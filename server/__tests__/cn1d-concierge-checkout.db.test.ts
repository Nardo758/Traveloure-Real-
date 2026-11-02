/**
 * CN-1d concierge checkout (Architect ruling, Nov 2, 2026; ledger `2026-11-02-cn1d-concierge-checkout`;
 * Locked Decision 49 amended: "a concierge hire is charged at checkout and awaits the expert's acceptance;
 * refunded in full on decline or timeout (Leon, Nov 1 2:56 PM ET)").
 *
 * Through the real rails — POST /api/cart and POST /api/checkout on the booted server, then the ONE payment
 * promotion (`promotePaidCheckout`, the webhook's own call) and the expert's PATCH accept:
 *   K1  a concierge listing in request mode is a cart line (POST /api/cart 200); a non-concierge expert
 *       listing in request mode is still refused (400 listing_requires_request), at the add and at checkout (409)
 *   K2  a paid concierge booking is promoted to `pending` (payment on record), and gets no "Booking confirmed"
 *       email; a planning listing's checkout still promotes to `confirmed` with its email
 *   K3  the expert's accept → `confirmed` + the advisor row (source concierge, access_until end of last day)
 *   K4  the CONCIERGE_ACCEPT_HOURS timeout refunds a paid, unaccepted concierge booking with the existing key
 *   K5  the promotion leaves the traveler ONE `concierge_hire_charged` notice per concierge booking (a second
 *       promotion adds none) and none for a planning listing; the held copy states the window only when
 *       CONCIERGE_ACCEPT_HOURS is set
 *
 * CI's stub Stripe key fails the checkout's PaymentIntent AFTER the claim rows are written (the
 * checkout-stamp-from-line-trip precedent), so the payment is applied by stamping the PaymentIntent the way the
 * checkout's authorization step does and calling the same promotion the webhook calls. Refund calls are stubbed
 * in-process on the Stripe client prototype (the cn1d-concierge-engagement precedent).
 *
 * Run (server on :5000, disposable DB):
 *   JOURNEY_DB_WRITES_OK=1 npx tsx --test --test-concurrency=1 --test-force-exit server/__tests__/cn1d-concierge-checkout.db.test.ts
 */
process.env.STRIPE_SECRET_KEY ||= "sk_test_dummy_key_for_cn1d_checkout";
// The promotion runs in THIS process, so the notice reads this process's window.
process.env.CONCIERGE_ACCEPT_HOURS = "48";

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import Stripe from "stripe";
import { sql } from "drizzle-orm";
import { db, pool } from "../db";
import { promotePaidCheckout } from "../services/checkout-claim.service";
import { runConciergeAcceptTimeout } from "../services/concierge-accept-timeout.service";
import { conciergeHireChargedNotice } from "../services/concierge-engagement.service";
import { registerAndSignIn } from "./fixtures/register-and-sign-in";

const BASE_URL = process.env.JOURNEY_BASE_URL || "http://127.0.0.1:5000";
const RUN = crypto.randomUUID().slice(0, 8);
const P = `cn1dck-${RUN}`;
const ids = {
  concierge: `${P}-conc`,
  planningInstant: `${P}-plan-inst`,
  planningRequest: `${P}-plan-req`,
  trip: `${P}-trip`,
};
let buyerId = "";
let buyerCookie = "";
let expertId = "";
let expertCookie = "";

const probe = new Stripe("sk_test_dummy");
const refundsProto = Object.getPrototypeOf(probe.refunds);
const piProto = Object.getPrototypeOf(probe.paymentIntents);
const originalRefundCreate = refundsProto.create;
const originalRetrieve = piProto.retrieve;
const refundKeys: string[] = [];

async function api(path: string, cookie: string, method = "GET", body?: unknown) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { "content-type": "application/json", cookie },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
}

async function clearCart() {
  await db.execute(sql`DELETE FROM cart_items WHERE user_id = ${buyerId}`);
}

