/**
 * An unverified account may not start checkout or create a booking while
 * EMAIL_SENDS_ENABLED is exactly "true" on the SERVER process. The same session
 * passes after email_verified is stamped, without signing in again. Confirming
 * a payment is not this gate.
 *
 * SERVER REQUIRED (JOURNEY_BASE_URL, default :5000) started with
 * EMAIL_SENDS_ENABLED=true, plus a disposable database. Every row this file
 * writes it deletes.
 *
 *   EMAIL_SENDS_ENABLED=true JOURNEY_DB_WRITES_OK=1 \
 *   npx tsx --test --test-force-exit server/__tests__/verified-email-checkout-gate.http.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";

import { db, pool } from "../db";
import { emailVerificationDeniedBody } from "../../shared/email-verification-gate";
import { registerAndSignIn, SUPPLY_PROVIDER_SIGNUP_EXTRA } from "./fixtures/register-and-sign-in";

const BASE_URL = process.env.JOURNEY_BASE_URL || "http://127.0.0.1:5000";
const PASSWORD = "TestPass123!";
const RUN = crypto.randomUUID().slice(0, 8);
const buyerEmail = `vemail-${RUN}@t.test`;
const DENIED = emailVerificationDeniedBody();

let buyerId = "";
let buyerCookie = "";

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
async function assertDisposableDb(): Promise<void> {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host: string | null = null;
  try {
    host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
  } catch {
    host = null;
  }
  if (!(host !== null && DISPOSABLE_HOSTS.has(host))) {
    throw new Error(
      `[verified-email-checkout-gate] REFUSING to write fixtures: DATABASE_URL host '${host ?? "<none>"}' is ` +
        `not a recognized disposable dev/CI database. Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1.`,
    );
  }
}

function api(path: string, cookie: string | undefined, body?: unknown) {
  return fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body ?? {}),
  });
}

async function readJson(res: Response): Promise<{ status: number; body: any; text: string }> {
  const text = await res.text();
  let body: any = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  return { status: res.status, body, text };
}

async function counts(): Promise<{ serviceBookings: number; bookings: number; cartItems: number }> {
  const serviceBookings = await db.execute(sql`
    SELECT count(*)::int AS n FROM service_bookings WHERE traveler_id = ${buyerId}
  `);
  const bookings = await db.execute(sql`
    SELECT count(*)::int AS n FROM bookings WHERE user_id = ${buyerId}
  `);
  const cartItems = await db.execute(sql`
    SELECT count(*)::int AS n FROM cart_items WHERE user_id = ${buyerId}
  `);
  return {
    serviceBookings: (serviceBookings.rows[0] as { n: number }).n,
    bookings: (bookings.rows[0] as { n: number }).n,
    cartItems: (cartItems.rows[0] as { n: number }).n,
  };
}

before(async () => {
  const health = await fetch(`${BASE_URL}/api/health`).catch(() => null);
  assert.ok(health && health.ok, `server must be running on ${BASE_URL} with EMAIL_SENDS_ENABLED=true`);
  await assertDisposableDb();

  const buyer = await registerAndSignIn({
    baseUrl: BASE_URL,
    email: buyerEmail,
    password: PASSWORD,
    firstName: "Unverified",
    lastName: "Buyer",
    leaveUnverified: true,
    // Waitlist mode refuses a first-time traveler. Supply intent is the existing
    // bypass and still creates role=user (emailAuth ignores userType).
    extra: SUPPLY_PROVIDER_SIGNUP_EXTRA,
  });
  buyerCookie = buyer.cookie;
  buyerId = buyer.id;

  const row = await db.execute(sql`
    SELECT email_verified FROM users WHERE id = ${buyerId}
  `);
  assert.equal((row.rows[0] as { email_verified: unknown }).email_verified, null);
});

after(async () => {
  try {
    if (buyerId) {
      await db.execute(sql`DELETE FROM service_bookings WHERE traveler_id = ${buyerId}`);
      await db.execute(sql`DELETE FROM bookings WHERE user_id = ${buyerId}`);
      await db.execute(sql`DELETE FROM cart_items WHERE user_id = ${buyerId}`);
      await db.execute(sql`DELETE FROM email_verification_tokens WHERE user_id = ${buyerId}`);
      await db.execute(sql`DELETE FROM users WHERE id = ${buyerId}`);
    }
  } finally {
    await pool.end();
  }
});

test("a signed-out checkout is still the route's 401", async () => {
  const res = await readJson(await api("/api/checkout", undefined, {}));
  assert.equal(res.status, 401, res.text);
  assert.notEqual(res.body?.code, DENIED.code);
});

test("an unverified account is refused on checkout and booking creates, and nothing is written", async () => {
  const beforeCounts = await counts();
  for (const path of ["/api/checkout", "/api/bookings", "/api/bookings/process-cart"]) {
    const res = await readJson(await api(path, buyerCookie, {}));
    assert.equal(res.status, 403, `${path} expected 403, got ${res.status}: ${res.text}`);
    assert.deepEqual(res.body, DENIED, path);
  }
  assert.deepEqual(await counts(), beforeCounts);
});

test("confirm-payment is not behind the verified-email gate", async () => {
  const res = await readJson(await api("/api/bookings/confirm-payment", buyerCookie, {}));
  assert.notEqual(res.status, 403, res.text);
  assert.notEqual(res.body?.code, DENIED.code);
  assert.equal(res.status, 400, res.text);
});

test("stamping email_verified mid-session lets the same calls past the gate", async () => {
  await db.execute(sql`UPDATE users SET email_verified = NOW() WHERE id = ${buyerId}`);
  for (const path of ["/api/checkout", "/api/bookings", "/api/bookings/process-cart"]) {
    const res = await readJson(await api(path, buyerCookie, {}));
    assert.notEqual(
      res.body?.code,
      DENIED.code,
      `${path} still refused after verification (${res.status}): ${res.text}`,
    );
    assert.notEqual(res.status, 403, `${path} still 403 after verification: ${res.text}`);
  }
});
