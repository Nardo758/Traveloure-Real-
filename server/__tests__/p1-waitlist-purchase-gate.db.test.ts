/**
 * P-1s: in traveler waitlist mode the purchase routes refuse a plain traveler (ledger
 * `2026-11-02-p1s-waitlist-purchase-gate`). One check — `waitlistPurchaseDecisionFor` — reused on five routes:
 *
 *   W1 POST /api/checkout                                   (payments.routes.ts)
 *   W2 POST /api/optimization-payments                      (optimization.routes.ts)
 *   W3 POST /api/trips/:tripId/handoff                      (handoff.routes.ts)
 *   W4 POST /api/trips/:tripId/trip-pass/purchase           (trip-pass.routes.ts)
 *   W5 POST /api/trips/:tripId/proposals/:id/pay            (trips.routes.ts)
 *
 * Each: mode "waitlist" + plain traveler → 403 { code: TRAVELER_WAITLIST, message: TRAVELER_WAITLIST_MESSAGE };
 * an admin, a QA-domain account, and mode "open" pass the gate (the route's own next answer, never that 403).
 *   W6 the Ready-Made purchase keeps its own refusal unchanged.
 *
 * The routers are mounted in-process so the platform-flag cache can be invalidated between modes. No call here
 * reaches Stripe: every pass case stops at the route's own validation or ownership answer.
 *
 * Run: DATABASE_URL=… JOURNEY_DB_WRITES_OK=1 npx tsx --test --test-concurrency=1 --test-force-exit server/__tests__/p1-waitlist-purchase-gate.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import express from "express";
import type { AddressInfo } from "node:net";
import { sql } from "drizzle-orm";

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_") ? process.env.STRIPE_SECRET_KEY : "sk_test_dummy";
const QA_DOMAIN = process.env.QA_ACCOUNT_EMAIL_DOMAIN || "p1s-qa.test";
process.env.QA_ACCOUNT_EMAIL_DOMAIN = QA_DOMAIN;

const { db, pool } = await import("../db");
const { invalidatePlatformFlagCache } = await import("../services/platform-flags");
const { TRAVELER_SIGNUP_MODE_SETTING, TRAVELER_WAITLIST, TRAVELER_WAITLIST_MESSAGE } = await import("@shared/launch-signup");
const paymentsRouter = (await import("../routes/payments.routes")).default;
const optimizationRouter = (await import("../routes/optimization.routes")).default;
const handoffRouter = (await import("../routes/handoff.routes")).default;
const tripPassRouter = (await import("../routes/trip-pass.routes")).default;
const tripsRouter = (await import("../routes/trips.routes")).default;
const readyMadeRouter = (await import("../routes/ready-made.routes")).default;
const bookingsRouter = (await import("../routes/bookings")).default;

const RUN = crypto.randomUUID().slice(0, 8);
const P = `p1s-${RUN}`;
const traveler = `${P}-trav`;
const adminUser = `${P}-admin`;
const qaUser = `${P}-qa`;
const TRIP = `${P}-trip`;
let priorMode: string | null = null;

const ROUTES: ReadonlyArray<{ id: string; label: string; router: any; path: string; body: unknown }> = [
  { id: "W1", label: "POST /api/checkout", router: paymentsRouter, path: "/api/checkout", body: {} },
  { id: "W2", label: "POST /api/optimization-payments", router: optimizationRouter, path: "/api/optimization-payments", body: {} },
  { id: "W3", label: "POST /api/trips/:tripId/handoff", router: handoffRouter, path: `/api/trips/${TRIP}/handoff`, body: {} },
  { id: "W4", label: "POST /api/trips/:tripId/trip-pass/purchase", router: tripPassRouter, path: `/api/trips/${TRIP}/trip-pass/purchase`, body: {} },
  { id: "W5", label: "POST /api/trips/:tripId/proposals/:id/pay", router: tripsRouter, path: `/api/trips/${TRIP}/proposals/${crypto.randomUUID()}/pay`, body: {} },
];

async function post(router: any, url: string, body: unknown, userId: string) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { claims: { sub: userId, name: "T" } };
    (req as any).isAuthenticated = () => true;
    next();
  });
  app.use(router);
  const server = app.listen(0);
  await new Promise<void>((r) => server.once("listening", () => r()));
  const { port } = server.address() as AddressInfo;
  try {
    const res = await fetch(`http://127.0.0.1:${port}${url}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  } finally {
    server.close();
  }
}

async function setMode(value: string | null) {
  if (value === null) await db.execute(sql`DELETE FROM platform_settings WHERE setting_key = ${TRAVELER_SIGNUP_MODE_SETTING}`);
  else
    await db.execute(sql`INSERT INTO platform_settings (setting_key, setting_value, updated_at) VALUES (${TRAVELER_SIGNUP_MODE_SETTING}, ${value}, NOW())
      ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = NOW()`);
  invalidatePlatformFlagCache(TRAVELER_SIGNUP_MODE_SETTING);
}

function isWaitlistRefusal(res: { status: number; body: any }) {
  return res.status === 403 && res.body?.code === TRAVELER_WAITLIST;
}

before(async () => {
  const host = new URL(process.env.DATABASE_URL ?? "postgres://localhost").hostname.toLowerCase();
  if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
    throw new Error("refusing to write fixtures to a non-disposable database");
  }
  const r = await db.execute(sql`SELECT setting_value FROM platform_settings WHERE setting_key = ${TRAVELER_SIGNUP_MODE_SETTING}`);
  priorMode = r.rows.length ? String((r.rows[0] as any).setting_value) : null;
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name, role, email_verified) VALUES
      (${traveler}, ${`${traveler}@traveloure.test`}, 'P', 'Traveler', 'user', NOW()),
      (${adminUser}, ${`${adminUser}@traveloure.test`}, 'P', 'Admin', 'admin', NOW()),
      (${qaUser}, ${`${qaUser}@${QA_DOMAIN}`}, 'P', 'Qa', 'user', NOW())
  `);
  await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, start_date, end_date)
    VALUES (${TRIP}, ${traveler}, 'Kyoto days', 'Kyoto, Japan', CURRENT_DATE + 30, CURRENT_DATE + 32)`);
});

after(async () => {
  try {
    await db.execute(sql`DELETE FROM trips WHERE id = ${TRIP}`).catch(() => {});
    await db.execute(sql`DELETE FROM users WHERE id IN (${traveler}, ${adminUser}, ${qaUser})`).catch(() => {});
    await setMode(priorMode);
  } finally {
    await pool.end();
  }
});

for (const r of ROUTES) {
  test(`${r.id} ${r.label}: waitlist refuses a traveler; admin, QA and open mode pass`, async () => {
    await setMode("waitlist");
    const refused = await post(r.router, r.path, r.body, traveler);
    assert.equal(refused.status, 403, JSON.stringify(refused.body));
    assert.deepEqual(refused.body, { code: TRAVELER_WAITLIST, message: TRAVELER_WAITLIST_MESSAGE });

    const asAdmin = await post(r.router, r.path, r.body, adminUser);
    assert.ok(!isWaitlistRefusal(asAdmin), `admin: ${JSON.stringify(asAdmin.body)}`);
    const asQa = await post(r.router, r.path, r.body, qaUser);
    assert.ok(!isWaitlistRefusal(asQa), `QA: ${JSON.stringify(asQa.body)}`);

    await setMode("open");
    const open = await post(r.router, r.path, r.body, traveler);
    assert.ok(!isWaitlistRefusal(open), `open: ${JSON.stringify(open.body)}`);
  });
}

test("W7 POST /api/bookings/process-cart is behind the waitlist purchase gate", async () => {
  await setMode("waitlist");
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { claims: { sub: traveler, name: "T" } };
    (req as any).isAuthenticated = () => true;
    next();
  });
  app.use("/api/bookings", bookingsRouter);
  const server = app.listen(0);
  await new Promise<void>((r) => server.once("listening", () => r()));
  const { port } = server.address() as AddressInfo;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/bookings/process-cart`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    const body = await res.json();
    assert.equal(res.status, 403);
    assert.deepEqual(body, { code: TRAVELER_WAITLIST, message: TRAVELER_WAITLIST_MESSAGE });
  } finally {
    server.close();
  }
});

test("W8 POST /api/expert-booking-requests checks the purchase gate before it loads a listing", () => {
  const src = fs.readFileSync(new URL("../routes.ts", import.meta.url), "utf8");
  const start = src.indexOf('app.post("/api/expert-booking-requests"');
  assert.ok(start > 0);
  const end = src.indexOf("\n  app.post(", start + 20);
  const slice = src.slice(start, end === -1 ? start + 8000 : end);
  const gate = slice.indexOf("waitlistPurchaseDecisionFor");
  const listing = slice.indexOf("getProviderServiceById");
  assert.ok(gate > 0 && listing > gate, "the gate runs before a listing is loaded");
});

test("W6 the Ready-Made purchase keeps its own waitlist refusal", async () => {
  await setMode("waitlist");
  const res = await post(readyMadeRouter, `/api/ready-made/${crypto.randomUUID()}/purchase`, {}, traveler);
  assert.equal(res.status, 403);
  assert.equal(res.body?.code, TRAVELER_WAITLIST);
  assert.equal(res.body?.message, "Ready-Made Trips open with the launch. Join the waitlist to hear first.");
});
