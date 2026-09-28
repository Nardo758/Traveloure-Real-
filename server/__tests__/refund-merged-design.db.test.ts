/**
 * R163 AMENDMENT — THE MERGED REFUND DESIGN (decision-maker Sep 27, 2026; ledger
 * `2026-09-27-dashboard-refund-reads-refunded`). Supersedes #1123, whose replay cases are kept here
 * and re-expressed against R163's read model (the stamp and the label), never a status write.
 *
 * WEBHOOK (`charge.refunded`, delivered through `handleWebhook` with an embedded refund list, so no
 * Stripe network call is made):
 *   M1  a full dashboard refund: the stamp holds the charge's cents, the booking reads Refunded
 *       (R163 flag), its STATUS is untouched, no earnings/revenue move, one audit row per refund id.
 *   M2  a partial dashboard refund: stamped, NOT refunded-by-label, the server's summary says how much.
 *   M3  two partials whose cumulative cents reach the whole charge ⇒ Refunded.
 *   M4  an identical repeat delivery changes nothing and adds no audit row.
 *   M5  OUT OF ORDER: an older snapshot (one refund) after a newer one (two) cannot lower the stamp.
 *   M6  a partial refund on a payment SHARED by two bookings: neither reads Refunded; the summary is
 *       a shared-payment refund, never attributed to one booking.
 *   M7  a refund Stripe later reports failed stops counting.
 *   M8  a charge with no trustworthy cents is REFUSED before anything is written.
 *   M9  a charge whose refund list is not embedded is PAGED past 100, never truncated.
 * APP-ISSUED (`refundServiceBooking`, the service's own Stripe client stubbed):
 *   A1  status is NOT `refunded` while Stripe is being called; it is `refunded` after, with the amount
 *       recorded beside it; one Stripe call, one audit row.
 *   A2  a 50% policy refund is FINAL (`refunded`) and the summary reads "Refunded (50%)".
 *   A3  payment_pending, failed and disputed are refused before any claim or Stripe call; the dispute
 *       path (`allowDisputed`) may refund a disputed booking.
 *   A4  a network error KEEPS the claim (status unchanged); the retry re-drives the SAME key ⇒ one refund.
 *   A5  a definitive Stripe refusal RELEASES the claim.
 *   A6  the webhook seeing our refund first and the app recording it after ⇒ ONE audit row, which
 *       names the booking; a dashboard refund's row never does (the drift job's "known" set).
 *
 * Run: JOURNEY_DB_WRITES_OK=1 DATABASE_URL=… npx tsx --test server/__tests__/refund-merged-design.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { refundSummaryFor, refundSummaryLine, refundedBadgeLabel } from "../../shared/booking-refund-record";

const RUN = crypto.randomUUID().slice(0, 8);
const ids = { user: `rmd-${RUN}-user`, service: `rmd-${RUN}-svc` };
const createdBookingIds: string[] = [];
const createdPis: string[] = [];

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
before(async () => {
  if (process.env.JOURNEY_DB_WRITES_OK !== "1") {
    let host: string | null = null;
    try { host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase(); } catch { host = null; }
    if (host === null || !DISPOSABLE_HOSTS.has(host)) {
      throw new Error(`[refund-merged-design] REFUSING to write fixtures to '${host ?? "<none>"}'; opt in with JOURNEY_DB_WRITES_OK=1.`);
    }
  }
  await db.execute(sql`INSERT INTO users (id, email, first_name, last_name) VALUES (${ids.user}, ${`rmd-${RUN}@t.test`}, 'Rmd', 'Fixture')`);
  await db.execute(sql`INSERT INTO provider_services (id, user_id, service_name, price) VALUES (${ids.service}, ${ids.user}, 'Refund fixture', '100.00')`);
});

after(async () => {
  for (const pi of createdPis) await db.execute(sql`DELETE FROM refunds WHERE stripe_payment_intent_id = ${pi}`).catch(() => {});
  for (const id of createdBookingIds) {
    await db.execute(sql`DELETE FROM fee_ledger WHERE booking_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM service_bookings WHERE id = ${id}`).catch(() => {});
  }
  await db.execute(sql`DELETE FROM provider_services WHERE id = ${ids.service}`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id = ${ids.user}`).catch(() => {});
});

/** A paid cart booking: $100 booking + $0 fee, charged on `pi`. */
async function makeBooking(pi: string, status = "confirmed"): Promise<string> {
  const id = crypto.randomUUID();
  await db.execute(sql`
    INSERT INTO service_bookings (id, service_id, traveler_id, provider_id, status, total_amount, platform_fee,
      stripe_payment_intent_id, booking_details, created_at)
    VALUES (${id}, ${ids.service}, ${ids.user}, ${ids.user}, ${status}, '100.00', '0.00', ${pi}, '{}'::jsonb, NOW())
  `);
  createdBookingIds.push(id);
  if (!createdPis.includes(pi)) createdPis.push(pi);
  return id;
}

