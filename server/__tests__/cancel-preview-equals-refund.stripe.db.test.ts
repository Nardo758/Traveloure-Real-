/**
 * THE CANCELLATION PREVIEW IS THE REFUND (ledger `2026-09-27-cancel-preview-equals-refund`; Terms §8.1:
 * "the amount displayed there is the amount refunded").
 *
 * END TO END against a RUNNING app and REAL Stripe test mode: a real PaymentIntent is charged the
 * booking's share plus its traveler service fee, the traveler reads `GET /api/bookings/:id/cancel-preview`,
 * cancels with `POST /api/bookings/:id/cancel`, and the test reads what STRIPE actually refunded. The
 * preview's cents must equal Stripe's cents, and the cancel response must say the same number.
 *
 *   P1  the reported case: a $105.00 booking + a $10.00 traveler service fee, Moderate policy, 50% tier.
 *       On `main` 521d00a10 the preview said $52.50 and Stripe refunded $57.50 (the fee's 50% was added
 *       after the preview was computed).
 *   P2  the same booking at the 100% tier.
 *   P3  a WAIVED fee (Trip Pass): the fee was never charged, so nothing of it is refunded or previewed.
 *
 * Skips VISIBLY without JOURNEY_BASE_URL or a real sk_test_ key. DISPOSABLE DB ONLY.
 *
 * Run: JOURNEY_BASE_URL=http://127.0.0.1:5602 STRIPE_SECRET_KEY=sk_test_… \
 *      DATABASE_URL=postgresql://postgres:postgres@localhost:5432/traveloure \
 *      npx tsx --test server/__tests__/cancel-preview-equals-refund.stripe.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { Pool } from "pg";
import Stripe from "stripe";

const BASE_URL = process.env.JOURNEY_BASE_URL;
const RAW_KEY = process.env.STRIPE_SECRET_KEY ?? "";
const liveStripe = /^sk_test_[A-Za-z0-9]{24,}$/.test(RAW_KEY) && !/dummy|stub|placeholder/i.test(RAW_KEY);
const SKIP = !BASE_URL ? "needs the running app (JOURNEY_BASE_URL)" : !liveStripe ? "needs a real sk_test_ key (STRIPE_SECRET_KEY)" : false;

const RUN = crypto.randomUUID().slice(0, 8);
const ids = { user: `cpr-${RUN}-user`, service: `cpr-${RUN}-svc` };
const email = `cpr-${RUN}@t.test`;
const password = `Cpr-${RUN}-pw!`;
const bookings: string[] = [];
const pis: string[] = [];
let pool: Pool;
let stripe: Stripe;
let cookie = "";

function hashPassword(pw: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString("hex");
    crypto.scrypt(pw, salt, 64, (err, key) => (err ? reject(err) : resolve(`${salt}:${key.toString("hex")}`)));
  });
}

before(async () => {
  if (SKIP) return;
  const host = new URL(process.env.DATABASE_URL ?? "").hostname;
  if (!["localhost", "127.0.0.1", "::1"].includes(host) && process.env.JOURNEY_DB_WRITES_OK !== "1") {
    throw new Error(`refusing to seed a non-local database (${host}); opt in with JOURNEY_DB_WRITES_OK=1`);
  }
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  stripe = new Stripe(RAW_KEY, { maxNetworkRetries: 2, timeout: 30000 });
  await pool.query(
    `INSERT INTO users (id, email, first_name, last_name, password, email_verified,
       terms_accepted_at, privacy_accepted_at, terms_version, privacy_version)
     VALUES ($1, $2, 'Cpr', 'Traveler', $3, NOW(), NOW(), NOW(), '1.0', '1.0')`,
    [ids.user, email, await hashPassword(password)],
  );
  await pool.query(
    `INSERT INTO provider_services (id, user_id, service_name, price, approval_status, status, cancellation_policy_type)
     VALUES ($1, $2, 'Cancel-preview fixture', '105.00', 'approved', 'active', 'moderate')`,
    [ids.service, ids.user],
  );
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (res.status !== 200) throw new Error(`login failed: ${res.status} ${await res.text()}`);
  cookie = (res.headers.get("set-cookie") ?? "").split(";")[0];
});

after(async () => {
  if (SKIP) return;
  await pool.query(`DELETE FROM refunds WHERE stripe_payment_intent_id = ANY($1)`, [pis]).catch(() => {});
  await pool.query(`DELETE FROM fee_ledger WHERE booking_id = ANY($1)`, [bookings]).catch(() => {});
  await pool.query(`DELETE FROM service_bookings WHERE id = ANY($1)`, [bookings]).catch(() => {});
  await pool.query(`DELETE FROM provider_services WHERE id = $1`, [ids.service]).catch(() => {});
  await pool.query(`DELETE FROM sessions WHERE sess::text LIKE $1`, [`%${ids.user}%`]).catch(() => {});
  await pool.query(`DELETE FROM users WHERE id = $1`, [ids.user]).catch(() => {});
  await pool.end();
});

/**
 * A confirmed $105.00 booking paid by a REAL succeeded PaymentIntent, starting `hoursAhead` from now,
 * with a traveler service fee snapshot of `feeDollars` (charged, or waived).
 */
