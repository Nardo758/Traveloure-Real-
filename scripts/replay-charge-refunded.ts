/**
 * replay-charge-refunded.ts — SIGNED-EVENT proof for the R163 amendment (merged refund design,
 * decision-maker Sep 27, 2026). Delivers `charge.refunded` events, signed exactly as Stripe signs
 * them, to the PLATFORM endpoint `POST /api/bookings/webhooks/stripe` of a RUNNING app, and reads the
 * database and `GET /api/my-bookings` afterwards. These are #1123's replay cases, re-expressed
 * against R163's read model: the webhook writes NO booking status; the stamp and the label answer.
 *
 *   1 full       — a whole-charge dashboard refund: label Refunded, status unchanged, one audit row.
 *   2 partial    — a partial refund: not labelled Refunded; My Bookings states "$X of $Y refunded".
 *   3 cumulative — a second partial reaching the whole charge ⇒ Refunded.
 *   4 repeat     — the identical signed event redelivered: nothing changes, no second audit row.
 *   5 late       — an OLDER snapshot (fewer refunds) delivered last cannot lower the stamp.
 *   6 shared     — a partial refund on a payment two bookings share labels neither.
 *
 * Every refund list is embedded in the charge (has_more:false), so the app makes no Stripe call.
 * DISPOSABLE DB + LOCAL APP ONLY; every seeded row is deleted at the end unless KEEP=1.
 *
 *   BASE_URL=http://127.0.0.1:5601 DATABASE_URL=postgresql://postgres:postgres@localhost:5432/traveloure \
 *   STRIPE_WEBHOOK_SECRET_TEST=whsec_local_replay npx tsx scripts/replay-charge-refunded.ts
 */
import { Pool } from "pg";
import crypto from "node:crypto";
import Stripe from "stripe";

