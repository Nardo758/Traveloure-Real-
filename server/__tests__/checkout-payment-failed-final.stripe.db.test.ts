/**
 * `failed` IS FINAL — live-Stripe behavioural proof (R162, ledger `2026-09-27-failed-is-final`).
 *
 * A Stripe `payment_intent.payment_failed` is NOT terminal: the SAME PaymentIntent can be confirmed
 * again and succeed. The platform's `failed` IS terminal. This file proves, against the REAL Stripe
 * test-mode API (nothing Stripe-shaped is mocked), the two things that make them agree:
 *
 *   LS1  late success — a real intent is DECLINED (pm_card_chargeDeclined), its booking is marked
 *        `failed`, then the SAME intent is confirmed with a good card and SUCCEEDS. The shared
 *        promotion keeps the booking `failed`, records the exception, and refunds the traveler
 *        through the ONE refund call site: Stripe shows exactly ONE refund for the full amount,
 *        tagged `late_success_on_failed_booking`, and every redelivery (client, webhook, drift job)
 *        leaves it at one.
 *
 *   LS2  "Try again" — after a decline, a NEW intent exists for the same plan item; retiring the
 *        stale ones CANCELS the old intent in Stripe (`cancellation_reason: abandoned`), leaves the
 *        new one open, and the old card form can no longer confirm it (Stripe refuses a canceled
 *        intent). A succeeded intent is never cancelled.
 *
 * SKIP CONTRACT (same as checkout-oneclick.stripe.db.test.ts): without a REAL test key the file
 * SKIPS VISIBLY. Test mode only — `succeeded` here is a test-mode confirm, never a real charge.
 * DISPOSABLE DB ONLY; every DB row this file writes is deleted in after().
 *
 * Run solo: STRIPE_SECRET_KEY=sk_test_… JOURNEY_DB_WRITES_OK=1 \
 *   npx tsx --test server/__tests__/checkout-payment-failed-final.stripe.db.test.ts
 */

const RAW_KEY = process.env.STRIPE_SECRET_KEY_TEST || process.env.STRIPE_SECRET_KEY || "";
const HAVE_REAL_KEY =
  /^sk_test_[A-Za-z0-9]{24,}$/.test(RAW_KEY) && !/dummy|stub|placeholder/i.test(RAW_KEY);
process.env.STRIPE_SECRET_KEY ||= "sk_test_dummy_key_for_failed_final_suite";
if (!HAVE_REAL_KEY) process.env.DATABASE_URL ||= "postgresql://skip:skip@127.0.0.1:5432/skip";

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import Stripe from "stripe";
import { sql } from "drizzle-orm";

const { db } = await import("../db");
const {
  markCheckoutPaymentFailed,
  promotePaidCheckout,
  refundLateSuccessOnFailedIntent,
  retireStalePaymentIntentsForCheckout,
  cancelStalePaymentIntent,
} = await import("../services/checkout-claim.service");

const RUN = crypto.randomUUID().slice(0, 8);
const ids = { user: `pff-${RUN}-user`, service: `pff-${RUN}-svc` };
const createdBookingIds: string[] = [];
const createdPis: string[] = [];
const stripe = HAVE_REAL_KEY ? new Stripe(RAW_KEY, { maxNetworkRetries: 2, timeout: 30000 }) : null;
const SKIP = HAVE_REAL_KEY ? false : "no real Stripe test key (STRIPE_SECRET_KEY=sk_test_…) — live proof skipped";

before(async () => {
  if (!HAVE_REAL_KEY) return;
  const host = new URL(process.env.DATABASE_URL ?? "").hostname;
  if (!["localhost", "127.0.0.1", "::1"].includes(host) && process.env.JOURNEY_DB_WRITES_OK !== "1") {
    throw new Error(`[failed-final] refusing to write to '${host}'; opt in with JOURNEY_DB_WRITES_OK=1`);
  }
  await db.execute(sql`INSERT INTO users (id, email, first_name) VALUES (${ids.user}, ${`pff-${RUN}@t.test`}, 'Pff')`);
  await db.execute(sql`
    INSERT INTO provider_services (id, user_id, service_name, price)
    VALUES (${ids.service}, ${ids.user}, 'Failed-final fixture', '100.00')
  `);
});

