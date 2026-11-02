/**
 * CN-1g: the legacy /api/concierge/* funnel is retired (ledger `2026-11-02-cn1g-retire-legacy-concierge-server`).
 *
 *   T1 each of the six legacy paths, signed out → 410 { code: "concierge_retired" } (through the running server)
 *   T2 the same six, signed in as a traveler → 410 (no auth runs first)
 *   T3 GET /api/traveler-doors → { eventConcierge: false, handoffBooking: <flag> } for handoff_booking "true" and
 *      "false", with event_concierge set to "true" in the database
 *   T4 the admin settings PATCH no longer treats event_concierge as a boolean switch: a non-boolean value is not
 *      refused as one, and whatever is written, GET /api/traveler-doors still answers eventConcierge: false
 *   T5 the CN-1 task-kind and task-log routes still answer (not 410)
 *   T6 handoff_booking off still refuses a new `book` quote with 410 handoff_booking_off
 *   T7 source pin: server/routes/concierge.routes.ts does not exist; routes.ts has no conciergeRoutes import
 *
 * Needs the dev server on :5000 (JOURNEY_BASE_URL) for T1, T2, T4, T5; T3 and T6 mount the routers in-process so
 * the platform-flag cache can be invalidated.
 *
 * Run: DATABASE_URL=… JOURNEY_DB_WRITES_OK=1 npx tsx --test --test-concurrency=1 --test-force-exit server/__tests__/cn1g-concierge-retired.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import express from "express";
import type { AddressInfo } from "node:net";
import { sql } from "drizzle-orm";
import { db, pool } from "../db";
import { registerAndSignIn } from "./fixtures/register-and-sign-in";
import travelerDoorsRoutes from "../routes/traveler-doors.routes";
import handoffRoutes from "../routes/handoff.routes";
import { invalidatePlatformFlagCache } from "../services/platform-flags";
import { EVENT_CONCIERGE_SETTING, HANDOFF_BOOKING_SETTING } from "@shared/traveler-doors";

const BASE_URL = process.env.JOURNEY_BASE_URL || "http://127.0.0.1:5000";
const ROOT = path.resolve(import.meta.dirname, "../..");
const RUN = crypto.randomUUID().slice(0, 8);
const P = `cn1g-${RUN}`;
const TRIP = `${P}-trip`;
const ITEM = crypto.randomUUID();
const prior = new Map<string, string | null>();
let traveler = { id: "", cookie: "" };
let admin = { id: "", cookie: "" };

const LEGACY: ReadonlyArray<{ method: string; path: string; body?: unknown }> = [
  { method: "POST", path: "/api/concierge/requests", body: { intent: "Plan Kyoto" } },
  { method: "POST", path: "/api/concierge/quote", body: { intent: "Plan Kyoto" } },
  { method: "PATCH", path: `/api/concierge/requests/${crypto.randomUUID()}`, body: { chosenTier: "full" } },
  { method: "POST", path: `/api/concierge/requests/${crypto.randomUUID()}/claim`, body: {} },
  { method: "POST", path: "/api/concierge/escalations", body: {} },
  { method: "GET", path: "/api/concierge/event-packages" },
];

async function live(method: string, url: string, body?: unknown, cookie?: string) {
  const res = await fetch(`${BASE_URL}${url}`, {
    method,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  return { status: res.status, body: json };
}

async function inProcess(router: any, method: "GET" | "POST", url: string, body?: unknown, userId?: string) {
  const app = express();
  app.use(express.json());
  if (userId) {
    app.use((req, _res, next) => {
      (req as any).user = { claims: { sub: userId, name: "T" } };
      (req as any).isAuthenticated = () => true;
      next();
    });
  }
  app.use(router);
  const server = app.listen(0);
  await new Promise<void>((r) => server.once("listening", () => r()));
  const { port } = server.address() as AddressInfo;
  try {
    const res = await fetch(`http://127.0.0.1:${port}${url}`, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  } finally {
    server.close();
  }
}

async function setValue(key: string, value: string | null) {
  if (value === null) await db.execute(sql`DELETE FROM platform_settings WHERE setting_key = ${key}`);
  else
    await db.execute(sql`INSERT INTO platform_settings (setting_key, setting_value, updated_at) VALUES (${key}, ${value}, NOW())
      ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = NOW()`);
  invalidatePlatformFlagCache(key);
}

before(async () => {
  const host = new URL(process.env.DATABASE_URL ?? "postgres://localhost").hostname.toLowerCase();
  if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
    throw new Error("refusing to write fixtures to a non-disposable database");
  }
  assert.equal((await fetch(`${BASE_URL}/api/health`)).status, 200, "dev server must be running on :5000");
  for (const key of [EVENT_CONCIERGE_SETTING, HANDOFF_BOOKING_SETTING]) {
    const r = await db.execute(sql`SELECT setting_value FROM platform_settings WHERE setting_key = ${key}`);
    prior.set(key, r.rows.length ? String((r.rows[0] as any).setting_value) : null);
  }
  const t = await registerAndSignIn({ baseUrl: BASE_URL, email: `${P}-trav@traveloure.test`, password: "TestPass123!", firstName: "Trav" });
  traveler = { id: t.id, cookie: t.cookie };
  const a = await registerAndSignIn({ baseUrl: BASE_URL, email: `${P}-admin@traveloure.test`, password: "TestPass123!", firstName: "Adm" });
  admin = { id: a.id, cookie: a.cookie };
  await db.execute(sql`UPDATE users SET role = 'admin' WHERE id = ${admin.id}`);
  await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, start_date, end_date)
    VALUES (${TRIP}, ${traveler.id}, 'Kyoto days', 'Kyoto, Japan', CURRENT_DATE + 30, CURRENT_DATE + 32)`);
  await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, title, day_number, sort_order, routing_status, estimated_cost)
    VALUES (${ITEM}, ${TRIP}, 'Fushimi Inari', 1, 0, 'in_planning', 0)`);
});

after(async () => {
  try {
    await db.execute(sql`DELETE FROM expert_requests WHERE trip_id = ${TRIP}`).catch(() => {});
    await db.execute(sql`DELETE FROM itinerary_items WHERE trip_id = ${TRIP}`).catch(() => {});
    await db.execute(sql`DELETE FROM trips WHERE id = ${TRIP}`).catch(() => {});
    await db.execute(sql`DELETE FROM admin_audit_logs WHERE admin_id = ${admin.id}`).catch(() => {});
    await db.execute(sql`DELETE FROM users WHERE id IN (${traveler.id}, ${admin.id})`).catch(() => {});
    for (const [key, value] of prior) await setValue(key, value);
  } finally {
    await pool.end();
  }
});

test("T1 each legacy path, signed out → 410 concierge_retired", async () => {
  for (const r of LEGACY) {
    const res = await live(r.method, r.path, r.body);
    assert.equal(res.status, 410, `${r.method} ${r.path}: ${JSON.stringify(res.body)}`);
    assert.equal(res.body?.code, "concierge_retired", `${r.method} ${r.path}`);
  }
});

test("T2 each legacy path, signed in as a traveler → 410, not 401/403", async () => {
  for (const r of LEGACY) {
    const res = await live(r.method, r.path, r.body, traveler.cookie);
    assert.equal(res.status, 410, `${r.method} ${r.path}: ${JSON.stringify(res.body)}`);
    assert.equal(res.body?.code, "concierge_retired", `${r.method} ${r.path}`);
  }
});

test("T3 GET /api/traveler-doors: eventConcierge is always false; handoffBooking follows its flag", async () => {
  await setValue(EVENT_CONCIERGE_SETTING, "true");
  for (const [flag, want] of [["true", true], ["false", false]] as const) {
    await setValue(HANDOFF_BOOKING_SETTING, flag);
    const res = await inProcess(travelerDoorsRoutes, "GET", "/api/traveler-doors");
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { eventConcierge: false, handoffBooking: want }, flag);
  }
});

test("T4 the admin PATCH no longer validates event_concierge as a switch, and nothing reads it", async () => {
  const res = await live("PATCH", `/api/admin/platform-settings/${EVENT_CONCIERGE_SETTING}`, { settingValue: "yes" }, admin.cookie);
  // Not in BOOLEAN_FLAG_KEYS: the "must be 'true' or 'false'" refusal no longer fires. The route has no key
  // allowlist (admin.routes.ts PATCH /api/admin/platform-settings/:settingKey), so an unvalidated key is written.
  assert.ok(!(res.status === 400 && String(res.body?.error ?? "").includes("must be 'true' or 'false'")), JSON.stringify(res.body));
  const on = await live("PATCH", `/api/admin/platform-settings/${EVENT_CONCIERGE_SETTING}`, { settingValue: "true" }, admin.cookie);
  assert.ok(on.status < 500, JSON.stringify(on.body));
  const doors = await live("GET", "/api/traveler-doors");
  assert.equal(doors.status, 200);
  assert.equal(doors.body?.eventConcierge, false);
});

test("T5 the CN-1 task-kind and task-log routes still answer", async () => {
  const kinds = await live("GET", "/api/concierge-task-kinds");
  assert.equal(kinds.status, 200, JSON.stringify(kinds.body));
  assert.ok(Array.isArray(kinds.body) || typeof kinds.body === "object");
  const tasks = await live("GET", `/api/concierge/bookings/${P}-none/tasks`, undefined, traveler.cookie);
  assert.notEqual(tasks.status, 410);
  assert.notEqual(tasks.body?.code, "concierge_retired");
  const create = await live("POST", `/api/concierge/bookings/${P}-none/tasks`, { taskKindId: "x", title: "x" }, traveler.cookie);
  assert.notEqual(create.status, 410);
  assert.notEqual(create.body?.code, "concierge_retired");
});

test("T6 handoff_booking off still refuses a new book quote with 410 handoff_booking_off", async () => {
  await setValue(HANDOFF_BOOKING_SETTING, null);
  const quote = await inProcess(handoffRoutes, "POST", `/api/trips/${TRIP}/handoff/quote`, { kind: "book", itemIds: [ITEM] }, traveler.id);
  assert.equal(quote.status, 410);
  assert.equal(quote.body?.code, "handoff_booking_off");
});

test("T7 source pin: the legacy router is gone and routes.ts does not import it", () => {
  assert.equal(fs.existsSync(path.join(ROOT, "server/routes/concierge.routes.ts")), false);
  const routes = fs.readFileSync(path.join(ROOT, "server/routes.ts"), "utf8");
  assert.ok(!/import\s+conciergeRoutes\b/.test(routes));
  assert.ok(!routes.includes("./routes/concierge.routes"));
});
