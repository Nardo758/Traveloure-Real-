/**
 * FB-1 step 3 (ledger `2026-10-18-fb1-version-gate`), end to end on a real database: a PAID run, its model answer
 * injected (`deps.callAI` — the only test seam), every version checked against its draft.
 *
 * One Kyoto plan, Monday 2027-11-08, with two draft issues: the Temple at 08:00 (it opens 9:00 — fix: start no earlier
 * than 09:00) and the Shrine at 11:00 (open 8–10 — fix: start by 09:00). The Market at 12:00 is open 9–17. Sequencing
 * honours the model's start times and the draft's retime windows (FB-1 step 3b), so the model's answer survives:
 *   A  the Shrine at 08:00, the Temple moved to 09:30, the Market at 12:00   ⇒ shown, named "Your plan, fixed"
 *   B  the draft's order and times — the Temple's window pushes it to 09:00,
 *      but the Shrine cannot start by 09:00 after it and is left late       ⇒ HELD (unresolved)
 *   C  as A, but the Market at 18:00 (after it closes)                        ⇒ HELD (added)
 *
 *   E1  the prompt names version A "Your plan, fixed" and carries the draft's fix, by tag and minute
 *   E2  A is generated and named "Your plan, fixed"; B and C are held — the gate ran after the run's legs step
 *   E3  every version carries its check metric rows (ruling 3), including the after-sequencing pair
 *   E4  the draft's rows are byte-for-byte unchanged by the run
 *   E5  the board shows A only, labelled A; apply-days refuses a held version; the run finished inside its deadline
 *   E6  a run whose every version fails: the board names that run (never the previous run's versions), shows no
 *       version, and carries the draft's open issues with their fixes (ruling 4)
 *
 * DISPOSABLE DB ONLY. Run solo:
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/traveloure npx tsx --test --test-force-exit server/__tests__/fb1-version-gate.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";

process.env.STRIPE_SECRET_KEY ||= "sk_test_fb1_gate";
delete process.env.ANTHROPIC_API_KEY;
delete process.env.GOOGLE_MAPS_API_KEY;
delete process.env.TRAVEL_TIME_SERVICE_ENABLED;
const { db, pool } = await import("../db");
const { recordFacts } = await import("../services/content-facts/place-facts.service");
const { loadTripOptimizerInputs } = await import("../services/optimizer-baseline.service");
const { generateOptimizedItineraries } = await import("../itinerary-optimizer");
const { loadVersionsBoard, applyDays } = await import("../services/version-board.service");
const { GENERATION_TIMEOUT_MS } = await import("../services/itinerary-outcome-email");

const RUN = crypto.randomUUID().slice(0, 8);
const id = (s: string) => `fb1g-${RUN}-${s}`;
const owner = id("owner");
const trip = id("trip");
const NOW = new Date();
const later = (days: number) => new Date(NOW.getTime() + days * 86_400_000);

const hours = (placeRef: string, itemId: string, line = "Monday: 9:00 AM – 5:00 PM") =>
  recordFacts(
    [{
      placeRefKind: "place_id", placeRef, placeLat: null, placeLng: null, market: "kyoto", need: "stop.hours", factType: "hours",
      value: { text: line, quote: line, weekdayDescriptions: [line] },
      origin: "crawled", sourceId: null, sourceUrl: "https://official.example.jp/", license: "official", fetchedAt: NOW, expiresAt: later(30), costCents: 0,
      /* CS-1 item 3 (ledger `2026-10-19-cs1-fact-review`): reviewed by a person */ verifiedBy: owner,
    } as any],
    { planId: trip, itemId },
  );

const versionJson = (stops: Array<{ name: string; ref: string | null; at: string }>, name: string) => ({
  name,
  description: "d",
  reasoning: "r",
  items: stops.map((s) => ({
    dayNumber: 1, timeSlot: "morning", startTime: s.at, endTime: null, name: s.name, description: "", serviceType: "activities",
    price: 0, rating: 4.5, location: "Kyoto", duration: 60, travelTimeFromPrevious: null, isReplacement: false, replacementReason: null,
    originalServiceId: null, sourceRef: s.ref,
  })),
  metrics: { totalCost: 0, totalTravelTime: 0, averageRating: 4.5, freeTimeMinutes: 0, optimizationScore: 80 },
});

