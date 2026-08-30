/**
 * Unit tests for the Travelpayouts cache-status aggregation helper.
 *
 * Run: npx tsx --test server/services/travelpayouts/__tests__/travelpayouts-cache-status.test.ts
 *
 * Covers:
 *  - Legacy rows with null refreshedAt (pre-migration 221)
 *  - All-fresh brand
 *  - All-expired brand
 *  - Mixed fresh/stale keys within a single brand
 *  - Multi-brand aggregation and alphabetical sort
 *  - lastRefreshedAt picks the most-recent non-null refreshedAt across keys
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { aggregateBrandStatus, type CacheRow } from "../travelpayouts-cache-status";

const NOW = new Date("2026-08-14T12:00:00Z");
const FUTURE = new Date("2026-08-15T12:00:00Z");  // expires in 24h — fresh
const PAST   = new Date("2026-08-13T12:00:00Z");  // expired 24h ago — stale
const REFRESHED_RECENT = new Date("2026-08-14T11:00:00Z");
const REFRESHED_OLDER  = new Date("2026-08-14T08:00:00Z");

function row(brand: string, cacheKey: string, expiresAt: Date, refreshedAt: Date | null): CacheRow {
  return { brand, cacheKey, expiresAt, refreshedAt };
}

describe("aggregateBrandStatus", () => {
  it("returns empty array for no rows", () => {
    const result = aggregateBrandStatus([], NOW);
    assert.deepEqual(result, []);
  });

  it("legacy rows with null refreshedAt: lastRefreshedAt stays null", () => {
    const rows: CacheRow[] = [
      row("tiqets", "tiqets::tokyo", FUTURE, null),
    ];
    const [brand] = aggregateBrandStatus(rows, NOW);
    assert.equal(brand.brand, "tiqets");
    assert.equal(brand.lastRefreshedAt, null);
    assert.equal(brand.totalKeys, 1);
    assert.equal(brand.freshKeys, 1);
    assert.equal(brand.staleKeys, 0);
    assert.equal(brand.isStale, false);
  });

  it("all-fresh brand: isStale is false, freshKeys equals totalKeys", () => {
    const rows: CacheRow[] = [
      row("viator", "viator::paris", FUTURE, REFRESHED_RECENT),
      row("viator", "viator::rome",  FUTURE, REFRESHED_OLDER),
    ];
    const [brand] = aggregateBrandStatus(rows, NOW);
    assert.equal(brand.isStale, false);
    assert.equal(brand.freshKeys, 2);
    assert.equal(brand.staleKeys, 0);
    // lastRefreshedAt should be the newest refreshedAt across keys
    assert.deepEqual(brand.lastRefreshedAt, REFRESHED_RECENT);
  });

  it("all-expired brand: isStale is true, freshKeys is 0", () => {
    const rows: CacheRow[] = [
      row("wegotrip", "wegotrip::kyoto", PAST, REFRESHED_OLDER),
    ];
    const [brand] = aggregateBrandStatus(rows, NOW);
    assert.equal(brand.isStale, true);
    assert.equal(brand.freshKeys, 0);
    assert.equal(brand.staleKeys, 1);
  });

  it("mixed fresh/stale keys: brand is not stale when any key is fresh", () => {
    const rows: CacheRow[] = [
      row("esim", "esim::jp", PAST,   REFRESHED_OLDER),   // stale key
      row("esim", "esim::th", FUTURE, REFRESHED_RECENT),  // fresh key
    ];
    const [brand] = aggregateBrandStatus(rows, NOW);
    assert.equal(brand.isStale, false);
    assert.equal(brand.freshKeys, 1);
    assert.equal(brand.staleKeys, 1);
    assert.equal(brand.totalKeys, 2);
    assert.deepEqual(brand.lastRefreshedAt, REFRESHED_RECENT);
    // per-key isStale
    const jp = brand.keys.find(k => k.cacheKey === "esim::jp")!;
    const th = brand.keys.find(k => k.cacheKey === "esim::th")!;
    assert.equal(jp.isStale, true);
    assert.equal(th.isStale, false);
  });

  it("multi-brand: results are sorted alphabetically by brand name", () => {
    const rows: CacheRow[] = [
      row("viator",   "viator::x",   FUTURE, REFRESHED_RECENT),
      row("esim",     "esim::x",     FUTURE, REFRESHED_RECENT),
      row("tiqets",   "tiqets::x",   FUTURE, REFRESHED_RECENT),
      row("wegotrip", "wegotrip::x", FUTURE, REFRESHED_RECENT),
    ];
    const result = aggregateBrandStatus(rows, NOW);
    assert.deepEqual(result.map(b => b.brand), ["esim", "tiqets", "viator", "wegotrip"]);
  });

  it("mixed null/non-null refreshedAt: lastRefreshedAt picks the non-null value", () => {
    const rows: CacheRow[] = [
      row("tiqets", "tiqets::old-key", FUTURE, null),              // legacy row
      row("tiqets", "tiqets::new-key", FUTURE, REFRESHED_RECENT),  // upserted row
    ];
    const [brand] = aggregateBrandStatus(rows, NOW);
    assert.deepEqual(brand.lastRefreshedAt, REFRESHED_RECENT);
    assert.equal(brand.totalKeys, 2);
  });

  it("earliestExpiresAt and latestExpiresAt correctly track expiry range", () => {
    const EARLIER_FUTURE = new Date("2026-08-14T18:00:00Z");
    const LATER_FUTURE   = new Date("2026-08-16T00:00:00Z");
    const rows: CacheRow[] = [
      row("viator", "viator::a", EARLIER_FUTURE, REFRESHED_OLDER),
      row("viator", "viator::b", LATER_FUTURE,   REFRESHED_RECENT),
    ];
    const [brand] = aggregateBrandStatus(rows, NOW);
    assert.deepEqual(brand.earliestExpiresAt, EARLIER_FUTURE);
    assert.deepEqual(brand.latestExpiresAt,   LATER_FUTURE);
  });
});
