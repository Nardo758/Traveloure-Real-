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
      assert.deepEqual(stored.rows[0], {
        event_type: eventType,
        processed: true,
        error: null,
      });
    });
  }
}

test("a processed Stripe event id does not execute terminal business logic twice", async () => {
  const eventId = `evt_${run}_dedup`;
  const paymentIntentId = `pi_${run}_dedup`;
  createdEventIds.push(eventId);
  createdIntentIds.push(paymentIntentId);
  const event = {
    id: eventId,
    type: "payment_intent.payment_failed",
    data: {
      object: {
        id: paymentIntentId,
        metadata: { type: "optimization_fee" },
      },
    },
  } as any;

  await db.execute(sql`
    INSERT INTO payment_intents (stripe_payment_intent_id, amount, currency, status, metadata)
    VALUES (${paymentIntentId}, '10.00', 'usd', 'processing', '{"type":"optimization_fee"}'::jsonb)
  `);
  await stripePaymentService.handleWebhook(event);
  await db.execute(sql`
    UPDATE payment_intents SET status = 'sentinel_after_first_delivery'
    WHERE stripe_payment_intent_id = ${paymentIntentId}
  `);

  assert.deepEqual(await stripePaymentService.handleWebhook(event), { received: true });
  const stored = await db.execute(sql`
    SELECT status FROM payment_intents WHERE stripe_payment_intent_id = ${paymentIntentId}
  `);
  assert.equal((stored.rows[0] as { status: string }).status, "sentinel_after_first_delivery");
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
      WHERE stripe_event_id = ${eventId} AND processed = TRUE
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