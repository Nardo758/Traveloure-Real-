/**
 * 2026-08-27-neighbourhood-slug-match
 *
 * Gems and provider services store a free-text `neighborhood` value. Some
 * seed rows use the slug ("gion"), others the display name ("Bandra",
 * "Fort / Kala Ghoda"), and even the slugs themselves mix hyphens and
 * underscores ("kawaramachi-sanjo" vs "fushimi_inari"). location-view.service.ts
 * joins these against `cityNeighborhoods.slug`; a raw equality join silently
 * drops any mismatched row from that neighbourhood's gemCount/serviceCount/
 * gems, which then drops the whole neighbourhood out of the client feed
 * (§6 section chrome disappears along with the content).
 *
 * normalizeNeighborhoodKey() is applied to BOTH sides of every join so a
 * slug, its display name, and either word-separator style all collapse to
 * one key.
 *
 * Run with:
 *   npx tsx --test server/services/__tests__/location-view-neighbourhood-match.test.ts
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { normalizeNeighborhoodKey } from "../location-view.service.js";

describe("normalizeNeighborhoodKey (production utility)", () => {
  test("display name and slug collapse to the same key", () => {
    assert.equal(normalizeNeighborhoodKey("Bandra"), normalizeNeighborhoodKey("bandra"));
  });

  test("a slashed display name and its underscore slug collapse to the same key", () => {
    assert.equal(
      normalizeNeighborhoodKey("Fort / Kala Ghoda"),
      normalizeNeighborhoodKey("fort_kala_ghoda"),
    );
  });

  test("a hyphenated slug and an underscore slug for the same place collapse to the same key", () => {
    assert.equal(
      normalizeNeighborhoodKey("kawaramachi-sanjo"),
      normalizeNeighborhoodKey("kawaramachi_sanjo"),
    );
  });

  test("distinct neighbourhoods still normalize to distinct keys", () => {
    assert.notEqual(normalizeNeighborhoodKey("Bandra"), normalizeNeighborhoodKey("Colaba"));
  });

  test("null/undefined/empty are all the same empty key, never crash", () => {
    assert.equal(normalizeNeighborhoodKey(null), "");
    assert.equal(normalizeNeighborhoodKey(undefined), "");
    assert.equal(normalizeNeighborhoodKey(""), "");
    assert.equal(normalizeNeighborhoodKey("   "), "");
  });
});
