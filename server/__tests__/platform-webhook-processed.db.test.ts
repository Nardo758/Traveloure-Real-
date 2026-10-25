/**
 * Fix queue row 166. The platform webhook marks `webhook_events` after the handler,
 * in the same way Connect's `processStripeWebhookEvent` does.
 *
 *   W1  a handled event ends `processed=true`, `error` null
 *   W2  a handler throw leaves `processed=false`, stores `error`, and the route still
 *       answers 500 with the same body
 *   W3  an in-flight claim still rejects and does not record `error` (Connect's split)
 *   W4  a duplicate event id does not re-run the handler and stays one row
 *   W5  the processed/error statements match Connect, and amount/capture/refund/ledger
 *       functions do not contain them
 *
 * Run solo: npx tsx --test server/__tests__/platform-webhook-processed.db.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { sql } from "drizzle-orm";
import Stripe from "stripe";

import { db } from "../db";
import { createPlatformStripeWebhookHandler } from "../routes/bookings";
import { stripePaymentService } from "../services/stripe-payment.service";
import { WebhookClaimInFlightError } from "../services/webhook-claim.service";

const run = `${Date.now()}-${process.pid}`;
const eventIds: string[] = [];
const intentIds: string[] = [];

// Local signing secret for the in-process route calls. Not a deployed credential.
const PLATFORM_WEBHOOK_SECRET = `whsec_${Buffer.from("platform-webhook-processed-row-166").toString("base64")}`;
process.env.STRIPE_WEBHOOK_SECRET_TEST = PLATFORM_WEBHOOK_SECRET;

const serviceSrc = readFileSync(new URL("../services/stripe-payment.service.ts", import.meta.url), "utf8");
const connectSrc = readFileSync(new URL("../routes/webhooks.routes.ts", import.meta.url), "utf8");
const bookingsSrc = readFileSync(new URL("../routes/bookings.ts", import.meta.url), "utf8");

test.after(async () => {
  for (const id of eventIds) {
    await db.execute(sql`DELETE FROM platform_webhook_consumers WHERE stripe_event_id = ${id}`);
    await db.execute(sql`DELETE FROM webhook_events WHERE stripe_event_id = ${id}`);
  }
  for (const id of intentIds) {
    await db.execute(sql`DELETE FROM payment_intents WHERE stripe_payment_intent_id = ${id}`);
  }
});

function rowsOf(result: unknown): Record<string, unknown>[] {
  const record = result as { rows?: Record<string, unknown>[] };
  return record.rows ?? [];
}

function between(src: string, start: string, end: string): string {
  const at = src.indexOf(start);
  const until = src.indexOf(end, at + start.length);
  assert.ok(at >= 0 && until > at, `${start} .. ${end}`);
  return src.slice(at, until);
}

function webhookUpdates(src: string): string[] {
  return [...src.matchAll(/await db\.execute\(sql`\s*UPDATE webhook_events[\s\S]*?WHERE stripe_event_id = \$\{event\.id\}\s*`\)/g)].map((match) =>
    match[0].replace(/\s+/g, " ").replace(/^await db\.execute\(sql`|`\)$/g, "").trim(),
  );
}

async function moneyRows(eventId: string, paymentIntentId: string | null): Promise<{ fees: number; revenue: number; refunds: number }> {
  const fees = await db.execute(sql`
    SELECT count(*)::int AS n FROM fee_ledger
    WHERE source_id = ${eventId}
       OR stripe_payment_ref = ${eventId}
       OR (${paymentIntentId}::text IS NOT NULL AND stripe_payment_ref = ${paymentIntentId})
  `);
  const revenue = await db.execute(sql`
    SELECT count(*)::int AS n FROM platform_revenue
    WHERE source_id = ${eventId}
       OR (${paymentIntentId}::text IS NOT NULL AND metadata->>'paymentIntentId' = ${paymentIntentId})
  `);
  const refunds = await db.execute(sql`
    SELECT count(*)::int AS n FROM refunds
    WHERE stripe_charge_id = ${eventId}
       OR stripe_payment_intent_id = ${eventId}
       OR (${paymentIntentId}::text IS NOT NULL AND stripe_payment_intent_id = ${paymentIntentId})
  `);
  return {
    fees: Number(rowsOf(fees)[0]?.n ?? 0),
    revenue: Number(rowsOf(revenue)[0]?.n ?? 0),
    refunds: Number(rowsOf(refunds)[0]?.n ?? 0),
  };
}

async function eventRow(eventId: string): Promise<Record<string, unknown>> {
  const stored = await db.execute(sql`
    SELECT processed, error, processed_at
    FROM webhook_events
    WHERE stripe_event_id = ${eventId}
  `);
  assert.equal(rowsOf(stored).length, 1);
  return rowsOf(stored)[0];
}

function signedRequest(event: Record<string, unknown>) {
  const payload = JSON.stringify(event);
  const stripe = new Stripe("sk_test_platform_webhook_processed", {
    apiVersion: "2024-12-18.acacia" as Stripe.LatestApiVersion,
  });
  const signature = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: PLATFORM_WEBHOOK_SECRET,
  });
  return {
    payload,
    req: {
      headers: { "stripe-signature": signature },
      rawBody: Buffer.from(payload),
    },
  };
}

function mockRes() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
}

test("W5: processed and error writes match Connect and stay out of amount, capture, refund, and ledger functions", () => {
  const platform = new Set(webhookUpdates(serviceSrc));
  const connect = new Set(webhookUpdates(connectSrc));
  assert.deepEqual(platform, connect);
  assert.equal(platform.size, 2);

  const hook = between(serviceSrc, "async handleWebhook(", "private generateConfirmationCode(");
  assert.ok(hook.indexOf("runUnderWebhookClaim") < hook.indexOf("SET processed"));
  assert.ok(hook.indexOf("SET error") < hook.indexOf("SET processed"));
  assert.match(hook, /return \{ received: true \}/);

  for (const [start, end] of [
    ["async createPaymentIntent(", "async handleWebhook("],
    ["async handlePaymentSucceeded(", "private async reportUnclaimedLegacyPaymentSignal("],
    ["private async handlePaymentFailed(", "private async handlePaymentCanceled("],
    ["private async handleRefund(", "async refundServiceBooking("],
    ["async refundServiceBooking(", "async refundBundlePartialSettlement("],
    ["async captureHandoffPayment(", "async refundHandoffFee("],
  ] as const) {
    const slice = between(serviceSrc, start, end);
    assert.equal(slice.includes("UPDATE webhook_events"), false, start);
    assert.equal(slice.includes("SET processed"), false, start);
  }

  assert.match(between(serviceSrc, "async createPaymentIntent(", "async handleWebhook("), /paymentIntents\.create/);
  assert.match(between(serviceSrc, "async captureHandoffPayment(", "async refundHandoffFee("), /paymentIntents\.capture/);
  assert.match(between(serviceSrc, "async refundServiceBooking(", "async refundBundlePartialSettlement("), /refunds\.create/);
  assert.match(bookingsSrc, /res\.status\(500\)\.json\(\{ error: 'Webhook processing failed; delivery can be retried' \}\)/);
  assert.match(bookingsSrc, /res\.json\(\{ received: true \}\)/);
});

test("W1: a handled event ends processed=true and writes no fee, revenue, or refund row", async () => {
  const eventId = `evt_${run}_ok`;
  eventIds.push(eventId);
  const event = { id: eventId, type: "invoice.upcoming", data: { object: { id: `in_${run}_ok` } } };

  assert.deepEqual(await stripePaymentService.handleWebhook(event as never), { received: true });

  const stored = await eventRow(eventId);
  assert.equal(stored.processed, true);
  assert.equal(stored.error, null);
  assert.ok(stored.processed_at, "processed_at is set with the flag");
  assert.deepEqual(await moneyRows(eventId, null), { fees: 0, revenue: 0, refunds: 0 });

  const res = mockRes();
  const httpEventId = `evt_${run}_ok_http`;
  eventIds.push(httpEventId);
  const httpEvent = {
    id: httpEventId,
    object: "event",
    type: "invoice.upcoming",
    data: { object: { id: `in_${run}_ok_http` } },
  };
  const { req } = signedRequest(httpEvent);
  await createPlatformStripeWebhookHandler()(req, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { received: true });
  assert.equal((await eventRow(httpEventId)).processed, true);
  assert.deepEqual(await moneyRows(httpEventId, null), { fees: 0, revenue: 0, refunds: 0 });
});

test("W2: a handler throw stays unprocessed, records error, and the route still returns 500", async () => {
  const eventId = `evt_${run}_boom`;
  const paymentIntentId = `pi_${run}_boom`;
  eventIds.push(eventId);
  intentIds.push(paymentIntentId);
  const event = {
    id: eventId,
    type: "payment_intent.succeeded",
    data: { object: { id: paymentIntentId } },
  };

  await assert.rejects(
    () => stripePaymentService.handleWebhook(event as never),
    (err: unknown) => {
      assert.ok(err instanceof TypeError);
      assert.match((err as TypeError).message, /metadata/);
      return true;
    },
  );

  const stored = await eventRow(eventId);
  assert.equal(stored.processed, false);
  assert.match(String(stored.error), /metadata/);
  const claim = await db.execute(sql`
    SELECT completed_at, error
    FROM platform_webhook_consumers
    WHERE stripe_event_id = ${eventId} AND consumer = 'platform'
  `);
  assert.equal(rowsOf(claim)[0]?.completed_at ?? null, null);
  assert.match(String(rowsOf(claim)[0]?.error), /metadata/);
  assert.deepEqual(await moneyRows(eventId, paymentIntentId), { fees: 0, revenue: 0, refunds: 0 });

  const httpEventId = `evt_${run}_boom_http`;
  const httpPi = `pi_${run}_boom_http`;
  eventIds.push(httpEventId);
  intentIds.push(httpPi);
  const httpEvent = {
    id: httpEventId,
    object: "event",
    type: "payment_intent.succeeded",
    data: { object: { id: httpPi } },
  };
  const res = mockRes();
  const { req } = signedRequest(httpEvent);
  await createPlatformStripeWebhookHandler()(req, res);
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: "Webhook processing failed; delivery can be retried" });
  const httpStored = await eventRow(httpEventId);
  assert.equal(httpStored.processed, false);
  assert.match(String(httpStored.error), /metadata/);
  assert.deepEqual(await moneyRows(httpEventId, httpPi), { fees: 0, revenue: 0, refunds: 0 });
});

test("W3: an in-flight claim still rejects and does not record webhook_events.error", async () => {
  const eventId = `evt_${run}_inflight`;
  eventIds.push(eventId);
  const event = { id: eventId, type: "invoice.upcoming", data: { object: { id: `in_${run}_inflight` } } };
  await db.execute(sql`
    INSERT INTO platform_webhook_consumers (stripe_event_id, consumer, event_type, raw_payload)
    VALUES (${eventId}, 'platform', ${event.type}, ${JSON.stringify(event)}::jsonb)
  `);

  await assert.rejects(
    () => stripePaymentService.handleWebhook(event as never),
    (err: unknown) => err instanceof WebhookClaimInFlightError,
  );

  const stored = await eventRow(eventId);
  assert.equal(stored.processed, false);
  assert.equal(stored.error, null);
  assert.deepEqual(await moneyRows(eventId, null), { fees: 0, revenue: 0, refunds: 0 });
});

test("W4: a duplicate event id keeps one row and does not re-run the handler", async () => {
  const eventId = `evt_${run}_dup`;
  const paymentIntentId = `pi_${run}_dup`;
  eventIds.push(eventId);
  intentIds.push(paymentIntentId);
  await db.execute(sql`
    INSERT INTO payment_intents (stripe_payment_intent_id, amount, currency, status, metadata)
    VALUES (${paymentIntentId}, '10.00', 'usd', 'processing', '{"type":"optimization_fee"}'::jsonb)
  `);
  const event = {
    id: eventId,
    type: "payment_intent.payment_failed",
    data: { object: { id: paymentIntentId, metadata: { type: "optimization_fee" } } },
  };

  assert.deepEqual(await stripePaymentService.handleWebhook(event as never), { received: true });
  const first = await db.execute(sql`
    SELECT status FROM payment_intents WHERE stripe_payment_intent_id = ${paymentIntentId}
  `);
  assert.equal(rowsOf(first)[0]?.status, "failed");

  await db.execute(sql`
    UPDATE payment_intents SET status = 'processing' WHERE stripe_payment_intent_id = ${paymentIntentId}
  `);
  assert.deepEqual(await stripePaymentService.handleWebhook(event as never), { received: true });

  const second = await db.execute(sql`
    SELECT status FROM payment_intents WHERE stripe_payment_intent_id = ${paymentIntentId}
  `);
  assert.equal(rowsOf(second)[0]?.status, "processing", "the completed claim skipped the handler");
  const count = await db.execute(sql`
    SELECT count(*)::int AS n FROM webhook_events WHERE stripe_event_id = ${eventId}
  `);
  assert.equal(rowsOf(count)[0]?.n, 1);
  const stored = await eventRow(eventId);
  assert.equal(stored.processed, true);
  assert.equal(stored.error, null);
  assert.deepEqual(await moneyRows(eventId, paymentIntentId), { fees: 0, revenue: 0, refunds: 0 });
});
