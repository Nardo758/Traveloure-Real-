/**
 * R316 — the anchor WRITERS store the plan's wall-clock, whatever the server's TZ (ledger
 * `2026-10-05-anchor-writers-wall-clock`; the convention module is `@shared/anchor-time`).
 *   W1 `POST /api/trips/:tripId/anchors` with a zone-less "2026-11-15T14:00:00" stores 14:00 on a
 *      Tokyo process (it stored 05:00 through `z.coerce.date()`, which read the string in the server's zone)
 *   W2 the `suggestedTime` path (dayNumber + "HH:MM") stores that day's wall-clock — never setHours in
 *      the server's zone — and a bad time is a 400 that stores nothing
 *   W3 `PUT /api/anchors/:id` with a zone-less string stores its wall-clock too
 *   W4 a value that names its own zone ("…Z") is stored as given (unchanged behaviour)
 *
 * NEGATIVE SPACE (§18d): the two CLIENT writers (plan modal, TemporalAnchorManager) send
 * `anchorWallClockString(...)`, whose shape is pinned by `shared/__tests__/anchor-time.test.ts`; rows
 * written before R316 are not rewritten (no backfill — their browser's zone was never recorded).
 *
 * DISPOSABLE DB ONLY. Run solo:
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/traveloure npx tsx --test server/__tests__/anchor-writers-wall-clock.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import express from "express";
import type { AddressInfo } from "node:net";
import { sql } from "drizzle-orm";

// The bug only shows on a server that is not on UTC.
process.env.TZ = "Asia/Tokyo";
process.env.STRIPE_SECRET_KEY ||= "sk_test_anchor_writers";
const { db } = await import("../db");
const tripsRoutes = (await import("../routes/trips.routes")).default;

const RUN = crypto.randomUUID().slice(0, 8);
const ids = { owner: `awc-${RUN}-owner`, trip: `awc-${RUN}-trip` };

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
function assertDisposableDb(): void {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host = "<none>";
  try {
    host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
  } catch {
    /* refuse below */
  }
  if (!DISPOSABLE_HOSTS.has(host)) {
    throw new Error(`[anchor-writers] REFUSING to write fixtures to '${host}'. Opt in with JOURNEY_DB_WRITES_OK=1.`);
  }
}

async function call(method: "POST" | "PUT", url: string, body: unknown) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { claims: { sub: ids.owner } };
    (req as any).isAuthenticated = () => true;
    next();
  });
  app.use(tripsRoutes);
  const server = app.listen(0);
  await new Promise<void>((r) => server.once("listening", () => r()));
  const { port } = server.address() as AddressInfo;
  try {
    const res = await fetch(`http://127.0.0.1:${port}${url}`, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return { status: res.status, body: await res.json().catch(() => null) };
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
}

const stored = async (id: string) =>
  ((await db.execute(sql`SELECT to_char(anchor_datetime, 'YYYY-MM-DD HH24:MI:SS') AS at FROM temporal_anchors WHERE id = ${id}`)).rows[0] as any)?.at;

before(async () => {
  assertDisposableDb();
  await db.execute(sql`INSERT INTO users (id, email, first_name, last_name, role) VALUES (${ids.owner}, ${`${ids.owner}@t.test`}, 'AWC', 'traveler', 'traveler')`);
  await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, start_date, end_date, status)
    VALUES (${ids.trip}, ${ids.owner}, 'Anchor writers', 'Kyoto, Japan', '2026-11-11', '2026-11-15', 'draft')`);
  await db.execute(sql`INSERT INTO trip_collaborators (id, trip_id, user_id, role) VALUES (${`${ids.trip}-c`}, ${ids.trip}, ${ids.owner}, 'owner')`).catch(() => {});
});

after(async () => {
  await db.execute(sql`DELETE FROM temporal_anchors WHERE trip_id = ${ids.trip}`);
  await db.execute(sql`DELETE FROM trips WHERE id = ${ids.trip}`);
  await db.execute(sql`DELETE FROM users WHERE id = ${ids.owner}`);
});

test("W1 a zone-less anchor is stored as its wall-clock on a non-UTC server", async () => {
  assert.equal(new Date("2026-11-15T14:00:00").getTimezoneOffset(), -540, "the process really is on Tokyo time");
  const r = await call("POST", `/api/trips/${ids.trip}/anchors`, { anchorType: "flight_departure", anchorDatetime: "2026-11-15T14:00:00", bufferBefore: 180 });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(await stored(r.body.id), "2026-11-15 14:00:00");
});

test("W2 the suggestedTime path stores that day's wall-clock; a bad time stores nothing", async () => {
  const r = await call("POST", `/api/trips/${ids.trip}/anchors`, { anchorType: "custom", dayNumber: 3, suggestedTime: "09:30", description: "Tea ceremony" });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(await stored(r.body.id), "2026-11-13 09:30:00");
  const bad = await call("POST", `/api/trips/${ids.trip}/anchors`, { anchorType: "custom", dayNumber: 3, suggestedTime: "25:99" });
  assert.equal(bad.status, 400);
});

test("W3 an update with a zone-less string stores its wall-clock", async () => {
  const r = await call("POST", `/api/trips/${ids.trip}/anchors`, { anchorType: "custom", anchorDatetime: "2026-11-12T10:00:00" });
  const u = await call("PUT", `/api/anchors/${r.body.id}`, { anchorDatetime: "2026-11-12T18:45:00" });
  assert.equal(u.status, 200, JSON.stringify(u.body));
  assert.equal(await stored(r.body.id), "2026-11-12 18:45:00");
});

test("W4 a value that names its own zone is stored as given", async () => {
  const r = await call("POST", `/api/trips/${ids.trip}/anchors`, { anchorType: "custom", anchorDatetime: "2026-11-14T05:00:00.000Z" });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(await stored(r.body.id), "2026-11-14 05:00:00");
});