async function draftRows() {
  return (await db.execute(sql`SELECT * FROM itinerary_items WHERE trip_id = ${trip} ORDER BY id`)).rows;
}

async function newComparison(key: string): Promise<string> {
  const c = id(key);
  await db.execute(sql`INSERT INTO itinerary_comparisons (id, user_id, trip_id, title, destination, status) VALUES (${c}, ${owner}, ${trip}, 'FB-1 gate', 'Kyoto, Japan', 'generating')`);
  return c;
}

async function run(comparisonId: string, answer: unknown): Promise<{ prompt: string; ms: number; result: { success: boolean } }> {
  const { baselineItems } = await loadTripOptimizerInputs(trip);
  let prompt = "";
  const t0 = Date.now();
  const result = await generateOptimizedItineraries(
    comparisonId, owner, baselineItems as any, [], "Kyoto, Japan", "2027-11-08", "2027-11-08", undefined, 1, trip,
    undefined, undefined, [], undefined, undefined, undefined,
    { callAI: async (_s, p) => { prompt = p; return JSON.stringify(answer); } },
  );
  return { prompt, ms: Date.now() - t0, result };
}

async function versionsOf(comparisonId: string) {
  return (await db.execute(sql`SELECT id, name, status, sort_order FROM itinerary_variants WHERE comparison_id = ${comparisonId} AND source = 'ai_optimized' ORDER BY sort_order`)).rows as any[];
}

let firstCmp = "";
let firstRun: Awaited<ReturnType<typeof run>>;
let before1: unknown[] = [];

before(async () => {
  const host = new URL(process.env.DATABASE_URL ?? "postgres://localhost").hostname.toLowerCase();
  if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) throw new Error("refusing a non-disposable database");
  await db.execute(sql`INSERT INTO users (id, email, role) VALUES (${owner}, ${`${owner}@t.test`}, 'traveler')`);
  await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, market_slug, start_date, end_date, status)
    VALUES (${trip}, ${owner}, 'FB-1 gate', 'Kyoto, Japan', 'kyoto', '2027-11-08', '2027-11-08', 'draft')`);
  await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, day_number, title, item_type, start_time, duration_minutes, origin, sort_order) VALUES
    (${id("t")}, ${trip}, 1, 'Temple', 'activity', '08:00', 60, 'traveler', 1),
    (${id("s")}, ${trip}, 1, 'Shrine', 'activity', '11:00', 60, 'traveler', 2),
    (${id("m")}, ${trip}, 1, 'Market', 'activity', '12:00', 60, 'traveler', 3)`);
  await hours(`ChIJ-fb1g-${RUN}-t`, id("t"));
  await hours(`ChIJ-fb1g-${RUN}-s`, id("s"), "Monday: 8:00 AM – 10:00 AM");
  await hours(`ChIJ-fb1g-${RUN}-m`, id("m"));
  before1 = await draftRows();
  firstCmp = await newComparison("cmp1");
  firstRun = await run(firstCmp, {
    variants: [
      versionJson([{ name: "Shrine", ref: "S2", at: "08:00" }, { name: "Temple", ref: "S1", at: "09:30" }, { name: "Market", ref: "S3", at: "12:00" }], "anything the model says"),
      versionJson([{ name: "Temple", ref: "S1", at: "08:00" }, { name: "Shrine", ref: "S2", at: "11:00" }, { name: "Market", ref: "S3", at: "12:00" }], "Version B"),
      versionJson([{ name: "Shrine", ref: "S2", at: "08:00" }, { name: "Temple", ref: "S1", at: "09:30" }, { name: "Market", ref: "S3", at: "18:00" }], "Version C"),
    ],
  });
});

after(async () => {
  await db.execute(sql`DELETE FROM place_facts WHERE plan_id = ${trip}`);
  await db.execute(sql`DELETE FROM itinerary_comparisons WHERE trip_id = ${trip}`);
  await db.execute(sql`DELETE FROM trips WHERE id = ${trip}`);
  await db.execute(sql`DELETE FROM users WHERE id = ${owner}`);
  await pool.end();
});

test("E1 the prompt names version A and carries the draft's fix", () => {
  assert.match(firstRun.prompt, /VARIANT 1 — "Your plan, fixed"/);
  assert.match(firstRun.prompt, /Day 1: start \[S1\] Temple no earlier than 09:00 \(before_opening\)\./);
});

