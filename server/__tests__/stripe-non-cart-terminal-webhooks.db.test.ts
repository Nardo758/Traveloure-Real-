import assert from "node:assert/strict";
import test from "node:test";
import { sql } from "drizzle-orm";

import { db } from "../db";
import { stripePaymentService } from "../services/stripe-payment.service";

const run = `${Date.now()}-${process.pid}`;
const createdEventIds: string[] = [];
const createdIntentIds: string[] = [];
const createdBookingIds: string[] = [];

test.after(async () => {
  for (const id of createdEventIds) {
    await db.execute(sql`DELETE FROM webhook_events WHERE stripe_event_id = ${id}`);
  }
  for (const id of createdIntentIds) {
    await db.execute(sql`DELETE FROM payment_intents WHERE stripe_payment_intent_id = ${id}`);
  }
  for (const id of createdBookingIds) {
    await db.execute(sql`DELETE FROM bookings WHERE id = ${id}`);
  }
});

for (const eventType of ["payment_intent.payment_failed", "payment_intent.canceled"] as const) {
  for (const metadataType of [
    "optimization_fee",
    "trip_pass_purchase",
    "ready_made_purchase",
    "coordination_fee",
    "expert_service",
    "ai_task_fee",
    "booking_request",
    "transport_booking",
  ]) {
    test(`${eventType}: ${metadataType} without bookingIds records status and returns 2xx outcome`, async () => {
      const id = `pi_${run}_${eventType.split(".").at(-1)}_${metadataType}`;
      const eventId = `evt_${run}_${eventType.split(".").at(-1)}_${metadataType}`;
      createdEventIds.push(eventId);

      const result = await stripePaymentService.handleWebhook({
        id: eventId,
        type: eventType,
        data: {
          object: {
            id,
            metadata: { type: metadataType },
          },
        },
      } as any);

      assert.deepEqual(result, { received: true });
      const stored = await db.execute(sql`
        SELECT event_type, processed, error
        FROM webhook_events
        WHERE stripe_event_id = ${eventId}
      `);
      assert.equal(stored.rows.length, 1);
      // `processed`/`error` belong to processStripeWebhookEvent (the Connect rail), which is the
      // ONE author of this row's lifecycle. This rail RECORDS the delivery and writes no state,
      // so the row it lands is `processed = FALSE, error = NULL`.
      assert.deepEqual(stored.rows[0], {
        event_type: eventType,
        processed: false,
        error: null,
      });
    });
  }
}

// REPLACES an earlier assertion that a `processed` event id skipped this rail's business logic.
// That claim was REMOVED deliberately: `webhook_events` is shared with the Connect endpoint
// (webhooks.routes.ts, STRIPE_CONNECT_WEBHOOK_SECRET), Stripe delivers the SAME event id to both
// endpoints for the types they both subscribe to, and skipping on `processed` meant whichever
// endpoint arrived second silently skipped its ENTIRE switch — losing the Connect arm's revenue
// tracking and earnings mint, which exist nowhere else. These two cases pin the shape that
// replaced it.
test("a row another rail already completed is neither skipped nor clobbered", async () => {
  const eventId = `evt_${run}_foreign_completed`;
  const paymentIntentId = `pi_${run}_foreign_completed`;
  createdEventIds.push(eventId);
  createdIntentIds.push(paymentIntentId);
  const event = {
    id: eventId,
    type: "payment_intent.payment_failed",
    data: { object: { id: paymentIntentId, metadata: { type: "optimization_fee" } } },
  } as any;

  await db.execute(sql`
    INSERT INTO payment_intents (stripe_payment_intent_id, amount, currency, status, metadata)
    VALUES (${paymentIntentId}, '10.00', 'usd', 'processing', '{"type":"optimization_fee"}'::jsonb)
  `);
  // Stand in for the Connect rail having received the same event id first and finished with it.
  await db.execute(sql`
    INSERT INTO webhook_events (stripe_event_id, event_type, processed, processed_at, raw_payload)
    VALUES (${eventId}, ${event.type}, TRUE, NOW(), '{}'::jsonb)
  `);

  assert.deepEqual(await stripePaymentService.handleWebhook(event), { received: true });

  // (a) THIS rail still did its own work — the whole point. A claim on `processed` would have
  //     returned early here and left the status at 'processing'.
  const intent = await db.execute(sql`
    SELECT status FROM payment_intents WHERE stripe_payment_intent_id = ${paymentIntentId}
  `);
  assert.equal((intent.rows[0] as { status: string }).status, "failed");

  // (b) and it did not write over the other rail's completed state.
  const stored = await db.execute(sql`
    SELECT processed, error FROM webhook_events WHERE stripe_event_id = ${eventId}
  `);
  assert.deepEqual(stored.rows[0], { processed: true, error: null });
});

test("a redelivery to this rail converges on exactly one durable row", async () => {
  const eventId = `evt_${run}_redelivery`;
  const paymentIntentId = `pi_${run}_redelivery`;
  createdEventIds.push(eventId);
  createdIntentIds.push(paymentIntentId);
  const event = {
    id: eventId,
    type: "payment_intent.payment_failed",
    data: { object: { id: paymentIntentId, metadata: { type: "optimization_fee" } } },
  } as any;

  await stripePaymentService.handleWebhook(event);
  assert.deepEqual(await stripePaymentService.handleWebhook(event), { received: true });

  const stored = await db.execute(sql`
    SELECT count(*)::int AS count FROM webhook_events WHERE stripe_event_id = ${eventId}
  `);
  assert.equal((stored.rows[0] as { count: number }).count, 1);
});

for (const eventType of ["payment_intent.payment_failed", "payment_intent.canceled"] as const) {
  test(`${eventType}: cart bookingIds still follow the legacy booking branch`, async () => {
    const eventId = `evt_${run}_${eventType.split(".").at(-1)}_cart`;
    const bookingId = crypto.randomUUID();
    createdEventIds.push(eventId);
    createdBookingIds.push(bookingId);
    await db.execute(sql`
      INSERT INTO bookings (id, status, payment_status)
      VALUES (${bookingId}, 'pending_payment', 'processing')
    `);

    const result = await stripePaymentService.handleWebhook({
      id: eventId,
      type: eventType,
      data: {
        object: {
          id: `pi_${run}_${eventType.split(".").at(-1)}_cart`,
          metadata: { bookingIds: bookingId },
        },
      },
    } as any);

    assert.deepEqual(result, { received: true });
    const stored = await db.execute(sql`
      SELECT count(*)::int AS count
      FROM webhook_events
      WHERE stripe_event_id = ${eventId}
    `);
    assert.equal((stored.rows[0] as { count: number }).count, 1);
    const booking = await db.execute(sql`
      SELECT status, payment_status FROM bookings WHERE id = ${bookingId}
    `);
    assert.deepEqual(
      booking.rows[0],
      eventType === "payment_intent.payment_failed"
        ? { status: "payment_failed", payment_status: "failed" }
        : { status: "canceled", payment_status: "canceled" },
    );
  });
}