after(async () => {
  if (!HAVE_REAL_KEY) return;
  for (const pi of createdPis) await db.execute(sql`DELETE FROM refunds WHERE stripe_payment_intent_id = ${pi}`).catch(() => {});
  for (const id of createdBookingIds) await db.execute(sql`DELETE FROM service_bookings WHERE id = ${id}`).catch(() => {});
  await db.execute(sql`DELETE FROM provider_services WHERE id = ${ids.service}`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id = ${ids.user}`).catch(() => {});
});

async function newIntent(label: string): Promise<Stripe.PaymentIntent> {
  const pi = await stripe!.paymentIntents.create({
    amount: 12500,
    currency: "usd",
    payment_method_types: ["card"],
    metadata: { source: "failed-final-suite", run: RUN, label },
  });
  createdPis.push(pi.id);
  return pi;
}

async function decline(piId: string): Promise<void> {
  await assert.rejects(
    stripe!.paymentIntents.confirm(piId, { payment_method: "pm_card_chargeDeclined" }),
    (e: any) => e?.type === "StripeCardError",
  );
  assert.equal((await stripe!.paymentIntents.retrieve(piId)).status, "requires_payment_method",
    "Stripe's own semantics: a declined intent is NOT terminal");
}

async function makeBooking(pi: string, status: string, itemId: string): Promise<string> {
  const id = crypto.randomUUID();
  await db.execute(sql`
    INSERT INTO service_bookings (id, service_id, traveler_id, provider_id, status, total_amount, platform_fee,
      stripe_payment_intent_id, booking_details, created_at)
    VALUES (${id}, ${ids.service}, ${ids.user}, ${ids.user}, ${status}, '100.00', '25.00', ${pi},
      jsonb_build_object('itineraryItemId', ${itemId}::text), NOW())
  `);
  createdBookingIds.push(id);
  return id;
}

async function statusOf(id: string): Promise<string> {
  return ((await db.execute(sql`SELECT status FROM service_bookings WHERE id = ${id}`)).rows[0] as any).status;
}

test("LS1: a real late success on a FAILED booking stays failed and is refunded exactly once at Stripe", { skip: SKIP }, async () => {
  const pi = await newIntent("ls1");
  await decline(pi.id);
  const booking = await makeBooking(pi.id, "payment_pending", `pff-${RUN}-item-1`);
  await markCheckoutPaymentFailed({ paymentIntentId: pi.id, actor: "platform_webhook", sendEmail: async () => {} });
  assert.equal(await statusOf(booking), "failed");

  // The SAME intent, confirmed again with a good card, really succeeds.
  const ok = await stripe!.paymentIntents.confirm(pi.id, { payment_method: "pm_card_visa" });
  assert.equal(ok.status, "succeeded");

  const promo = await promotePaidCheckout({ paymentIntentId: pi.id, actor: "client", actorId: ids.user, bookingIds: [booking] });
  assert.deepEqual(promo.promoted, []);
  assert.equal(promo.lateSuccessRefund?.outcome, "refunded", JSON.stringify(promo.lateSuccessRefund));
  assert.equal(await statusOf(booking), "failed", "failed is final");

  // Every other path hears it too; none refunds again.
  await promotePaidCheckout({ paymentIntentId: pi.id, actor: "webhook", metadataBookingIds: [booking] });
  const again = await refundLateSuccessOnFailedIntent({ paymentIntentId: pi.id, actor: "reconciliation" });
  assert.equal(again.outcome, "already_refunded");

  const refunds = await stripe!.refunds.list({ payment_intent: pi.id, limit: 10 });
  assert.equal(refunds.data.length, 1, "STRIPE FACT: exactly one refund");
  assert.equal(refunds.data[0].amount, 12500, "STRIPE FACT: the full amount received");
  assert.equal(refunds.data[0].metadata?.source, "late_success_on_failed_booking");
  const audit = await db.execute(sql`SELECT count(*)::int AS n FROM refunds WHERE stripe_payment_intent_id = ${pi.id}`);
  assert.equal((audit.rows[0] as any).n, 1, "DB FACT: one refunds audit row");
});

test("LS2: 'Try again' cancels the OLD intent in Stripe after the new one exists; the old form can no longer pay", { skip: SKIP }, async () => {
  const item = `pff-${RUN}-item-2`;
  const oldPi = await newIntent("ls2-old");
  await decline(oldPi.id);
  const oldBooking = await makeBooking(oldPi.id, "failed", item);
  const newPi = await newIntent("ls2-new");
  const newBooking = await makeBooking(newPi.id, "payment_pending", item);

  const r = await retireStalePaymentIntentsForCheckout({ travelerId: ids.user, bookingIds: [newBooking], newPaymentIntentId: newPi.id });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal((await stripe!.paymentIntents.retrieve(oldPi.id)).status, "canceled", "STRIPE FACT: the OLD intent is canceled");
  assert.equal((await stripe!.paymentIntents.retrieve(oldPi.id)).cancellation_reason, "abandoned");
  assert.equal((await stripe!.paymentIntents.retrieve(newPi.id)).status, "requires_payment_method", "the NEW intent is untouched");

  // The old, still-mounted card form re-confirms the old intent: Stripe refuses a canceled intent.
  await assert.rejects(stripe!.paymentIntents.confirm(oldPi.id, { payment_method: "pm_card_visa" }));
  assert.equal(await statusOf(oldBooking), "failed");

  // Idempotent: a second retire (the same-key re-drive) finds it already canceled.
  const r2 = await retireStalePaymentIntentsForCheckout({ travelerId: ids.user, bookingIds: [newBooking], newPaymentIntentId: newPi.id });
  assert.equal(r2.ok, true);
  assert.equal(r2.stale[0]?.result.outcome, "already_canceled");
});

test("LS3: a SUCCEEDED intent is never cancelled", { skip: SKIP }, async () => {
  const pi = await newIntent("ls3");
  const ok = await stripe!.paymentIntents.confirm(pi.id, { payment_method: "pm_card_visa" });
  assert.equal(ok.status, "succeeded");
  const res = await cancelStalePaymentIntent({ paymentIntentId: pi.id });
  assert.deepEqual(res, { outcome: "not_cancellable", status: "succeeded" });
  assert.equal((await stripe!.paymentIntents.retrieve(pi.id)).status, "succeeded");
  await stripe!.refunds.create({ payment_intent: pi.id, metadata: { source: "failed-final-suite-cleanup" } }).catch(() => {});
});
