/**
 * replay-dispute-hardening.ts — REAL-STRIPE, SIGNED-EVENT proof for R165 (G3, ledger
 * `2026-09-27-dispute-hardening`). Creates real test-mode charges, lets Stripe open real disputes
 * (`pm_card_createDispute`), then delivers the events — signed exactly as Stripe signs them — to the
 * PLATFORM endpoint `POST /api/bookings/webhooks/stripe` of a RUNNING app, and reads the database.
 *
 *   1 refunded   — a dispute on a booking we already refunded: the booking is NOT flipped; ops is
 *                  told once (a redelivery and a second event add nothing).
 *   2 trip pass  — a dispute on a Trip Pass charge (no booking at all): ops is told, naming the
 *                  charge and the PaymentIntent; a redelivery adds nothing.
 *   3 canceled   — `payment_intent.canceled` for a stamped, unpaid checkout: the claim is released at
 *                  once (expired, slot back, item back in the plan) and the notice is claimed once.
 *
 * The app fetches the charge from Stripe itself (real call), so it must run with a real sk_test_ key.
 * DISPOSABLE DB + LOCAL APP ONLY; every seeded row is deleted at the end.
 *
 *   BASE_URL=http://127.0.0.1:5602 DATABASE_URL=postgresql://postgres:postgres@localhost:5432/traveloure \
 *   STRIPE_WEBHOOK_SECRET_TEST=whsec_local_replay STRIPE_SECRET_KEY=sk_test_… npx tsx scripts/replay-dispute-hardening.ts
 */
import { Pool } from "pg";
import crypto from "node:crypto";
import Stripe from "stripe";