async function row(id: string): Promise<any> {
  return (await db.execute(sql`SELECT status, booking_details FROM service_bookings WHERE id = ${id}`)).rows[0];
}

async function auditRows(pi: string): Promise<any[]> {
  return (await db.execute(sql`SELECT stripe_refund_id, booking_id, amount, reason FROM refunds WHERE stripe_payment_intent_id = ${pi} ORDER BY stripe_refund_id`)).rows as any[];
}

function refundEvent(pi: string, chargeCents: number, refunds: Array<{ id: string; amount: number; status?: string; source?: string }>) {
  return {
    type: "charge.refunded",
    data: {
      object: {
        id: `ch_${pi}`,
        payment_intent: pi,
        amount: chargeCents,
        amount_refunded: refunds.filter((r) => r.status !== "failed").reduce((s, r) => s + r.amount, 0),
        currency: "usd",
        refunds: {
          has_more: false,
          data: refunds.map((r) => ({
            id: r.id, amount: r.amount, status: r.status ?? "succeeded", currency: "usd",
            metadata: r.source ? { source: r.source } : {},
          })),
        },
      },
    },
  } as any;
}

async function deliver(event: any) {
  const { stripePaymentService } = await import("../services/stripe-payment.service");
  await stripePaymentService.handleWebhook(event);
}

async function labelled(id: string): Promise<boolean> {
  const { outOfBandFullyRefundedBookingIds } = await import("../services/out-of-band-refund.service");
  return (await outOfBandFullyRefundedBookingIds([id])).has(id);
}

async function summary(id: string) {
  const { refundSummariesFor } = await import("../services/out-of-band-refund.service");
  const r = await db.execute(sql`SELECT id, booking_details AS "bookingDetails", stripe_payment_intent_id AS "stripePaymentIntentId" FROM service_bookings WHERE id = ${id}`);
  return (await refundSummariesFor(r.rows as any)).get(id) ?? null;
}

// ── WEBHOOK ────────────────────────────────────────────────────────────────────────────────────

test("M1 a full dashboard refund reads Refunded by label, changes no status and moves no money", async () => {
  const pi = `pi_${RUN}_m1`;
  const b = await makeBooking(pi);
  await deliver(refundEvent(pi, 10000, [{ id: `re_${RUN}_m1`, amount: 10000 }]));
  const r = await row(b);
  assert.equal(r.status, "confirmed", "the charge.refunded webhook writes no booking status (R163)");
  assert.equal(r.booking_details.outOfBandRefund.amountCents, 10000);
  assert.equal(r.booking_details.outOfBandRefund.chargeAmountCents, 10000);
  assert.equal(await labelled(b), true, "the whole share is covered ⇒ the label reads Refunded");
  const audit = await auditRows(pi);
  assert.equal(audit.length, 1, "ONE audit row per refund id");
  assert.equal(audit[0].stripe_refund_id, `re_${RUN}_m1`);
  assert.equal(audit[0].booking_id, null, "the webhook never names a booking — the drift job still sees a refund we did not issue");
});

test("M2 a partial dashboard refund is stamped, not labelled Refunded, and the server states the amount", async () => {
  const pi = `pi_${RUN}_m2`;
  const b = await makeBooking(pi);
  await deliver(refundEvent(pi, 10000, [{ id: `re_${RUN}_m2`, amount: 4000 }]));
  assert.equal((await row(b)).status, "confirmed");
  assert.equal(await labelled(b), false, "a partial refund never reads Refunded");
  const s = await summary(b);
  assert.deepEqual(s, { kind: "out_of_band", refundedCents: 4000, chargedCents: 10000, percent: 40 });
  assert.equal(refundSummaryLine(s), "$40.00 of $100.00 refunded");
});

