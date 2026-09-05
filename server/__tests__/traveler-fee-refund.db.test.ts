/**
 * TRAVELER SERVICE FEE REFUND — ruling 2026-09-02-traveler-fee-refundability.
 *
 * refundServiceBooking now refunds the assessed traveler service fee ON TOP of the booking refund,
 * scaled by the caller's `feeRefundPercent` (the cancellation-tier % for a traveler cancel; 100 for a
 * provider/expert cancel or a made-whole refund), and records a `fee_ledger` reversal row (−fee)
 * linked to the booking's original +traveler_service_fee row. Suppressed (waived) bookings billed no
 * fee → nothing to refund. Processing/FX fees are excluded (the fee `charged` is the platform fee).
 *
 * Asserted here (against a real Postgres + a stubbed Stripe.refunds.create — no network):
 *   1. PROPORTIONAL traveler refund → Stripe amount = bookingRefund + tier% × fee; reversal = −(tier% × fee).
 *   2. FULL provider refund (feeRefundPercent 100) → Stripe amount includes the whole fee; reversal = −fee.
 *   3. WAIVED booking → no fee in the refund; NO reversal row.
 *   4. DUPLICATE refund attempt → alreadyRefunded; exactly one reversal row.
 * Plus the reversal writer's own contract: idempotency (same amount → one row) and a missing original
 * row (reversed:false, reason original_row_missing).
 *
 * DISPOSABLE DB ONLY — every row is created and deleted here.
 *   JOURNEY_DB_WRITES_OK=1 STRIPE_SECRET_KEY=sk_test_dummy \
 *     npx tsx --test --test-force-exit server/__tests__/traveler-fee-refund.db.test.ts
 */
