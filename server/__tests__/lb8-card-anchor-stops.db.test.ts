/**
 * 9b-c LB8 on the Trip Card (ledger `2026-10-18-lb8-lb9-card-wiring`): the plancard read's `days[].anchorStops`.
 *
 *   CA1 a coded departure: its day, `anchor:<id>`, the buffered time (take-off − buffer), located
 *   CA2 a typed departure has no airport point ⇒ located false; an arrival is not a stop; a non-flight anchor neither
 *   CA3 no start date ⇒ nothing; a departure before the plan ⇒ nothing
 *
 * NEGATIVE SPACE (§18d): the card's use of these stops is LW4–LW6 (client test); the HTTP read's present-only
 * spread is one line in `plancard.routes.ts`, not driven here.
 *
 * DISPOSABLE DB ONLY. Run solo:
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/traveloure npx tsx --test --test-force-exit server/__tests__/lb8-card-anchor-stops.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";

process.env.STRIPE_SECRET_KEY ||= "sk_test_lb8_anchor_stops";
const { db } = await import("../db");
const { departureAnchorStopsByDay } = await import("../services/routing/card-anchor-stops");

const RUN = crypto.randomUUID().slice(0, 8);
const id = (s: string) => `lb8-${RUN}-${s}`;
const owner = id("owner");
const TRIP = id("trip");

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
function assertDisposableDb(): void {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host = "<none>";
  try {
    host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
  } catch {
    /* refuse below */
  }
  if (!DISPOSABLE_HOSTS.has(host)) throw new Error(`[lb8-card-anchor-stops] REFUSING to write fixtures to '${host}'.`);
}

before(async () => {
  assertDisposableDb();
  await db.execute(sql`INSERT INTO users (id, email, first_name, last_name, role) VALUES (${owner}, ${`${owner}@t.test`}, 'LB8', 'traveler', 'traveler')`);
  await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, market_slug, timezone, start_date, end_date, status, dates_confirmed_at)
    VALUES (${TRIP}, ${owner}, 'LB8', 'Kyoto, Japan', 'kyoto', 'Asia/Tokyo', '2026-11-11', '2026-11-15', 'draft', now())`);
  // The anchor datetime is the plan's wall clock (R316): 21:00 on day 5, 150 min before take-off.
  await db.execute(sql`INSERT INTO temporal_anchors (id, trip_id, anchor_type, anchor_datetime, buffer_before, buffer_after, location, latitude, longitude) VALUES
    (${id("dep")}, ${TRIP}, 'flight_departure', '2026-11-15 21:00:00', 150, 0, 'KIX', 34.4320, 135.2304),
    (${id("typed")}, ${TRIP}, 'flight_departure', '2026-11-14 12:00:00', 90, 0, 'Kansai airport', NULL, NULL),
    (${id("arr")}, ${TRIP}, 'flight_arrival', '2026-11-11 08:00:00', 0, 120, 'KIX', 34.4320, 135.2304),
    (${id("tour")}, ${TRIP}, 'pre_booked_tour', '2026-11-12 10:00:00', 0, 0, 'Gion', NULL, NULL),
    (${id("early")}, ${TRIP}, 'flight_departure', '2026-11-09 10:00:00', 90, 0, 'ITM', 34.7855, 135.4382)`);
});

after(async () => {
  await db.execute(sql`DELETE FROM trips WHERE id = ${TRIP}`);
  await db.execute(sql`DELETE FROM users WHERE id = ${owner}`);
});

test("CA1: a coded departure — its day, its leg-end id, its buffered time, located", async () => {
  const byDay = await departureAnchorStopsByDay(TRIP, "2026-11-11");
  assert.deepEqual(byDay.get(5), [{ id: `anchor:${id("dep")}`, name: "KIX", bufferedTime: "18:30", located: true }]);
});

test("CA2: a typed departure is unlocated; arrivals and other anchors are not stops", async () => {
  const byDay = await departureAnchorStopsByDay(TRIP, "2026-11-11");
  assert.deepEqual(byDay.get(4), [{ id: `anchor:${id("typed")}`, name: "Kansai airport", bufferedTime: "10:30", located: false }]);
  assert.equal(byDay.get(1), undefined, "the arrival is not a leave-by target");
  assert.equal(byDay.get(2), undefined, "a pre-booked tour has no item link");
  assert.deepEqual([...byDay.keys()].sort(), [4, 5]);
});

test("CA3: no start date ⇒ nothing; a departure before the plan ⇒ nothing", async () => {
  assert.equal((await departureAnchorStopsByDay(TRIP, null)).size, 0);
  assert.equal((await departureAnchorStopsByDay(TRIP, "not-a-date")).size, 0);
  const byDay = await departureAnchorStopsByDay(TRIP, "2026-11-11");
  assert.ok(![...byDay.values()].flat().some((s) => s.id.endsWith("early")));
});
