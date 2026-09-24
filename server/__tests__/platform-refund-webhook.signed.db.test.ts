import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import Stripe from "stripe";
import { pool } from "../db";

test("signed platform charge.refunded reaches the refund writer over HTTP", async (t) => {
  if (process.env.JOURNEY_DB_WRITES_OK !== "1") {
    t.skip("Requires explicit development database write opt-in");
    return;
  }
  assert.notEqual(process.env.NODE_ENV, "production");
  assert.ok(process.env.DATABASE_URL);
  assert.notEqual(process.env.DATABASE_URL, process.env.PROD_DATABASE_URL);
  assert.ok(process.env.REPLIT_DEV_DOMAIN?.endsWith(".replit.dev"));
  assert.ok(process.env.STRIPE_WEBHOOK_SECRET);

  const chargeId = `ch_signed_refund_${crypto.randomUUID().replaceAll("-", "")}`;
  const eventId = `evt_signed_refund_${crypto.randomUUID().replaceAll("-", "")}`;
  const paymentIntentId = `pi_signed_refund_${crypto.randomUUID().replaceAll("-", "")}`;
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
        refunds: { data: [] },
      },
    },
  });
  const signature = Stripe.webhooks.generateTestHeaderString({
    payload,
    secret: process.env.STRIPE_WEBHOOK_SECRET!,
  });

  try {
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
  } finally {
    await pool.query("DELETE FROM refunds WHERE stripe_charge_id = $1", [chargeId]);
    await pool.query("DELETE FROM webhook_events WHERE stripe_event_id = $1", [eventId]);
    await pool.end();
  }
});