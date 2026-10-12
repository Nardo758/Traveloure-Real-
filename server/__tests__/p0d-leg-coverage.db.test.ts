/**
 * P0-d item 1 — `loadLegCoverage` reads the engine's own stops and the plan's shown legs
 * (ledger `2026-10-12-p0d-coverage-bridges`).
 *
 *   LC1 a routed plan with a routed bridge around an unlocated stop ⇒ not complete, that stop listed
 *   LC2 the same plan with the stop located and both pairs routed ⇒ complete, nothing listed
 *   LC3 a free plan ⇒ routedPlan false (the card never gives it the all-clear)
 *
 * DISPOSABLE DB ONLY. Run solo:
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/traveloure npx tsx --test --test-force-exit server/__tests__/p0d-leg-coverage.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";

const host = (() => {
  try {
    return new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
  } catch {
    return "<none>";
  }
})();
if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
  throw new Error(`[p0d-leg-coverage] REFUSING to write fixtures to '${host}'.`);
}

const { db, pool } = await import("../db");
const { loadLegCoverage } = await import("../services/optimizer-lead.service");

const RUN = crypto.randomUUID().slice(0, 8);
const owner = `lc-${RUN}-owner`;
const PAID = `lc-${RUN}-paid`;
const FREE = `lc-${RUN}-free`;
// Day 1 is in the future for this clock.
const NOW = new Date("2027-11-01T00:00:00Z");

async function item(trip: string, key: string, sort: number, located: boolean) {
  await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, title, day_number, sort_order, item_type, latitude, longitude)
    VALUES (${`${trip}-${key}`}, ${trip}, ${`Stop ${key}`}, 1, ${sort}, 'activity', ${located ? 35.0 + sort / 100 : null}, ${located ? 135.7 : null})`);
}
async function engineLeg(trip: string, from: string, to: string, order: number) {
  await db.execute(sql`INSERT INTO transport_legs (id, trip_id, day_number, leg_order, from_activity_id, from_name, from_lat, from_lng, to_activity_id, to_name, to_lat, to_lng,
      distance_meters, distance_display, recommended_mode, estimated_duration_minutes, alternative_modes, energy_cost, proposal_status, source)
    VALUES (${`${trip}-${from}${to}`}, ${trip}, 1, ${order}, ${`${trip}-${from}`}, ${from}, 35, 135.7, ${`${trip}-${to}`}, ${to}, 35, 135.7,
      2100, '2.1 km', 'transit', 14, '[]'::jsonb, 0, 'proposed', 'google_routes')`);
}

before(async () => {
  await db.execute(sql`INSERT INTO users (id, email, role) VALUES (${owner}, ${`${owner}@t.test`}, 'traveler')`);
  for (const t of [PAID, FREE]) {
    await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, market_slug, timezone, start_date, end_date, status, dates_confirmed_at)
      VALUES (${t}, ${owner}, 'LC', 'Kyoto, Japan', 'kyoto', 'Asia/Tokyo', '2027-11-08', '2027-11-09', 'draft', now())`);
    await item(t, "a", 0, true);
    await item(t, "u", 1, false);
    await item(t, "b", 2, true);
    await engineLeg(t, "a", "b", 1); // the bridge around u
  }
  await db.execute(sql`INSERT INTO trip_entitlements (id, trip_id, plan_key, status, source) VALUES (${`${PAID}-pass`}, ${PAID}, 'trip_pass', 'active', 'manual')`);
});

after(async () => {
  try {
    await db.execute(sql`DELETE FROM transport_legs WHERE trip_id IN (${PAID}, ${FREE})`);
    await db.execute(sql`DELETE FROM trip_entitlements WHERE trip_id IN (${PAID}, ${FREE})`);
    await db.execute(sql`DELETE FROM itinerary_items WHERE trip_id IN (${PAID}, ${FREE})`);
    await db.execute(sql`DELETE FROM trips WHERE id IN (${PAID}, ${FREE})`);
    await db.execute(sql`DELETE FROM users WHERE id = ${owner}`);
  } finally {
    await pool.end();
  }
});

test("LC1 a routed bridge around an unlocated stop is not coverage; the stop is listed", async () => {
  const { coverage, routedPlan } = await loadLegCoverage(PAID, NOW);
  assert.equal(routedPlan, true);
  assert.equal(coverage.complete, false);
  assert.deepEqual(coverage.unlocated, [{ day: 1, title: "Stop u" }]);
});

test("LC2 every pair routed and every stop on the map ⇒ complete", async () => {
  await db.execute(sql`UPDATE itinerary_items SET latitude = 35.005, longitude = 135.7 WHERE id = ${`${PAID}-u`}`);
  await db.execute(sql`DELETE FROM transport_legs WHERE id = ${`${PAID}-ab`}`);
  await engineLeg(PAID, "a", "u", 1);
  await engineLeg(PAID, "u", "b", 2);
  const { coverage } = await loadLegCoverage(PAID, NOW);
  assert.deepEqual(coverage, { complete: true, unlocated: [] });
});

test("LC3 a free plan is not a routed plan", async () => {
  const { routedPlan } = await loadLegCoverage(FREE, NOW);
  assert.equal(routedPlan, false);
});