async function paidBooking(opts: { hoursAhead: number; feeDollars: number; waived?: boolean }): Promise<{ id: string; pi: string }> {
  const chargedFee = opts.waived ? 0 : opts.feeDollars;
  const pi = await stripe.paymentIntents.create({
    amount: Math.round((105 + chargedFee) * 100),
    currency: "usd",
    payment_method_types: ["card"],
    payment_method: "pm_card_visa",
    confirm: true,
    metadata: { source: "cancel-preview-test", run: RUN },
  });
  assert.equal(pi.status, "succeeded");
  pis.push(pi.id);
  const id = crypto.randomUUID();
  bookings.push(id);
  const scheduledDate = new Date(Date.now() + opts.hoursAhead * 3600 * 1000).toISOString();
  const feeSnapshot = {
    charged: opts.waived ? 0 : opts.feeDollars,
    wouldHaveBeen: opts.feeDollars,
    waived: !!opts.waived,
    waiverBasis: opts.waived ? "trip_pass" : null,
  };
  await pool.query(
    `INSERT INTO service_bookings (id, service_id, traveler_id, provider_id, status, total_amount, platform_fee,
       stripe_payment_intent_id, booking_details, created_at)
     VALUES ($1, $2, $3, $3, 'confirmed', '105.00', '0.00', $4, $5::jsonb, NOW())`,
    [id, ids.service, ids.user, pi.id, JSON.stringify({ scheduledDate, travelerServiceFee: feeSnapshot })],
  );
  return { id, pi: pi.id };
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

async function previewThenCancel(b: { id: string; pi: string }) {
  const preview = await api("GET", `/api/bookings/${b.id}/cancel-preview`);
  assert.equal(preview.status, 200, JSON.stringify(preview.json));
  const cancel = await api("POST", `/api/bookings/${b.id}/cancel`, { reason: "changed plans" });
  assert.equal(cancel.status, 200, JSON.stringify(cancel.json));
  const refunds = await stripe.refunds.list({ payment_intent: b.pi, limit: 10 });
  const stripeCents = refunds.data.reduce((s, r) => s + r.amount, 0);
  return { preview: preview.json, cancel: cancel.json, stripeCents, refundCount: refunds.data.length };
}

test("P1 $105 booking + $10 fee at the 50% tier: the preview is exactly what Stripe refunds", { skip: SKIP }, async () => {
  const b = await paidBooking({ hoursAhead: 72, feeDollars: 10 });
  const r = await previewThenCancel(b);
  assert.equal(r.preview.refundPercent, 50);
  assert.equal(r.refundCount, 1);
  assert.equal(Math.round(r.preview.refundAmount * 100), r.stripeCents,
    `preview said ${r.preview.refundAmount}, Stripe refunded ${(r.stripeCents / 100).toFixed(2)}`);
  assert.equal(r.stripeCents, 5750, "50% of $105 plus 50% of the $10 fee (R156)");
  assert.equal(Math.round(r.cancel.refund.refundAmount * 100), r.stripeCents, "the cancel response says the same number");
});

test("P2 the same booking at the 100% tier refunds everything it was charged, as previewed", { skip: SKIP }, async () => {
  const b = await paidBooking({ hoursAhead: 200, feeDollars: 10 });
  const r = await previewThenCancel(b);
  assert.equal(r.preview.refundPercent, 100);
  assert.equal(Math.round(r.preview.refundAmount * 100), r.stripeCents);
  assert.equal(r.stripeCents, 11500);
});

test("P3 a waived (Trip Pass) fee was never charged, so none of it is previewed or refunded", { skip: SKIP }, async () => {
  const b = await paidBooking({ hoursAhead: 72, feeDollars: 10, waived: true });
  const r = await previewThenCancel(b);
  assert.equal(Math.round(r.preview.refundAmount * 100), r.stripeCents);
  assert.equal(r.stripeCents, 5250);
});
