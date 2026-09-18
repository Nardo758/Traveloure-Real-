/**
 * BOOKING CONCIERGE FEE — THE CAP AND THE EXPERT/PLATFORM SPLIT AT COMPLETION.
 *
 * Locked Decision 51 (ledger `2026-09-18-concierge-fee-cap-split`, migration 311). The
 * facilitation fee is still collected 100%-platform AT CAPTURE (payments.routes.ts,
 * `resolveConciergeBookingFee`, proven purely in `traveler-charge-composition.test.ts` P13-P16);
 * this file proves the OTHER half — the expert's share, snapshotted at purchase onto
 * `booking_details.travelerCharge.conciergeFeeExpertShare`, is re-split into the listing owner's
 * earnings and OUT of the platform's own take at COMPLETION, through
 * `storage.mintCompletionEarningsForBooking`, exactly once per booking, no matter how many times
 * completion mints.
 *
 * DISPOSABLE DB ONLY. Every row this file writes is created here and deleted in after().
 * No Stripe key and no network — this file never reaches Stripe.
 *
 * Run solo: npx tsx --test server/__tests__/concierge-fee-split.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";

import { db } from "../db";
import { storage } from "../storage";

const RUN = crypto.randomUUID().slice(0, 8);
const providerId = `cfs-${RUN}-prov`;
const travelerId = `cfs-${RUN}-trav`;
let serviceId: string;
const bookingIds: string[] = [];

const idList = (ids: string[]) => sql.join(ids.map((i) => sql`${i}`), sql`, `);

/**
 * A CONFIRMED booking, born the way a real concierge purchase is born: `total_amount` /
 * `platform_fee` / `provider_earnings` at their BIRTH values (the fee still 100%-platform, R6's
 * shape) and, optionally, the purchase-time `travelerCharge` snapshot Locked Decision 51 adds.
 */
async function insertBooking(opts: {
  totalAmount: string;
  platformFee: string;
  providerEarnings: string;
  conciergeFeeExpertShare?: string | null;
}): Promise<string> {
  const id = crypto.randomUUID();
  const bookingDetails =
    opts.conciergeFeeExpertShare === undefined
      ? null
      : opts.conciergeFeeExpertShare === null
        ? { travelerCharge: { conciergeFee: "20.00" } } // present, but WITHOUT the share key
        : { travelerCharge: { conciergeFee: "20.00", conciergeFeeExpertShare: opts.conciergeFeeExpertShare } };
  await db.execute(sql`
    INSERT INTO service_bookings
      (id, service_id, traveler_id, provider_id, status,
       total_amount, platform_fee, provider_earnings,
       stripe_payment_intent_id, confirmed_at, booking_details)
    VALUES
      (${id}, ${serviceId}, ${travelerId}, ${providerId}, 'confirmed',
       ${opts.totalAmount}, ${opts.platformFee}, ${opts.providerEarnings},
       ${`pi_cfs_${RUN}_${id}`}, NOW() - interval '10 days',
       ${bookingDetails ? JSON.stringify(bookingDetails) : null}::jsonb)
  `);
  bookingIds.push(id);
  return id;
}

async function mintedFigures(bookingId: string) {
  const pe = await db.execute(sql`SELECT amount::numeric AS amount FROM provider_earnings WHERE source_id = ${bookingId}`);
  const ee = await db.execute(sql`SELECT amount::numeric AS amount FROM expert_earnings WHERE reference_id = ${bookingId}`);
  const pr = await db.execute(sql`
    SELECT gross_amount::numeric AS gross, platform_fee::numeric AS platform_fee, provider_earnings::numeric AS provider_earnings
      FROM platform_revenue WHERE source_id = ${bookingId} AND gross_amount >= 0
  `);
  return {
    providerEarningRows: pe.rows.length,
    providerEarningAmount: pe.rows[0] ? Number((pe.rows[0] as any).amount) : null,
    expertEarningRows: ee.rows.length,
    expertEarningAmount: ee.rows[0] ? Number((ee.rows[0] as any).amount) : null,
    revenueRows: pr.rows.length,
    revenue: pr.rows[0]
      ? {
          gross: Number((pr.rows[0] as any).gross),
          platformFee: Number((pr.rows[0] as any).platform_fee),
          providerEarnings: Number((pr.rows[0] as any).provider_earnings),
        }
      : null,
  };
}

before(async () => {
  await db.execute(sql`
    INSERT INTO users (id, email, role) VALUES
      (${providerId}, ${`cfs-${RUN}-prov@test.local`}, 'expert'),
      (${travelerId}, ${`cfs-${RUN}-trav@test.local`}, 'traveler')
  `);
  serviceId = crypto.randomUUID();
  await db.execute(sql`
    INSERT INTO provider_services (id, user_id, service_name, price, status, approval_status, delivery_method)
    VALUES (${serviceId}, ${providerId}, ${`cfs-${RUN} Booking Concierge fixture`}, '100.00', 'active', 'approved', 'in_person')
  `);
});

after(async () => {
  for (const id of bookingIds) {
    await db.execute(sql`DELETE FROM provider_earnings WHERE source_id = ${id}`);
    await db.execute(sql`DELETE FROM expert_earnings WHERE reference_id = ${id}`);
    await db.execute(sql`DELETE FROM platform_revenue WHERE source_id = ${id}`);
  }
  if (bookingIds.length > 0) {
    await db.execute(sql`DELETE FROM service_bookings WHERE id IN (${idList(bookingIds)})`);
  }
  await db.execute(sql`DELETE FROM provider_services WHERE id = ${serviceId}`);
  await db.execute(sql`DELETE FROM users WHERE id IN (${providerId}, ${travelerId})`);
});

