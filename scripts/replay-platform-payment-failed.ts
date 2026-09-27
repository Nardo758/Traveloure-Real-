/**
 * replay-platform-payment-failed.ts — REAL-EVENT proof for R161 + R162 (ledger
 * `2026-09-27-platform-payment-failed`, `2026-09-27-failed-is-final`), driven over HTTP against a
 * RUNNING app. The defect lived between Stripe's routing and the two webhook endpoints, which no
 * DB-seeded unit test can see, so this drives the real routes (raw body, `stripe-signature`,
 * `constructEvent`, the session cookie).
 *
 *   Scenario 0 (R161, no Stripe network) — a SIGNED `payment_intent.payment_failed` to the PLATFORM
 *     endpoint marks the cart booking `failed`; the plancard discloses `endedBooking.status='failed'`
 *     (the slip's "Payment didn't go through" + "Try again"); a REPLAY changes nothing and sends no
 *     second email.
 *   Scenario A (R162, real Stripe test mode) — LATE SUCCESS. A real intent is DECLINED, its booking is
 *     marked `failed` by the signed webhook, the SAME intent is then confirmed with a good card and
 *     SUCCEEDS (the old card form re-submitting). The client fallback `POST /api/bookings/confirm-payment`
 *     is refused, the booking STAYS `failed`, the exception is recorded, and Stripe shows exactly ONE
 *     refund. A signed `payment_intent.succeeded` redelivery and a second confirm refund nothing more.
 *   Scenario B (R162, real Stripe test mode) — "TRY AGAIN". After the decline, the item is back in the
 *     cart through R157's real "Try again" routing rail, and the traveler checks out again
 *     through the real `POST /api/checkout`: a NEW intent is minted and stamped on a NEW booking row,
 *     the OLD intent is CANCELLED in Stripe, and the old card form can no longer confirm it.
 *
 * DISPOSABLE DB + LOCAL APP ONLY. Every row it seeds is deleted at the end unless KEEP=1; test-mode
 * Stripe objects it creates are cancelled/refunded. Scenarios A/B SKIP visibly without a real key.
 *
 * Run (start the app with the SAME secret in STRIPE_WEBHOOK_SECRET_TEST, NODE_ENV!=production, and —
 * for A/B — the same sk_test_ key in STRIPE_SECRET_KEY):
 *   BASE_URL=http://127.0.0.1:5057 \
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/traveloure \
 *   STRIPE_WEBHOOK_SECRET_TEST=whsec_local_replay STRIPE_SECRET_KEY=sk_test_… \
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
const RAW_KEY = process.env.STRIPE_SECRET_KEY ?? "";
const liveStripe = /^sk_test_[A-Za-z0-9]{24,}$/.test(RAW_KEY) && !/dummy|stub|placeholder/i.test(RAW_KEY);
if (!SECRET) throw new Error("STRIPE_WEBHOOK_SECRET_TEST must be set (the same value the app was started with)");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL must be set");
const host = new URL(process.env.DATABASE_URL).hostname;
if (!["localhost", "127.0.0.1", "::1"].includes(host) && process.env.JOURNEY_DB_WRITES_OK !== "1") {
  throw new Error(`refusing to seed a non-local database (${host}); opt in with JOURNEY_DB_WRITES_OK=1`);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
// Signing needs no key; the real calls (scenarios A/B) use the test key.
const signer = new Stripe("sk_test_signing_only_no_network", { apiVersion: "2024-12-18.acacia" as any });
const stripe = liveStripe ? new Stripe(RAW_KEY, { maxNetworkRetries: 2, timeout: 30000 }) : null;
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
const extraBookings: string[] = [];
const extraItems: string[] = [];
const livePis: string[] = [];
let cookie = "";

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
  // Terms/privacy pre-accepted so a KEEP=1 run can open the slip in a browser past the consent gate.
  await pool.query(
    `INSERT INTO users (id, email, first_name, last_name, password, email_verified,
       terms_accepted_at, privacy_accepted_at, terms_version, privacy_version)
     VALUES ($1, $2, 'Replay', 'Traveler', $3, NOW(), NOW(), NOW(), '1.0', '1.0')`,
    [ids.user, email, await hashPassword(password)],
  );
  // An approved, active, INSTANT listing — the shape `POST /api/checkout` will charge (LD 49: a
  // request-mode listing is never a list-price cart line).
  await pool.query(
    `INSERT INTO provider_services (id, user_id, service_name, price, approval_status, status, booking_mode)
     VALUES ($1, $2, 'Replay kaiseki dinner', '120.00', 'approved', 'active', 'instant')`,
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
  await seedClaim({ bookingId: ids.booking, itemId: ids.item, pi: ids.pi });
}

/**
 * A booking exactly as checkout's AUTHORIZATION leaves it (stampAuthorization): the PI stamped, still
 * payment_pending, the §15b pre-flight marker and the item link in booking_details — and its plan item
 * as markItemPurchased leaves it: purchased, booking_id stamped.
 */
