import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import Stripe from "stripe";
import { pool } from "../db";

test("signed platform charge.refunded reaches #1288 and blocks booking earnings", async (t) => {
  if (process.env.JOURNEY_DB_WRITES_OK !== "1") {
    t.skip("Requires explicit development database write opt-in");
    return;
  }
  assert.notEqual(process.env.NODE_ENV, "production");
  assert.ok(process.env.DATABASE_URL);
  assert.notEqual(process.env.DATABASE_URL, process.env.PROD_DATABASE_URL);
  assert.ok(process.env.REPLIT_DEV_DOMAIN?.endsWith(".replit.dev"));
  assert.ok(process.env.STRIPE_WEBHOOK_SECRET_TEST);

  const chargeId = `ch_signed_refund_${crypto.randomUUID().replaceAll("-", "")}`;
  const eventId = `evt_signed_refund_${crypto.randomUUID().replaceAll("-", "")}`;
  const paymentIntentId = `pi_signed_refund_${crypto.randomUUID().replaceAll("-", "")}`;
  const refundId = `re_signed_refund_${crypto.randomUUID().replaceAll("-", "")}`;
  const providerId = crypto.randomUUID();
  const bookingId = crypto.randomUUID();
  const earningId = crypto.randomUUID();
  const payload = JSON.stringify({
    id: eventId,
    object: "event",
    type: "charge.refunded",
    data: {
      object: {
        id: chargeId,
        object: "charge",
        payment_intent: paymentIntentId,
        amount_refunded: 1725,
        currency: "usd",
        refunds: { data: [{ id: refundId, amount: 1725, metadata: {} }], has_more: false },
      },
    },
  });
  const signature = Stripe.webhooks.generateTestHeaderString({
    payload,
    secret: process.env.STRIPE_WEBHOOK_SECRET_TEST!,
  });

  try {
    await pool.query(
      "INSERT INTO users (id,email,role) VALUES ($1,$2,'service_provider')",
      [providerId, `${providerId}@test.invalid`],
    );
    await pool.query(
      "INSERT INTO service_bookings (id,total_amount,status,stripe_payment_intent_id,provider_id) VALUES ($1,100,'confirmed',$2,$3)",
      [bookingId, paymentIntentId, providerId],
    );
    await pool.query(
      `INSERT INTO provider_earnings
       (id,provider_id,type,amount,source_type,source_id,status,dispute_state)
       VALUES ($1,$2,'service_booking',12,'booking',$3,'releasable','none')`,
      [earningId, providerId, bookingId],
    );
    const response = await fetch(`https://${process.env.REPLIT_DEV_DOMAIN}/api/bookings/webhooks/stripe`, {
      method: "POST",
      headers: { "content-type": "application/json", "stripe-signature": signature },
      body: payload,
    });
    assert.equal(response.status, 200, await response.text());
    const refund = await pool.query(
      "SELECT stripe_payment_intent_id, amount, status FROM refunds WHERE stripe_charge_id = $1",
      [chargeId],
    );
    assert.equal(refund.rowCount, 1, "the refund handler must make its durable audit write");
    assert.equal(refund.rows[0].stripe_payment_intent_id, paymentIntentId);
    assert.equal(Number(refund.rows[0].amount), 17.25);
    assert.equal(refund.rows[0].status, "completed");
    const booking = await pool.query(
      "SELECT status, booking_details->'outOfBandRefund' AS refund FROM service_bookings WHERE id = $1",
      [bookingId],
    );
    assert.equal(booking.rows[0].status, "confirmed");
    assert.deepEqual(booking.rows[0].refund?.refundIds, [refundId], "#1288 must stamp the booking");
    const earning = await pool.query(
      "SELECT status, dispute_state FROM provider_earnings WHERE id = $1",
      [earningId],
    );
    assert.deepEqual(earning.rows[0], { status: "held", dispute_state: "open" });
    const alert = await pool.query(
      "SELECT count(*)::int AS n FROM admin_notifications WHERE type='out_of_band_refund' AND metadata->>'paymentIntentId' = $1",
      [paymentIntentId],
    );
    assert.equal(alert.rows[0].n, 1);
  } finally {
    await pool.query("DELETE FROM admin_notifications WHERE metadata->>'paymentIntentId' = $1", [paymentIntentId]);
    await pool.query("DELETE FROM refunds WHERE stripe_charge_id = $1", [chargeId]);
    await pool.query("DELETE FROM webhook_events WHERE stripe_event_id = $1", [eventId]);
    await pool.query("DELETE FROM provider_earnings WHERE id = $1", [earningId]);
    await pool.query("DELETE FROM service_bookings WHERE id = $1", [bookingId]);
    await pool.query("DELETE FROM users WHERE id = $1", [providerId]);
    await pool.end();
  }
});