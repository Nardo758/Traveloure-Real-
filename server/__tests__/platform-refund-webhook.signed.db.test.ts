import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import Stripe from "stripe";
import { pool } from "../db";

test("signed platform charge.refunded applies full and cumulative refunds to bookings", async (t) => {
  if (process.env.JOURNEY_DB_WRITES_OK !== "1") {
    t.skip("Requires explicit development database write opt-in");
    return;
  }
  assert.notEqual(process.env.NODE_ENV, "production");
  assert.ok(process.env.DATABASE_URL);
  assert.notEqual(process.env.DATABASE_URL, process.env.PROD_DATABASE_URL);
  assert.ok(process.env.STRIPE_WEBHOOK_SECRET_TEST, "set the test-mode Stripe webhook secret");
  assert.notEqual(
    process.env.STRIPE_WEBHOOK_SECRET_TEST,
    process.env.STRIPE_WEBHOOK_SECRET,
    "refusing to sign a fixture with the production webhook secret",
  );

  // The running app to deliver to: CI's local server (JOURNEY_BASE_URL), or the Replit dev domain.
  const baseUrl = process.env.JOURNEY_BASE_URL
    ?? (process.env.REPLIT_DEV_DOMAIN?.endsWith(".replit.dev") ? `https://${process.env.REPLIT_DEV_DOMAIN}` : undefined);
  assert.ok(baseUrl, "set JOURNEY_BASE_URL (CI) or run in a Replit dev workspace");

  const suffix = crypto.randomUUID().replaceAll("-", "");
  const providerId = crypto.randomUUID();
  const paymentIntentIds = {
    full: `pi_signed_refund_full_${suffix}`,
    partial: `pi_signed_refund_partial_${suffix}`,
    cumulative: `pi_signed_refund_cumulative_${suffix}`,
    shared: `pi_signed_refund_shared_${suffix}`,
  };
  const bookingIds = {
    full: crypto.randomUUID(),
    partial: crypto.randomUUID(),
    cumulative: crypto.randomUUID(),
    sharedA: crypto.randomUUID(),
    sharedB: crypto.randomUUID(),
  };
  const earningIds = {
    full: crypto.randomUUID(),
    partial: crypto.randomUUID(),
  };
  const chargeIds = {
    full: `ch_signed_refund_full_${suffix}`,
    partial: `ch_signed_refund_partial_${suffix}`,
    cumulative: `ch_signed_refund_cumulative_${suffix}`,
    shared: `ch_signed_refund_shared_${suffix}`,
  };
  const refundIds = {
    full: `re_signed_refund_full_${suffix}`,
    partial: `re_signed_refund_partial_${suffix}`,
    cumulativeFirst: `re_signed_refund_cumulative_first_${suffix}`,
    cumulativeSecond: `re_signed_refund_cumulative_second_${suffix}`,
    shared: `re_signed_refund_shared_${suffix}`,
  };
  const eventIds = {
    full: `evt_signed_refund_full_${suffix}`,
    partial: `evt_signed_refund_partial_${suffix}`,
    cumulativeFirst: `evt_signed_refund_cumulative_first_${suffix}`,
    cumulativeSecond: `evt_signed_refund_cumulative_second_${suffix}`,
    cumulativeStale: `evt_signed_refund_cumulative_stale_${suffix}`,
    shared: `evt_signed_refund_shared_${suffix}`,
  };
  const allBookingIds = Object.values(bookingIds);
  const allPaymentIntentIds = Object.values(paymentIntentIds);
  const allChargeIds = Object.values(chargeIds);
  const allRefundIds = Object.values(refundIds);
  const allEventIds = Object.values(eventIds);

  function signedEvent(
    eventId: string,
    chargeId: string,
    paymentIntentId: string,
    amount: number,
    amountRefunded: number,
    refunds: Array<{ id: string; amount: number }>,
  ) {
    const payload = JSON.stringify({
      id: eventId,
      object: "event",
      type: "charge.refunded",
      data: {
        object: {
          id: chargeId,
          object: "charge",
          payment_intent: paymentIntentId,
          amount,
          amount_refunded: amountRefunded,
          currency: "usd",
          // Supplying the refund list on the charge ensures the webhook never calls Stripe.
          refunds: { data: refunds.map((refund) => ({ ...refund, metadata: {} })), has_more: false },
        },
      },
    });
    const signature = Stripe.webhooks.generateTestHeaderString({
      payload,
      secret: process.env.STRIPE_WEBHOOK_SECRET_TEST!,
    });
    return { payload, signature };
  }

  async function replay(event: ReturnType<typeof signedEvent>) {
    const response = await fetch(`${baseUrl}/api/bookings/webhooks/stripe`, {
      method: "POST",
      headers: { "content-type": "application/json", "stripe-signature": event.signature },
      body: event.payload,
    });
    assert.equal(response.status, 200, await response.text());
  }

  async function bookingState(bookingId: string) {
    const result = await pool.query(
      "SELECT status, booking_details->'chargeRefund' AS charge_refund FROM service_bookings WHERE id = $1",
      [bookingId],
    );
    assert.equal(result.rowCount, 1, `booking fixture ${bookingId} exists`);
    return result.rows[0] as { status: string; charge_refund: { amountCents?: number } | null };
  }

  async function refundAuditCount(refundId: string) {
    const result = await pool.query(
      "SELECT count(*)::int AS n FROM refunds WHERE stripe_refund_id = $1",
      [refundId],
    );
    return result.rows[0].n as number;
  }

  async function refundAuditAmount(refundId: string) {
    const result = await pool.query(
      "SELECT amount FROM refunds WHERE stripe_refund_id = $1",
      [refundId],
    );
    assert.equal(result.rowCount, 1, `one durable audit row for ${refundId}`);
    return Number(result.rows[0].amount);
  }

  try {
    await pool.query(
      "INSERT INTO users (id,email,role) VALUES ($1,$2,'service_provider')",
      [providerId, `${providerId}@test.invalid`],
    );
    for (const [name, bookingId] of Object.entries(bookingIds)) {
      const paymentIntentId = name.startsWith("shared") ? paymentIntentIds.shared : paymentIntentIds[name as keyof typeof paymentIntentIds];
      await pool.query(
        "INSERT INTO service_bookings (id,total_amount,status,stripe_payment_intent_id,provider_id) VALUES ($1,100,'confirmed',$2,$3)",
        [bookingId, paymentIntentId, providerId],
      );
    }
    await pool.query(
      `INSERT INTO provider_earnings
       (id,provider_id,type,amount,source_type,source_id,status,dispute_state)
       VALUES ($1,$2,'service_booking',12,'booking',$3,'releasable','none'),
              ($4,$2,'service_booking',12,'booking',$5,'releasable','none')`,
      [earningIds.full, providerId, bookingIds.full, earningIds.partial, bookingIds.partial],
    );

    // A full refund of the booking's charge is terminal.
    await replay(signedEvent(eventIds.full, chargeIds.full, paymentIntentIds.full, 10000, 10000, [
      { id: refundIds.full, amount: 10000 },
    ]));
    assert.equal((await bookingState(bookingIds.full)).status, "refunded");
    assert.equal(await refundAuditCount(refundIds.full), 1);
    const fullEarning = await pool.query("SELECT status FROM provider_earnings WHERE id = $1", [earningIds.full]);
    assert.equal(fullEarning.rows[0].status, "reversed", "a full refund reverses the earning instead of merely holding it");

    // A partial refund is recorded in booking_details without ending the confirmed booking.
    await replay(signedEvent(eventIds.partial, chargeIds.partial, paymentIntentIds.partial, 10000, 4000, [
      { id: refundIds.partial, amount: 4000 },
    ]));
    const partial = await bookingState(bookingIds.partial);
    assert.equal(partial.status, "confirmed");
    assert.equal(Number(partial.charge_refund?.amountCents), 4000);
    assert.equal(await refundAuditAmount(refundIds.partial), 40);
    const partialEarning = await pool.query("SELECT status FROM provider_earnings WHERE id = $1", [earningIds.partial]);
    assert.equal(partialEarning.rows[0].status, "held", "a partial out-of-band refund holds the earning");

    // The second event carries the cumulative refund list and total; together they fully refund it.
    await replay(signedEvent(eventIds.cumulativeFirst, chargeIds.cumulative, paymentIntentIds.cumulative, 10000, 4000, [
      { id: refundIds.cumulativeFirst, amount: 4000 },
    ]));
    assert.equal((await bookingState(bookingIds.cumulative)).status, "confirmed");
    const cumulativeEvent = signedEvent(
      eventIds.cumulativeSecond,
      chargeIds.cumulative,
      paymentIntentIds.cumulative,
      10000,
      10000,
      [
        { id: refundIds.cumulativeFirst, amount: 4000 },
        { id: refundIds.cumulativeSecond, amount: 6000 },
      ],
    );
    await replay(cumulativeEvent);
    assert.equal((await bookingState(bookingIds.cumulative)).status, "refunded");
    assert.equal(await refundAuditCount(refundIds.cumulativeFirst), 1);
    assert.equal(await refundAuditCount(refundIds.cumulativeSecond), 1);
    assert.equal(await refundAuditAmount(refundIds.cumulativeFirst), 40);
    assert.equal(await refundAuditAmount(refundIds.cumulativeSecond), 60);

    // Redelivering the same signed event is idempotent: one audit per Stripe refund and no
    // repeated transition away from the terminal state.
    await replay(cumulativeEvent);
    assert.equal((await bookingState(bookingIds.cumulative)).status, "refunded");
    assert.equal(await refundAuditCount(refundIds.cumulativeFirst), 1);
    assert.equal(await refundAuditCount(refundIds.cumulativeSecond), 1);
    const duplicateEvent = await pool.query(
      "SELECT count(*)::int AS n FROM webhook_events WHERE stripe_event_id = $1",
      [eventIds.cumulativeSecond],
    );
    assert.equal(duplicateEvent.rows[0].n, 1);

    // A fresh event can arrive out of order with an older cumulative charge snapshot. It must not
    // regress either the terminal booking status or the greatest observed refunded amount.
    await replay(signedEvent(
      eventIds.cumulativeStale,
      chargeIds.cumulative,
      paymentIntentIds.cumulative,
      10000,
      4000,
      [{ id: refundIds.cumulativeFirst, amount: 4000 }],
    ));
    const afterStaleSnapshot = await bookingState(bookingIds.cumulative);
    assert.equal(afterStaleSnapshot.status, "refunded");
    assert.equal(Number(afterStaleSnapshot.charge_refund?.amountCents), 10000);
    assert.equal(await refundAuditCount(refundIds.cumulativeFirst), 1);

    // A partial payment refund must not mark every booking sharing the PaymentIntent as refunded.
    await replay(signedEvent(eventIds.shared, chargeIds.shared, paymentIntentIds.shared, 20000, 5000, [
      { id: refundIds.shared, amount: 5000 },
    ]));
    assert.equal((await bookingState(bookingIds.sharedA)).status, "confirmed");
    assert.equal((await bookingState(bookingIds.sharedB)).status, "confirmed");
    assert.equal(await refundAuditCount(refundIds.shared), 1);
  } finally {
    await pool.query("DELETE FROM admin_notifications WHERE metadata->>'paymentIntentId' = ANY($1::text[])", [allPaymentIntentIds]);
    await pool.query("DELETE FROM refunds WHERE stripe_refund_id = ANY($1::text[]) OR stripe_charge_id = ANY($2::text[])", [
      allRefundIds,
      allChargeIds,
    ]);
    await pool.query("DELETE FROM webhook_events WHERE stripe_event_id = ANY($1::text[])", [allEventIds]);
    await pool.query("DELETE FROM provider_earnings WHERE source_id = ANY($1::text[])", [allBookingIds]);
    await pool.query("DELETE FROM provider_earnings WHERE id = ANY($1::text[])", [Object.values(earningIds)]);
    await pool.query("DELETE FROM expert_earnings WHERE reference_id = ANY($1::text[])", [allBookingIds]);
    await pool.query("DELETE FROM platform_revenue WHERE source_id = ANY($1::text[])", [allBookingIds]);
    await pool.query("DELETE FROM service_bookings WHERE id = ANY($1::text[])", [allBookingIds]);
    await pool.query("DELETE FROM users WHERE id = $1", [providerId]);
  }
});