const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:5602";
const SECRET = process.env.STRIPE_WEBHOOK_SECRET_TEST;
const KEY = process.env.STRIPE_SECRET_KEY ?? "";
if (!SECRET) throw new Error("STRIPE_WEBHOOK_SECRET_TEST must be set (the same value the app was started with)");
if (!/^sk_test_[A-Za-z0-9]{24,}$/.test(KEY)) throw new Error("a real sk_test_ key is required in STRIPE_SECRET_KEY");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL must be set");
const host = new URL(process.env.DATABASE_URL).hostname;
if (!["localhost", "127.0.0.1", "::1"].includes(host) && process.env.JOURNEY_DB_WRITES_OK !== "1") {
  throw new Error(`refusing to seed a non-local database (${host}); opt in with JOURNEY_DB_WRITES_OK=1`);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const stripe = new Stripe(KEY, { apiVersion: "2024-12-18.acacia" as any, maxNetworkRetries: 2 });
const RUN = crypto.randomUUID().slice(0, 8);
const ids = { user: `rp-g3-${RUN}-user`, service: `rp-g3-${RUN}-svc`, trip: `rp-g3-${RUN}-trip` };
const bookings: string[] = [];
const slots: string[] = [];
const disputeIds: string[] = [];
let failures = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail === undefined ? "" : `  ${JSON.stringify(detail)}`}`);
}

async function deliver(type: string, object: unknown, eventId = `evt_rp_g3_${crypto.randomUUID().slice(0, 12)}`) {
  const payload = JSON.stringify({ id: eventId, object: "event", type, api_version: "2024-12-18.acacia", created: Math.floor(Date.now() / 1000), data: { object } });
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET! });
  const res = await fetch(`${BASE_URL}/api/bookings/webhooks/stripe`, {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": header },
    body: payload,
  });
  return { status: res.status, eventId, payload };
}
async function redeliver(payload: string) {
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET! });
  const res = await fetch(`${BASE_URL}/api/bookings/webhooks/stripe`, { method: "POST", headers: { "content-type": "application/json", "stripe-signature": header }, body: payload });
  return res.status;
}

async function disputedCharge(metadata: Record<string, string>) {
  const pi = await stripe.paymentIntents.create({
    amount: 5000, currency: "usd", payment_method_types: ["card"], payment_method: "pm_card_createDispute", confirm: true,
    metadata: { source: "replay-g3", run: RUN, ...metadata },
  });
  for (let i = 0; i < 20; i++) {
    const list = await stripe.disputes.list({ payment_intent: pi.id, limit: 1 });
    if (list.data[0]) { disputeIds.push(list.data[0].id); return { pi, dispute: list.data[0] }; }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`Stripe opened no dispute on ${pi.id}`);
}

async function main() {
  await pool.query(`INSERT INTO users (id, email, first_name, last_name) VALUES ($1, $2, 'G3', 'Replay')`, [ids.user, `rp-g3-${RUN}@t.test`]);
  await pool.query(`INSERT INTO provider_services (id, user_id, service_name, price) VALUES ($1, $2, 'G3 replay', '50.00')`, [ids.service, ids.user]);
  await pool.query(`INSERT INTO trips (id, user_id, title, destination, start_date, end_date) VALUES ($1, $2, 'G3 replay', 'Kyoto', CURRENT_DATE + 30, CURRENT_DATE + 33)`, [ids.trip, ids.user]);

  console.log("── 1 a dispute on a refunded booking");
  const one = await disputedCharge({});
  const b1 = `rp-g3-${RUN}-b1`;
  bookings.push(b1);
  await pool.query(`INSERT INTO service_bookings (id, service_id, traveler_id, provider_id, status, total_amount, platform_fee, stripe_payment_intent_id)
    VALUES ($1, $2, $3, $3, 'refunded', '50.00', '0.00', $4)`, [b1, ids.service, ids.user, one.pi.id]);
  const d1 = await deliver("charge.dispute.created", one.dispute);
  check("delivery accepted", d1.status === 200, d1.status);
  check("redelivery accepted", (await redeliver(d1.payload)) === 200);
  check("a second event (updated) accepted", (await deliver("charge.dispute.updated", one.dispute)).status === 200);
  const s1 = (await pool.query(`SELECT status FROM service_bookings WHERE id = $1`, [b1])).rows[0].status;
  check("the refunded booking is NOT flipped", s1 === "refunded", s1);
  const n1 = (await pool.query(`SELECT message FROM admin_notifications WHERE type = 'dispute_on_settled_booking' AND metadata->>'disputeId' = $1`, [one.dispute.id])).rows;
  check("ops told exactly once", n1.length === 1, n1.map((r: any) => r.message));

  console.log("── 2 a dispute on a Trip Pass charge");
  const two = await disputedCharge({ type: "trip_pass_purchase" });
  const d2 = await deliver("charge.dispute.created", two.dispute);
  check("delivery accepted", d2.status === 200, d2.status);
  check("redelivery accepted", (await redeliver(d2.payload)) === 200);
  const n2 = (await pool.query(`SELECT message FROM admin_notifications WHERE type = 'dispute_unmatched' AND metadata->>'disputeId' = $1`, [two.dispute.id])).rows;
  const chargeId = typeof two.dispute.charge === "string" ? two.dispute.charge : two.dispute.charge.id;
  check("ops told exactly once", n2.length === 1, n2.length);
  check("the notice names the charge, the PaymentIntent and the charge type",
    !!n2[0] && n2[0].message.includes(chargeId) && n2[0].message.includes(two.pi.id) && n2[0].message.includes("trip_pass_purchase"), n2[0]?.message);

  console.log("── 3 payment_intent.canceled for a stamped, unpaid checkout");
  const pi3 = await stripe.paymentIntents.create({ amount: 5000, currency: "usd", payment_method_types: ["card"], metadata: { source: "replay-g3", run: RUN } });
  const b3 = `rp-g3-${RUN}-b3`, slot3 = `rp-g3-${RUN}-slot3`, item3 = `rp-g3-${RUN}-item3`;
  await pool.query(`INSERT INTO vendor_availability_slots (id, service_id, provider_id, date, capacity, booked_count, status)
    VALUES ($1, $2, $3, CURRENT_DATE + 20, 1, 1, 'fully_booked')`, [slot3, ids.service, ids.user]);
  slots.push(slot3);
  await pool.query(`INSERT INTO service_bookings (id, service_id, traveler_id, provider_id, trip_id, slot_id, status, total_amount, platform_fee, stripe_payment_intent_id, booking_details)
    VALUES ($1, $2, $3, $3, $4, $5, 'payment_pending', '50.00', '0.00', $6, $7::jsonb)`,
    [b3, ids.service, ids.user, ids.trip, slot3, pi3.id, JSON.stringify({ itineraryItemId: item3, stripeAttemptAt: new Date().toISOString() })]);
  bookings.push(b3);
  await pool.query(`INSERT INTO itinerary_items (id, trip_id, title, day_number, origin, routing_status, booking_id, provider_service_id, status)
    VALUES ($1, $2, 'G3 replay item', 1, 'traveler', 'purchased', $3, $4, 'planned')`, [item3, ids.trip, b3, ids.service]);
  const canceled = await stripe.paymentIntents.cancel(pi3.id);
  const d3 = await deliver("payment_intent.canceled", canceled);
  check("delivery accepted", d3.status === 200, d3.status);
  check("redelivery accepted", (await redeliver(d3.payload)) === 200);
  const r3 = (await pool.query(`SELECT b.status, b.booking_details -> 'expiredClaimNotice' AS n, s.booked_count, i.routing_status
    FROM service_bookings b JOIN vendor_availability_slots s ON s.id = b.slot_id JOIN itinerary_items i ON i.booking_id = b.id WHERE b.id = $1`, [b3])).rows[0];
  check("released at once: expired, slot back, item back in the plan",
    r3.status === "expired" && Number(r3.booked_count) === 0 && r3.routing_status === "in_planning", r3);
  check("the traveler's notice was claimed once", !!r3.n?.claimedAt, r3.n);
}

main()
  .catch((err) => { failures++; console.error(err); })
  .finally(async () => {
    for (const d of disputeIds) {
      await pool.query(`DELETE FROM admin_notifications WHERE metadata->>'disputeId' = $1`, [d]).catch(() => {});
      await pool.query(`DELETE FROM stripe_dispute_lifecycle WHERE dispute_id = $1`, [d]).catch(() => {});
    }
    await pool.query(`DELETE FROM platform_webhook_consumers WHERE raw_payload::text LIKE $1`, [`%replay-g3%${RUN}%`]).catch(() => {});
    for (const id of bookings) {
      await pool.query(`DELETE FROM admin_notifications WHERE metadata->>'bookingId' = $1`, [id]).catch(() => {});
      await pool.query(`DELETE FROM service_bookings WHERE id = $1`, [id]).catch(() => {});
    }
    await pool.query(`DELETE FROM item_transition_log WHERE trip_id = $1`, [ids.trip]).catch(() => {});
    await pool.query(`DELETE FROM itinerary_items WHERE trip_id = $1`, [ids.trip]).catch(() => {});
    await pool.query(`DELETE FROM trips WHERE id = $1`, [ids.trip]).catch(() => {});
    for (const id of slots) await pool.query(`DELETE FROM vendor_availability_slots WHERE id = $1`, [id]).catch(() => {});
    await pool.query(`DELETE FROM provider_services WHERE id = $1`, [ids.service]).catch(() => {});
    await pool.query(`DELETE FROM users WHERE id = $1`, [ids.user]).catch(() => {});
    await pool.end();
    console.log(failures === 0 ? "[replay] ALL PASS" : `[replay] ${failures} FAILURE(S)`);
    process.exit(failures === 0 ? 0 : 1);
  });
