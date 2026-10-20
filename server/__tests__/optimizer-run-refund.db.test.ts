/**
 * A paid Optimize run that ends with no optimized version is refunded once
 * (ledger `2026-10-20-optimize-paid-failure-refund`).
 *
 * Stripe is stubbed on the shared prototype. No network. The amount is this
 * file's fixture, not a fee band. DISPOSABLE DB ONLY; rows are deleted in after().
 *
 * Run: JOURNEY_DB_WRITES_OK=1 npx tsx --test --test-concurrency=1 server/__tests__/optimizer-run-refund.db.test.ts
 */

process.env.STRIPE_SECRET_KEY ||= "sk_test_dummy_optimizer_refund";
process.env.SESSION_SECRET ||= "optimizer-refund-test";

import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import Stripe from "stripe";
import { sql } from "drizzle-orm";

const { db } = await import("../db");
const { recordOptimizerRunToll } = await import("../services/fee-ledger.service");
const { getAvailableCoordinationCreditCents } = await import("../services/optimization-fee.service");
const {
  refundFailedPaidOptimizerRun,
  recordedOptimizerPaymentForRetry,
  retryPendingOptimizerRefunds,
} = await import("../services/optimizer-run-refund.service");
const { optimizerRunRefundIdempotencyKey } = await import("@shared/optimizer-run-refund");

const RUN = crypto.randomUUID().slice(0, 8);
const CENTS = 1234;
const userId = `orf-${RUN}-user`;
const tripId = `orf-${RUN}-trip`;

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
    throw new Error(`[optimizer-run-refund] refusing to write fixtures on '${host ?? "<none>"}'`);
  }
}

const probe = new Stripe("sk_test_dummy");
const refundsProto = Object.getPrototypeOf(probe.refunds);
const intentsProto = Object.getPrototypeOf(probe.paymentIntents);
const originalRefundCreate = refundsProto.create;
const originalIntentRetrieve = intentsProto.retrieve;

const intents = new Map<string, { amount: number; type: string }>();
type RefundCall = { params: any; options: any };
let refundCalls: RefundCall[] = [];
const refundsByKey = new Map<string, any>();
let failNextRefunds = 0;

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
refundsProto.create = async (params: any, options: any) => {
  refundCalls.push({ params, options });
  if (failNextRefunds > 0) {
    failNextRefunds -= 1;
    throw new Error("stripe_down (stub)");
  }
  const key: string | undefined = options?.idempotencyKey;
  if (key && refundsByKey.has(key)) return refundsByKey.get(key);
  const refund = {
    id: `re_${RUN}_${crypto.randomUUID().slice(0, 8)}`,
    status: "succeeded",
    amount: params.amount,
    currency: "usd",
    charge: "ch_stub",
    metadata: params.metadata,
  };
  if (key) refundsByKey.set(key, refund);
  return refund;
};

const comparisonIds: string[] = [];
const paymentIds: string[] = [];

async function comparison(opts: { status: string; pi: string | null; variant?: boolean }): Promise<string> {
  const id = `orf-${RUN}-cmp-${crypto.randomUUID().slice(0, 8)}`;
  comparisonIds.push(id);
  if (opts.pi) paymentIds.push(opts.pi);
  await db.execute(sql`
    INSERT INTO itinerary_comparisons (id, user_id, trip_id, status, optimization_payment_id, title, destination)
    VALUES (${id}, ${userId}, ${tripId}, ${opts.status}, ${opts.pi}, 'ORF', 'Kyoto')
  `);
  if (opts.variant) {
    await db.execute(sql`
      INSERT INTO itinerary_variants (id, comparison_id, name, source)
      VALUES (${`${id}-v`}, ${id}, 'A', 'ai_optimized')
    `);
  }
  return id;
}

async function ledgerRows(comparisonId: string) {
  const r = await db.execute(sql`
    SELECT fee_type, amount::text AS amount, reverses_ledger_id, stripe_refund_ref, idempotency_key
      FROM fee_ledger WHERE source_id = ${comparisonId}
     ORDER BY fee_type
  `);
  return r.rows as Array<{ fee_type: string; amount: string; reverses_ledger_id: string | null; stripe_refund_ref: string | null; idempotency_key: string }>;
}

before(async () => {
  assertDisposableDb();
  await db.execute(sql`INSERT INTO users (id, email, role) VALUES (${userId}, ${`orf-${RUN}@t.test`}, 'user')`);
  await db.execute(sql`
    INSERT INTO trips (id, user_id, title, start_date, end_date, destination)
    VALUES (${tripId}, ${userId}, 'ORF', '2030-01-01', '2030-01-05', 'Kyoto')
  `);
});

