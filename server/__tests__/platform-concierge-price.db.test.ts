/**
 * platform-concierge-price.db.test.ts — ledger `2026-09-21-platform-concierge-price-editable`.
 *
 * Migration 313 seeded a `fee_bands` row AND a static `provider_services.price` from it, and
 * nothing re-resolved the column. `fee_bands` has a WORKING admin editor, so an admin could change
 * that band, get a 200 and an audit row, and the live price would not move — a control that
 * appears to set a price and does not, on a money surface (§13).
 *
 * WHAT THIS PROVES (needs a database — it asserts on real rows):
 *   P1  migration 315 landed $35 on BOTH the band and the listing.
 *   P2  the ONE writer repoints the listing, and touches exactly one row.
 *   P3  a negative/NaN price is REFUSED and writes nothing (never a $0 listing).
 *   P4  the writer names WHY it did nothing — never a silent no-op (§13).
 *   P5  a real expert's booking_concierge listing is NOT repriced by it.
 *
 * P5 is the one worth having. The writer is reached from the admin band editor, and a predicate
 * that matched on the offering key alone would reprice every expert's own Booking Concierge
 * listing from a platform panel — taking a seller's price out of their hands.
 *
 * Run: DATABASE_URL=… npx tsx --test server/__tests__/platform-concierge-price.db.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { sql } from "drizzle-orm";
import { db } from "../db";
import {
  syncPlatformConciergeListingPrice,
  PLATFORM_CONCIERGE_PRICE_BAND_KEY,
} from "../services/platform-concierge-price.service";

async function listingPrice(): Promise<string | null> {
  const r = await db.execute(sql`
    SELECT ps.price::text AS p
      FROM provider_services ps
      JOIN platform_settings s ON s.setting_key = 'platform_concierge_user_id'
                              AND ps.user_id = s.setting_value
     WHERE ps.expert_offering_type_key = 'booking_concierge'`);
  return ((r.rows?.[0] as any)?.p ?? null);
}
async function bandRate(): Promise<number | null> {
  const r = await db.execute(sql`
    SELECT CAST(default_rate AS FLOAT) AS v FROM fee_bands
     WHERE band_key = ${PLATFORM_CONCIERGE_PRICE_BAND_KEY}`);
  return ((r.rows?.[0] as any)?.v ?? null);
}

test("P1: migration 315 set $35 on BOTH the band and the live listing", async () => {
  const band = await bandRate();
  const price = await listingPrice();
  if (band === null && price === null) return; // migration 313 not applied on this database
  assert.equal(band, 35, "the admin-facing band must read 35");
  assert.equal(Number(price), 35, "the LIVE column the LD 51 charge path reads must be 35");
});

test("P2: the one writer repoints the listing, exactly one row", async () => {
  if ((await listingPrice()) === null) return;
  const result = await syncPlatformConciergeListingPrice(42.5);
  assert.equal(result.updated, true);
  assert.equal(result.rowsUpdated, 1, "the platform owns exactly one Booking Concierge listing");
  assert.equal(Number(await listingPrice()), 42.5);
  await syncPlatformConciergeListingPrice(35); // restore
  assert.equal(Number(await listingPrice()), 35);
});

test("P3: a negative price is refused and writes NOTHING — never a $0 listing", async () => {
  if ((await listingPrice()) === null) return;
  const before = await listingPrice();
  for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
    const r = await syncPlatformConciergeListingPrice(bad);
    assert.equal(r.updated, false, `${bad} must be refused`);
    assert.equal(r.rowsUpdated, 0);
  }
  assert.equal(await listingPrice(), before, "a refused price must not move the row");
});

test("P4: a refusal NAMES its reason — never a silent no-op (§13)", async () => {
  const r = await syncPlatformConciergeListingPrice(-1);
  assert.equal(r.updated, false);
  assert.equal(r.reason, "invalid_price", "the caller must be able to say WHY nothing moved");
});

test("P5: an EXPERT's own booking_concierge listing is never repriced from the admin panel", async () => {
  // A price set by a seller is theirs. The writer's predicate is owner + offering key, so an
  // expert-owned row with the same offering key must be untouched by a platform band edit.
  const r = await db.execute(sql`
    SELECT ps.id, ps.price::text AS p
      FROM provider_services ps
     WHERE ps.expert_offering_type_key = 'booking_concierge'
       AND ps.user_id <> COALESCE(
             (SELECT setting_value FROM platform_settings
               WHERE setting_key = 'platform_concierge_user_id'), '')
     LIMIT 1`);
  const expert = r.rows?.[0] as any;
  if (!expert) return; // no expert-owned concierge listing on this database
  const before = expert.p;
  await syncPlatformConciergeListingPrice(99);
  const after = await db.execute(sql`SELECT price::text AS p FROM provider_services WHERE id = ${expert.id}`);
  assert.equal((after.rows?.[0] as any)?.p, before, "an expert's own price must not move");
  await syncPlatformConciergeListingPrice(35); // restore the platform row
});
