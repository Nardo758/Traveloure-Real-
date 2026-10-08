/**
 * THE T-48h NUDGE SAYS "STARTS SOON" ONLY OF A REAL START STILL AHEAD
 * (ledger `2026-10-08-nudge-needs-real-dates`; the slip banner's rule, B1 / `tripStartsSoon`).
 *
 *   H1  a PLACEHOLDER-dated plan (dates_confirmed_at NULL) starting tomorrow gets no nudge
 *   H2  the same plan with CHOSEN dates gets exactly one nudge, sent to its slip
 *   H3  a plan that already STARTED (inside the 7-day scan bound) gets no "starts soon" nudge
 *   H4  a plan with a final version still gets its "ready" nudge, dates or not (that arm is unchanged)
 *   H5  a withheld plan is asked again: once its dates are chosen, the next pass nudges it once
 *
 * DISPOSABLE DB ONLY. Run solo:
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/traveloure npx tsx --test --test-force-exit server/__tests__/trip-card-handover-nudge.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";

process.env.STRIPE_SECRET_KEY ||= "sk_test_handover_nudge";
const { db } = await import("../db");
const { tripCardHandoverScheduler } = await import("../services/trip-card-handover-scheduler.service");
const { TRIP_CARD_FINALIZE_NOW_TITLE, TRIP_CARD_READY_TITLE } = await import("@shared/trip-primary-surface");

const RUN = crypto.randomUUID().slice(0, 8);
const id = (s: string) => `tch-${RUN}-${s}`;
const owner = id("owner");
const PLACEHOLDER = id("placeholder");
const DATED = id("dated");
const STARTED = id("started");
const FINAL = id("final");
const DAY = 86_400_000;
const isoDay = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 10);

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
function assertDisposableDb(): void {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  const url = process.env.DATABASE_URL ?? "";
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    host = "";
  }
  if (!DISPOSABLE_HOSTS.has(host)) throw new Error(`refusing to write fixtures to a non-disposable database (${host})`);
}

async function trip(tripId: string, startOffset: number, confirmed: boolean) {
  await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, start_date, end_date, status, dates_confirmed_at)
    VALUES (${tripId}, ${owner}, 'TCH', 'Kyoto, Japan', ${isoDay(startOffset)}, ${isoDay(startOffset + 2)}, 'draft',
            ${confirmed ? sql`now()` : sql`NULL`})`);
}

async function nudges(tripId: string): Promise<{ title: string; path: string }[]> {
  const r: any = await db.execute(sql`SELECT title, data ->> 'workspacePath' AS path FROM notifications
    WHERE user_id = ${owner} AND type = 'trip_card_ready' AND data ->> 'tripId' = ${tripId}`);
  return r.rows ?? [];
}

before(async () => {
  assertDisposableDb();
  await db.execute(sql`INSERT INTO users (id, email, first_name, last_name, role) VALUES (${owner}, ${`${owner}@t.test`}, 'TCH', 'traveler', 'traveler')`);
  await trip(PLACEHOLDER, 1, false);
  await trip(DATED, 1, true);
  await trip(STARTED, -2, true);
  await trip(FINAL, 1, false);
  await db.execute(sql`INSERT INTO trip_finals (id, trip_id, version, snapshot, content_hash) VALUES (${id("f1")}, ${FINAL}, 1, '{}'::jsonb, ${"0".repeat(64)})`);
  await tripCardHandoverScheduler.runPass();
});

after(async () => {
  await db.execute(sql`DELETE FROM notifications WHERE user_id = ${owner}`);
  await db.execute(sql`DELETE FROM trips WHERE user_id = ${owner}`);
  await db.execute(sql`DELETE FROM users WHERE id = ${owner}`);
});

test("H1 a placeholder-dated plan gets no nudge", async () => {
  assert.deepEqual(await nudges(PLACEHOLDER), []);
});

test("H2 the same window with chosen dates gets exactly one 'starts soon' nudge, to its slip", async () => {
  assert.deepEqual(await nudges(DATED), [{ title: TRIP_CARD_FINALIZE_NOW_TITLE, path: `/plans/${DATED}` }]);
});

test("H3 a plan already underway is not told it 'starts soon'", async () => {
  assert.deepEqual(await nudges(STARTED), []);
});

test("H4 a plan with a final version still gets its 'ready' nudge", async () => {
  assert.deepEqual(await nudges(FINAL), [{ title: TRIP_CARD_READY_TITLE, path: `/trip/${FINAL}` }]);
});

test("H5 a withheld plan is nudged once its dates are chosen, and only once", async () => {
  await db.execute(sql`UPDATE trips SET dates_confirmed_at = now() WHERE id = ${PLACEHOLDER}`);
  await tripCardHandoverScheduler.runPass();
  await tripCardHandoverScheduler.runPass();
  assert.deepEqual(await nudges(PLACEHOLDER), [{ title: TRIP_CARD_FINALIZE_NOW_TITLE, path: `/plans/${PLACEHOLDER}` }]);
});
