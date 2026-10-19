/**
 * FB-1 step 4 (ledger `2026-10-19-fb1-fixed-by-tap`), end to end on a real database: a PAID run (model answer injected
 * through `deps.callAI`, the step 3 seam) makes "Your plan, fixed"; the traveler's tap adopts its days through
 * apply-days with `unchangedSinceRun: true`; a day the plan changed on since the run started is refused.
 *
 * A two-day Kyoto plan, Mon–Tue 2027-11-08/09. Day 1: the Temple at 08:00 (opens 9:00) — flagged. Day 2: the Pagoda at
 * 08:00 (opens 9:00) — flagged. Version A moves both to 09:30.
 *
 *   FT1 the fixed view names version A and both flagged days as fixable
 *   FT2 a day edited after the run is "changed"; its single tap is a 409 `day_changed` and writes nothing
 *   FT3 the whole-plan tap fixes the unchanged day and reports the changed one as skipped (ruling (c))
 *   FT4 the board's own adopt (no flag) is unchanged: it still adopts a changed day
 *   FT5 no baseline to read ⇒ every flagged day is changed (refused, never guessed)
 *   FT6 staleDays, pure: an add, an edit, a move in, a move out, a delete, an unknown-day removal, an untouched day
 *   FT7 confirm before apply: the preview returns the same counts the write makes, and writes nothing
 *   FT8 a machine re-time (the legacy leg schedule writer, trip-transport-legs.service.ts) does not make a day changed
 *
 * DISPOSABLE DB ONLY.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";

process.env.STRIPE_SECRET_KEY ||= "sk_test_fb1_tap";
delete process.env.ANTHROPIC_API_KEY;
delete process.env.GOOGLE_MAPS_API_KEY;
delete process.env.TRAVEL_TIME_SERVICE_ENABLED;
const { db, pool } = await import("../db");
const { recordFacts } = await import("../services/content-facts/place-facts.service");
const { loadTripOptimizerInputs } = await import("../services/optimizer-baseline.service");
const { generateOptimizedItineraries } = await import("../itinerary-optimizer");
const { applyDays, VersionBoardError } = await import("../services/version-board.service");
const { loadFixedPlan, applyDaysUnchangedSinceRun, staleDays } = await import("../services/fixed-plan.service");
const { generateTripTransportLegs } = await import("../services/trip-transport-legs.service");

const RUN = crypto.randomUUID().slice(0, 8);
const id = (s: string) => `fb1t-${RUN}-${s}`;
const owner = id("owner");
const trip = id("trip");
const NOW = new Date();
const later = (days: number) => new Date(NOW.getTime() + days * 86_400_000);
const WEEK = ["Monday: 9:00 AM – 5:00 PM", "Tuesday: 9:00 AM – 5:00 PM"];

const hours = (placeRef: string, itemId: string) =>
  recordFacts(
    [{
      placeRefKind: "place_id", placeRef, placeLat: null, placeLng: null, market: "kyoto", need: "stop.hours", factType: "hours",
      value: { text: WEEK.join("; "), quote: WEEK.join("; "), weekdayDescriptions: WEEK },
      origin: "crawled", sourceId: null, sourceUrl: "https://official.example.jp/", license: "official", fetchedAt: NOW, expiresAt: later(30), costCents: 0,
    } as any],
    { planId: trip, itemId },
  );

const stop = (dayNumber: number, name: string, ref: string, at: string) => ({
  dayNumber, timeSlot: "morning", startTime: at, endTime: null, name, description: "", serviceType: "activities",
  price: 0, rating: 4.5, location: "Kyoto", duration: 60, travelTimeFromPrevious: null, isReplacement: false, replacementReason: null,
  originalServiceId: null, sourceRef: ref,
});
const version = (name: string) => ({
  name, description: "d", reasoning: "r",
  items: [stop(1, "Temple", "S1", "09:30"), stop(1, "Market", "S2", "12:00"), stop(2, "Pagoda", "S3", "09:30"), stop(2, "Garden", "S4", "12:00")],
  metrics: { totalCost: 0, totalTravelTime: 0, averageRating: 4.5, freeTimeMinutes: 0, optimizationScore: 80 },
});

const startOf = async (itemId: string) => ((await db.execute(sql`SELECT start_time FROM itinerary_items WHERE id = ${itemId}`)).rows[0] as any)?.start_time;
let cmp = "";

before(async () => {
  const host = new URL(process.env.DATABASE_URL ?? "postgres://localhost").hostname.toLowerCase();
  if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) throw new Error("refusing a non-disposable database");
  await db.execute(sql`INSERT INTO users (id, email, role) VALUES (${owner}, ${`${owner}@t.test`}, 'traveler')`);
  await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, market_slug, start_date, end_date, status)
    VALUES (${trip}, ${owner}, 'FB-1 tap', 'Kyoto, Japan', 'kyoto', '2027-11-08', '2027-11-09', 'draft')`);
  await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, day_number, title, item_type, start_time, duration_minutes, origin, sort_order) VALUES
    (${id("t")}, ${trip}, 1, 'Temple', 'activity', '08:00', 60, 'traveler', 1),
    (${id("m")}, ${trip}, 1, 'Market', 'activity', '12:00', 60, 'traveler', 2),
    (${id("p")}, ${trip}, 2, 'Pagoda', 'activity', '08:00', 60, 'traveler', 1),
    (${id("g")}, ${trip}, 2, 'Garden', 'activity', '12:00', 60, 'traveler', 2)`);
  for (const k of ["t", "m", "p", "g"]) await hours(`ChIJ-fb1t-${RUN}-${k}`, id(k));
  cmp = id("cmp");
  await db.execute(sql`INSERT INTO itinerary_comparisons (id, user_id, trip_id, title, destination, status) VALUES (${cmp}, ${owner}, ${trip}, 'FB-1 tap', 'Kyoto, Japan', 'generating')`);
  const { baselineItems } = await loadTripOptimizerInputs(trip);
  const out = await generateOptimizedItineraries(
    cmp, owner, baselineItems as any, [], "Kyoto, Japan", "2027-11-08", "2027-11-09", undefined, 2, trip,
    undefined, undefined, [], undefined, undefined, undefined,
    { callAI: async () => JSON.stringify({ variants: [version("a"), version("Version B"), version("Version C")] }) },
  );
  assert.ok(out.success, "the run finished");
  // Every write after this point is "after the run started".
  await new Promise((r) => setTimeout(r, 20));
});

after(async () => {
  await db.execute(sql`DELETE FROM trips WHERE id = ${trip}`).catch(() => {});
  await db.execute(sql`DELETE FROM itinerary_comparisons WHERE id = ${cmp}`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id = ${owner}`).catch(() => {});
  await pool.end();
});

test("FT1 the fixed view names version A and both flagged days as fixable", async () => {
  const view = await loadFixedPlan(trip);
  assert.ok(view, "a shown Your plan, fixed");
  const a = ((await db.execute(sql`SELECT id, name FROM itinerary_variants WHERE id = ${view!.variantId}`)).rows[0] as any);
  assert.equal(a.name, "Your plan, fixed");
  assert.deepEqual(view!.days, [{ day: 1, state: "fixable" }, { day: 2, state: "fixable" }]);
  assert.equal(view!.comparisonId, cmp);
});

test("FT8 a machine re-time does not make a day changed", async () => {
  const stamp = async () => ((await db.execute(sql`SELECT max(updated_at)::text AS t FROM itinerary_items WHERE trip_id = ${trip}`)).rows[0] as any).t;
  const times = async () => (await db.execute(sql`SELECT id, start_time, end_time FROM itinerary_items WHERE trip_id = ${trip} ORDER BY id`)).rows as any[];
  // Points on the rows (never read by the checker, which uses open coordinates only) so the writer has legs to time.
  await db.execute(sql`UPDATE itinerary_items SET latitude = 35.0, longitude = 135.70 + sort_order * 0.05 WHERE trip_id = ${trip}`);
  const before = await stamp();
  const timesBefore = await times();
  // The legacy writer, run directly (it never runs on a routed plan): it re-times the plan's items from its legs.
  await generateTripTransportLegs(trip, { via: "travel_time_service" });
  const timesAfter = await times();
  assert.notDeepEqual(timesAfter, timesBefore, "the machine writer did re-time the plan");
  assert.equal(await stamp(), before, "the machine writer leaves updated_at alone");
  const view = (await loadFixedPlan(trip))!;
  assert.deepEqual(view.days.map((d) => d.state), view.days.map(() => "fixable"), "a machine re-time is not a traveler's change");
  // Put the plan's own times back, as plain data (no updated_at), for the tests that follow.
  for (const r of timesBefore) await db.execute(sql`UPDATE itinerary_items SET start_time = ${r.start_time}, end_time = ${r.end_time} WHERE id = ${r.id}`);
  await db.execute(sql`DELETE FROM transport_legs WHERE trip_id = ${trip} AND variant_id IS NULL`);
  const src = (await import("node:fs")).readFileSync(new URL("../services/trip-transport-legs.service.ts", import.meta.url), "utf8");
  const block = src.slice(src.indexOf("const scheduleValues"), src.indexOf("const scheduleValues") + 200);
  assert.doesNotMatch(block, /updatedAt/, "the schedule write carries no updatedAt");
});

test("FT7 confirm before apply: the preview's counts are the write's, and it writes nothing", async () => {
  const view = (await loadFixedPlan(trip))!;
  const rowsBefore = (await db.execute(sql`SELECT id, day_number, start_time, updated_at::text FROM itinerary_items WHERE trip_id = ${trip} ORDER BY id`)).rows;
  const preview = await applyDaysUnchangedSinceRun({ tripId: trip, userId: owner, days: [{ day: 1, variantId: view.variantId }], preview: true });
  assert.equal(preview.days.length, 1);
  assert.ok(preview.days[0].moved >= 1, "the Temple would move");
  const rowsAfter = (await db.execute(sql`SELECT id, day_number, start_time, updated_at::text FROM itinerary_items WHERE trip_id = ${trip} ORDER BY id`)).rows;
  assert.deepEqual(rowsAfter, rowsBefore, "nothing written");
  assert.equal((await loadFixedPlan(trip))!.days.find((d) => d.day === 1)?.state, "fixable", "the preview leaves the day fixable");
  previewCounts = preview.days[0];
});
let previewCounts: { moved: number; added: number; removed: number } | null = null;

test("FT2 a day edited after the run is changed; its single tap is 409 day_changed and writes nothing", async () => {
  await db.execute(sql`UPDATE itinerary_items SET description = 'my note', updated_at = now() WHERE id = ${id("g")}`);
  const view = (await loadFixedPlan(trip))!;
  assert.deepEqual(view.days, [{ day: 1, state: "fixable" }, { day: 2, state: "changed" }]);
  await assert.rejects(
    applyDaysUnchangedSinceRun({ tripId: trip, userId: owner, days: [{ day: 2, variantId: view.variantId }] }),
    (e: any) => e instanceof VersionBoardError && e.status === 409 && e.code === "day_changed",
  );
  assert.equal(await startOf(id("p")), "08:00", "nothing written");
});

test("FT3 the whole-plan tap fixes the unchanged day and reports the changed one as skipped", async () => {
  const view = (await loadFixedPlan(trip))!;
  const out = await applyDaysUnchangedSinceRun({ tripId: trip, userId: owner, days: view.days.map((d) => ({ day: d.day, variantId: view.variantId })) });
  assert.deepEqual(out.days.map((d) => d.day), [1]);
  assert.deepEqual(out.skipped, [{ day: 2, reason: "changed_since_run" }]);
  assert.equal(await startOf(id("t")), "09:30", "day 1 fixed");
  const applied = out.days[0];
  assert.deepEqual({ moved: applied.moved, added: applied.added, removed: applied.removed }, { moved: previewCounts!.moved, added: previewCounts!.added, removed: previewCounts!.removed }, "the write made the preview's counts");
  assert.equal(await startOf(id("p")), "08:00", "day 2 untouched");
  const after = (await loadFixedPlan(trip))!;
  assert.equal(after.days.some((d) => d.day === 1), false, "day 1 has nothing left to fix");
});

test("FT4 the board's own adopt (no flag) is unchanged: it still adopts a changed day", async () => {
  const view = (await loadFixedPlan(trip))!;
  const out = await applyDays({ tripId: trip, userId: owner, days: [{ day: 2, variantId: view.variantId }] });
  assert.equal(out.days[0].day, 2);
  assert.equal(await startOf(id("p")), "09:30");
});

test("FT5 no baseline to read: every flagged day is changed", async () => {
  await db.execute(sql`UPDATE itinerary_items SET start_time = '08:00', updated_at = now() - interval '1 day' WHERE trip_id = ${trip}`);
  await db.execute(sql`UPDATE itinerary_variants SET source = 'user_moved_for_test' WHERE comparison_id = ${cmp} AND source = 'user'`);
  const view = (await loadFixedPlan(trip))!;
  assert.ok(view.days.length > 0);
  assert.ok(view.days.every((d) => d.state === "changed"));
});

test("FT6 staleDays, pure", () => {
  const runStart = new Date("2027-01-01T10:00:00Z");
  const old = "2027-01-01T09:00:00Z";
  const late = "2027-01-01T11:00:00Z";
  const baseline = [
    { sourceItemId: "a", dayNumber: 1 },
    { sourceItemId: "b", dayNumber: 2 },
    { sourceItemId: "c", dayNumber: 3 },
    { sourceItemId: "d", dayNumber: 4 },
  ];
  const plan = [
    { id: "a", dayNumber: 1, createdAt: old, updatedAt: old }, // day 1 untouched
    { id: "b", dayNumber: 2, createdAt: old, updatedAt: late }, // day 2 edited
    { id: "c", dayNumber: 5, createdAt: old, updatedAt: late }, // moved 3 → 5: both days
    // d deleted: day 4
    { id: "n", dayNumber: 6, createdAt: late, updatedAt: late }, // added on day 6
    { id: "fixed", dayNumber: 1, createdAt: old, updatedAt: old }, // a fixed commitment the baseline skipped
  ];
  const r = staleDays({ runStart, baseline, plan, removedSinceStart: [] });
  assert.deepEqual([...r.days].sort(), [2, 3, 4, 5, 6]);
  assert.equal(r.all, false);
  assert.equal(staleDays({ runStart, baseline, plan, removedSinceStart: ["d"] }).all, false, "a known removal is attributed to its day");
  assert.equal(staleDays({ runStart, baseline, plan, removedSinceStart: ["zz"] }).all, true, "an unknown-day removal stales every day");
});
