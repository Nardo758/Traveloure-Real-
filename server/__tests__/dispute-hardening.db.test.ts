/**
 * R165 (G3, decision-maker ruled Sep 27, 2026; ledger `2026-09-27-dispute-hardening`).
 *
 *   D1  a dispute on a REFUNDED booking never flips it; ops is told once (redelivery ⇒ no duplicate)
 *   D2  a LOST dispute on a refunded booking: stays refunded, the lost-chargeback record is still written
 *   D3  a WON dispute never undoes a refund made while the dispute was open
 *   D4  a dispute on a charge with NO booking (a Trip Pass charge) ⇒ one ops notice naming charge + PI
 *       when it opens and one when it closes; a redelivery adds nothing
 *   D5  a `dispute_lost` booking is not reopened by a later open event
 *   D6  platform `payment_intent.canceled` releases the stamped claim — expired, slot back, item back
 *       in planning, ONE email; a redelivery does nothing; a confirmed booking on another PI is untouched
 *   D7  the same event through `handleWebhook` (the platform endpoint's dispatcher) releases the claim
 *   D8  My Bookings maps `expired` and `dispute_lost`, and both sit in the past-bookings tab
 *
 * Run: JOURNEY_DB_WRITES_OK=1 DATABASE_URL=… npx tsx --test --test-force-exit server/__tests__/dispute-hardening.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { handleStripeDispute } from "../services/stripe-dispute.service";
import {
  CLAIM_EXPIRED_STATUS,
  releaseClaimsForCanceledIntent,
  type ExpiredClaimEmailSender,
} from "../services/checkout-claim.service";

const RUN = crypto.randomUUID().slice(0, 8);
const ids = { user: `g3-${RUN}-user`, service: `g3-${RUN}-svc`, trip: `g3-${RUN}-trip` };
const bookingsMade: string[] = [];
const slotsMade: string[] = [];
const disputes: string[] = [];

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
before(async () => {
  if (process.env.JOURNEY_DB_WRITES_OK !== "1") {
    let host: string | null = null;
    try { host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase(); } catch { host = null; }
    if (host === null || !DISPOSABLE_HOSTS.has(host)) {
      throw new Error(`[dispute-hardening] REFUSING to write fixtures to '${host ?? "<none>"}'; opt in with JOURNEY_DB_WRITES_OK=1.`);
    }
  }
  await db.execute(sql`INSERT INTO users (id, email, first_name, last_name) VALUES (${ids.user}, ${`g3-${RUN}@t.test`}, 'G3', 'Fixture')`);
  await db.execute(sql`INSERT INTO provider_services (id, user_id, service_name, price) VALUES (${ids.service}, ${ids.user}, 'G3 fixture', '100.00')`);
  await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, start_date, end_date)
    VALUES (${ids.trip}, ${ids.user}, 'G3 trip', 'Kyoto', CURRENT_DATE + 30, CURRENT_DATE + 33)`);
});

after(async () => {
  for (const d of disputes) {
    await db.execute(sql`DELETE FROM admin_notifications WHERE metadata->>'disputeId' = ${d}`).catch(() => {});
    await db.execute(sql`DELETE FROM stripe_dispute_lifecycle WHERE dispute_id = ${d}`).catch(() => {});
  }
  for (const id of bookingsMade) {
    await db.execute(sql`DELETE FROM admin_notifications WHERE metadata->>'bookingId' = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM service_bookings WHERE id = ${id}`).catch(() => {});
  }
  await db.execute(sql`DELETE FROM item_transition_log WHERE trip_id = ${ids.trip}`).catch(() => {});
  await db.execute(sql`DELETE FROM itinerary_items WHERE trip_id = ${ids.trip}`).catch(() => {});
  await db.execute(sql`DELETE FROM trips WHERE id = ${ids.trip}`).catch(() => {});
  for (const id of slotsMade) await db.execute(sql`DELETE FROM vendor_availability_slots WHERE id = ${id}`).catch(() => {});
  await db.execute(sql`DELETE FROM provider_services WHERE id = ${ids.service}`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id = ${ids.user}`).catch(() => {});
});

async function booking(status: string, pi: string): Promise<string> {
  const id = `g3-${RUN}-bk-${bookingsMade.length}`;
  bookingsMade.push(id);
  await db.execute(sql`INSERT INTO service_bookings (id, service_id, traveler_id, provider_id, status, total_amount, platform_fee, stripe_payment_intent_id)
    VALUES (${id}, ${ids.service}, ${ids.user}, ${ids.user}, ${status}, '100.00', '0.00', ${pi})`);
  return id;
}
const statusOf = async (id: string) =>
  ((await db.execute(sql`SELECT status FROM service_bookings WHERE id = ${id}`)).rows[0] as any).status as string;
const notices = async (type: string, disputeId: string) =>
  (await db.execute(sql`SELECT message, metadata FROM admin_notifications WHERE type = ${type} AND metadata->>'disputeId' = ${disputeId} ORDER BY id`)).rows as any[];

function fakeStripe(chargeId: string, pi: string | null, metadata: Record<string, string> = {}) {
  const charge = { id: chargeId, payment_intent: pi, metadata };
  return { stripe: { charges: { retrieve: async () => charge } } as any, charge };
}
function newDispute(chargeId: string, status: string, id?: string) {
  const d = { id: id ?? `dp_g3_${RUN}_${disputes.length}`, charge: chargeId, status, reason: "fraudulent", amount: 10000, currency: "usd" } as any;
  if (!disputes.includes(d.id)) disputes.push(d.id);
  return d;
}

test("D1 a dispute on a refunded booking never flips it; ops told once", async () => {
  const pi = `pi_g3_${RUN}_d1`;
  const b = await booking("refunded", pi);
  const { stripe } = fakeStripe(`ch_g3_${RUN}_d1`, pi);
  const d = newDispute(`ch_g3_${RUN}_d1`, "needs_response");
  await handleStripeDispute(d, stripe, { closed: false, eventId: `evt_g3_${RUN}_d1a` });
  await handleStripeDispute({ ...d, status: "under_review" }, stripe, { closed: false, eventId: `evt_g3_${RUN}_d1b` });
  assert.equal(await statusOf(b), "refunded", "a chargeback does not change what we did");
  const n = await notices("dispute_on_settled_booking", d.id);
  assert.equal(n.length, 1, "one notice for the open phase, however many deliveries");
  assert.match(n[0].message, /already refunded/);
  assert.match(n[0].message, /refunded twice/);
});

test("D2 a lost dispute on a refunded booking stays refunded and still records the lost chargeback", async () => {
  const pi = `pi_g3_${RUN}_d2`;
  const b = await booking("refunded", pi);
  const { stripe } = fakeStripe(`ch_g3_${RUN}_d2`, pi);
  const d = newDispute(`ch_g3_${RUN}_d2`, "lost");
  await handleStripeDispute(d, stripe, { closed: true, eventId: `evt_g3_${RUN}_d2` });
  assert.equal(await statusOf(b), "refunded");
  const lc = (await db.execute(sql`SELECT booking_details -> 'lostChargebacks' AS l FROM service_bookings WHERE id = ${b}`)).rows[0] as any;
  assert.ok(lc.l?.[d.id], "the refund guard's record is written regardless of the status");
  assert.equal((await notices("dispute_on_settled_booking", d.id)).length, 1);
});

test("D3 a won dispute never undoes a refund made while it was open", async () => {
  const pi = `pi_g3_${RUN}_d3`;
  const b = await booking("confirmed", pi);
  const { stripe } = fakeStripe(`ch_g3_${RUN}_d3`, pi);
  const d = newDispute(`ch_g3_${RUN}_d3`, "needs_response");
  await handleStripeDispute(d, stripe, { closed: false, eventId: `evt_g3_${RUN}_d3a` });
  assert.equal(await statusOf(b), "disputed");
  await db.execute(sql`UPDATE service_bookings SET status = 'refunded' WHERE id = ${b}`); // admin upheld + refunded
  await handleStripeDispute({ ...d, status: "won" }, stripe, { closed: true, eventId: `evt_g3_${RUN}_d3b` });
  assert.equal(await statusOf(b), "refunded", "the win restores only a row the dispute itself flipped");
  // And the ordinary case still restores.
  const pi2 = `pi_g3_${RUN}_d3c`;
  const b2 = await booking("confirmed", pi2);
  const s2 = fakeStripe(`ch_g3_${RUN}_d3c`, pi2);
  const d2 = newDispute(`ch_g3_${RUN}_d3c`, "needs_response");
  await handleStripeDispute(d2, s2.stripe, { closed: false, eventId: `evt_g3_${RUN}_d3d` });
  await handleStripeDispute({ ...d2, status: "won" }, s2.stripe, { closed: true, eventId: `evt_g3_${RUN}_d3e` });
  assert.equal(await statusOf(b2), "confirmed");
});

test("D4 a dispute on a charge with no booking (Trip Pass) ⇒ one ops notice per phase naming charge and PI", async () => {
  const chargeId = `ch_g3_${RUN}_d4`;
  const pi = `pi_g3_${RUN}_d4`;
  const { stripe } = fakeStripe(chargeId, pi, { type: "trip_pass_purchase" });
  const d = newDispute(chargeId, "needs_response");
  await handleStripeDispute(d, stripe, { closed: false, eventId: `evt_g3_${RUN}_d4a` });
  await handleStripeDispute(d, stripe, { closed: false, eventId: `evt_g3_${RUN}_d4b` });
  let n = await notices("dispute_unmatched", d.id);
  assert.equal(n.length, 1);
  assert.ok(n[0].message.includes(chargeId) && n[0].message.includes(pi), n[0].message);
  assert.match(n[0].message, /trip_pass_purchase/);
  assert.equal(n[0].metadata.phase, "open");
  await handleStripeDispute({ ...d, status: "lost" }, stripe, { closed: true, eventId: `evt_g3_${RUN}_d4c` });
  n = await notices("dispute_unmatched", d.id);
  assert.deepEqual(n.map((x) => x.metadata.phase), ["open", "closed"]);
});

test("D5 a dispute_lost booking is not reopened by a later open event", async () => {
  const pi = `pi_g3_${RUN}_d5`;
  const b = await booking("dispute_lost", pi);
  const { stripe } = fakeStripe(`ch_g3_${RUN}_d5`, pi);
  await handleStripeDispute(newDispute(`ch_g3_${RUN}_d5`, "needs_response"), stripe, { closed: false, eventId: `evt_g3_${RUN}_d5` });
  assert.equal(await statusOf(b), "dispute_lost");
});

async function stampedClaim(label: string, pi: string) {
  const bookingId = `g3-${RUN}-claim-${label}`;
  const slotId = `g3-${RUN}-slot-${label}`;
  const itemId = `g3-${RUN}-item-${label}`;
  await db.execute(sql`INSERT INTO vendor_availability_slots (id, service_id, provider_id, date, capacity, booked_count, status)
    VALUES (${slotId}, ${ids.service}, ${ids.user}, CURRENT_DATE + 20, 1, 1, 'fully_booked')`);
  slotsMade.push(slotId);
  await db.execute(sql`INSERT INTO service_bookings (id, service_id, traveler_id, provider_id, trip_id, slot_id, status, total_amount, platform_fee,
      stripe_payment_intent_id, booking_details, created_at)
    VALUES (${bookingId}, ${ids.service}, ${ids.user}, ${ids.user}, ${ids.trip}, ${slotId}, 'payment_pending', '100.00', '0.00', ${pi},
      ${JSON.stringify({ itineraryItemId: itemId, stripeAttemptAt: new Date().toISOString() })}::jsonb, NOW() - interval '5 minutes')`);
  bookingsMade.push(bookingId);
  await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, title, day_number, origin, routing_status, booking_id, provider_service_id, status)
    VALUES (${itemId}, ${ids.trip}, ${`G3 ${label}`}, 1, 'traveler', 'purchased', ${bookingId}, ${ids.service}, 'planned')`);
  return { bookingId, slotId, itemId };
}
async function claimState(c: { bookingId: string; slotId: string; itemId: string }) {
  const s = (await db.execute(sql`SELECT booked_count FROM vendor_availability_slots WHERE id = ${c.slotId}`)).rows[0] as any;
  const i = (await db.execute(sql`SELECT routing_status FROM itinerary_items WHERE id = ${c.itemId}`)).rows[0] as any;
  return { booking: await statusOf(c.bookingId), booked: Number(s.booked_count), item: i.routing_status };
}

test("D6 platform payment_intent.canceled releases the stamped claim at once, emails once, and touches nothing else", async () => {
  const pi = `pi_g3_${RUN}_d6`;
  const c = await stampedClaim("d6", pi);
  const other = await booking("confirmed", `pi_g3_${RUN}_d6_other`);
  const sent: any[] = [];
  const send: ExpiredClaimEmailSender = async (p) => { sent.push(p); };
  const r = await releaseClaimsForCanceledIntent(pi, { sendExpiredClaimEmail: send });
  assert.deepEqual([r.matched, r.released, r.noticesSent], [1, 1, 1]);
  assert.deepEqual(await claimState(c), { booking: CLAIM_EXPIRED_STATUS, booked: 0, item: "in_planning" });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].tripId, ids.trip);
  const again = await releaseClaimsForCanceledIntent(pi, { sendExpiredClaimEmail: send });
  assert.deepEqual([again.matched, again.released], [0, 0], "a redelivery finds nothing to release");
  assert.equal(sent.length, 1);
  assert.equal((await claimState(c)).booked, 0, "nothing released twice");
  assert.equal(await statusOf(other), "confirmed");
});

test("D7 the platform endpoint's dispatcher routes payment_intent.canceled to the release", async () => {
  const pi = `pi_g3_${RUN}_d7`;
  const c = await stampedClaim("d7", pi);
  const { stripePaymentService } = await import("../services/stripe-payment.service");
  await stripePaymentService.handleWebhook({
    id: `evt_g3_${RUN}_d7`,
    type: "payment_intent.canceled",
    data: { object: { id: pi, object: "payment_intent", status: "canceled", metadata: {} } },
  } as any);
  assert.deepEqual(await claimState(c), { booking: CLAIM_EXPIRED_STATUS, booked: 0, item: "in_planning" });
  await db.execute(sql`DELETE FROM webhook_events WHERE stripe_event_id = ${`evt_g3_${RUN}_d7`}`).catch(() => {});
});

test("D8 My Bookings labels expired and dispute_lost, and both sit in the past tab", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "client/src/pages/my-bookings.tsx"), "utf8");
  assert.match(src, /expired: \{ label: "Not completed"/);
  assert.match(src, /dispute_lost: \{ label: "Dispute closed – refunded to you"/);
  const completed = src.match(/const COMPLETED_STATUSES = \[([^\]]*)\]/)?.[1] ?? "";
  assert.ok(completed.includes('"expired"') && completed.includes('"dispute_lost"'), completed);
});