async function seedClaim(o: { bookingId: string; itemId: string; pi: string }) {
  await pool.query(
    `INSERT INTO service_bookings (
       id, service_id, traveler_id, provider_id, trip_id, status, total_amount, platform_fee,
       stripe_payment_intent_id, idempotency_key, booking_details, created_at)
     VALUES ($1, $2, $3, $3, $4, 'payment_pending', '120.00', '12.00', $5, $6, $7::jsonb, NOW())`,
    [
      o.bookingId, ids.service, ids.user, ids.trip, o.pi, `replay-${RUN}-${o.bookingId.slice(0, 8)}`,
      JSON.stringify({ itineraryItemId: o.itemId, stripeAttemptAt: new Date().toISOString() }),
    ],
  );
  await pool.query(
    `INSERT INTO itinerary_items (id, trip_id, title, day_number, origin, routing_status, booking_id,
       provider_service_id, status)
     VALUES ($1, $2, 'Replay kaiseki dinner', 1, 'traveler', 'purchased', $3, $4, 'planned')`,
    [o.itemId, ids.trip, o.bookingId, ids.service],
  );
}

async function cleanup() {
  for (const pi of livePis) {
    if (!stripe) break;
    const cur = await stripe.paymentIntents.retrieve(pi).catch(() => null);
    if (cur && !["canceled", "succeeded"].includes(cur.status)) await stripe.paymentIntents.cancel(pi).catch(() => {});
  }
  await pool.query(`DELETE FROM refunds WHERE stripe_payment_intent_id = ANY($1)`, [[ids.pi, ...livePis]]).catch(() => {});
  await pool.query(`DELETE FROM payment_intents WHERE stripe_payment_intent_id = ANY($1)`, [livePis]).catch(() => {});
  await pool.query(`DELETE FROM cart_items WHERE user_id = $1`, [ids.user]).catch(() => {});
  await pool.query(`DELETE FROM item_transition_log WHERE trip_id = $1`, [ids.trip]).catch(() => {});
  await pool.query(`DELETE FROM itinerary_items WHERE trip_id = $1`, [ids.trip]).catch(() => {});
  await pool.query(`DELETE FROM fee_ledger WHERE booking_id IN (SELECT id FROM service_bookings WHERE traveler_id = $1)`, [ids.user]).catch(() => {});
  await pool.query(`DELETE FROM service_bookings WHERE traveler_id = $1`, [ids.user]).catch(() => {});
  await pool.query(`DELETE FROM webhook_events WHERE stripe_event_id LIKE $1`, [`evt_replay_${RUN}%`]).catch(() => {});
  await pool.query(`DELETE FROM trip_collaborators WHERE trip_id = $1`, [ids.trip]).catch(() => {});
  await pool.query(`DELETE FROM trips WHERE id = $1`, [ids.trip]).catch(() => {});
  await pool.query(`DELETE FROM provider_services WHERE id = $1`, [ids.service]).catch(() => {});
  await pool.query(`DELETE FROM sessions WHERE sess::text LIKE $1`, [`%${ids.user}%`]).catch(() => {});
  await pool.query(`DELETE FROM users WHERE id = $1`, [ids.user]).catch(() => {});
}

