/**
 * CN-1d: the concierge accept through the real route, PATCH /api/expert/bookings/:id/status.
 *
 *   A1  the expert accepts a paid, pending concierge booking on a trip: 200, the booking is confirmed,
 *       and the advisor row is source 'concierge' with access_until at the first instant of the day
 *       after the trip's last day in the trip's zone
 *   A2  the advisor grant is PART of the accept: when it fails (the expert is no longer routable and has
 *       no row on this trip), the route returns that error, the booking stays pending and no row exists
 *
 * Run: npx tsx --test --test-concurrency=1 --test-force-exit server/__tests__/cn1d-concierge-accept-http.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db, pool } from "../db";
import { conciergeAccessUntil } from "@shared/concierge-access";
import { registerAndSignIn, SUPPLY_PROVIDER_SIGNUP_EXTRA } from "./fixtures/register-and-sign-in";

const BASE_URL = process.env.JOURNEY_BASE_URL || "http://127.0.0.1:5000";
const RUN = crypto.randomUUID().slice(0, 8);
const PREFIX = `cn1dh-${RUN}`;
const travelerId = `${PREFIX}-trav`;
const tripOk = `${PREFIX}-trip-ok`;
const tripRefused = `${PREFIX}-trip-no`;
const serviceId = `${PREFIX}-svc`;
const expertEmail = `${PREFIX}-exp@traveloure.test`;
let expertId = "";
let expertCookie = "";

async function accept(bookingId: string) {
  const res = await fetch(`${BASE_URL}/api/expert/bookings/${bookingId}/status`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie: expertCookie },
    body: JSON.stringify({ status: "confirmed" }),
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

async function insertBooking(id: string, tripId: string) {
  await db.execute(sql`
    INSERT INTO service_bookings
      (id, service_id, traveler_id, provider_id, trip_id, booking_details, total_amount,
       platform_fee, insurance_fee, provider_earnings, status, stripe_payment_intent_id)
    VALUES
      (${id}, ${serviceId}, ${travelerId}, ${expertId}, ${tripId}, '{}'::jsonb, '80.00',
       '0.00', '0.00', '80.00', 'pending', ${`pi_${id}`})
  `);
}

async function advisorRow(tripId: string) {
  const r = await db.execute(sql`
    SELECT status, source, access_until FROM trip_expert_advisors
    WHERE trip_id = ${tripId} AND local_expert_id = ${expertId}
  `);
  return r.rows[0] as { status: string; source: string | null; access_until: Date | string | null } | undefined;
}

async function bookingStatus(id: string): Promise<string> {
  const r = await db.execute(sql`SELECT status FROM service_bookings WHERE id = ${id}`);
  return (r.rows[0] as { status: string }).status;
}

before(async () => {
  const host = new URL(process.env.DATABASE_URL ?? "postgres://localhost").hostname.toLowerCase();
  if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
    throw new Error("refusing to write fixtures to a non-disposable database");
  }
  const health = await fetch(`${BASE_URL}/api/health`);
  assert.equal(health.status, 200, "dev server must be running on :5000");

  await db.execute(sql`
    INSERT INTO users (id, email, role, first_name) VALUES (${travelerId}, ${`${travelerId}@traveloure.test`}, 'user', 'Trav')
  `);
  const expert = await registerAndSignIn({
    baseUrl: BASE_URL, email: expertEmail, password: "TestPass123!", firstName: "Exp", extra: SUPPLY_PROVIDER_SIGNUP_EXTRA,
  });
  expertId = expert.id;
  expertCookie = expert.cookie;
  await db.execute(sql`UPDATE users SET role = 'local_expert' WHERE id = ${expertId}`);
  await db.execute(sql`
    INSERT INTO local_expert_forms
      (id, user_id, first_name, status, identity_verification_status, stripe_connect_status, city, destinations)
    VALUES (${crypto.randomUUID()}, ${expertId}, 'Exp', 'approved', 'verified', 'complete', 'Kyoto', '[]'::jsonb)
  `);
  await db.execute(sql`
    INSERT INTO trips (id, user_id, title, destination, start_date, end_date, timezone) VALUES
      (${tripOk}, ${travelerId}, 'Concierge OK', 'Kyoto', '2027-04-02', '2027-04-05', 'Asia/Tokyo'),
      (${tripRefused}, ${travelerId}, 'Concierge refused', 'Kyoto', '2027-05-02', '2027-05-05', 'Asia/Tokyo')
  `);
  await db.execute(sql`
    INSERT INTO provider_services (id, user_id, service_name, price, service_type, status, approval_status, delivery_method)
    VALUES (${serviceId}, ${expertId}, 'Local concierge', '80.00', 'concierge', 'active', 'approved', 'async_messaging')
  `);
});

after(async () => {
  await db.execute(sql`DELETE FROM notifications WHERE user_id IN (${travelerId}, ${expertId})`).catch(() => {});
  await db.execute(sql`DELETE FROM trip_expert_advisors WHERE trip_id IN (${tripOk}, ${tripRefused})`).catch(() => {});
  await db.execute(sql`DELETE FROM service_bookings WHERE traveler_id = ${travelerId}`).catch(() => {});
  await db.execute(sql`DELETE FROM provider_services WHERE id = ${serviceId}`).catch(() => {});
  await db.execute(sql`DELETE FROM trips WHERE id IN (${tripOk}, ${tripRefused})`).catch(() => {});
  await db.execute(sql`DELETE FROM local_expert_forms WHERE user_id = ${expertId}`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id IN (${travelerId}, ${expertId})`).catch(() => {});
  await pool.end();
});

test("A1 the accept route grants concierge access until the end of the trip's last day", async () => {
  const id = `${PREFIX}-ok`;
  await insertBooking(id, tripOk);
  const res = await accept(id);
  assert.equal(res.status, 200, JSON.stringify(res.json));
  assert.equal(await bookingStatus(id), "confirmed");
  const row = await advisorRow(tripOk);
  assert.equal(row?.status, "accepted");
  assert.equal(row?.source, "concierge");
  assert.ok(row?.access_until, "access_until is set");
  const expected = conciergeAccessUntil("2027-04-05", "Asia/Tokyo");
  assert.equal(expected?.toISOString(), "2027-04-05T15:00:00.000Z", "midnight Apr 6 in Tokyo");
  assert.equal(new Date(row!.access_until!).toISOString(), expected!.toISOString());
});

test("A2 a failed grant fails the accept: the error is returned and nothing is written", async () => {
  const id = `${PREFIX}-no`;
  await insertBooking(id, tripRefused);
  await db.execute(sql`UPDATE local_expert_forms SET identity_verification_status = 'pending' WHERE user_id = ${expertId}`);
  const res = await accept(id);
  assert.equal(res.status, 409, JSON.stringify(res.json));
  assert.equal(res.json?.code, "expert_not_routable");
  assert.equal(typeof res.json?.message, "string");
  assert.equal(await bookingStatus(id), "pending", "the accept rolled back with the grant");
  assert.equal(await advisorRow(tripRefused), undefined, "no advisor row");
  const notes = await db.execute(sql`
    SELECT 1 FROM notifications WHERE related_id = ${id} AND type = 'booking_confirmed'
  `);
  assert.equal(notes.rows.length, 0, "no accept notification");
});