test("M3 two partials whose cumulative cents reach the whole charge read Refunded", async () => {
  const pi = `pi_${RUN}_m3`;
  const b = await makeBooking(pi);
  await deliver(refundEvent(pi, 10000, [{ id: `re_${RUN}_m3a`, amount: 6000 }]));
  assert.equal(await labelled(b), false);
  await deliver(refundEvent(pi, 10000, [{ id: `re_${RUN}_m3a`, amount: 6000 }, { id: `re_${RUN}_m3b`, amount: 4000 }]));
  assert.equal((await row(b)).booking_details.outOfBandRefund.amountCents, 10000);
  assert.equal(await labelled(b), true);
  assert.equal((await auditRows(pi)).length, 2, "one audit row per refund id across both deliveries");
});

test("M4 an identical repeat delivery changes nothing and adds no audit row", async () => {
  const pi = `pi_${RUN}_m4`;
  const b = await makeBooking(pi);
  const ev = refundEvent(pi, 10000, [{ id: `re_${RUN}_m4`, amount: 2500 }]);
  await deliver(ev);
  const first = (await row(b)).booking_details.outOfBandRefund;
  await deliver(ev);
  const second = (await row(b)).booking_details.outOfBandRefund;
  assert.equal(second.amountCents, first.amountCents);
  assert.equal(second.detectedAt, first.detectedAt, "the first sighting is kept");
  assert.equal((await auditRows(pi)).length, 1);
});

test("M5 an OLDER snapshot delivered after a newer one cannot lower the cumulative stamp", async () => {
  const pi = `pi_${RUN}_m5`;
  const b = await makeBooking(pi);
  await deliver(refundEvent(pi, 10000, [{ id: `re_${RUN}_m5a`, amount: 3000 }, { id: `re_${RUN}_m5b`, amount: 7000 }]));
  await deliver(refundEvent(pi, 10000, [{ id: `re_${RUN}_m5a`, amount: 3000 }]));
  assert.equal((await row(b)).booking_details.outOfBandRefund.amountCents, 10000);
  assert.equal(await labelled(b), true);
});

test("M6 a partial refund on a SHARED payment labels neither booking and is never attributed to one", async () => {
  const pi = `pi_${RUN}_m6`;
  const a = await makeBooking(pi);
  const c = await makeBooking(pi);
  await deliver(refundEvent(pi, 20000, [{ id: `re_${RUN}_m6`, amount: 10000 }]));
  assert.equal(await labelled(a), false, "the partial equals one booking's price, and still labels neither");
  assert.equal(await labelled(c), false);
  assert.equal((await row(a)).status, "confirmed");
  const s = await summary(a);
  assert.deepEqual(s, { kind: "shared_payment", refundedCents: 10000, paymentCents: 20000 });
  assert.equal(refundSummaryLine(s), "Refund on a shared payment: $100.00 of the $200.00 payment");
  assert.equal(refundedBadgeLabel("Refunded", s), "Refunded", "no percentage is claimed for a shared payment");
});

test("M7 a refund Stripe later reports failed stops counting", async () => {
  const pi = `pi_${RUN}_m7`;
  const b = await makeBooking(pi);
  await deliver(refundEvent(pi, 10000, [{ id: `re_${RUN}_m7`, amount: 10000 }]));
  assert.equal(await labelled(b), true);
  await deliver(refundEvent(pi, 10000, [{ id: `re_${RUN}_m7`, amount: 10000, status: "failed" }]));
  assert.equal((await row(b)).booking_details.outOfBandRefund.amountCents, 0);
  assert.equal(await labelled(b), false, "money that did not go back is not a refund");
  // …and an older snapshot still saying `succeeded` cannot revive it.
  await deliver(refundEvent(pi, 10000, [{ id: `re_${RUN}_m7`, amount: 10000 }]));
  assert.equal((await row(b)).booking_details.outOfBandRefund.amountCents, 0);
});

test("M8 a charge with no trustworthy cents is refused before anything is written", async () => {
  const pi = `pi_${RUN}_m8`;
  const b = await makeBooking(pi);
  const bad = refundEvent(pi, 10000, [{ id: `re_${RUN}_m8`, amount: 10000 }]);
  bad.data.object.amount_refunded = 20000; // more refunded than charged
  const { stripePaymentService } = await import("../services/stripe-payment.service");
  await assert.rejects(() => (stripePaymentService as any).handleRefund(bad.data.object), /exceeds charge\.amount/);
  assert.equal((await row(b)).booking_details.outOfBandRefund, undefined, "nothing stamped");
  assert.equal((await auditRows(pi)).length, 0, "no audit row");
});

