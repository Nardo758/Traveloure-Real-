/**
 * LG-1 item 4 — leg options on the dispatched path, and leg provenance in the plan JSON (ledger
 * `2026-10-17-lg1-leg-options-provenance`), against a real database.
 *
 *   LP1  the options handler answers on `/api/trips/:tripId/legs/:legId/options` (GET and POST) and on
 *        `/api/trips/:tripId/transport-legs/:legId/options` (GET and POST) — the dispatched path no longer 404s
 *   LP2  an engine leg in the assembled plan carries top-level `source` and `checkedAt`, equal to its
 *        `routed.provenance`; a leg with no provenance carries neither key
 *
 * DISPOSABLE DB ONLY. Run solo:
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/traveloure npx tsx --test --test-force-exit server/__tests__/lg1-leg-options-provenance.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";

process.env.STRIPE_SECRET_KEY ||= "sk_test_lg1_leg_provenance";
process.env.TRAVEL_TIME_SERVICE_ENABLED = "1";
process.env.ROUTING_ADAPTER_STUB = "1";
delete process.env.GOOGLE_MAPS_API_KEY;
const { db } = await import("../db");
const { computePlanLegs } = await import("../services/routing/plan-legs-engine.service");
const { StubRoutingAdapter } = await import("../services/routing/stub-routing-adapter");
const { assembleTripPlan } = await import("../services/trip-plan.service");
const transportLegsRouter = (await import("../routes/transport-legs.routes")).default as any;

const RUN = crypto.randomUUID().slice(0, 8);
const id = (s: string) => `lp-${RUN}-${s}`;
const owner = id("owner");
const TRIP = id("trip");

before(async () => {
  const host = new URL(process.env.DATABASE_URL ?? "").hostname;
  if (!["localhost", "127.0.0.1", "::1", ""].includes(host) && process.env.JOURNEY_DB_WRITES_OK !== "1") throw new Error(`refusing ${host}`);
  await db.execute(sql`INSERT INTO users (id, email, first_name, last_name, role) VALUES (${owner}, ${`${owner}@t.test`}, 'LP', 'traveler', 'traveler')`);
  await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, market_slug, timezone, start_date, end_date, status, dates_confirmed_at)
    VALUES (${TRIP}, ${owner}, 'LP', 'Kyoto, Japan', 'kyoto', 'Asia/Tokyo', '2026-11-11', '2026-11-11', 'draft', now())`);
  await db.execute(sql`INSERT INTO trip_entitlements (id, trip_id, plan_key, status, source) VALUES (${`${TRIP}-pass`}, ${TRIP}, 'trip_pass', 'active', 'manual')`);
  const K = crypto.randomInt(0, 100_000) / 1e6;
  await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, title, item_type, day_number, sort_order, latitude, longitude, start_time, end_time, origin)
    VALUES (${`${TRIP}-a`}, ${TRIP}, 'A', 'activity', 1, 0, ${String(35.0037 + K)}, '135.7788', '09:00', '10:00', 'traveler'),
           (${`${TRIP}-b`}, ${TRIP}, 'B', 'activity', 1, 1, ${String(34.9949 + K)}, '135.785', '11:00', '12:00', 'traveler')`);
});

after(async () => {
  await db.execute(sql`DELETE FROM trips WHERE id = ${TRIP}`);
  await db.execute(sql`DELETE FROM users WHERE id = ${owner}`);
});

test("LP1: the options handler answers on legs/… and transport-legs/…, GET and POST", () => {
  const routes = (transportLegsRouter.stack ?? [])
    .filter((l: any) => l.route)
    .flatMap((l: any) => Object.keys(l.route.methods).map((m) => `${m.toUpperCase()} ${l.route.path}`));
  for (const want of [
    "GET /api/trips/:tripId/legs/:legId/options",
    "POST /api/trips/:tripId/legs/:legId/options",
    "GET /api/trips/:tripId/transport-legs/:legId/options",
    "POST /api/trips/:tripId/transport-legs/:legId/options",
  ]) {
    assert.ok(routes.includes(want), `${want} is registered`);
  }
});

test("LP2: an engine leg carries source and checkedAt at the top, equal to its routed provenance", async () => {
  await computePlanLegs(TRIP, { adapter: new StubRoutingAdapter() });
  const plan: any = await assembleTripPlan(TRIP, "full");
  const legs = (plan.days ?? []).flatMap((d: any) => d.transports ?? []);
  assert.ok(legs.length > 0, "the plan has a leg");
  for (const l of legs) {
    if (l.routed) {
      assert.equal(l.source, l.routed.provenance.source);
      assert.equal(l.checkedAt, l.routed.provenance.checkedAt);
      assert.equal(l.source, "stub");
    } else {
      assert.equal("source" in l, false);
      assert.equal("checkedAt" in l, false);
    }
  }
  assert.ok(legs.some((l: any) => l.routed), "at least one engine leg");
});