/** Add one line through POST /api/cart, check out through POST /api/checkout, and return the claim row. */
async function buyThroughCheckout(serviceId: string): Promise<string> {
  await clearCart();
  const add = await api("/api/cart", buyerCookie, "POST", { serviceId, quantity: 1, tripId: ids.trip });
  assert.equal(add.status < 300, true, `cart add ${serviceId}: ${add.status} ${JSON.stringify(add.json)}`);
  const key = `${P}-${crypto.randomUUID()}`;
  await api("/api/checkout", buyerCookie, "POST", { idempotencyKey: key });
  const r = await db.execute(sql`
    SELECT id, status FROM service_bookings
    WHERE traveler_id = ${buyerId} AND service_id = ${serviceId} AND idempotency_key LIKE ${key + "%"}
  `);
  const row = r.rows[0] as { id: string; status: string } | undefined;
  assert.ok(row, `checkout wrote a claim row for ${serviceId}`);
  assert.equal(row!.status, "payment_pending");
  return row!.id;
}

/** The authorization stamp, then the webhook's promotion. */
async function pay(bookingId: string): Promise<void> {
  const pi = `pi_${P}_${bookingId.slice(-8)}`;
  await db.execute(sql`UPDATE service_bookings SET stripe_payment_intent_id = ${pi} WHERE id = ${bookingId}`);
  const result = await promotePaidCheckout({ paymentIntentId: pi, actor: "webhook", metadataBookingIds: [bookingId] });
  assert.deepEqual(result.promoted, [bookingId], JSON.stringify(result));
}

async function booking(id: string) {
  const r = await db.execute(sql`
    SELECT status, confirmed_at, booking_details -> 'paidCharge' AS paid FROM service_bookings WHERE id = ${id}
  `);
  return r.rows[0] as { status: string; confirmed_at: Date | null; paid: any };
}

async function confirmationEmails(id: string): Promise<number> {
  const r = await db.execute(sql`SELECT count(*)::int AS n FROM email_outbox WHERE metadata ->> 'bookingId' = ${id}`);
  return (r.rows[0] as { n: number }).n;
}

before(async () => {
  const host = new URL(process.env.DATABASE_URL ?? "postgres://localhost").hostname.toLowerCase();
  if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
    throw new Error("refusing to write fixtures to a non-disposable database");
  }
  assert.equal((await fetch(`${BASE_URL}/api/health`)).status, 200, "dev server must be running on :5000");

  const buyer = await registerAndSignIn({ baseUrl: BASE_URL, email: `${P}-buyer@t.test`, password: "TestPass123!", firstName: "Buy" });
  buyerId = buyer.id;
  buyerCookie = buyer.cookie;
  const expert = await registerAndSignIn({
    baseUrl: BASE_URL, email: `${P}-exp@t.test`, password: "TestPass123!", firstName: "Aya",
    extra: { intent: "supply", supplyRole: "provider", provider: { businessName: "Fixture", category: "other", city: "Kyoto" } },
  });
  expertId = expert.id;
  expertCookie = expert.cookie;
  // An expert account with no instant-booking flag: an unset booking mode resolves to `request`.
  await db.execute(sql`UPDATE users SET role = 'local_expert' WHERE id = ${expertId}`);
  await db.execute(sql`
    INSERT INTO local_expert_forms
      (id, user_id, first_name, status, identity_verification_status, stripe_connect_status, city, destinations)
    VALUES (${crypto.randomUUID()}, ${expertId}, 'Aya', 'approved', 'verified', 'complete', 'Kyoto', '[]'::jsonb)
  `);
  await db.execute(sql`
    INSERT INTO provider_services
      (id, user_id, service_name, price, pricing_unit, service_type, booking_mode, status, approval_status, delivery_method)
    VALUES
      (${ids.concierge}, ${expertId}, 'Local concierge fixture', '120.00', 'per_trip', 'concierge', NULL, 'active', 'approved', 'async_messaging'),
      (${ids.planningInstant}, ${expertId}, 'Planning instant fixture', '80.00', NULL, 'planning', 'instant', 'active', 'approved', 'async_messaging'),
      (${ids.planningRequest}, ${expertId}, 'Planning request fixture', '80.00', NULL, 'planning', NULL, 'active', 'approved', 'async_messaging')
  `);
  await db.execute(sql`
    INSERT INTO trips (id, user_id, title, destination, start_date, end_date, timezone)
    VALUES (${ids.trip}, ${buyerId}, 'Concierge checkout', 'Kyoto', '2027-04-02', '2027-04-05', 'Asia/Tokyo')
  `);

  piProto.retrieve = async () => ({ status: "succeeded", id: "pi_cn1dck" });
  refundsProto.create = async (_body: unknown, opts?: { idempotencyKey?: string }) => {
    refundKeys.push(opts?.idempotencyKey ?? "");
    return { id: `re_${crypto.randomUUID().slice(0, 8)}`, status: "succeeded", amount: 12000 };
  };
});