const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:5057";
const SECRET = process.env.STRIPE_WEBHOOK_SECRET_TEST;
if (!SECRET) throw new Error("STRIPE_WEBHOOK_SECRET_TEST must be set (the same value the app was started with)");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL must be set");
const host = new URL(process.env.DATABASE_URL).hostname;
if (!["localhost", "127.0.0.1", "::1"].includes(host) && process.env.JOURNEY_DB_WRITES_OK !== "1") {
  throw new Error(`refusing to seed a non-local database (${host}); opt in with JOURNEY_DB_WRITES_OK=1`);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const signer = new Stripe("sk_test_signing_only_no_network", { apiVersion: "2024-12-18.acacia" as any });
const RUN = crypto.randomUUID().slice(0, 8);
const email = `replay-cr-${RUN}@t.test`;
const password = `Replay-${RUN}-pw!`;
const userId = `replay-cr-${RUN}-user`;
const serviceId = `replay-cr-${RUN}-svc`;
const bookings: string[] = [];
const pis: string[] = [];
let cookie = "";
let failures = 0;

function check(label: string, ok: boolean, detail?: unknown) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail === undefined ? "" : `  ${JSON.stringify(detail)}`}`);
}

function hashPassword(pw: string): Promise<string> {
  // The app's scrypt format (`<salt>:<hex>`), as scripts/replay-platform-payment-failed.ts seeds it.
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString("hex");
    crypto.scrypt(pw, salt, 64, (err, key) => (err ? reject(err) : resolve(`${salt}:${key.toString("hex")}`)));
  });
}

async function seed() {
  await pool.query(
    `INSERT INTO users (id, email, first_name, last_name, password, email_verified,
       terms_accepted_at, privacy_accepted_at, terms_version, privacy_version)
     VALUES ($1, $2, 'Replay', 'Traveler', $3, NOW(), NOW(), NOW(), '1.0', '1.0')`,
    [userId, email, await hashPassword(password)],
  );
  await pool.query(
    `INSERT INTO provider_services (id, user_id, service_name, price, approval_status, status)
     VALUES ($1, $2, 'Replay refund service', '100.00', 'approved', 'active')`,
    [serviceId, userId],
  );
}

async function booking(pi: string): Promise<string> {
  const id = crypto.randomUUID();
  await pool.query(
    `INSERT INTO service_bookings (id, service_id, traveler_id, provider_id, status, total_amount, platform_fee,
       stripe_payment_intent_id, booking_details, created_at)
     VALUES ($1, $2, $3, $3, 'confirmed', '100.00', '0.00', $4, '{}'::jsonb, NOW())`,
    [id, serviceId, userId, pi],
  );
  bookings.push(id);
  if (!pis.includes(pi)) pis.push(pi);
  return id;
}

function chargeEvent(eventId: string, pi: string, chargeCents: number, refunds: Array<{ id: string; amount: number }>): string {
  return JSON.stringify({
    id: eventId,
    object: "event",
    api_version: "2024-12-18.acacia",
    created: Math.floor(Date.now() / 1000),
    type: "charge.refunded",
    livemode: false,
    data: {
      object: {
        id: `ch_${pi}`,
        object: "charge",
        payment_intent: pi,
        amount: chargeCents,
        amount_refunded: refunds.reduce((s, r) => s + r.amount, 0),
        currency: "usd",
        refunds: {
          object: "list",
          has_more: false,
          data: refunds.map((r) => ({ id: r.id, object: "refund", amount: r.amount, status: "succeeded", currency: "usd", metadata: {} })),
        },
      },
    },
  });
}

async function deliver(payload: string): Promise<number> {
  const header = signer.webhooks.generateTestHeaderString({ payload, secret: SECRET! });
  const res = await fetch(`${BASE_URL}/api/bookings/webhooks/stripe`, {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": header },
    body: payload,
  });
  return res.status;
}

async function login() {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (res.status !== 200) throw new Error(`login failed: ${res.status} ${await res.text()}`);
  cookie = (res.headers.get("set-cookie") ?? "").split(";")[0];
}

async function myBooking(id: string): Promise<any> {
  const res = await fetch(`${BASE_URL}/api/my-bookings`, { headers: { cookie } });
  const json: any = await res.json();
  const list = Array.isArray(json) ? json : json.bookings ?? [];
  return list.find((b: any) => b.id === id);
}

async function dbRow(id: string): Promise<any> {
  return (await pool.query(`SELECT status, booking_details FROM service_bookings WHERE id = $1`, [id])).rows[0];
}

async function auditCount(pi: string): Promise<number> {
  return (await pool.query(`SELECT count(*)::int AS n FROM refunds WHERE stripe_payment_intent_id = $1`, [pi])).rows[0].n;
}

async function cleanup() {
  await pool.query(`DELETE FROM refunds WHERE stripe_payment_intent_id = ANY($1)`, [pis]).catch(() => {});
  await pool.query(`DELETE FROM ops_alerts WHERE metadata->>'paymentIntentId' = ANY($1)`, [pis]).catch(() => {});
  await pool.query(`DELETE FROM service_bookings WHERE traveler_id = $1`, [userId]).catch(() => {});
  await pool.query(`DELETE FROM webhook_events WHERE stripe_event_id LIKE $1`, [`evt_rcr_${RUN}%`]).catch(() => {});
  await pool.query(`DELETE FROM provider_services WHERE id = $1`, [serviceId]).catch(() => {});
  await pool.query(`DELETE FROM sessions WHERE sess::text LIKE $1`, [`%${userId}%`]).catch(() => {});
  await pool.query(`DELETE FROM users WHERE id = $1`, [userId]).catch(() => {});
}

async function main() {
  console.log(`[replay] base=${BASE_URL} run=${RUN}`);
  await seed();
  await login();

  console.log("── 1 full");
  const pi1 = `pi_rcr_${RUN}_full`;
  const b1 = await booking(pi1);
  check("signed charge.refunded → 200", (await deliver(chargeEvent(`evt_rcr_${RUN}_1`, pi1, 10000, [{ id: `re_rcr_${RUN}_1`, amount: 10000 }]))) === 200);
  check("status unchanged (the webhook writes no booking status)", (await dbRow(b1)).status === "confirmed");
  const m1 = await myBooking(b1);
  check("My Bookings reads refundedOutOfBand", m1?.refundedOutOfBand === true, m1?.refundedOutOfBand);
  check("one audit row", (await auditCount(pi1)) === 1);

  console.log("── 2 partial");
  const pi2 = `pi_rcr_${RUN}_partial`;
  const b2 = await booking(pi2);
  check("signed partial → 200", (await deliver(chargeEvent(`evt_rcr_${RUN}_2a`, pi2, 10000, [{ id: `re_rcr_${RUN}_2a`, amount: 4000 }]))) === 200);
  const m2 = await myBooking(b2);
  check("not labelled Refunded", m2?.refundedOutOfBand === undefined, m2?.refundedOutOfBand);
  check("server states the refund: 40 of 100", m2?.refundSummary?.refundedCents === 4000 && m2?.refundSummary?.chargedCents === 10000, m2?.refundSummary);

  console.log("── 3 cumulative");
  check("second partial → 200",
    (await deliver(chargeEvent(`evt_rcr_${RUN}_2b`, pi2, 10000, [{ id: `re_rcr_${RUN}_2a`, amount: 4000 }, { id: `re_rcr_${RUN}_2b`, amount: 6000 }]))) === 200);
  check("cumulative 100 of 100 ⇒ refundedOutOfBand", (await myBooking(b2))?.refundedOutOfBand === true);
  check("two audit rows, one per refund id", (await auditCount(pi2)) === 2);

  console.log("── 4 repeat");
  const before = (await dbRow(b2)).booking_details.outOfBandRefund;
  check("identical redelivery → 200",
    (await deliver(chargeEvent(`evt_rcr_${RUN}_2b`, pi2, 10000, [{ id: `re_rcr_${RUN}_2a`, amount: 4000 }, { id: `re_rcr_${RUN}_2b`, amount: 6000 }]))) === 200);
  const after = (await dbRow(b2)).booking_details.outOfBandRefund;
  check("stamp unchanged", before.amountCents === after.amountCents && before.detectedAt === after.detectedAt);
  check("still two audit rows", (await auditCount(pi2)) === 2);

  console.log("── 5 late (older snapshot last)");
  check("older snapshot (one refund) → 200",
    (await deliver(chargeEvent(`evt_rcr_${RUN}_2old`, pi2, 10000, [{ id: `re_rcr_${RUN}_2a`, amount: 4000 }]))) === 200);
  check("stamp keeps the cumulative 10000", (await dbRow(b2)).booking_details.outOfBandRefund.amountCents === 10000);
  check("still Refunded", (await myBooking(b2))?.refundedOutOfBand === true);

  console.log("── 6 shared payment");
  const pi6 = `pi_rcr_${RUN}_shared`;
  const s1 = await booking(pi6);
  const s2 = await booking(pi6);
  check("shared partial equal to one booking's price → 200",
    (await deliver(chargeEvent(`evt_rcr_${RUN}_6`, pi6, 20000, [{ id: `re_rcr_${RUN}_6`, amount: 10000 }]))) === 200);
  const m6a = await myBooking(s1);
  const m6b = await myBooking(s2);
  check("neither booking reads Refunded", m6a?.refundedOutOfBand === undefined && m6b?.refundedOutOfBand === undefined);
  check("summary is a shared-payment refund, never this booking's", m6a?.refundSummary?.kind === "shared_payment" && m6a?.refundSummary?.paymentCents === 20000, m6a?.refundSummary);
  check("both statuses unchanged", (await dbRow(s1)).status === "confirmed" && (await dbRow(s2)).status === "confirmed");
}

main()
  .catch((err) => { failures++; console.error(err); })
  .finally(async () => {
    if (process.env.KEEP !== "1") await cleanup();
    await pool.end();
    console.log(failures === 0 ? "[replay] ALL PASS" : `[replay] ${failures} FAILURE(S)`);
    process.exit(failures === 0 ? 0 : 1);
  });
