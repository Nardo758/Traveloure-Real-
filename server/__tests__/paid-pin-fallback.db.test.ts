/**
 * Row 217 — a supplied Optimize pin that does not resolve after payment fails
 * the run. It is not auto-anchored, and the paid work is refunded.
 *
 * Stripe is stubbed on the shared prototype. No network. DISPOSABLE DB ONLY.
 *
 * Run: npx tsx --test --test-concurrency=1 --test-force-exit server/__tests__/paid-pin-fallback.db.test.ts
 */
process.env.STRIPE_SECRET_KEY ||= "sk_test_dummy_paid_pin_fallback";
process.env.SESSION_SECRET ||= "paid-pin-fallback-test";

import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import Stripe from "stripe";
import { sql } from "drizzle-orm";

const { db } = await import("../db");
const { paidPinFellBack, recordUnresolvedPaidPin } = await import("../services/paid-pin-resolution");
const { optimizationFeeRefundForComparison } = await import("../services/optimizer-run-refund.service");

const RUN = crypto.randomUUID().slice(0, 8);
const CENTS = 1599;
const userId = `ppf-${RUN}-user`;
const tripId = `ppf-${RUN}-trip`;
const email = `ppf-${RUN}@t.test`;

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
function assertDisposableDb(): void {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host: string | null = null;
  try {
    host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
  } catch {
    host = null;
  }
  if (host === null || !DISPOSABLE_HOSTS.has(host)) {
    throw new Error(`[paid-pin-fallback] refusing to write fixtures on '${host ?? "<none>"}'`);
  }
}

const probe = new Stripe("sk_test_dummy");
const refundsProto = Object.getPrototypeOf(probe.refunds);
const intentsProto = Object.getPrototypeOf(probe.paymentIntents);
const originalRefundCreate = refundsProto.create;
const originalIntentRetrieve = intentsProto.retrieve;

const intents = new Map<string, { amount: number; type: string }>();
intentsProto.retrieve = async (id: string) => {
  const bound = intents.get(id);
  if (!bound) throw new Error(`No such PaymentIntent (stub): ${id}`);
  return {
    id,
    status: "succeeded",
    amount: bound.amount,
    amount_refunded: 0,
    currency: "usd",
    metadata: { type: bound.type },
  };
};
refundsProto.create = async (params: { amount: number; metadata?: Record<string, string> }) => ({
  id: `re_${RUN}_${crypto.randomUUID().slice(0, 8)}`,
  status: "succeeded",
  amount: params.amount,
  currency: "usd",
  charge: "ch_stub",
  metadata: params.metadata,
});

const comparisonIds: string[] = [];
const paymentIds: string[] = [];

async function comparison(pi: string): Promise<string> {
  const id = `ppf-${RUN}-cmp-${crypto.randomUUID().slice(0, 8)}`;
  comparisonIds.push(id);
  paymentIds.push(pi);
  intents.set(pi, { amount: CENTS, type: "optimization_fee" });
  await db.execute(sql`
    INSERT INTO itinerary_comparisons (id, user_id, trip_id, status, optimization_payment_id, title, destination)
    VALUES (${id}, ${userId}, ${tripId}, 'generated', ${pi}, 'Pin fallback', 'Kyoto')
  `);
  return id;
}

before(async () => {
  assertDisposableDb();
  await db.execute(sql`INSERT INTO users (id, email, role) VALUES (${userId}, ${email}, 'user')`);
  await db.execute(sql`
    INSERT INTO trips (id, user_id, title, start_date, end_date, destination)
    VALUES (${tripId}, ${userId}, 'Pin fallback', '2030-04-01', '2030-04-05', 'Kyoto')
  `);
});

after(async () => {
  refundsProto.create = originalRefundCreate;
  intentsProto.retrieve = originalIntentRetrieve;
  for (const id of comparisonIds) {
    await db.execute(sql`DELETE FROM itinerary_variants WHERE comparison_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM fee_ledger WHERE source_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM email_outbox WHERE metadata->>'comparisonId' = ${id}`).catch(() => {});
  }
  for (const pi of paymentIds) {
    await db.execute(sql`DELETE FROM refunds WHERE stripe_payment_intent_id = ${pi}`).catch(() => {});
    await db.execute(sql`DELETE FROM platform_revenue WHERE source_id = ${pi}`).catch(() => {});
    await db.execute(sql`DELETE FROM fee_ledger WHERE idempotency_key LIKE ${"%" + pi + "%"}`).catch(() => {});
  }
  await db.execute(sql`DELETE FROM itinerary_comparisons WHERE user_id = ${userId}`).catch(() => {});
  await db.execute(sql`DELETE FROM trips WHERE id = ${tripId}`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id = ${userId}`).catch(() => {});
});

test("an omitted pin stays auto-anchor; a supplied pin that does not resolve is a fallback", () => {
  assert.equal(paidPinFellBack(undefined, undefined), false);
  assert.equal(paidPinFellBack({ type: "nope" }, undefined), false);
  assert.equal(
    paidPinFellBack({ type: "hotel", id: "hotel-1" }, { lat: 35, lng: 135 }),
    false,
    "a resolved pin is not a fallback",
  );
  assert.equal(
    paidPinFellBack({ type: "neighborhood", id: "hood-1", name: "Gion" }, undefined),
    true,
  );
  assert.equal(paidPinFellBack({ type: "activity", id: "stop-1" }, null), true);
});

test("a paid comparison whose pin does not resolve is failed, refunded, and stores no variant", async () => {
  const pi = `pi_ppf_${RUN}_paid`;
  const id = await comparison(pi);
  const body = await recordUnresolvedPaidPin(id);

  assert.equal(body.status, "failed");
  assert.equal(body.id, id);
  assert.notEqual(body.status, "generated");
  assert.notEqual(body.status, "generating");

  const stored = await db.execute(sql`
    SELECT status FROM itinerary_comparisons WHERE id = ${id}
  `);
  assert.equal((stored.rows[0] as { status: string }).status, "failed");

  const variants = await db.execute(sql`
    SELECT count(*)::int AS n FROM itinerary_variants WHERE comparison_id = ${id}
  `);
  assert.equal(Number((variants.rows[0] as { n: number }).n), 0, "no auto-anchored variant was stored");

  const refunds = await db.execute(sql`
    SELECT stripe_refund_id, reason FROM refunds WHERE stripe_payment_intent_id = ${pi}
  `);
  assert.equal(refunds.rows.length, 1, "the paid work is recorded as a refund, not dropped");
  const refund = refunds.rows[0] as { stripe_refund_id: string; reason: string };
  assert.equal(refund.reason, "optimizer_run_failed");
  assert.match(refund.stripe_refund_id, /^re_/);

  const shown = await optimizationFeeRefundForComparison({
    id,
    status: "failed",
    optimizationPaymentId: pi,
  });
  assert.equal(shown, "refunded", "the comparison page already renders this refund state");
});
