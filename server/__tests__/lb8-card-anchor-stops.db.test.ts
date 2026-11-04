/**
 * 9b-c LB8 on the Trip Card (ledger `2026-10-18-lb8-lb9-card-wiring`): the plancard read's `days[].anchorStops`.
 *
 *   CA1 a coded departure: its day, `anchor:<id>`, the buffered time (take-off − buffer), located
 *   CA2 a typed departure has no airport point ⇒ located false; an arrival is not a stop; a non-flight anchor neither
 *   CA3 no start date ⇒ nothing; a departure before the plan ⇒ nothing
 *   CA4 (ENTRY-1s T1) a Reservation preset anchor (photographer_arrival) on day 2 is a timed stop with its preset label
 *       and its own time; a banned preset label falls back to the row's description
 *   CA5 (ENTRY-1s T2) a preset anchor outside the plan's days is skipped — no stop, no throw
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
  // ENTRY-1s: preset anchors as the generator writes them (its description verbatim, no location).
  await db.execute(sql`INSERT INTO temporal_anchors (id, trip_id, anchor_type, anchor_datetime, buffer_before, buffer_after, description) VALUES
    (${id("photo")}, ${TRIP}, 'photographer_arrival', '2026-11-12 12:00:00', 0, 60, 'Photographer arrives for pre-ceremony shots'),
    (${id("banned")}, ${TRIP}, 'proposal_moment', '2026-11-13 20:30:00', 60, 60, 'The proposal moment — everything leads to this'),
    (${id("late")}, ${TRIP}, 'ceremony_time', '2026-11-20 15:00:00', 120, 60, 'Placeholder ceremony'),
    (${id("before")}, ${TRIP}, 'dinner_reservation', '2026-11-01 19:00:00', 0, 0, 'Placeholder dinner')`);
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
  // ENTRY-1s (sanctioned edit): a pre-booked tour is a preset anchor type, so it is a timed stop on its day now. No
  // preset wrote this row (no description), so it is named by its location.
  assert.ok(byDay.get(2)?.some((st) => st.id === `anchor:${id("tour")}` && st.name === "Gion" && st.bufferedTime === "10:00"));
  assert.deepEqual([...byDay.keys()].sort(), [2, 3, 4, 5]);
});

test("CA3: no start date ⇒ nothing; a departure before the plan ⇒ nothing", async () => {
  assert.equal((await departureAnchorStopsByDay(TRIP, null)).size, 0);
  assert.equal((await departureAnchorStopsByDay(TRIP, "not-a-date")).size, 0);
  const byDay = await departureAnchorStopsByDay(TRIP, "2026-11-11");
  assert.ok(![...byDay.values()].flat().some((s) => s.id.endsWith("early")));
});

test("CA4 (ENTRY-1s T1): a preset anchor on day 2 is a timed stop with its label and time; departures still work", async () => {
  const byDay = await departureAnchorStopsByDay(TRIP, "2026-11-11");
  const day2 = byDay.get(2) ?? [];
  assert.ok(
    day2.some((st) => st.id === `anchor:${id("photo")}` && st.name === "Photographer Arrival" && st.bufferedTime === "12:00" && st.located === false),
    JSON.stringify(day2),
  );
  // The departure flight keeps its buffered time.
  assert.deepEqual(byDay.get(5), [{ id: `anchor:${id("dep")}`, name: "KIX", bufferedTime: "18:30", located: true }]);
  // A preset whose label is clean but whose row matches it reads the label ("The Proposal").
  assert.ok((byDay.get(3) ?? []).some((st) => st.id === `anchor:${id("banned")}` && st.name === "The Proposal"));
});

test("CA5 (ENTRY-1s T2): a preset anchor outside the plan's days is skipped — no stop, no throw", async () => {
  const byDay = await departureAnchorStopsByDay(TRIP, "2026-11-11");
  const all = [...byDay.values()].flat();
  assert.ok(!all.some((st) => st.id.endsWith("late")), "after the last day");
  assert.ok(!all.some((st) => st.id.endsWith("before")), "before day 1");
  assert.ok(Math.max(...byDay.keys()) <= 5);
});
