/**
 * PREVIEW CENTS == REFUNDED CENTS, FOR EVERY TIER × FEE CONFIGURATION (ledger
 * `2026-09-27-cancel-preview-equals-refund`; Terms §8.1).
 *
 * For each cancellation tier (flexible, moderate, strict, non-refundable, at every window) and each
 * fee configuration (no fee, a charged fee, an odd-cent fee, a waived fee, an A3 row with a concierge
 * fee, a pre-A3 row with platform + insurance fees), a real booking row is quoted by
 * `quoteCancellationForBooking` — what `GET /api/bookings/:id/cancel-preview` returns — and then
 * refunded by `refundServiceBooking` with EXACTLY the options the cancel route builds
 * (`refundOptionsForQuote`). The service's own Stripe client is stubbed and records the cents it was
 * asked for. The two numbers must be equal, cent for cent. A 0% tier must preview $0.00, which is
 * what makes the route issue no refund at all.
 *
 * The end-to-end HTTP + real-Stripe twin is `cancel-preview-equals-refund.stripe.db.test.ts`.
 *
 * Run: JOURNEY_DB_WRITES_OK=1 DATABASE_URL=… npx tsx --test server/__tests__/cancel-preview-matrix.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { computeRefundBreakdown, tierRefundBreakdown, R156_NON_REFUNDABLE } from "../services/refund-breakdown";

const RUN = crypto.randomUUID().slice(0, 8);
const ids = { user: `cpm-${RUN}-user` };
const services: Record<string, string> = {};
const createdBookings: string[] = [];

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
before(async () => {
  if (process.env.JOURNEY_DB_WRITES_OK !== "1") {
    let host: string | null = null;
    try { host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase(); } catch { host = null; }
    if (host === null || !DISPOSABLE_HOSTS.has(host)) {
      throw new Error(`[cancel-preview-matrix] REFUSING to write fixtures to '${host ?? "<none>"}'; opt in with JOURNEY_DB_WRITES_OK=1.`);
    }
  }
  await db.execute(sql`INSERT INTO users (id, email, first_name, last_name) VALUES (${ids.user}, ${`cpm-${RUN}@t.test`}, 'Cpm', 'Fixture')`);
  for (const policy of ["flexible", "moderate", "strict", "non_refundable"]) {
    const id = `cpm-${RUN}-${policy}`;
    services[policy] = id;
    await db.execute(sql`
      INSERT INTO provider_services (id, user_id, service_name, price, cancellation_policy_type)
      VALUES (${id}, ${ids.user}, ${`Matrix ${policy}`}, '105.00', ${policy})
    `);
  }
});

after(async () => {
  for (const id of createdBookings) {
    await db.execute(sql`DELETE FROM refunds WHERE booking_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM fee_ledger WHERE booking_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM service_bookings WHERE id = ${id}`).catch(() => {});
  }
  for (const id of Object.values(services)) await db.execute(sql`DELETE FROM provider_services WHERE id = ${id}`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id = ${ids.user}`).catch(() => {});
});

interface FeeConfig {
  name: string;
  totalAmount: string;
  platformFee: string;
  insuranceFee?: string;
  conciergeFee?: string | null;
  fee?: { charged: number; waived?: boolean };
}

const FEES: FeeConfig[] = [
  { name: "no traveler fee", totalAmount: "105.00", platformFee: "0.00" },
  { name: "$10 fee charged", totalAmount: "105.00", platformFee: "0.00", fee: { charged: 10 } },
  { name: "$7.33 fee (odd cents)", totalAmount: "99.99", platformFee: "0.00", fee: { charged: 7.33 } },
  { name: "$10 fee waived (Trip Pass)", totalAmount: "105.00", platformFee: "0.00", fee: { charged: 0, waived: true } },
  { name: "A3 row: concierge fee + $10 fee", totalAmount: "105.00", platformFee: "15.75", conciergeFee: "5.25", fee: { charged: 10 } },
  { name: "pre-A3 row: platform + insurance + $10 fee", totalAmount: "105.00", platformFee: "12.00", insuranceFee: "3.00", fee: { charged: 10 } },
];

const TIERS: Array<{ policy: string; hoursAhead: number; percent: number }> = [
  { policy: "flexible", hoursAhead: 200, percent: 100 },
  { policy: "flexible", hoursAhead: 10, percent: 0 },
  { policy: "moderate", hoursAhead: 200, percent: 100 },
  { policy: "moderate", hoursAhead: 72, percent: 50 },
  { policy: "moderate", hoursAhead: 10, percent: 0 },
  { policy: "strict", hoursAhead: 200, percent: 50 },
  { policy: "strict", hoursAhead: 10, percent: 0 },
  { policy: "non_refundable", hoursAhead: 200, percent: 0 },
];

async function makeBooking(policy: string, hoursAhead: number, f: FeeConfig): Promise<string> {
  const id = crypto.randomUUID();
  createdBookings.push(id);
  const details: Record<string, unknown> = {
    scheduledDate: new Date(Date.now() + hoursAhead * 3600 * 1000).toISOString(),
  };
  if (f.fee) {
    details.travelerServiceFee = {
      charged: f.fee.waived ? 0 : f.fee.charged,
      wouldHaveBeen: f.fee.waived ? 10 : f.fee.charged,
      waived: !!f.fee.waived,
      waiverBasis: f.fee.waived ? "trip_pass" : null,
    };
  }
  if (f.conciergeFee !== undefined) details.travelerCharge = { conciergeFee: f.conciergeFee };
  await db.execute(sql`
    INSERT INTO service_bookings (id, service_id, traveler_id, provider_id, status, total_amount, platform_fee,
      insurance_fee, stripe_payment_intent_id, booking_details, created_at)
    VALUES (${id}, ${services[policy]}, ${ids.user}, ${ids.user}, 'confirmed', ${f.totalAmount}, ${f.platformFee},
      ${f.insuranceFee ?? "0.00"}, ${`pi_${RUN}_${id.slice(0, 8)}`}, ${JSON.stringify(details)}::jsonb, NOW())
  `);
  return id;
}

async function withFakeRefunds<T>(fn: (calls: Array<{ amount: number }>) => Promise<T>): Promise<T> {
  const { stripe } = await import("../services/stripe-payment.service");
  const s: any = stripe;
  const orig = s.refunds.create;
  const calls: Array<{ amount: number }> = [];
  s.refunds.create = async (params: any) => {
    calls.push({ amount: params.amount });
    return { id: `re_${RUN}_${calls.length}`, status: "succeeded", amount: params.amount, currency: "usd", charge: null, metadata: params.metadata };
  };
  try { return await fn(calls); } finally { s.refunds.create = orig; }
}

for (const tier of TIERS) {
  for (const f of FEES) {
    test(`${tier.policy} at ${tier.hoursAhead}h (${tier.percent}%) × ${f.name}: preview cents == refunded cents`, async () => {
      const id = await makeBooking(tier.policy, tier.hoursAhead, f);
      const { quoteCancellationForBooking, refundOptionsForQuote } = await import("../services/cancellation-policy.service");
      const { stripePaymentService } = await import("../services/stripe-payment.service");
      const quote = await quoteCancellationForBooking(id);
      assert.ok(quote);
      assert.equal(quote!.refundPercent, tier.percent);
      const previewCents = Math.round(quote!.refundAmount * 100);
      assert.equal(
        Math.round((quote!.bookingRefundAmount + quote!.feeRefundAmount) * 100),
        previewCents,
        "the preview is its two shares, and nothing else",
      );
      assert.deepEqual([...quote!.nonRefundable], [...R156_NON_REFUNDABLE], "R156 exclusions are named on the preview");
      if (previewCents === 0) {
        // The cancel route issues no refund when the preview is $0 (`refundDue` is false).
        assert.equal(tier.percent === 0 || f.totalAmount === "0.00", true);
        return;
      }
      await withFakeRefunds(async (calls) => {
        await stripePaymentService.refundServiceBooking(id, "requested_by_customer", refundOptionsForQuote(quote!));
        assert.equal(calls.length, 1);
        assert.equal(calls[0].amount, previewCents, `preview $${(previewCents / 100).toFixed(2)} vs Stripe $${(calls[0].amount / 100).toFixed(2)}`);
      });
    });
  }
}

test("the reported case, pure: $105 + $10 fee at 50% is $57.50 = $52.50 + $5.00", () => {
  const b = tierRefundBreakdown({ bookingChargedDollars: 105, feeChargedDollars: 10, percent: 50 });
  assert.equal(b.bookingRefundDollars, 52.5);
  assert.equal(b.feeRefundDollars, 5);
  assert.equal(b.totalRefundDollars, 57.5);
});

test("computeRefundBreakdown keeps refundServiceBooking's existing rules for callers without a tier", () => {
  // A full refund (no override) makes the traveler whole on the fee.
  assert.equal(computeRefundBreakdown({ bookingChargedDollars: 105, feeChargedDollars: 10 }).totalRefundDollars, 115);
  // A policy-scaled refund with no explicit fee % refunds no fee.
  assert.equal(computeRefundBreakdown({ bookingChargedDollars: 105, feeChargedDollars: 10, amountOverride: 50 }).totalRefundDollars, 50);
  // An override above what was charged is clamped to the charge.
  assert.equal(computeRefundBreakdown({ bookingChargedDollars: 105, feeChargedDollars: 0, amountOverride: 500 }).bookingRefundDollars, 105);
});