test("E2 A is shown and named; B and C are held", async () => {
  assert.equal(firstRun.result.success, true);
  const vs = await versionsOf(firstCmp);
  // Step 3b: version A's Temple is where the model put it (09:30), not re-timed from 08:00.
  const aStops = (await db.execute(sql`SELECT name, start_time FROM itinerary_variant_items WHERE variant_id = ${vs[0].id} ORDER BY sort_order`)).rows as any[];
  assert.deepEqual(aStops.map((r) => [r.name, r.start_time]), [["Shrine", "08:00"], ["Temple", "09:30"], ["Market", "12:00"]]);
  assert.deepEqual(vs.map((v) => [v.sort_order, v.status]), [[1, "generated"], [2, "held"], [3, "held"]]);
  assert.equal(vs[0].name, "Your plan, fixed", "the server's name, not the model's");
  assert.deepEqual([vs[1].name, vs[2].name], ["Version B", "Version C"]);
});

test("E3 every version carries its check rows", async () => {
  const vs = await versionsOf(firstCmp);
  const rows = (await db.execute(sql`SELECT variant_id, metric_key, value FROM itinerary_variant_metrics WHERE variant_id IN (${vs[0].id}, ${vs[1].id}, ${vs[2].id}) AND metric_key LIKE 'check\\_%'`)).rows as any[];
  const of = (v: any, k: string) => rows.find((r) => r.variant_id === v.id && r.metric_key === k)?.value;
  assert.deepEqual([of(vs[0], "check_unresolved"), of(vs[0], "check_added")].map(Number), [0, 0]);
  assert.deepEqual([of(vs[1], "check_unresolved"), of(vs[1], "check_added")].map(Number), [1, 0]);
  assert.deepEqual([of(vs[2], "check_unresolved"), of(vs[2], "check_added")].map(Number), [0, 1]);
  assert.equal(Number(of(vs[1], "check_closed_on_arrival")), 1);
  for (const v of vs) {
    assert.notEqual(of(v, "check_unresolved_after_sequencing"), undefined, "the after-sequencing check is recorded");
    assert.notEqual(of(v, "check_coverage_reduced"), undefined);
  }
});

test("E4 the draft's rows are unchanged by the run", async () => {
  assert.deepEqual(await draftRows(), before1);
});

test("E5 the board shows A only; apply-days refuses a held version; inside the deadline", async () => {
  const board = await loadVersionsBoard(trip);
  assert.equal(board.run?.comparisonId, firstCmp);
  assert.deepEqual(board.versions.map((v) => [v.label, v.name]), [["A", "Your plan, fixed"]]);
  assert.equal(board.blocked, undefined);
  const vs = await versionsOf(firstCmp);
  await assert.rejects(applyDays({ tripId: trip, userId: owner, days: [{ day: 1, variantId: vs[1].id }] }), /No such version/);
  assert.ok(firstRun.ms < GENERATION_TIMEOUT_MS, `the run took ${firstRun.ms} ms`);
  const [cmp] = (await db.execute(sql`SELECT status FROM itinerary_comparisons WHERE id = ${firstCmp}`)).rows as any[];
  assert.equal(cmp.status, "generated");
});

test("E6 no version passes: the board names that run, shows none, and lists the open issues with fixes", async () => {
  const c = await newComparison("cmp2");
  const keep = [{ name: "Temple", ref: "S1", at: "08:00" }, { name: "Shrine", ref: "S2", at: "11:00" }, { name: "Market", ref: "S3", at: "12:00" }];
  const r = await run(c, { variants: [versionJson(keep, "a"), versionJson(keep, "b"), versionJson(keep, "c")] });
  assert.equal(r.result.success, true);
  assert.deepEqual((await versionsOf(c)).map((v) => v.status), ["held", "held", "held"]);
  const board = await loadVersionsBoard(trip);
  assert.equal(board.run?.comparisonId, c, "the latest run, not the earlier run's passing version");
  assert.deepEqual(board.versions, []);
  assert.equal(board.blocked?.heldCount, 3);
  assert.deepEqual(board.blocked?.openIssues.map((i) => [i.type, i.why, i.stop?.title, i.fix.action]), [
    ["closed_on_arrival", "before_opening", "Temple", "retime"],
    ["closed_on_arrival", "after_closing", "Shrine", "retime"],
  ]);
  assert.deepEqual(await draftRows(), before1, "still untouched");
});
