/**
 * Paid Optimize failure — live Stripe test-mode proof
 * (ledger `2026-10-20-optimize-paid-failure-refund`).
 *
 * A real test-mode PaymentIntent tagged `optimization_fee` is confirmed, the
 * comparison is marked failed with no optimized version, and
 * `refundFailedPaidOptimizerRun` refunds it. A second call leaves Stripe at
 * one refund. Nothing here is live mode.
 *
 * SKIP CONTRACT: without a real `sk_test_` key the file SKIPS VISIBLY.
 *
 * Run: STRIPE_SECRET_KEY=sk_test_… JOURNEY_DB_WRITES_OK=1 \
 *   npx tsx --test server/__tests__/optimizer-run-refund.stripe.db.test.ts
 */

const RAW_KEY = process.env.STRIPE_SECRET_KEY_TEST || process.env.STRIPE_SECRET_KEY || "";
const HAVE_REAL_KEY =
  /^sk_test_[A-Za-z0-9]{24,}$/.test(RAW_KEY) && !/dummy|stub|placeholder/i.test(RAW_KEY);
process.env.STRIPE_SECRET_KEY ||= "sk_test_dummy_key_for_optimizer_refund_suite";
if (!HAVE_REAL_KEY) process.env.DATABASE_URL ||= "postgresql://skip:skip@127.0.0.1:5432/skip";

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import Stripe from "stripe";
import { sql } from "drizzle-orm";

const { db } = await import("../db");
const { refundFailedPaidOptimizerRun } = await import("../services/optimizer-run-refund.service");

const RUN = crypto.randomUUID().slice(0, 8);
const CENTS = 1234;
const ids = { user: `orf-live-${RUN}`, trip: `orf-live-${RUN}-trip`, cmp: `orf-live-${RUN}-cmp` };
const stripe = HAVE_REAL_KEY ? new Stripe(RAW_KEY, { maxNetworkRetries: 2, timeout: 30000 }) : null;
const SKIP = HAVE_REAL_KEY ? false : "no real Stripe test key (STRIPE_SECRET_KEY=sk_test_…) — live proof skipped";
let paymentIntentId = "";

before(async () => {
  if (!HAVE_REAL_KEY) return;
  const host = new URL(process.env.DATABASE_URL ?? "").hostname;
  if (!["localhost", "127.0.0.1", "::1"].includes(host) && process.env.JOURNEY_DB_WRITES_OK !== "1") {
    throw new Error(`[optimizer-refund-live] refusing to write to '${host}'`);
  }
  await db.execute(sql`INSERT INTO users (id, email, first_name) VALUES (${ids.user}, ${`orf-live-${RUN}@t.test`}, 'Orf')`);
  await db.execute(sql`
    INSERT INTO trips (id, user_id, title, start_date, end_date, destination)
    VALUES (${ids.trip}, ${ids.user}, 'ORF live', '2030-01-01', '2030-01-02', 'Kyoto')
  `);
});

after(async () => {
  if (!HAVE_REAL_KEY) return;
  if (paymentIntentId) {
    await db.execute(sql`DELETE FROM fee_ledger WHERE stripe_payment_ref = ${paymentIntentId}`).catch(() => {});
    await db.execute(sql`DELETE FROM refunds WHERE stripe_payment_intent_id = ${paymentIntentId}`).catch(() => {});
    await db.execute(sql`DELETE FROM platform_revenue WHERE source_id = ${paymentIntentId}`).catch(() => {});
  }
  await db.execute(sql`DELETE FROM itinerary_comparisons WHERE id = ${ids.cmp}`).catch(() => {});
  await db.execute(sql`DELETE FROM trips WHERE id = ${ids.trip}`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id = ${ids.user}`).catch(() => {});
});

test("a real test-mode Optimize charge that ends with no version is refunded once", { skip: SKIP }, async () => {
  const pi = await stripe!.paymentIntents.create({
    amount: CENTS,
    currency: "usd",
    payment_method_types: ["card"],
    payment_method: "pm_card_visa",
    confirm: true,
    metadata: { type: "optimization_fee", source: "optimizer-refund-suite" },
  });
  paymentIntentId = pi.id;
  assert.equal(pi.status, "succeeded");

  await db.execute(sql`
    INSERT INTO itinerary_comparisons (id, user_id, trip_id, status, optimization_payment_id, title, destination)
    VALUES (${ids.cmp}, ${ids.user}, ${ids.trip}, 'failed', ${pi.id}, 'ORF live', 'Kyoto')
  `);

  const first = await refundFailedPaidOptimizerRun(ids.cmp);
  assert.deepEqual(first, { state: "refunded" });
  const listed = await stripe!.refunds.list({ payment_intent: pi.id, limit: 10 });
  assert.equal(listed.data.filter((r) => r.status !== "failed" && r.status !== "canceled").length, 1);

  const second = await refundFailedPaidOptimizerRun(ids.cmp);
  assert.deepEqual(second, { state: "refunded" });
  const again = await stripe!.refunds.list({ payment_intent: pi.id, limit: 10 });
  assert.equal(again.data.filter((r) => r.status !== "failed" && r.status !== "canceled").length, 1);
});
