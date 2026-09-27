/**
 * replay-platform-payment-failed.ts — REAL-EVENT proof for R161 (ledger
 * `2026-09-27-platform-payment-failed`): a SIGNED `payment_intent.payment_failed` delivered over
 * HTTP to the PLATFORM webhook (`POST /api/bookings/webhooks/stripe`) marks the cart checkout's
 * `service_bookings` row `failed`, the plancard then discloses it as `endedBooking.status='failed'`
 * (the slip's "Payment didn't go through" + "Try again"), and a REPLAY of the same signed event
 * changes nothing and sends no second email.
 *
 * Why a script and not only a unit test: the defect lived BETWEEN Stripe's routing (a platform PI's
 * events go to the platform endpoint) and the two endpoints' handlers. This drives the real route —
 * raw body, `stripe-signature`, `constructEvent` — on a running app.
 *
 * DISPOSABLE DB + LOCAL APP ONLY. It seeds its own rows (a password user, a listing, a plan, a plan
 * item and the booking in exactly the shape checkout's authorization leaves it: `payment_pending`,
 * PI stamped, `bookingDetails.itineraryItemId` + `stripeAttemptAt`, the item `purchased` with its
 * `booking_id`), and deletes them at the end unless KEEP=1. No Stripe network call is made: the
 * event is built locally and signed with `stripe.webhooks.generateTestHeaderString`.
 *
 * Run (the app must be started with the SAME secret in STRIPE_WEBHOOK_SECRET_TEST, NODE_ENV!=production):
 *   BASE_URL=http://127.0.0.1:5057 \
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/traveloure \
 *   STRIPE_WEBHOOK_SECRET_TEST=whsec_local_replay \
 *   SERVER_LOG=/path/to/app.log   # optional: counts the payment-failed email lines
 *   npx tsx scripts/replay-platform-payment-failed.ts
 *
 * Exits non-zero on any failed expectation.
 */
import { Pool } from "pg";
import crypto from "node:crypto";
import fs from "node:fs";
import Stripe from "stripe";

