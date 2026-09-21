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
 * P5 is the one worth having, and it BUILDS ITS OWN FIXTURE. Its first version looked one up and
 * returned early when absent, which made it vacuous in CI (CI never runs `seed:dev-fixtures`), so
 * it passed green while asserting nothing — caught by a read-only audit, not by the suite. A test
 * that depends on a seeder having been run is green on the author's machine and silent where it
 * matters.
 *
 * Run: DATABASE_URL=… npx tsx --test server/__tests__/platform-concierge-price.db.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import crypto from "node:crypto";
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
  // THIS TEST BUILDS ITS OWN FIXTURE, and that is the point of the rewrite.
  //
  // The first version of P5 LOOKED UP an expert-owned booking_concierge listing and returned early
  // when it found none. That made it VACUOUS exactly where it mattered: CI applies migrations and
  // seeds `scripts/seed-ci-test-users.ts`, and never runs `npm run seed:dev-fixtures` — so no
  // expert-owned concierge listing exists there and the assertion never ran. It passed green while
  // proving nothing, which is the §18d failure class this repo keeps guards honest against, and it
  // was caught by a read-only audit rather than by the suite itself.
  //
  // A test that depends on a seeder having been run is a test that is green on the author's
  // machine and silent in CI. It now creates the row it needs, asserts, and cleans up — the same
  // shape `platform-concierge-listing.db.test.ts` uses for its own $150 expert fixture.
  if ((await listingPrice()) === null) return; // migration 313 genuinely absent — nothing to isolate

  const runId = crypto.randomUUID().slice(0, 8);
  const expertUserId = crypto.randomUUID();
  const expertServiceId = crypto.randomUUID();
  const EXPERT_PRICE = "120.00";

  try {
    await db.execute(sql`
      INSERT INTO users (id, email, role)
      VALUES (${expertUserId}, ${`pcp-${runId}-expert@test.local`}, 'expert')`);
    await db.execute(sql`
      INSERT INTO provider_services
        (id, user_id, service_name, price, status, approval_status, delivery_method,
         expert_offering_type_key)
      VALUES
        (${expertServiceId}, ${expertUserId}, ${`pcp-${runId} expert Booking Concierge`},
         ${EXPERT_PRICE}, 'active', 'approved', 'in_person', 'booking_concierge')`);

    // The admin moves the PLATFORM price. A writer matching on the offering key alone would take
    // this seller's price with it.
    const synced = await syncPlatformConciergeListingPrice(99);
    assert.equal(synced.updated, true, "the platform listing must still reprice");
    assert.equal(
      synced.rowsUpdated,
      1,
      "exactly ONE row may move — if this is 2, the writer just repriced a seller's own listing",
    );

    const after = await db.execute(sql`
      SELECT price::text AS p FROM provider_services WHERE id = ${expertServiceId}`);
    assert.equal(
      (after.rows?.[0] as any)?.p,
      EXPERT_PRICE,
      "an expert's own Booking Concierge price is theirs and must not move from the platform panel",
    );
  } finally {
    await db.execute(sql`DELETE FROM provider_services WHERE id = ${expertServiceId}`);
    await db.execute(sql`DELETE FROM users WHERE id = ${expertUserId}`);
    await syncPlatformConciergeListingPrice(35); // restore the ruled price
  }
});