import { test, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import Stripe from "stripe";
import { sql } from "drizzle-orm";
import { db, pool } from "../db";
import { resolveTravelerServiceFee } from "../services/fee-resolution.service";
import {
  recordTravelerServiceFeeLedger,
  recordTravelerServiceFeeReversal,
} from "../services/fee-ledger.service";

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "sk_test_dummy";

const RUN = crypto.randomUUID().slice(0, 8);
const userId = `tfr-${RUN}-user`;
const bookingIds: string[] = [];

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
async function assertDisposableDb(): Promise<void> {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host: string | null = null;
  try {
    host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
  } catch {
    host = null;
  }
  if (!(host !== null && DISPOSABLE_HOSTS.has(host))) {
    throw new Error(
      `[traveler-fee-refund] REFUSING to write fixtures: DATABASE_URL host '${host ?? "<none>"}' is not a ` +
        `recognized disposable dev/CI database. Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1.`,
    );
  }
}

// Stub Stripe.refunds.create on the shared prototype (every `new Stripe()` shares it) so no network
// call happens; capture the requested amount so we can assert the fee rode the refund.
const probe = new Stripe("sk_test_dummy");
const refundsProto = Object.getPrototypeOf(probe.refunds);
const originalCreate = refundsProto.create;
let lastRefundAmountCents = 0;
function stubRefundSucceed() {
  lastRefundAmountCents = 0;
  refundsProto.create = async (...args: any[]) => {
    lastRefundAmountCents = args?.[0]?.amount ?? 0;
    return { id: `re_test_${crypto.randomUUID().slice(0, 8)}`, status: "succeeded", amount: lastRefundAmountCents };
  };
}
afterEach(() => {
  refundsProto.create = originalCreate;
});

let feeAmount = 0;

/** A confirmed booking with a fee snapshot + its original +traveler_service_fee ledger row. */
async function makeBooking(opts: { price: number; waived?: boolean }): Promise<string> {
  const id = `tfr-${RUN}-bk-${bookingIds.length}`;
  bookingIds.push(id);
  const resolved = await resolveTravelerServiceFee(opts.price);
  const charged = opts.waived ? 0 : resolved.amount;
  const snapshot = {
    charged,
    wouldHaveBeen: resolved.amount,
    rate: resolved.rate,
    bandId: resolved.bandId,
    bandKey: resolved.bandKey,
    capApplied: resolved.capApplied,
    waived: opts.waived === true,
    waiverBasis: opts.waived ? "trip_pass" : null,
  };
  await db.execute(sql`
    INSERT INTO service_bookings (id, traveler_id, provider_id, status, total_amount, platform_fee, insurance_fee,
      stripe_payment_intent_id, booking_details, created_at)
    VALUES (${id}, ${userId}, ${userId}, 'confirmed', ${String(opts.price.toFixed(2))}, '0.00', '0.00',
      ${`pi_test_${RUN}_${bookingIds.length}`}, ${JSON.stringify({ travelerServiceFee: snapshot })}::jsonb, NOW())
  `);
  // The original +traveler_service_fee row (only when a fee was actually billed).
  if (!opts.waived) {
    await recordTravelerServiceFeeLedger({ bookingIds: [id], actor: "test" });
  }
  return id;
}

async function feeRows(bookingId: string): Promise<Array<{ fee_type: string; amount: string; reverses_ledger_id: string | null; borne_by: string }>> {
  const r = await db.execute(sql`
    SELECT fee_type, amount, reverses_ledger_id, borne_by
    FROM fee_ledger WHERE booking_id = ${bookingId} ORDER BY fee_type
  `);
  return (r.rows ?? []) as any[];
}

before(async () => {
  await assertDisposableDb();
  await db.execute(sql`INSERT INTO users (id, email, first_name, last_name, role)
    VALUES (${userId}, ${`tfr-${RUN}@t.test`}, 'Fee', 'Refund', 'service_provider')`);
  feeAmount = (await resolveTravelerServiceFee(100)).amount;
  assert.ok(feeAmount > 0, `traveler fee on $100 must be > 0, got ${feeAmount}`);
});

after(async () => {
  // The shared `../db` pool is built `allowExitOnIdle: false`, so a run that never ends it outlives
  // its own assertions (ledger `2026-09-05-fee-ledger-test-robustness`). Cleanup first, in reverse
  // dependency order; the pool closes in a `finally` so the process exits on every path.
  try {
    if (bookingIds.length) {
      const ids = sql.join(bookingIds.map((b) => sql`${b}`), sql`, `);
      await db.execute(sql`DELETE FROM refunds WHERE booking_id IN (${ids})`);
      await db.execute(sql`DELETE FROM fee_ledger WHERE booking_id IN (${ids})`);
      await db.execute(sql`DELETE FROM service_bookings WHERE id IN (${ids})`);
    }
    await db.execute(sql`DELETE FROM users WHERE id = ${userId}`);
  } finally {
    await pool.end();
  }
});

test("1. PROPORTIONAL traveler refund — Stripe amount = bookingRefund + tier% × fee; reversal = −(tier% × fee)", async () => {
  const { stripePaymentService } = await import("../services/stripe-payment.service");
  const id = await makeBooking({ price: 100 });
  const fee = feeAmount; // fee on $100
  stubRefundSucceed();
  // Moderate-tier 50%: booking refund 50.00, fee refund = 50% of the fee.
  const res: any = await stripePaymentService.refundServiceBooking(id, "requested_by_customer", {
    amountOverride: 50,
    feeRefundPercent: 50,
  });
  const expectedFeeRefund = Math.round(fee * 0.5 * 100) / 100;
  assert.equal(res.feeRefund, expectedFeeRefund, "fee refund is 50% of the assessed fee");
  assert.equal(res.bookingRefund, 50, "booking refund is the 50% override");
  assert.equal(res.amount, Math.round((50 + expectedFeeRefund) * 100) / 100, "total refund = booking + fee share");
  assert.equal(lastRefundAmountCents, Math.round((50 + expectedFeeRefund) * 100), "Stripe charged the fee-inclusive total");
  const rows = await feeRows(id);
  const rev = rows.find((r) => r.fee_type === "reversal");
  assert.ok(rev, "a reversal row was written");
  assert.equal(Number(rev!.amount), -expectedFeeRefund, "reversal is −(50% × fee)");
  assert.ok(rev!.reverses_ledger_id, "reversal is linked to the original fee row");
  assert.equal(rev!.borne_by, "traveler", "the fee is given back to the traveler");
});

test("2. FULL provider refund (feeRefundPercent 100) — the whole fee is refunded; reversal = −fee", async () => {
  const { stripePaymentService } = await import("../services/stripe-payment.service");
  const id = await makeBooking({ price: 100 });
  const fee = feeAmount;
  stubRefundSucceed();
  const res: any = await stripePaymentService.refundServiceBooking(id, "cancelled_by_provider", {
    amountOverride: 100,
    feeRefundPercent: 100,
  });
  assert.equal(res.feeRefund, fee, "provider cancel refunds 100% of the fee");
  assert.equal(res.amount, Math.round((100 + fee) * 100) / 100, "total = full booking + full fee");
  assert.equal(lastRefundAmountCents, Math.round((100 + fee) * 100), "Stripe charged booking + full fee");
  const rev = (await feeRows(id)).find((r) => r.fee_type === "reversal");
  assert.ok(rev && Number(rev.amount) === -fee, "reversal is −fee");
});

test("3. WAIVED booking — no fee in the refund, NO reversal row", async () => {
  const { stripePaymentService } = await import("../services/stripe-payment.service");
  const id = await makeBooking({ price: 100, waived: true });
  stubRefundSucceed();
  const res: any = await stripePaymentService.refundServiceBooking(id, "cancelled_by_provider", {
    amountOverride: 100,
    feeRefundPercent: 100,
  });
  assert.equal(res.feeRefund, 0, "a waived booking billed no fee, so refunds none");
  assert.equal(res.amount, 100, "refund is the booking amount only");
  assert.equal(lastRefundAmountCents, 10000, "Stripe charged the booking amount only");
  const rows = await feeRows(id);
  assert.equal(rows.filter((r) => r.fee_type === "reversal").length, 0, "no reversal row for a waived booking");
});

test("4. DUPLICATE refund attempt — alreadyRefunded; exactly one reversal row", async () => {
  const { stripePaymentService } = await import("../services/stripe-payment.service");
  const id = await makeBooking({ price: 100 });
  stubRefundSucceed();
  const first: any = await stripePaymentService.refundServiceBooking(id, "requested_by_customer", {
    amountOverride: 100,
    feeRefundPercent: 100,
  });
  assert.equal(first.feeRefund, feeAmount);
  stubRefundSucceed();
  const dup: any = await stripePaymentService.refundServiceBooking(id, "requested_by_customer", {
    amountOverride: 100,
    feeRefundPercent: 100,
  });
  assert.equal(dup.alreadyRefunded, true, "a repeat refund is a no-op (atomic status claim)");
  const revs = (await feeRows(id)).filter((r) => r.fee_type === "reversal");
  assert.equal(revs.length, 1, "exactly one reversal row after a duplicate attempt");
});

test("5. reversal writer — idempotent per (booking, amount); missing original is reported, not fabricated", async () => {
  const id = await makeBooking({ price: 100 });
  // Same amount twice → one row.
  const a = await recordTravelerServiceFeeReversal({ bookingId: id, refundAmount: feeAmount, actor: "test" });
  assert.equal(a.inserted, 1, "first reversal lands");
  const b = await recordTravelerServiceFeeReversal({ bookingId: id, refundAmount: feeAmount, actor: "test" });
  assert.equal(b.inserted, 0, "same-amount replay is a no-op (amount-specific idempotency key)");
  assert.equal((await feeRows(id)).filter((r) => r.fee_type === "reversal").length, 1);

  // A booking with NO original fee row → reported, no row written.
  const orphan = `tfr-${RUN}-orphan`;
  bookingIds.push(orphan);
  await db.execute(sql`INSERT INTO service_bookings (id, traveler_id, provider_id, status, total_amount, created_at)
    VALUES (${orphan}, ${userId}, ${userId}, 'confirmed', '100.00', NOW())`);
  const miss = await recordTravelerServiceFeeReversal({ bookingId: orphan, refundAmount: 5, actor: "test" });
  assert.equal(miss.reversed, false);
  assert.equal(miss.reason, "original_row_missing", "a missing original row is reported, never an unlinked reversal");
  assert.equal((await feeRows(orphan)).length, 0, "nothing written when there's no row to reverse");
});
