/**
 * The two switched traveler doors on the server (ledger `2026-10-18-traveler-doors-hidden`).
 *
 *   TD1 GET /api/traveler-doors: a missing row, "false" or any value but "true" reads off; "true" reads on; the body
 *       carries exactly { eventConcierge, handoffBooking }
 *   TD2 handoff_booking off ⇒ a NEW `book` ask and a `book` quote are 410 `handoff_booking_off`, and nothing is written
 *   TD3 handoff_booking off ⇒ the `polish` kind is unaffected (its quote answers, never 410)
 *   TD4 handoff_booking on ⇒ a `book` quote answers, never 410
 *
 * DISPOSABLE DB ONLY. Both settings are restored to what they were before the run. Run solo:
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/traveloure npx tsx --test --test-force-exit server/__tests__/traveler-doors.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import express from "express";
import type { AddressInfo } from "node:net";
import { sql } from "drizzle-orm";

const host = (() => {
  try {
    return new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
  } catch {
    return "<none>";
  }
})();
if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
  throw new Error(`[traveler-doors] REFUSING to write fixtures to '${host}'.`);
}

const { db, pool } = await import("../db");
const conciergeRoutes = (await import("../routes/concierge.routes")).default;
const handoffRoutes = (await import("../routes/handoff.routes")).default;
const { invalidatePlatformFlagCache } = await import("../services/platform-flags");
const { EVENT_CONCIERGE_SETTING, HANDOFF_BOOKING_SETTING } = await import("@shared/traveler-doors");

const RUN = crypto.randomUUID().slice(0, 8);
const OWNER = `td-${RUN}-owner`;
const TRIP = `td-${RUN}-trip`;
const ITEM = crypto.randomUUID();
const prior = new Map<string, string | null>();

async function setValue(key: string, value: string | null) {
  if (value === null) await db.execute(sql`DELETE FROM platform_settings WHERE setting_key = ${key}`);
  else
    await db.execute(sql`INSERT INTO platform_settings (setting_key, setting_value, updated_at) VALUES (${key}, ${value}, NOW())
      ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = NOW()`);
  invalidatePlatformFlagCache(key);
}

async function call(router: any, method: "GET" | "POST", url: string, body?: unknown, userId?: string) {
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

const requestCount = async () =>
  Number(((await db.execute(sql`SELECT count(*)::int AS c FROM expert_requests WHERE trip_id = ${TRIP}`)).rows[0] as any).c);

before(async () => {
  for (const key of [EVENT_CONCIERGE_SETTING, HANDOFF_BOOKING_SETTING]) {
    const r = await db.execute(sql`SELECT setting_value FROM platform_settings WHERE setting_key = ${key}`);
    prior.set(key, r.rows.length ? String((r.rows[0] as any).setting_value) : null);
  }
  await db.execute(sql`INSERT INTO users (id, email, first_name, last_name) VALUES (${OWNER}, ${`${OWNER}@t.test`}, 'Td', 'Owner')`);
  await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, start_date, end_date)
    VALUES (${TRIP}, ${OWNER}, 'Kyoto days', 'Kyoto, Japan', '2027-05-01', '2027-05-03')`);
  await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, title, day_number, sort_order, routing_status, estimated_cost)
    VALUES (${ITEM}, ${TRIP}, 'Fushimi Inari', 1, 0, 'in_planning', 0)`);
});

after(async () => {
  try {
    await db.execute(sql`DELETE FROM expert_requests WHERE trip_id = ${TRIP}`);
    await db.execute(sql`DELETE FROM itinerary_items WHERE trip_id = ${TRIP}`);
    await db.execute(sql`DELETE FROM trips WHERE id = ${TRIP}`);
    await db.execute(sql`DELETE FROM users WHERE id = ${OWNER}`);
    for (const [key, value] of prior) await setValue(key, value);
  } finally {
    await pool.end();
  }
});

test("TD1 GET /api/traveler-doors reads each switch off unless it is exactly 'true'", async () => {
  for (const [concierge, booking, want] of [
    [null, null, { eventConcierge: false, handoffBooking: false }],
    ["true", "false", { eventConcierge: true, handoffBooking: false }],
    ["yes", "true", { eventConcierge: false, handoffBooking: true }],
    ["TRUE", "", { eventConcierge: false, handoffBooking: false }],
  ] as const) {
    await setValue(EVENT_CONCIERGE_SETTING, concierge);
    await setValue(HANDOFF_BOOKING_SETTING, booking);
    const res = await call(conciergeRoutes, "GET", "/api/traveler-doors");
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, want, `${concierge}/${booking}`);
  }
});

test("TD2 handoff_booking off: a new book ask and a book quote are 410, and nothing is written", async () => {
  await setValue(HANDOFF_BOOKING_SETTING, null);
  const before = await requestCount();
  const quote = await call(handoffRoutes, "POST", `/api/trips/${TRIP}/handoff/quote`, { kind: "book", itemIds: [ITEM] }, OWNER);
  assert.equal(quote.status, 410);
  assert.equal(quote.body?.code, "handoff_booking_off");
  const ask = await call(handoffRoutes, "POST", `/api/trips/${TRIP}/handoff`, { kind: "book", itemIds: [ITEM] }, OWNER);
  assert.equal(ask.status, 410);
  assert.equal(ask.body?.code, "handoff_booking_off");
  assert.equal(await requestCount(), before, "no handoff row was written");
});

test("TD3 handoff_booking off: the polish kind still answers", async () => {
  await setValue(HANDOFF_BOOKING_SETTING, "false");
  const quote = await call(handoffRoutes, "POST", `/api/trips/${TRIP}/handoff/quote`, { kind: "polish", itemIds: [ITEM] }, OWNER);
  assert.notEqual(quote.status, 410);
  assert.ok(quote.status !== 401 && quote.status !== 404, `reached the quote, got ${quote.status}`);
  assert.notEqual(quote.body?.code, "handoff_booking_off");
});

test("TD4 handoff_booking on: a book quote answers", async () => {
  await setValue(HANDOFF_BOOKING_SETTING, "true");
  const quote = await call(handoffRoutes, "POST", `/api/trips/${TRIP}/handoff/quote`, { kind: "book", itemIds: [ITEM] }, OWNER);
  assert.notEqual(quote.status, 410);
  assert.ok(quote.status !== 401 && quote.status !== 404, `reached the quote, got ${quote.status}`);
  assert.notEqual(quote.body?.code, "handoff_booking_off");
});