test("M9 a refund list that is not embedded is PAGED, never truncated at 100", async () => {
  const pi = `pi_${RUN}_m9`;
  const b = await makeBooking(pi);
  const { stripe } = await import("../services/stripe-payment.service");
  const s: any = stripe;
  const orig = s.refunds.list;
  const all = Array.from({ length: 150 }, (_, i) => ({ id: `re_${RUN}_m9_${String(i).padStart(3, "0")}`, amount: 1, status: "succeeded", currency: "usd", metadata: {} }));
  const pages: any[] = [];
  s.refunds.list = async (params: any) => {
    pages.push(params);
    const start = params.starting_after ? all.findIndex((r) => r.id === params.starting_after) + 1 : 0;
    const data = all.slice(start, start + params.limit);
    return { data, has_more: start + params.limit < all.length };
  };
  try {
    const ev = refundEvent(pi, 10000, []);
    ev.data.object.amount_refunded = 150;
    delete ev.data.object.refunds; // API ≥ 2022-11-15: the charge carries no refund list
    await deliver(ev);
  } finally {
    s.refunds.list = orig;
  }
  assert.equal(pages.length, 2, "two pages were read");
  assert.equal(pages[1].starting_after, all[99].id);
  assert.equal((await row(b)).booking_details.outOfBandRefund.amountCents, 150, "all 150 refunds counted");
});

// ── APP-ISSUED ─────────────────────────────────────────────────────────────────────────────────

type FakeMode = "ok" | "network" | "invalid";
async function withFakeRefunds<T>(mode: FakeMode | (() => FakeMode), fn: (calls: any[]) => Promise<T>, onCall?: (params: any) => Promise<void>): Promise<T> {
  const { stripe } = await import("../services/stripe-payment.service");
  const s: any = stripe;
  const orig = s.refunds.create;
  const calls: any[] = [];
  const byKey = new Map<string, any>();
  s.refunds.create = async (params: any, options: any) => {
    calls.push({ params, options });
    if (onCall) await onCall(params);
    const m = typeof mode === "function" ? mode() : mode;
    if (m === "network") throw Object.assign(new Error("socket hang up"), { type: "StripeConnectionError" });
    if (m === "invalid") throw Object.assign(new Error("charge already refunded"), { type: "StripeInvalidRequestError" });
    const key = options?.idempotencyKey;
    if (!byKey.has(key)) {
      byKey.set(key, { id: `re_${RUN}_app_${byKey.size}_${calls.length}`, status: "succeeded", amount: params.amount, currency: "usd", charge: `ch_${params.payment_intent}`, metadata: params.metadata });
    }
    return byKey.get(key);
  };
  try {
    return await fn(calls);
  } finally {
    s.refunds.create = orig;
  }
}

test("A1 the booking is NOT refunded while Stripe is called; it is refunded after, with the amount recorded", async () => {
  const pi = `pi_${RUN}_a1`;
  const b = await makeBooking(pi);
  const { stripePaymentService } = await import("../services/stripe-payment.service");
  let statusDuringCall: string | null = null;
  await withFakeRefunds("ok", async (calls) => {
    const res: any = await stripePaymentService.refundServiceBooking(b, "requested_by_customer");
    assert.equal(calls.length, 1);
    assert.equal(res.alreadyRefunded, undefined);
  }, async () => { statusDuringCall = (await row(b)).status; });
  assert.equal(statusDuringCall, "confirmed", "no 'refunded' before Stripe confirms (R163 amendment)");
  const r = await row(b);
  assert.equal(r.status, "refunded");
  assert.equal(r.booking_details.serviceBookingRefundAttempt, undefined, "the claim is consumed by the finalize");
  assert.equal(r.booking_details.serviceBookingRefund.amountCents, 10000);
  const audit = await auditRows(pi);
  assert.equal(audit.length, 1);
  assert.equal(audit[0].booking_id, b);
});

test("A2 a 50% policy refund is FINAL and reads Refunded (50%)", async () => {
  const pi = `pi_${RUN}_a2`;
  const b = await makeBooking(pi);
  const { stripePaymentService } = await import("../services/stripe-payment.service");
  await withFakeRefunds("ok", async () => {
    await stripePaymentService.refundServiceBooking(b, "requested_by_customer", { amountOverride: 50, feeRefundPercent: 50 });
  });
  const r = await row(b);
  assert.equal(r.status, "refunded", "a cancelled booking reaches a final status (decision-maker Sep 27, 2026)");
  const s = refundSummaryFor({ bookingDetails: r.booking_details, bookingsOnPayment: 1 });
  assert.deepEqual(s, { kind: "own", refundedCents: 5000, chargedCents: 10000, percent: 50 });
  assert.equal(refundedBadgeLabel("Refunded", s), "Refunded (50%)");
  assert.equal(refundSummaryLine(s), "$50.00 of $100.00 refunded");
});