const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:5057";
const SECRET = process.env.STRIPE_WEBHOOK_SECRET_TEST;
const SERVER_LOG = process.env.SERVER_LOG;
if (!SECRET) throw new Error("STRIPE_WEBHOOK_SECRET_TEST must be set (the same value the app was started with)");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL must be set");
const host = new URL(process.env.DATABASE_URL).hostname;
if (!["localhost", "127.0.0.1", "::1"].includes(host) && process.env.JOURNEY_DB_WRITES_OK !== "1") {
  throw new Error(`refusing to seed a non-local database (${host}); opt in with JOURNEY_DB_WRITES_OK=1`);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const stripe = new Stripe("sk_test_signing_only_no_network", { apiVersion: "2024-12-18.acacia" as any });
const RUN = crypto.randomUUID().slice(0, 8);
const email = `replay-pf-${RUN}@t.test`;
const password = `Replay-${RUN}-pw!`;
const ids = {
  user: `replay-pf-${RUN}-user`,
  service: `replay-pf-${RUN}-svc`,
  trip: `replay-pf-${RUN}-trip`,
  item: `replay-pf-${RUN}-item`,
  booking: crypto.randomUUID(),
  pi: `pi_replay_${RUN}`,
  event: `evt_replay_${RUN}`,
};

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail !== undefined ? `  ${JSON.stringify(detail)}` : ""}`);
  if (!ok) failures++;
}

function hashPassword(pw: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString("hex");
    crypto.scrypt(pw, salt, 64, (err, key) => (err ? reject(err) : resolve(`${salt}:${key.toString("hex")}`)));
  });
}

async function seed() {
  await pool.query(
    // Terms/privacy pre-accepted so a KEEP=1 run can open the slip in a browser past the consent gate.
    `INSERT INTO users (id, email, first_name, last_name, password, email_verified,
       terms_accepted_at, privacy_accepted_at, terms_version, privacy_version)
     VALUES ($1, $2, 'Replay', 'Traveler', $3, NOW(), NOW(), NOW(), '1.0', '1.0')`,
    [ids.user, email, await hashPassword(password)],
  );
  await pool.query(
    `INSERT INTO provider_services (id, user_id, service_name, price, approval_status)
     VALUES ($1, $2, 'Replay kaiseki dinner', '120.00', 'approved')`,
    [ids.service, ids.user],
  );
  await pool.query(
    `INSERT INTO trips (id, user_id, title, destination, start_date, end_date)
     VALUES ($1, $2, 'Replay plan', 'Kyoto, Japan', CURRENT_DATE + 30, CURRENT_DATE + 33)`,
    [ids.trip, ids.user],
  );
  // The owner collaborator row every trip mint writes (the plancard READ resolves the owner through it).
  await pool.query(
    `INSERT INTO trip_collaborators (id, trip_id, user_id, role, created_at)
     VALUES (gen_random_uuid()::text, $1, $2, 'owner', NOW())`,
    [ids.trip, ids.user],
  );
  // The booking exactly as checkout's AUTHORIZATION leaves it (stampAuthorization): the PI stamped,
  // still payment_pending, the §15b pre-flight marker and the item link in booking_details.
  await pool.query(
    `INSERT INTO service_bookings (
       id, service_id, traveler_id, provider_id, trip_id, status, total_amount, platform_fee,
       stripe_payment_intent_id, idempotency_key, booking_details, created_at)
     VALUES ($1, $2, $3, $3, $4, 'payment_pending', '120.00', '12.00', $5, $6, $7::jsonb, NOW())`,
    [
      ids.booking, ids.service, ids.user, ids.trip, ids.pi, `replay-${RUN}`,
      JSON.stringify({ itineraryItemId: ids.item, stripeAttemptAt: new Date().toISOString() }),
    ],
  );
  // The plan item as markItemPurchased leaves it at authorization: purchased, booking_id stamped.
  await pool.query(
    `INSERT INTO itinerary_items (id, trip_id, title, day_number, origin, routing_status, booking_id,
       provider_service_id, status)
     VALUES ($1, $2, 'Replay kaiseki dinner', 1, 'traveler', 'purchased', $3, $4, 'planned')`,
    [ids.item, ids.trip, ids.booking, ids.service],
  );
}

async function cleanup() {
  await pool.query(`DELETE FROM item_transition_log WHERE trip_id = $1`, [ids.trip]).catch(() => {});
  await pool.query(`DELETE FROM itinerary_items WHERE trip_id = $1`, [ids.trip]).catch(() => {});
  await pool.query(`DELETE FROM service_bookings WHERE id = $1`, [ids.booking]).catch(() => {});
  await pool.query(`DELETE FROM webhook_events WHERE stripe_event_id LIKE $1`, [`${ids.event}%`]).catch(() => {});
  await pool.query(`DELETE FROM trip_collaborators WHERE trip_id = $1`, [ids.trip]).catch(() => {});
  await pool.query(`DELETE FROM trips WHERE id = $1`, [ids.trip]).catch(() => {});
  await pool.query(`DELETE FROM provider_services WHERE id = $1`, [ids.service]).catch(() => {});
  await pool.query(`DELETE FROM sessions WHERE sess::text LIKE $1`, [`%${ids.user}%`]).catch(() => {});
  await pool.query(`DELETE FROM users WHERE id = $1`, [ids.user]).catch(() => {});
}

/** The payload Stripe signs for a declined platform PaymentIntent carrying cart bookingIds. */
function eventPayload(): string {
  return JSON.stringify({
    id: ids.event,
    object: "event",
    api_version: "2024-12-18.acacia",
    created: Math.floor(Date.now() / 1000),
    type: "payment_intent.payment_failed",
    livemode: false,
    data: {
      object: {
        id: ids.pi,
        object: "payment_intent",
        amount: 13200,
        currency: "usd",
        status: "requires_payment_method",
        metadata: { userId: ids.user, bookingIds: ids.booking, isDeposit: "false" },
        last_payment_error: { code: "card_declined", message: "Your card was declined." },
      },
    },
  });
}

async function deliver(payload: string): Promise<number> {
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET! });
  const res = await fetch(`${BASE_URL}/api/bookings/webhooks/stripe`, {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": header },
    body: payload,
  });
  return res.status;
}

async function bookingStatus(): Promise<string> {
  const r = await pool.query(`SELECT status, updated_at FROM service_bookings WHERE id = $1`, [ids.booking]);
  return r.rows[0]?.status;
}

function emailLines(): number | null {
  if (!SERVER_LOG) return null;
  const text = fs.readFileSync(SERVER_LOG, "utf8");
  return text.split("\n").filter((l) => l.includes("payment-failed email") && l.includes(email)).length;
}

async function plancardEnded(): Promise<any> {
  const login = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (login.status !== 200) throw new Error(`login failed: ${login.status} ${await login.text()}`);
  const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
  const res = await fetch(`${BASE_URL}/api/trips/${ids.trip}/plancard`, { headers: { cookie } });
  if (res.status !== 200) throw new Error(`plancard failed: ${res.status}`);
  const plan: any = await res.json();
  const acts = (plan.days ?? []).flatMap((d: any) => d.activities ?? []);
  return acts.find((a: any) => a.id === ids.item);
}

async function main() {
  console.log(`[replay] base=${BASE_URL} booking=${ids.booking} pi=${ids.pi} event=${ids.event}`);
  await seed();
  try {
    check("seeded booking is payment_pending", (await bookingStatus()) === "payment_pending");

    const payload = eventPayload();
    const first = await deliver(payload);
    check("signed delivery #1 to /api/bookings/webhooks/stripe answers 200", first === 200, first);
    check("service_bookings.status is now 'failed'", (await bookingStatus()) === "failed", await bookingStatus());

    // The email is fire-and-forget; give the log a moment to land before counting.
    await new Promise((r) => setTimeout(r, 1500));
    const emailsAfterFirst = emailLines();
    if (emailsAfterFirst !== null) check("exactly one payment-failed email line after delivery #1", emailsAfterFirst === 1, emailsAfterFirst);

    const a = await plancardEnded();
    check("plancard item carries NO `booking` (not 'Booked')", a && a.booking === undefined);
    check("plancard item discloses endedBooking.status === 'failed'", a?.endedBooking?.status === "failed", a?.endedBooking);

    const before = await pool.query(`SELECT status, updated_at FROM service_bookings WHERE id = $1`, [ids.booking]);
    const second = await deliver(payload); // REPLAY — the same signed event, re-signed with a fresh timestamp
    check("signed REPLAY answers 200", second === 200, second);
    const after = await pool.query(`SELECT status, updated_at FROM service_bookings WHERE id = $1`, [ids.booking]);
    check("replay changes nothing (status and updated_at identical)",
      before.rows[0].status === after.rows[0].status &&
        String(before.rows[0].updated_at) === String(after.rows[0].updated_at),
      { before: before.rows[0], after: after.rows[0] });
    await new Promise((r) => setTimeout(r, 1500));
    const emailsAfterReplay = emailLines();
    if (emailsAfterReplay !== null) check("no second payment-failed email after the replay", emailsAfterReplay === 1, emailsAfterReplay);
    if (emailsAfterReplay === null) console.log("NOTE  SERVER_LOG not set — email count not checked");

    if (process.env.THEN_SUCCEED === "1") {
      // OBSERVATION ONLY (not a pass/fail): the OPEN HAZARD R161 is blocked on. A Stripe
      // payment_failed is NOT terminal — the same PaymentIntent can be confirmed again (the cart's
      // StripeCheckout stays mounted on the same client secret after a decline). This delivers a
      // signed payment_intent.succeeded for the SAME PI and prints what the platform does with it.
      const succeeded = JSON.stringify({
        id: `${ids.event}_succeeded`,
        object: "event",
        api_version: "2024-12-18.acacia",
        created: Math.floor(Date.now() / 1000),
        type: "payment_intent.succeeded",
        livemode: false,
        data: {
          object: {
            id: ids.pi,
            object: "payment_intent",
            amount: 13200,
            amount_received: 13200,
            currency: "usd",
            status: "succeeded",
            metadata: { userId: ids.user, bookingIds: ids.booking, isDeposit: "false" },
          },
        },
      });
      const code = await deliver(succeeded);
      const r = await pool.query(
        `SELECT status, booking_details->'reconciliationException' AS exception FROM service_bookings WHERE id = $1`,
        [ids.booking],
      );
      const diary = await pool.query(
        `SELECT event_type, from_status, to_status FROM item_transition_log WHERE trip_id = $1 ORDER BY created_at`,
        [ids.trip],
      );
      const item = await pool.query(`SELECT routing_status, booking_id FROM itinerary_items WHERE id = $1`, [ids.item]);
      console.log(`OBSERVED  succeeded-after-failed delivery answered ${code}`);
      console.log(`OBSERVED  booking row: ${JSON.stringify(r.rows[0])}`);
      console.log(`OBSERVED  diary rows: ${JSON.stringify(diary.rows)}`);
      console.log(`OBSERVED  plan item: ${JSON.stringify(item.rows[0])}`);
    }
  } finally {
    if (process.env.KEEP === "1") {
      console.log(`[replay] KEEP=1 — rows kept; sign in as ${email} / ${password} and open /plans/${ids.trip}`);
    } else {
      await cleanup();
    }
    await pool.end();
  }
  console.log(failures === 0 ? "[replay] ALL PASS" : `[replay] ${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("[replay] error:", err);
  await pool.end().catch(() => {});
  process.exit(1);
});
