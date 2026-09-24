/**
 * Disposable real-Postgres coverage for the shared dispute handler.
 * Deliberately refuses to run unless the caller explicitly opts into writes.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

const enabled = process.env.NODE_ENV !== "production" && process.env.JOURNEY_DB_WRITES_OK === "1";
const run = enabled ? describe : describe.skip;
if (!process.env.DATABASE_URL) process.env.DATABASE_URL = "postgresql://claude:claude@localhost:5432/traveloure_test";

const { pool } = await import("../../db");
const { handleStripeDispute, processPlatformWebhookEvent } = await import("../stripe-dispute.service");

const userId = crypto.randomUUID();
const bookingA = crypto.randomUUID();
const bookingB = crypto.randomUUID();
const disputeId = `dp_test_${crypto.randomUUID()}`;
const charge = { id: `ch_test_${crypto.randomUUID()}`, payment_intent: `pi_test_${crypto.randomUUID()}`, metadata: {} };
const expandedCharge = { ...charge, payment_intent: { id: charge.payment_intent } };
const stripe = { charges: { retrieve: async () => expandedCharge } } as any;
const dispute = (id: string, status: string) => ({ id, charge: expandedCharge, status, reason: "fraudulent" }) as any;

async function q(text: string, values: unknown[] = []) {
  return pool.query(text, values);
}

run("stripe dispute handler (disposable DB fixtures)", () => {
  before(async () => {
    await q(`INSERT INTO users (id,email,role) VALUES ($1,$2,'provider')`, [userId, `${userId}@test.invalid`]);
    await q(`INSERT INTO service_bookings (id,total_amount,status,stripe_payment_intent_id,provider_id)
      VALUES ($1,100,'confirmed',$3,$4),($2,100,'confirmed',$5,$4)`,
      [bookingA, bookingB, charge.payment_intent, userId, `pi_other_${crypto.randomUUID()}`]);
    await q(`INSERT INTO provider_earnings
      (id,provider_id,type,amount,source_type,source_id,status,dispute_state,available_at,payout_id)
      VALUES ($1,$3,'service_booking',50,'booking',$4,'held','none',NOW()-interval '1 day',NULL),
             ($2,$3,'service_booking',50,'booking',$5,'held','none',NOW()-interval '1 day',NULL)`,
      [crypto.randomUUID(), crypto.randomUUID(), userId, bookingA, bookingB]);
    await q(`UPDATE service_bookings SET status='in_progress' WHERE id=$1`, [bookingA]);
  });

  after(async () => {
    await q(`DELETE FROM admin_notifications WHERE metadata->>'eventId' LIKE 'evt_test_%' OR metadata->>'disputeId' LIKE 'dp_test_%'`);
    await q(`DELETE FROM platform_webhook_consumers WHERE stripe_event_id LIKE 'evt_test_%'`);
    await q(`DELETE FROM stripe_dispute_lifecycle WHERE dispute_id LIKE 'dp_test_%'`);
    await q(`DELETE FROM expert_earnings WHERE expert_id=$1`, [userId]);
    await q(`DELETE FROM provider_earnings WHERE provider_id=$1`, [userId]);
    await q(`DELETE FROM service_bookings WHERE id IN ($1,$2)`, [bookingA, bookingB]);
    await q(`DELETE FROM users WHERE id=$1`, [userId]);
    await pool.end();
  });

  it("holds only the booking resolved by the expanded charge", async () => {
    await handleStripeDispute(dispute(disputeId, "needs_response"), stripe, { closed: false, eventId: "evt_test_created" });
    const rows = await q(`SELECT id,source_id,status,dispute_state FROM provider_earnings WHERE provider_id=$1 ORDER BY source_id`, [userId]);
    assert.equal(rows.rows.find((r) => r.source_id === bookingA)?.dispute_state, "open");
    assert.equal(rows.rows.find((r) => r.source_id === bookingB)?.dispute_state, "none");
  });

  it("closed won restores maturity and the original canonical status", async () => {
    await handleStripeDispute(dispute(disputeId, "won"), stripe, { closed: true, eventId: "evt_test_won" });
    const booking = await q(`SELECT status FROM service_bookings WHERE id=$1`, [bookingA]);
    const earning = await q(`SELECT status,dispute_state FROM provider_earnings WHERE source_id=$1`, [bookingA]);
    assert.equal(booking.rows[0].status, "in_progress");
    assert.equal(earning.rows[0].status, "releasable");
    assert.equal(earning.rows[0].dispute_state, "none");
    await handleStripeDispute(dispute(disputeId, "needs_response"), stripe, { closed: false, eventId: "evt_test_stale" });
    const stale = await q(`SELECT dispute_state FROM provider_earnings WHERE source_id=$1`, [bookingA]);
    assert.equal(stale.rows[0].dispute_state, "none");
  });

  it("closed lost retains unpaid holds and records payout review IDs", async () => {
    const lost = `dp_test_${crypto.randomUUID()}`;
    await q(`UPDATE service_bookings SET status='confirmed' WHERE id=$1`, [bookingA]);
    await q(`UPDATE provider_earnings SET status='held',dispute_state='none',payout_id='payout_processing' WHERE source_id=$1`, [bookingA]);
    await handleStripeDispute(dispute(lost, "lost"), stripe, { closed: true, eventId: "evt_test_lost" });
    const earning = await q(`SELECT status,dispute_state FROM provider_earnings WHERE source_id=$1`, [bookingA]);
    assert.equal(earning.rows[0].status, "held");
    assert.equal(earning.rows[0].dispute_state, "open");
    const alert = await q(`SELECT metadata FROM admin_notifications WHERE metadata->>'eventId'='evt_test_lost'`);
    assert.equal(alert.rows[0].metadata.action, "manual_review");
    assert.deepEqual(alert.rows[0].metadata.payoutIds, ["payout_processing"]);
  });

  it("deduplicates payout.failed event delivery", async () => {
    const event = { id: "evt_test_payout_failed", type: "payout.failed", data: { object: { id: "po_test_1" } } } as any;
    await processPlatformWebhookEvent(event, stripe);
    await processPlatformWebhookEvent(event, stripe);
    const rows = await q(`SELECT count(*)::int AS n FROM admin_notifications WHERE metadata->>'eventId'=$1`, [event.id]);
    assert.equal(rows.rows[0].n, 1);
  });
});