test("A3 payment_pending, failed and disputed are refused before any claim or Stripe call; the dispute path may refund disputed", async () => {
  const { stripePaymentService } = await import("../services/stripe-payment.service");
  for (const status of ["payment_pending", "failed", "disputed"]) {
    const pi = `pi_${RUN}_a3_${status}`;
    const b = await makeBooking(pi, status);
    await withFakeRefunds("ok", async (calls) => {
      await assert.rejects(() => stripePaymentService.refundServiceBooking(b, "x"), (e: any) => e?.name === "ServiceBookingRefundRefusedError" && e.bookingStatus === status);
      assert.equal(calls.length, 0, `no Stripe call for ${status}`);
    });
    const r = await row(b);
    assert.equal(r.status, status);
    assert.equal(r.booking_details.serviceBookingRefundAttempt, undefined, "no claim taken");
  }
  const pi = `pi_${RUN}_a3_uphold`;
  const d = await makeBooking(pi, "disputed");
  await withFakeRefunds("ok", async (calls) => {
    await stripePaymentService.refundServiceBooking(d, "dispute_upheld", { feeRefundPercent: 100, allowDisputed: true });
    assert.equal(calls.length, 1);
  });
  assert.equal((await row(d)).status, "refunded");
});

test("A4 a network error KEEPS the claim; the retry re-drives the SAME key and makes one refund", async () => {
  const pi = `pi_${RUN}_a4`;
  const b = await makeBooking(pi);
  const { stripePaymentService } = await import("../services/stripe-payment.service");
  let mode: FakeMode = "network";
  await withFakeRefunds(() => mode, async (calls) => {
    await assert.rejects(() => stripePaymentService.refundServiceBooking(b, "x"), /Refund failed/);
    const mid = await row(b);
    assert.equal(mid.status, "confirmed");
    assert.equal(mid.booking_details.serviceBookingRefundAttempt.state, "processing", "§15b: a thrown call does not prove no refund exists");
    mode = "ok";
    await stripePaymentService.refundServiceBooking(b, "x");
    assert.equal(calls.length, 2);
    assert.equal(calls[0].options.idempotencyKey, calls[1].options.idempotencyKey, "the same key both times");
  });
  assert.equal((await row(b)).status, "refunded");
  assert.equal((await auditRows(pi)).length, 1);
});

test("A5 a definitive Stripe refusal RELEASES the claim", async () => {
  const pi = `pi_${RUN}_a5`;
  const b = await makeBooking(pi);
  const { stripePaymentService } = await import("../services/stripe-payment.service");
  await withFakeRefunds("invalid", async () => {
    await assert.rejects(() => stripePaymentService.refundServiceBooking(b, "x"), /Refund failed/);
  });
  const r = await row(b);
  assert.equal(r.status, "confirmed");
  assert.equal(r.booking_details.serviceBookingRefundAttempt, undefined);
});

test("A6 the webhook seeing our refund first and the app recording it after ⇒ ONE audit row naming the booking", async () => {
  const pi = `pi_${RUN}_a6`;
  const b = await makeBooking(pi);
  const { recordRefundAuditRow } = await import("../services/stripe-payment.service");
  const refundId = `re_${RUN}_a6`;
  await recordRefundAuditRow({ refundId, chargeId: `ch_${pi}`, paymentIntentId: pi, amountDollars: 100, currency: "usd", status: "succeeded" });
  await recordRefundAuditRow({ refundId, chargeId: `ch_${pi}`, paymentIntentId: pi, amountDollars: 100, currency: "usd", status: "pending", bookingId: b, reason: "requested_by_customer" });
  const audit = await auditRows(pi);
  assert.equal(audit.length, 1);
  assert.equal(audit[0].booking_id, b, "the app path fills in the booking");
  assert.equal(audit[0].reason, "requested_by_customer");
  const st = (await db.execute(sql`SELECT status FROM refunds WHERE stripe_refund_id = ${refundId}`)).rows[0] as any;
  assert.equal(st.status, "succeeded", "a final status is never overwritten by an older 'pending'");
});
