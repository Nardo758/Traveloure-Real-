/**
 * P0-c item 1 — the plan card's `legsSkipped` reads the plan's OWN confirmed dates (ledger
 * `2026-10-12-p0c-hotfix`). From the production smoke on 330f594a: a routed plan whose
 * `dates_confirmed_at` was set was told `legsSkipped: "dates_not_confirmed"`. The route read
 * `plan.trip.datesConfirmed`, a path the assembled plan does not have (the trip DTO is
 * `plan.plancard.trip`), so every plan read as unconfirmed. The engine's own gate was not regressed.
 *
 *   PS1 a routed plan (active Trip Pass, engine on) with confirmed dates ⇒ `legsSkipped` absent
 *   PS2 the same plan with unconfirmed dates ⇒ `legsSkipped: "dates_not_confirmed"`
 *   PS3 a confirmed-dates plan with no pass ⇒ `free_plan` (the reason order is unchanged)
 *   PS4 (item 3) a stop whose stored times disagree — start 10:00, end 12:30, 60 minutes — reads its stored
 *       start on the card (`startTime` and `time` both "10:00"), never end − duration ("11:30")
 *
 * TRANSPORT: the REAL plancard router in a bare express app, real requests (the payer-reads-plancard shape).
 * DISPOSABLE DB ONLY. Run solo:
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/traveloure npx tsx --test --test-force-exit server/__tests__/p0c-plancard-legs-skipped.db.test.ts
 */
process.env.STRIPE_SECRET_KEY ||= "sk_test_p0c";
process.env.TRAVEL_TIME_SERVICE_ENABLED = "1";
process.env.ROUTING_ADAPTER_STUB = "1";
delete process.env.GOOGLE_MAPS_API_KEY;

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
  throw new Error(`[p0c-plancard-legs-skipped] REFUSING to write fixtures to '${host}'.`);
}

const { db, pool } = await import("../db");
const plancardRoutes = (await import("../routes/plancard.routes")).default;

const RUN = crypto.randomUUID().slice(0, 8);
const owner = `p0c-${RUN}-owner`;
const CONFIRMED = `p0c-${RUN}-confirmed`;
const UNCONFIRMED = `p0c-${RUN}-unconfirmed`;
const FREE = `p0c-${RUN}-free`;

async function plancardAs(userId: string, tripId: string): Promise<{ status: number; body: any }> {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { claims: { sub: userId } };
    (req as any).isAuthenticated = () => true;
    next();
  });
  app.use(plancardRoutes);
  const server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/api/trips/${tripId}/plancard`);
    return { status: res.status, body: await res.json() };
  } finally {
    server.close();
  }
}

before(async () => {
  await db.execute(sql`INSERT INTO users (id, email, role) VALUES (${owner}, ${`${owner}@t.test`}, 'traveler')`);
  for (const [t, confirmed] of [
    [CONFIRMED, true],
    [UNCONFIRMED, false],
    [FREE, true],
  ] as const) {
    await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, market_slug, timezone, start_date, end_date, status, dates_confirmed_at)
      VALUES (${t}, ${owner}, 'P0-c', 'Kyoto, Japan', 'kyoto', 'Asia/Tokyo', '2027-11-08', '2027-11-09', 'draft', ${confirmed ? new Date() : null})`);
    await db.execute(sql`INSERT INTO trip_collaborators (trip_id, user_id, role) VALUES (${t}, ${owner}, 'owner') ON CONFLICT DO NOTHING`).catch(() => undefined);
  }
  await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, title, day_number, sort_order, start_time, end_time, duration_minutes, item_type)
    VALUES (${`${CONFIRMED}-item`}, ${CONFIRMED}, 'Kinkaku-ji', 1, 0, '10:00', '12:30', 60, 'activity')`);
  for (const t of [CONFIRMED, UNCONFIRMED]) {
    await db.execute(sql`INSERT INTO trip_entitlements (id, trip_id, plan_key, status, source) VALUES (${`${t}-pass`}, ${t}, 'trip_pass', 'active', 'manual')`);
  }
});

after(async () => {
  try {
    await db.execute(sql`DELETE FROM itinerary_items WHERE trip_id = ${CONFIRMED}`);
    await db.execute(sql`DELETE FROM trip_entitlements WHERE trip_id IN (${CONFIRMED}, ${UNCONFIRMED}, ${FREE})`);
    await db.execute(sql`DELETE FROM trip_collaborators WHERE trip_id IN (${CONFIRMED}, ${UNCONFIRMED}, ${FREE})`).catch(() => undefined);
    await db.execute(sql`DELETE FROM trips WHERE id IN (${CONFIRMED}, ${UNCONFIRMED}, ${FREE})`);
    await db.execute(sql`DELETE FROM users WHERE id = ${owner}`);
  } finally {
    await pool.end();
  }
});

test("PS1 a routed plan with confirmed dates carries no legsSkipped", async () => {
  const { status, body } = await plancardAs(owner, CONFIRMED);
  assert.equal(status, 200);
  assert.equal(body.trip?.datesConfirmed, true, "fixture: the plan's dates are confirmed");
  assert.equal(body.routedLegs, true, "fixture: the plan is routed and the engine is on");
  assert.equal("legsSkipped" in body, false, `legsSkipped must be absent, got ${JSON.stringify(body.legsSkipped)}`);
});

test("PS2 unconfirmed dates are still reported as dates_not_confirmed", async () => {
  const { status, body } = await plancardAs(owner, UNCONFIRMED);
  assert.equal(status, 200);
  assert.equal(body.trip?.datesConfirmed, false);
  assert.equal(body.legsSkipped, "dates_not_confirmed");
});

test("PS3 a confirmed plan with no pass is a free plan (reason order unchanged)", async () => {
  const { status, body } = await plancardAs(owner, FREE);
  assert.equal(status, 200);
  assert.equal(body.legsSkipped, "free_plan");
});

test("PS4 an inconsistent stop reads its stored start, never end − duration", async () => {
  const { status, body } = await plancardAs(owner, CONFIRMED);
  assert.equal(status, 200);
  const acts = (body.days ?? []).flatMap((d: any) => d.activities ?? []);
  const a = acts.find((x: any) => x.id === `${CONFIRMED}-item`);
  assert.ok(a, "fixture item is on the card");
  assert.equal(a.startTime, "10:00");
  assert.equal(a.time, "10:00");
  assert.notEqual(a.time, "11:30", "never end − duration");
});