after(async () => {
  refundsProto.create = originalRefundCreate;
  piProto.retrieve = originalRetrieve;
  await db.execute(sql`DELETE FROM email_outbox WHERE metadata ->> 'bookingId' IN (SELECT id FROM service_bookings WHERE traveler_id = ${buyerId})`).catch(() => {});
  await db.execute(sql`DELETE FROM notifications WHERE user_id IN (${buyerId}, ${expertId})`).catch(() => {});
  await db.execute(sql`DELETE FROM refunds WHERE booking_id IN (SELECT id FROM service_bookings WHERE traveler_id = ${buyerId})`).catch(() => {});
  await db.execute(sql`DELETE FROM trip_expert_advisors WHERE trip_id = ${ids.trip}`).catch(() => {});
  await clearCart().catch(() => {});
  await db.execute(sql`DELETE FROM service_bookings WHERE traveler_id = ${buyerId}`).catch(() => {});
  await db.execute(sql`DELETE FROM itinerary_items WHERE trip_id = ${ids.trip}`).catch(() => {});
  await db.execute(sql`DELETE FROM trips WHERE id = ${ids.trip}`).catch(() => {});
  await db.execute(sql`DELETE FROM provider_services WHERE id IN (${ids.concierge}, ${ids.planningInstant}, ${ids.planningRequest})`).catch(() => {});
  await db.execute(sql`DELETE FROM local_expert_forms WHERE user_id = ${expertId}`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id IN (${buyerId}, ${expertId})`).catch(() => {});
  await pool.end();
});

test("K1 a request-mode concierge listing is a cart line; a request-mode planning listing is still refused", async () => {
  await clearCart();
  const conc = await api("/api/cart", buyerCookie, "POST", { serviceId: ids.concierge, quantity: 1, tripId: ids.trip });
  assert.equal(conc.status < 300, true, JSON.stringify(conc.json));

  await clearCart();
  const plan = await api("/api/cart", buyerCookie, "POST", { serviceId: ids.planningRequest, quantity: 1, tripId: ids.trip });
  assert.equal(plan.status, 400);
  assert.equal(plan.json?.reason, "listing_requires_request");

  // The checkout refuses the same line if it reaches the cart another way.
  await clearCart();
  await db.execute(sql`
    INSERT INTO cart_items (id, user_id, service_id, quantity, trip_id)
    VALUES (${`${P}-cart-req`}, ${buyerId}, ${ids.planningRequest}, 1, ${ids.trip})
  `);
  const checkout = await api("/api/checkout", buyerCookie, "POST", { idempotencyKey: `${P}-refused` });
  assert.equal(checkout.status, 409);
  assert.equal(checkout.json?.reason, "listing_requires_request");
  await clearCart();
});

let acceptedId = "";
let planningPaidId = "";

async function hireNotices(bookingId: string) {
  const r = await db.execute(sql`
    SELECT type, title, message, user_id, dedupe_key FROM notifications
    WHERE related_id = ${bookingId} AND type = 'concierge_hire_charged'
  `);
  return r.rows as Array<{ type: string; title: string; message: string; user_id: string; dedupe_key: string }>;
}

test("K2 a paid concierge booking lands pending with its payment on record and no confirmed email; planning unchanged", async () => {
  acceptedId = await buyThroughCheckout(ids.concierge);
  await pay(acceptedId);
  const conc = await booking(acceptedId);
  assert.equal(conc.status, "pending");
  assert.equal(conc.confirmed_at, null);
  assert.equal(conc.paid?.status, "confirmed", "the stamp names the full-payment leg");
  assert.equal(await confirmationEmails(acceptedId), 0, "no 'Booking confirmed' email for an unaccepted hire");

  const planId = await buyThroughCheckout(ids.planningInstant);
  planningPaidId = planId;
  await pay(planId);
  const plan = await booking(planId);
  assert.equal(plan.status, "confirmed");
  assert.ok(plan.confirmed_at);
  assert.equal(plan.paid?.status, "confirmed");
  assert.equal(await confirmationEmails(planId), 1);
});

test("K3 the expert's accept confirms it and grants concierge access to the end of the trip", async () => {
  const res = await api(`/api/expert/bookings/${acceptedId}/status`, expertCookie, "PATCH", { status: "confirmed" });
  assert.equal(res.status, 200, JSON.stringify(res.json));
  assert.equal((await booking(acceptedId)).status, "confirmed");
  const r = await db.execute(sql`
    SELECT status, source, access_until FROM trip_expert_advisors WHERE trip_id = ${ids.trip} AND local_expert_id = ${expertId}
  `);
  const row = r.rows[0] as { status: string; source: string; access_until: Date };
  assert.equal(row.status, "accepted");
  assert.equal(row.source, "concierge");
  assert.equal(new Date(row.access_until).toISOString(), "2027-04-05T15:00:00.000Z");
});

test("K4 the accept-window timeout refunds a paid, unaccepted concierge booking with the existing key", async () => {
  const id = await buyThroughCheckout(ids.concierge);
  await pay(id);
  assert.equal((await booking(id)).status, "pending");
  await db.execute(sql`UPDATE service_bookings SET created_at = NOW() - INTERVAL '49 hours' WHERE id = ${id}`);
  refundKeys.length = 0;
  const result = await runConciergeAcceptTimeout(new Date(), { CONCIERGE_ACCEPT_HOURS: "48" } as NodeJS.ProcessEnv);
  assert.equal(result.errors, 0, JSON.stringify(result));
  assert.ok(result.declined >= 1);
  assert.equal((await booking(id)).status, "refunded");
  const mine = refundKeys.filter((k) => k.startsWith(`refund-sb-${id}-`));
  assert.equal(mine.length, 1, `existing refund key used: ${JSON.stringify(refundKeys)}`);
});

test("K5 one concierge_hire_charged notice per concierge booking, none for a planning listing; held copy", async () => {
  const notes = await hireNotices(acceptedId);
  assert.equal(notes.length, 1);
  assert.equal(notes[0].user_id, buyerId);
  assert.equal(notes[0].dedupe_key, `booking:${acceptedId}:concierge_hire_charged`);
  assert.equal(notes[0].title, "You're charged — awaiting Aya's answer");
  assert.equal(notes[0].message, "Aya has 48 hours to accept. If they can't take this trip, you get a full refund.");

  // A second promotion signal for the same booking adds nothing.
  const pi = `pi_${P}_${acceptedId.slice(-8)}`;
  await promotePaidCheckout({ paymentIntentId: pi, actor: "webhook", metadataBookingIds: [acceptedId] });
  assert.equal((await hireNotices(acceptedId)).length, 1);

  assert.equal((await hireNotices(planningPaidId)).length, 0, "a planning listing gets no hire notice");
  const any = await db.execute(sql`
    SELECT count(*)::int AS n FROM notifications WHERE related_id = ${planningPaidId} AND type = 'concierge_hire_charged'
  `);
  assert.equal((any.rows[0] as { n: number }).n, 0);

  // Unset window: the first sentence is omitted, never a guessed number.
  assert.deepEqual(conciergeHireChargedNotice("Aya", null), {
    title: "You're charged — awaiting Aya's answer",
    message: "If they can't take this trip, you get a full refund.",
  });
});
