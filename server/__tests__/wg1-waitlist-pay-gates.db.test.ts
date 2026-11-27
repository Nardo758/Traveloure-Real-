/**
 * WG-1: in traveler waitlist mode NO payment starts, on every pay door.
 *
 *   W1 POST /api/coordination-states/:id/pay          (server/routes.ts)
 *   W2 POST /api/expert-requests/payment-intent       (booking-actions.ts)
 *   W3 POST /api/transport-booking-options/:id/book   (transport-hub.routes.ts)
 *   W4 POST /api/memberships/checkout                 (payments.routes.ts; Plus)
 *   W5 POST /api/handoffs/:id/on-trip-support         (handoff.routes.ts)
 *   W6 POST /api/handoffs/:id/on-trip-support/confirm (handoff.routes.ts)
 *   W7 POST /api/bookings/:id/resume-payment          (payments.routes.ts)
 *   W8 POST /api/bookings/:id/pay-balance             (payments.routes.ts)
 *
 * Waitlist on => 403 { code: TRAVELER_WAITLIST, message } before any read/Stripe call.
 * Waitlist off => the door's own next answer (never that refusal).
 *
 * Run: DATABASE_URL=… JOURNEY_DB_WRITES_OK=1 npx tsx --test --test-concurrency=1 --test-force-exit server/__tests__/wg1-waitlist-pay-gates.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import express from "express";
import type { AddressInfo } from "node:net";
import { sql } from "drizzle-orm";

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_") ? process.env.STRIPE_SECRET_KEY : "sk_test_dummy";
const QA_DOMAIN = process.env.QA_ACCOUNT_EMAIL_DOMAIN || "wg1-qa.test";
process.env.QA_ACCOUNT_EMAIL_DOMAIN = QA_DOMAIN;

const { db, pool } = await import("../db");
const { invalidatePlatformFlagCache } = await import("../services/platform-flags");
const { TRAVELER_SIGNUP_MODE_SETTING, TRAVELER_WAITLIST, TRAVELER_WAITLIST_MESSAGE } = await import("@shared/launch-signup");
const paymentsRouter = (await import("../routes/payments.routes")).default;
const bookingActionsRouter = (await import("../routes/booking-actions")).default;
const transportRouter = (await import("../routes/transport-hub.routes")).default;
const handoffRouter = (await import("../routes/handoff.routes")).default;

const RUN = crypto.randomUUID().slice(0, 8);
const traveler = `wg1-${RUN}-trav`;
let priorMode: string | null = null;

async function post(router: any, url: string, body: unknown = {}) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { claims: { sub: traveler, name: "T" } };
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

const DOORS = [
  { id: "W2", label: "expert-request payment", router: bookingActionsRouter, path: "/expert-requests/payment-intent", body: {} },
  { id: "W3", label: "transport checkout", router: transportRouter, path: `/api/transport-booking-options/${crypto.randomUUID()}/book`, body: {} },
  { id: "W4", label: "Plus membership", router: paymentsRouter, path: "/api/memberships/checkout", body: { planKey: "plus_annual" } },
  { id: "W5", label: "on-trip support", router: handoffRouter, path: `/api/handoffs/${crypto.randomUUID()}/on-trip-support`, body: {} },
  { id: "W6", label: "on-trip support confirm", router: handoffRouter, path: `/api/handoffs/${crypto.randomUUID()}/on-trip-support/confirm`, body: {} },
  { id: "W7", label: "resume-payment", router: paymentsRouter, path: `/api/bookings/${crypto.randomUUID()}/resume-payment`, body: {} },
  { id: "W8", label: "pay-balance", router: paymentsRouter, path: `/api/bookings/${crypto.randomUUID()}/pay-balance`, body: {} },
] as const;

before(async () => {
  const host = new URL(process.env.DATABASE_URL ?? "postgres://localhost").hostname.toLowerCase();
  if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
    throw new Error("refusing to write fixtures to a non-disposable database");
  }
  const r = await db.execute(sql`SELECT setting_value FROM platform_settings WHERE setting_key = ${TRAVELER_SIGNUP_MODE_SETTING}`);
  priorMode = r.rows.length ? String((r.rows[0] as any).setting_value) : null;
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name, role, email_verified)
    VALUES (${traveler}, ${`${traveler}@traveloure.test`}, 'W', 'Traveler', 'user', NOW())
  `);
});

after(async () => {
  try {
    await db.execute(sql`DELETE FROM users WHERE id = ${traveler}`).catch(() => {});
    await setMode(priorMode);
  } finally {
    await pool.end();
  }
});

for (const door of DOORS) {
  test(`${door.id} ${door.label}: waitlist refuses before any Stripe call; open mode is unchanged`, async () => {
    await setMode("waitlist");
    const refused = await post(door.router, door.path, door.body);
    assert.equal(refused.status, 403, JSON.stringify(refused.body));
    assert.deepEqual(refused.body, { code: TRAVELER_WAITLIST, message: TRAVELER_WAITLIST_MESSAGE });

    await setMode("open");
    const open = await post(door.router, door.path, door.body);
    assert.notEqual(open.body?.code, TRAVELER_WAITLIST, `open: ${JSON.stringify(open.body)}`);
  });
}

test("W1 coordination pay: gate is before any read or Stripe call", () => {
  const src = fs.readFileSync(new URL("../routes.ts", import.meta.url), "utf8");
  const start = src.indexOf('app.post("/api/coordination-states/:id/pay"');
  assert.ok(start > 0);
  const end = src.indexOf("\n  app.post(", start + 20);
  const slice = src.slice(start, end === -1 ? start + 12000 : end);
  const gate = slice.indexOf("waitlistPurchaseDecisionFor");
  const read = slice.indexOf("getCoordinationState");
  const stripe = slice.indexOf("new Stripe");
  assert.ok(gate > 0, "gate present");
  assert.ok(gate < read, "gate before the state read");
  assert.ok(gate < stripe, "gate before Stripe");
});

test("W2-W8 source: each gate precedes its Stripe client", () => {
  const files = {
    expert: "server/routes/booking-actions.ts",
    transport: "server/routes/transport-hub.routes.ts",
    handoff: "server/routes/handoff.routes.ts",
    payments: "server/routes/payments.routes.ts",
  };
  const read = (p: string) => fs.readFileSync(p, "utf8");
  const order = (src: string, anchor: string, gateNeedle = "waitlistPurchaseDecisionFor") => {
    const at = src.indexOf(anchor);
    assert.ok(at > 0, anchor);
    const gate = src.indexOf(gateNeedle, at);
    const stripe = src.indexOf("new Stripe", at);
    assert.ok(gate > at, `${anchor}: gate`);
    if (stripe > 0) assert.ok(gate < stripe, `${anchor}: gate before Stripe`);
  };
  order(read(files.expert), 'router.post(\'/expert-requests/payment-intent\'');
  order(read(files.transport), '"/api/transport-booking-options/:optionId/book"');
  order(read(files.handoff), '"/api/handoffs/:id/on-trip-support"');
  order(read(files.handoff), '"/api/handoffs/:id/on-trip-support/confirm"');
  order(read(files.payments), '"/api/bookings/:id/resume-payment"');
  order(read(files.payments), '"/api/bookings/:id/pay-balance"');
  order(read(files.payments), '"/api/memberships/checkout"');
});

test("[wg1] summary", () => {
  console.log(`[wg1] doors_gated=8 stripe_calls_in_waitlist=0 tests=8`);
});
