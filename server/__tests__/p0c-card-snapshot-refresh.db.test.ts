/**
 * P0-c item 3 — the Trip Card's snapshot follows the live plan for every day not yet past
 * (ledger `2026-10-12-p0c-hotfix`; LD 69). Production 330f594a: the item said 17:35, the snapshot taken
 * five days earlier said 17:30, and the card showed the snapshot.
 *
 *   SR1 edit a stop's time → recompute → the snapshot's start_time matches the item (a day not yet past)
 *   SR2 a past day keeps its frozen snapshot item, even when the live row changed
 *   SR3 idempotent: a second recompute with nothing changed writes nothing; no new version, hash kept
 *   SR4 a plan never made final gets no snapshot (nothing is created by a recompute)
 *
 * The recompute is `computePlanLegs` with the engine off (adapter null): the refresh runs at its end
 * whether or not legs were computed.
 * DISPOSABLE DB ONLY. Run solo:
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/traveloure npx tsx --test --test-force-exit server/__tests__/p0c-card-snapshot-refresh.db.test.ts
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
  throw new Error(`[p0c-card-snapshot-refresh] REFUSING to write fixtures to '${host}'.`);
}

const { db, pool } = await import("../db");
const { finalizeTrip, getLatestTripFinal, refreshTripFinalLiveDays } = await import("../services/trip-finalize.service");
const { computePlanLegs } = await import("../services/routing/plan-legs-engine.service");

const RUN = crypto.randomUUID().slice(0, 8);
const owner = `sr-${RUN}-owner`;
const TRIP = `sr-${RUN}-trip`;
const NEVER = `sr-${RUN}-never`;
const DAY1 = `${TRIP}-d1`;
const DAY2 = `${TRIP}-d2`;
// Tokyo noon on Nov 9 2027: day 1 (Nov 8) is past, day 2 (Nov 9) is today.
const NOW = new Date("2027-11-09T03:00:00Z");
const recompute = (tripId: string) => computePlanLegs(tripId, { adapter: null, qualifies: true, now: () => NOW });

async function snapshotStart(itemId: string): Promise<string | null> {
  const f = await getLatestTripFinal(TRIP);
  const it = ((f?.snapshot as any)?.items ?? []).find((x: any) => x.id === itemId);
  return it?.startTime ?? null;
}

before(async () => {
  await db.execute(sql`INSERT INTO users (id, email, role) VALUES (${owner}, ${`${owner}@t.test`}, 'traveler')`);
  for (const t of [TRIP, NEVER]) {
    await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, market_slug, timezone, start_date, end_date, status, dates_confirmed_at)
      VALUES (${t}, ${owner}, 'SR', 'Kyoto, Japan', 'kyoto', 'Asia/Tokyo', '2027-11-08', '2027-11-09', 'draft', now())`);
  }
  for (const [id, day] of [
    [DAY1, 1],
    [DAY2, 2],
  ] as const) {
    await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, title, day_number, sort_order, start_time, end_time, item_type)
      VALUES (${id}, ${TRIP}, ${`Stop ${day}`}, ${day}, 0, '17:30', '18:30', 'activity')`);
  }
  await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, title, day_number, sort_order, start_time, item_type)
    VALUES (${`${NEVER}-i`}, ${NEVER}, 'Stop', 2, 0, '09:00', 'activity')`);
  await finalizeTrip(TRIP, owner);
});

after(async () => {
  try {
    await db.execute(sql`DELETE FROM trip_finals WHERE trip_id IN (${TRIP}, ${NEVER})`);
    await db.execute(sql`DELETE FROM item_transition_log WHERE trip_id IN (${TRIP}, ${NEVER})`).catch(() => undefined);
    await db.execute(sql`DELETE FROM itinerary_items WHERE trip_id IN (${TRIP}, ${NEVER})`);
    await db.execute(sql`DELETE FROM trips WHERE id IN (${TRIP}, ${NEVER})`);
    await db.execute(sql`DELETE FROM users WHERE id = ${owner}`);
  } finally {
    await pool.end();
  }
});

test("SR1/SR2 an edited stop's time reaches the snapshot on a day not yet past; a past day stays frozen", async () => {
  const before = await getLatestTripFinal(TRIP);
  assert.equal(await snapshotStart(DAY2), "17:30");
  await db.execute(sql`UPDATE itinerary_items SET start_time = '17:35' WHERE id IN (${DAY1}, ${DAY2})`);
  await recompute(TRIP);
  assert.equal(await snapshotStart(DAY2), "17:35", "today's stop follows the live item");
  assert.equal(await snapshotStart(DAY1), "17:30", "yesterday's stop keeps its frozen time");
  const after = await getLatestTripFinal(TRIP);
  assert.equal(after!.version, before!.version, "no new version");
  assert.equal(after!.contentHash, before!.contentHash, "the made-final fingerprint is kept");
});

test("SR3 a second recompute with nothing changed writes nothing", async () => {
  const r = await refreshTripFinalLiveDays(TRIP, NOW);
  assert.equal(r.refreshed, false);
  assert.deepEqual(r.liveDays, [2]);
});

test("SR4 a plan never made final gets no snapshot", async () => {
  await recompute(NEVER);
  assert.equal(await getLatestTripFinal(NEVER), null);
});