after(async () => {
  refundsProto.create = originalRefundCreate;
  intentsProto.retrieve = originalIntentRetrieve;
  for (const id of comparisonIds) {
    await db.execute(sql`DELETE FROM fee_ledger WHERE source_id = ${id} AND fee_type = 'reversal'`).catch(() => {});
    await db.execute(sql`DELETE FROM fee_ledger WHERE source_id = ${id}`).catch(() => {});
  }
  for (const pi of paymentIds) {
    await db.execute(sql`DELETE FROM refunds WHERE stripe_payment_intent_id = ${pi}`).catch(() => {});
    await db.execute(sql`DELETE FROM platform_revenue WHERE source_id = ${pi}`).catch(() => {});
    await db.execute(sql`DELETE FROM coordination_fee_credits WHERE source_payment_intent_id = ${pi}`).catch(() => {});
  }
  await db.execute(sql`DELETE FROM itinerary_comparisons WHERE user_id = ${userId}`).catch(() => {});
  await db.execute(sql`DELETE FROM trips WHERE id = ${tripId}`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id = ${userId}`).catch(() => {});
});

test("a paid empty run refunds once, reverses the toll and the credit, and a retry does not refund again", async () => {
  refundCalls = [];
  const pi = `pi_orf_${RUN}_paid`;
  intents.set(pi, { amount: CENTS, type: "optimization_fee" });
  const id = await comparison({ status: "failed", pi });
  await recordOptimizerRunToll({
    comparisonId: id,
    tripId,
    userExperienceId: null,
    eventType: "wedding",
    tier: "standard",
    priceCents: CENTS,
    actor: "test",
    basis: "paid",
    paymentIntentId: pi,
  });
  await db.execute(sql`
    INSERT INTO coordination_fee_credits (id, user_id, source_payment_intent_id, amount_cents, currency, event_type)
    VALUES (${`orf-${RUN}-credit`}, ${userId}, ${pi}, ${CENTS}, 'USD', 'wedding')
  `);
  await db.execute(sql`
    INSERT INTO platform_revenue (id, source_type, source_id, gross_amount, platform_fee, net_amount, currency, status)
    VALUES (${`orf-${RUN}-rev`}, 'optimization_fee', ${pi}, '12.34', '12.34', '12.34', 'USD', 'recorded')
  `);
  assert.equal(await getAvailableCoordinationCreditCents(userId, "wedding"), CENTS);

  const first = await refundFailedPaidOptimizerRun(id);
  assert.deepEqual(first, { state: "refunded" });
  assert.equal(refundCalls.length, 1);
  assert.equal(refundCalls[0].options?.idempotencyKey, optimizerRunRefundIdempotencyKey(pi));
  assert.equal(refundCalls[0].params.amount, CENTS);
  assert.equal(refundCalls[0].params.reason, "requested_by_customer");

  const rows = await ledgerRows(id);
  const fee = rows.find((r) => r.fee_type === "ai_concierge_fee");
  const rev = rows.find((r) => r.fee_type === "reversal");
  assert.ok(fee && rev, JSON.stringify(rows));
  const feeId = await db.execute(sql`
    SELECT id FROM fee_ledger WHERE source_id = ${id} AND fee_type = 'ai_concierge_fee'
  `);
  assert.equal(rev.reverses_ledger_id, String((feeId.rows[0] as { id: string }).id));
  assert.equal(Number(rev.amount), -Number(fee.amount));
  assert.match(rev.stripe_refund_ref ?? "", /^re_/);
  assert.equal(await getAvailableCoordinationCreditCents(userId, "wedding"), 0);
  const credit = await db.execute(sql`SELECT amount_cents FROM coordination_fee_credits WHERE source_payment_intent_id = ${pi}`);
  assert.equal(Number((credit.rows[0] as any).amount_cents), CENTS, "the credit row stays; it is no longer available");

  const revenue = await db.execute(sql`
    SELECT status, gross_amount::text AS gross, metadata
      FROM platform_revenue WHERE source_id = ${pi} ORDER BY gross_amount DESC
  `);
  assert.equal(revenue.rows.length, 2);
  assert.equal((revenue.rows[0] as any).status, "reversed");
  assert.equal(Number((revenue.rows[1] as any).gross), -12.34);
  assert.equal((revenue.rows[1] as any).metadata?.reason, "optimizer_run_failed");
  assert.equal((revenue.rows[1] as any).metadata?.paymentIntentId, undefined);

  const audits = await db.execute(sql`
    SELECT stripe_refund_id FROM refunds WHERE stripe_payment_intent_id = ${pi} AND reason = 'optimizer_run_failed'
  `);
  assert.equal(audits.rows.length, 1);
  assert.match(String((audits.rows[0] as any).stripe_refund_id), /^re_/);

  const second = await refundFailedPaidOptimizerRun(id);
  assert.deepEqual(second, { state: "refunded" });
  assert.equal(refundCalls.length, 1, "one refund per PaymentIntent");
  assert.equal((await ledgerRows(id)).filter((r) => r.fee_type === "reversal").length, 1);
  assert.equal(await recordedOptimizerPaymentForRetry({ id, optimizationPaymentId: pi }), null);
});

test("a generated run with no optimized version is refunded the same way", async () => {
  refundCalls = [];
  const pi = `pi_orf_${RUN}_gen`;
  intents.set(pi, { amount: CENTS, type: "optimization_fee" });
  const id = await comparison({ status: "generated", pi });
  const result = await refundFailedPaidOptimizerRun(id);
  assert.deepEqual(result, { state: "refunded" });
  assert.equal(refundCalls.length, 1);
});

test("a run that stored an optimized version is not refunded", async () => {
  refundCalls = [];
  const pi = `pi_orf_${RUN}_ok`;
  intents.set(pi, { amount: CENTS, type: "optimization_fee" });
  const id = await comparison({ status: "failed", pi, variant: true });
  const result = await refundFailedPaidOptimizerRun(id);
  assert.deepEqual(result, { state: "skipped", reason: "delivered" });
  assert.equal(refundCalls.length, 0);
  assert.equal(await recordedOptimizerPaymentForRetry({ id, optimizationPaymentId: pi }), pi);
});

test("a run with no PaymentIntent is not refunded", async () => {
  refundCalls = [];
  const id = await comparison({ status: "failed", pi: null });
  const result = await refundFailedPaidOptimizerRun(id);
  assert.deepEqual(result, { state: "skipped", reason: "unpaid" });
  assert.equal(refundCalls.length, 0);
});

test("a Stripe failure keeps the claim, blocks the credit, and the retry refunds once", async () => {
  refundCalls = [];
  failNextRefunds = 1;
  const pi = `pi_orf_${RUN}_retry`;
  intents.set(pi, { amount: CENTS, type: "optimization_fee" });
  const id = await comparison({ status: "failed", pi });
  await db.execute(sql`
    INSERT INTO coordination_fee_credits (id, user_id, source_payment_intent_id, amount_cents)
    VALUES (${`orf-${RUN}-credit2`}, ${userId}, ${pi}, ${CENTS})
  `);
  const pending = await refundFailedPaidOptimizerRun(id);
  assert.deepEqual(pending, { state: "pending" });
  assert.equal(refundCalls.length, 1);
  assert.equal(await getAvailableCoordinationCreditCents(userId), 0);
  const claim = await db.execute(sql`
    SELECT stripe_refund_id FROM refunds WHERE stripe_payment_intent_id = ${pi}
  `);
  assert.match(String((claim.rows[0] as any).stripe_refund_id), /^pending-optimizer-/);

  const n = await retryPendingOptimizerRefunds();
  assert.equal(n, 1);
  assert.equal(refundCalls.length, 2, "the retry re-drives the same PaymentIntent");
  assert.equal(refundCalls[1].options?.idempotencyKey, refundCalls[0].options?.idempotencyKey);
  const done = await db.execute(sql`
    SELECT stripe_refund_id FROM refunds WHERE stripe_payment_intent_id = ${pi} AND reason = 'optimizer_run_failed'
  `);
  assert.equal(done.rows.length, 1);
  assert.match(String((done.rows[0] as any).stripe_refund_id), /^re_/);
});

test("the outcome writer and the regenerate gate call this refund", () => {
  const outcome = readFileSync("server/services/itinerary-generation-outcome.service.ts", "utf8");
  const routes = readFileSync("server/routes.ts", "utf8");
  const stripeSrc = readFileSync("server/services/stripe-payment.service.ts", "utf8");
  assert.match(outcome, /refundFailedPaidOptimizerRun/);
  assert.match(routes, /recordedOptimizerPaymentForRetry/);
  assert.match(routes, /payment_refunded/);
  assert.match(stripeSrc, /async refundFailedOptimizerRun/);
  const stripeCode = stripeSrc.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.equal(stripeCode.match(/stripe\.refunds\.create/g)?.length, 1);
});