test("C1: a concierge booking's snapshotted share mints once — provider/expert earnings gain it, platform_revenue.platform_fee loses it", async () => {
  // Birth values: 100 total, 25 platform_fee (the concierge fee's 100%-platform capture), 75
  // provider_earnings. Purchase-time snapshot: the expert's 75% share of a $20 concierge fee = $15.
  const id = await insertBooking({
    totalAmount: "100.00",
    platformFee: "25.00",
    providerEarnings: "75.00",
    conciergeFeeExpertShare: "15.00",
  });
  const booking = await storage.getServiceBooking(id);
  assert.ok(booking);

  const applied = await storage.mintCompletionEarningsForBooking(booking!);
  assert.equal(applied, true);

  const figures = await mintedFigures(id);
  assert.equal(figures.providerEarningRows, 1);
  assert.equal(figures.expertEarningRows, 1);
  assert.equal(figures.revenueRows, 1);
  // 75 (base) + 15 (concierge split) = 90 — the SAME combined amount rides BOTH earnings tables.
  assert.equal(figures.providerEarningAmount, 90);
  assert.equal(figures.expertEarningAmount, 90);
  assert.equal(figures.revenue?.gross, 100, "gross_amount is untouched by the split");
  assert.equal(figures.revenue?.platformFee, 10, "25 - 15 = 10: the platform's own take shrinks by exactly the share");
  assert.equal(figures.revenue?.providerEarnings, 90);
});

test("C2: a retry mints NOTHING new — ONE combined earning, never a second row", async () => {
  const id = await insertBooking({
    totalAmount: "100.00",
    platformFee: "25.00",
    providerEarnings: "75.00",
    conciergeFeeExpertShare: "15.00",
  });
  const booking = await storage.getServiceBooking(id);
  assert.ok(booking);

  const first = await storage.mintCompletionEarningsForBooking(booking!);
  assert.equal(first, true);
  const second = await storage.mintCompletionEarningsForBooking(booking!);
  assert.equal(second, false, "second mint must be a no-op — the existing onConflictDoNothing guard");

  const figures = await mintedFigures(id);
  assert.equal(figures.providerEarningRows, 1);
  assert.equal(figures.expertEarningRows, 1);
  assert.equal(figures.revenueRows, 1);
  assert.equal(figures.providerEarningAmount, 90);
  assert.equal(figures.revenue?.platformFee, 10);
});

test("C3: a row with NO conciergeFeeExpertShare key splits nothing — pre-lane bookings are unchanged (§13, no backfill)", async () => {
  const id = await insertBooking({
    totalAmount: "100.00",
    platformFee: "25.00",
    providerEarnings: "75.00",
    // no `conciergeFeeExpertShare` field at all — `booking_details` is entirely absent.
  });
  const booking = await storage.getServiceBooking(id);
  assert.ok(booking);

  const applied = await storage.mintCompletionEarningsForBooking(booking!);
  assert.equal(applied, true);

  const figures = await mintedFigures(id);
  assert.equal(figures.providerEarningAmount, 75, "no split ⇒ the base provider earning is untouched");
  assert.equal(figures.expertEarningAmount, 75);
  assert.equal(figures.revenue?.platformFee, 25, "no split ⇒ the platform's own take is untouched");
});

test("C4: a travelerCharge snapshot present but WITHOUT the share key also splits nothing", async () => {
  const id = await insertBooking({
    totalAmount: "100.00",
    platformFee: "25.00",
    providerEarnings: "75.00",
    conciergeFeeExpertShare: null, // travelerCharge.conciergeFee present, but no ...ExpertShare key
  });
  const booking = await storage.getServiceBooking(id);
  assert.ok(booking);

  await storage.mintCompletionEarningsForBooking(booking!);

  const figures = await mintedFigures(id);
  assert.equal(figures.providerEarningAmount, 75);
  assert.equal(figures.revenue?.platformFee, 25);
});

test("C5: the split never drives the platform's take negative — it clamps to platformFee", async () => {
  // A deliberately malformed snapshot (share > platformFee) proves the safety clamp rather than
  // relying on it never being exercised in practice. Clamping to EXACTLY platformFee (10) drives
  // it to 0 — and the mint's PRE-EXISTING `if (platformFee > 0)` gate (unchanged by this lane)
  // then mints NO platform_revenue row at all: there is no commission left to record. That gate
  // predates this split and is proven here rather than assumed.
  const id = await insertBooking({
    totalAmount: "100.00",
    platformFee: "10.00",
    providerEarnings: "90.00",
    conciergeFeeExpertShare: "999.00",
  });
  const booking = await storage.getServiceBooking(id);
  assert.ok(booking);

  await storage.mintCompletionEarningsForBooking(booking!);

  const figures = await mintedFigures(id);
  assert.equal(figures.revenueRows, 0, "platformFee clamped to exactly 0 ⇒ no commission row");
  assert.equal(figures.providerEarningAmount, 100, "90 base + 10 (the clamped share) = 100 — never negative");
});

test("C6: a $0.00 snapshot is present but splits nothing — the same present-but-zero posture as the fee itself (§13)", async () => {
  const id = await insertBooking({
    totalAmount: "100.00",
    platformFee: "25.00",
    providerEarnings: "75.00",
    conciergeFeeExpertShare: "0.00",
  });
  const booking = await storage.getServiceBooking(id);
  assert.ok(booking);

  await storage.mintCompletionEarningsForBooking(booking!);

  const figures = await mintedFigures(id);
  assert.equal(figures.providerEarningAmount, 75);
  assert.equal(figures.revenue?.platformFee, 25);
});