/** A PaymentIntent event payload shaped like the one Stripe signs for a cart checkout's PI. */
function piEvent(type: string, eventId: string, pi: { id: string; status: string; amount?: number }, bookingIds: string[]): string {
  return JSON.stringify({
    id: eventId,
    object: "event",
    api_version: "2024-12-18.acacia",
    created: Math.floor(Date.now() / 1000),
    type,
    livemode: false,
    data: {
      object: {
        id: pi.id,
        object: "payment_intent",
        amount: pi.amount ?? 13200,
        amount_received: pi.status === "succeeded" ? pi.amount ?? 13200 : 0,
        currency: "usd",
        status: pi.status,
        metadata: { userId: ids.user, bookingIds: bookingIds.join(","), isDeposit: "false" },
        ...(type === "payment_intent.payment_failed"
          ? { last_payment_error: { code: "card_declined", message: "Your card was declined." } }
          : {}),
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

async function statusOf(bookingId: string): Promise<string> {
  const r = await pool.query(`SELECT status FROM service_bookings WHERE id = $1`, [bookingId]);
  return r.rows[0]?.status;
}

function emailLines(): number | null {
  if (!SERVER_LOG) return null;
  const text = fs.readFileSync(SERVER_LOG, "utf8");
  return text.split("\n").filter((l) => l.includes("payment-failed email") && l.includes(email)).length;
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

async function api(method: string, path: string, body?: unknown): Promise<{ status: number; json: any }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { cookie, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { json = text.slice(0, 300); }
  return { status: res.status, json };
}

async function plancardItem(itemId: string): Promise<any> {
  const { status, json } = await api("GET", `/api/trips/${ids.trip}/plancard`);
  if (status !== 200) throw new Error(`plancard failed: ${status}`);
  return (json.days ?? []).flatMap((d: any) => d.activities ?? []).find((a: any) => a.id === itemId);
}

/** A real test-mode intent, declined once — Stripe leaves it `requires_payment_method` (NOT terminal). */
async function declinedIntent(bookingIds: string[]): Promise<Stripe.PaymentIntent> {
  const pi = await stripe!.paymentIntents.create({
    amount: 13200,
    currency: "usd",
    payment_method_types: ["card"],
    metadata: { userId: ids.user, bookingIds: bookingIds.join(","), isDeposit: "false", source: "replay", run: RUN },
  });
  livePis.push(pi.id);
  await stripe!.paymentIntents.confirm(pi.id, { payment_method: "pm_card_chargeDeclined" }).catch(() => {});
  return stripe!.paymentIntents.retrieve(pi.id);
}

// ── Scenario 0 (R161) ────────────────────────────────────────────────────────────────────────
async function scenarioPlatformFailed() {
  console.log("── Scenario 0: platform payment_failed marks the cart booking failed (R161)");
  check("seeded booking is payment_pending", (await statusOf(ids.booking)) === "payment_pending");
  const payload = piEvent("payment_intent.payment_failed", ids.event, { id: ids.pi, status: "requires_payment_method" }, [ids.booking]);
  check("signed delivery #1 to /api/bookings/webhooks/stripe answers 200", (await deliver(payload)) === 200);
  check("service_bookings.status is now 'failed'", (await statusOf(ids.booking)) === "failed", await statusOf(ids.booking));

  await new Promise((r) => setTimeout(r, 1500)); // the email is fire-and-forget
  const e1 = emailLines();
  if (e1 !== null) check("exactly one payment-failed email line after delivery #1", e1 === 1, e1);

  const a = await plancardItem(ids.item);
  check("plancard item carries NO `booking` (not 'Booked')", a && a.booking === undefined);
  check("plancard item discloses endedBooking.status === 'failed'", a?.endedBooking?.status === "failed", a?.endedBooking);

  const before = await pool.query(`SELECT status, updated_at FROM service_bookings WHERE id = $1`, [ids.booking]);
  check("signed REPLAY answers 200", (await deliver(payload)) === 200);
  const after = await pool.query(`SELECT status, updated_at FROM service_bookings WHERE id = $1`, [ids.booking]);
  check("replay changes nothing (status and updated_at identical)",
    before.rows[0].status === after.rows[0].status && String(before.rows[0].updated_at) === String(after.rows[0].updated_at),
    { before: before.rows[0], after: after.rows[0] });
  await new Promise((r) => setTimeout(r, 1500));
  const e2 = emailLines();
  if (e2 !== null) check("no second payment-failed email after the replay", e2 === 1, e2);
  if (e2 === null) console.log("NOTE  SERVER_LOG not set — email count not checked");
}

// ── Scenario A (R162): late success on the OLD intent ─────────────────────────────────────────
async function scenarioLateSuccess() {
  console.log("── Scenario A: fail → late success on the SAME intent → stays failed, refunded exactly once (R162)");
  const bookingId = crypto.randomUUID();
  const itemId = `replay-pf-${RUN}-item-a`;
  extraBookings.push(bookingId);
  extraItems.push(itemId);
  const pi = await declinedIntent([bookingId]);
  check("Stripe: a declined intent is requires_payment_method (not terminal)", pi.status === "requires_payment_method", pi.status);
  await seedClaim({ bookingId, itemId, pi: pi.id });

  check("signed payment_failed → 200",
    (await deliver(piEvent("payment_intent.payment_failed", `evt_replay_${RUN}_a_failed`, { id: pi.id, status: pi.status }, [bookingId]))) === 200);
  check("booking is 'failed'", (await statusOf(bookingId)) === "failed");

  // The traveler's OLD, still-mounted card form re-confirms the SAME intent with a good card.
  const paid = await stripe!.paymentIntents.confirm(pi.id, { payment_method: "pm_card_visa" });
  check("Stripe: the SAME intent now SUCCEEDS", paid.status === "succeeded", paid.status);

  // The client fallback reports it (the platform endpoint is not subscribed to payment_intent.succeeded).
  const c1 = await api("POST", "/api/bookings/confirm-payment", { bookingId, paymentIntentId: pi.id });
  check("confirm-payment is refused with payment_after_failure_refunded (409)",
    c1.status === 409 && c1.json?.error === "payment_after_failure_refunded", c1);
  check("booking STAYS 'failed' (failed is final)", (await statusOf(bookingId)) === "failed");
  const row = await pool.query(
    `SELECT booking_details->'reconciliationException'->>'reason' AS reason,
            booking_details->'lateSuccessRefund'->>'refundId' AS refund_id
       FROM service_bookings WHERE id = $1`, [bookingId]);
  check("reconciliation exception recorded (not_promotable)", row.rows[0]?.reason === "not_promotable", row.rows[0]);
  let refunds = await stripe!.refunds.list({ payment_intent: pi.id, limit: 10 });
  check("Stripe: exactly ONE refund, full amount, tagged late_success_on_failed_booking",
    refunds.data.length === 1 && refunds.data[0].amount === 13200 && refunds.data[0].metadata?.source === "late_success_on_failed_booking",
    refunds.data.map((r) => ({ id: r.id, amount: r.amount, source: r.metadata?.source })));
  check("the claim records the Stripe refund id", row.rows[0]?.refund_id === refunds.data[0]?.id, row.rows[0]?.refund_id);

  // Redelivery through every door: a signed succeeded webhook, and the client confirm again.
  check("signed payment_intent.succeeded redelivery → 200",
    (await deliver(piEvent("payment_intent.succeeded", `evt_replay_${RUN}_a_succeeded`, { id: pi.id, status: "succeeded" }, [bookingId]))) === 200);
  const c2 = await api("POST", "/api/bookings/confirm-payment", { bookingId, paymentIntentId: pi.id });
  check("a second confirm is refused the same way (already refunded)", c2.status === 409 && c2.json?.error === "payment_after_failure_refunded", c2.status);
  refunds = await stripe!.refunds.list({ payment_intent: pi.id, limit: 10 });
  const audit = await pool.query(`SELECT count(*)::int AS n FROM refunds WHERE stripe_payment_intent_id = $1`, [pi.id]);
  check("redelivery is a no-op: still ONE Stripe refund and ONE audit row",
    refunds.data.length === 1 && audit.rows[0].n === 1, { stripe: refunds.data.length, audit: audit.rows[0].n });
  check("booking still 'failed'", (await statusOf(bookingId)) === "failed");
}

// ── Scenario B (R162): "Try again" mints a NEW intent and cancels the OLD one ─────────────────
async function scenarioTryAgain() {
  console.log("── Scenario B: fail → \"Try again\" → new intent created, old intent cancelled (R162)");
  const oldBooking = crypto.randomUUID();
  const itemId = `replay-pf-${RUN}-item-b`;
  extraBookings.push(oldBooking);
  extraItems.push(itemId);
  const oldPi = await declinedIntent([oldBooking]);
  await seedClaim({ bookingId: oldBooking, itemId, pi: oldPi.id });
  check("signed payment_failed on the old intent → 200",
    (await deliver(piEvent("payment_intent.payment_failed", `evt_replay_${RUN}_b_failed`, { id: oldPi.id, status: oldPi.status }, [oldBooking]))) === 200);
  check("old booking is 'failed'", (await statusOf(oldBooking)) === "failed");

  // "Try again" is R157's real rail: the owner re-projects the failed-payment item back into the cart
  // (`purchased → in_planning → ready_for_checkout`, the item's own cart line), then opens checkout.
  const retry = await api("POST", `/api/trips/${ids.trip}/items/${itemId}/route`, { to: "ready_for_checkout" });
  check("R157 \"Try again\" re-projects the item into the cart (routing rail answers 2xx)",
    retry.status >= 200 && retry.status < 300, { status: retry.status, body: retry.status >= 300 ? retry.json : undefined });
  const line = await pool.query(`SELECT count(*)::int AS n FROM cart_items WHERE user_id = $1 AND itinerary_item_id = $2`, [ids.user, itemId]);
  check("the item has its cart line again", line.rows[0].n === 1, line.rows[0].n);

  const key = `replay-${RUN}-try-again`;
  const co = await api("POST", "/api/checkout", { tripId: ids.trip, idempotencyKey: key });
  const newPiId: string | undefined = co.json?.paymentIntent?.paymentIntentId;
  if (newPiId) livePis.push(newPiId);
  check("POST /api/checkout opens a NEW checkout (201 + a client secret)",
    co.status === 201 && !!co.json?.paymentIntent?.clientSecret && !!newPiId && newPiId !== oldPi.id,
    { status: co.status, error: co.json?.error ?? null, message: co.json?.message ?? null, newPiId });
  if (!newPiId) return;

  const nb = await pool.query(
    `SELECT id, status, stripe_payment_intent_id FROM service_bookings
      WHERE traveler_id = $1 AND booking_details->>'itineraryItemId' = $2 AND id <> $3`,
    [ids.user, itemId, oldBooking],
  );
  check("the NEW intent is stamped on a NEW booking row for the same item",
    nb.rows.length === 1 && nb.rows[0].stripe_payment_intent_id === newPiId && nb.rows[0].status === "payment_pending", nb.rows);

  const oldNow = await stripe!.paymentIntents.retrieve(oldPi.id);
  check("Stripe: the OLD intent is CANCELLED (abandoned)", oldNow.status === "canceled" && oldNow.cancellation_reason === "abandoned",
    { status: oldNow.status, reason: oldNow.cancellation_reason });
  const newNow = await stripe!.paymentIntents.retrieve(newPiId);
  check("Stripe: the NEW intent is open and payable", newNow.status === "requires_payment_method", newNow.status);

  let oldFormError = "";
  await stripe!.paymentIntents.confirm(oldPi.id, { payment_method: "pm_card_visa" }).catch((e: any) => { oldFormError = e?.code ?? e?.message ?? "error"; });
  check("the OLD card form can no longer pay the old intent (Stripe refuses)", oldFormError !== "", oldFormError);
  check("old booking still 'failed'", (await statusOf(oldBooking)) === "failed");

  const again = await api("POST", "/api/checkout", { tripId: ids.trip, idempotencyKey: key });
  check("the same-key re-POST hands back the NEW intent, never the failed one",
    again.json?.paymentIntent?.paymentIntentId === newPiId, { status: again.status, pi: again.json?.paymentIntent?.paymentIntentId ?? null });
}

async function main() {
  console.log(`[replay] base=${BASE_URL} run=${RUN} liveStripe=${liveStripe}`);
  await seed();
  try {
    await login();
    await scenarioPlatformFailed();
    if (!liveStripe) {
      console.log("SKIP  scenarios A/B — no real Stripe test key (STRIPE_SECRET_KEY=sk_test_…); nothing is claimed for them");
    } else {
      await scenarioLateSuccess();
      await scenarioTryAgain();
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
