/**
 * FB-1 step 5c (ledger `2026-10-19-fb1-timed-entry`), on a real database: a timed-entry requirement is a flag, shown on
 * the plan and on its versions, and never treated as a problem a fix must clear.
 *
 * A two-day Kyoto plan, Mon–Tue 2027-11-08/09. Day 1: the Temple at 08:00 (opens 9:00) — flagged, and it also needs a
 * timed slot. Day 2: the Villa at 10:00 — needs a timed slot, nothing else.
 *
 *   TDB1 a fact whose stated "days ahead" the quote does not print is refused; the admitted one is stored
 *   TDB2 the loader feeds the checker: one `book_ahead` issue per stop; the slip's facts carry the fact for its warning
 *   TDB3 free retime still offers the Temple's retime fix (the flag is not a new problem)
 *   TDB4 a paid run: every version keeps the flag and passes the gate; "Your plan, fixed" flags day 1 only
 *
 * DISPOSABLE DB ONLY.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";

process.env.STRIPE_SECRET_KEY ||= "sk_test_fb1_te";
delete process.env.ANTHROPIC_API_KEY;
delete process.env.GOOGLE_MAPS_API_KEY;
delete process.env.TRAVEL_TIME_SERVICE_ENABLED;
const { db, pool } = await import("../db");
const { recordFacts, factsForTrip } = await import("../services/content-facts/place-facts.service");
const { loadPlanCheckInput } = await import("../services/optimizer-lead.service");
const { loadFreeRetimeFixes } = await import("../services/free-retime.service");
const { loadTripOptimizerInputs } = await import("../services/optimizer-baseline.service");
const { generateOptimizedItineraries } = await import("../itinerary-optimizer");
const { loadFixedPlan } = await import("../services/fixed-plan.service");
const { checkPlan } = await import("@shared/plan-check");

const RUN = crypto.randomUUID().slice(0, 8);
const id = (s: string) => `fb1e-${RUN}-${s}`;
const owner = id("owner");
const free = id("free");
const paid = id("paid");
const NOW = new Date();
const later = (d: number) => new Date(NOW.getTime() + d * 86_400_000);
const WEEK = ["Monday: 9:00 AM – 5:00 PM", "Tuesday: 9:00 AM – 5:00 PM"];
const VILLA_URL = "https://villa.example.jp/visit";

const draft = (tripId: string, k: string, factType: string, value: Record<string, unknown>, sourceUrl = "https://official.example.jp/") => ({
  placeRefKind: "place_id", placeRef: `ChIJ-fb1e-${RUN}-${tripId}-${k}`, placeLat: null, placeLng: null, market: "kyoto", need: "stop.hours", factType,
  value, origin: "crawled", sourceId: null, sourceUrl, license: "official", fetchedAt: NOW, expiresAt: later(30), costCents: 0,
  // CS-1 item 3: hours are a dated fact and show only once a person has reviewed them.
  verifiedBy: owner,
}) as any;
const record = (tripId: string, k: string, factType: string, value: Record<string, unknown>, sourceUrl?: string) =>
  recordFacts([draft(tripId, k, factType, value, sourceUrl)], { planId: tripId, itemId: `${tripId}-${k}` });
const hoursValue = { text: WEEK.join("; "), quote: WEEK.join("; "), weekdayDescriptions: WEEK };
const timed = { required: true, opensDaysAhead: 30, quote: "Entry by timed reservation; slots open 30 days ahead.", text: "Timed entry" };

async function seed(tripId: string) {
  await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, market_slug, start_date, end_date, status)
    VALUES (${tripId}, ${owner}, 'FB-1 timed entry', 'Kyoto, Japan', 'kyoto', '2027-11-08', '2027-11-09', 'draft')`);
  await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, day_number, title, item_type, start_time, duration_minutes, origin, sort_order) VALUES
    (${`${tripId}-t`}, ${tripId}, 1, 'Temple', 'activity', '08:00', 60, 'traveler', 1),
    (${`${tripId}-m`}, ${tripId}, 1, 'Market', 'activity', '12:00', 60, 'traveler', 2),
    (${`${tripId}-v`}, ${tripId}, 2, 'Villa', 'activity', '10:00', 60, 'traveler', 1)`);
  for (const k of ["t", "m", "v"]) await record(tripId, k, "hours", hoursValue);
  await record(tripId, "t", "timed_entry_required", timed, VILLA_URL);
  await record(tripId, "v", "timed_entry_required", timed, VILLA_URL);
}

let cmp = "";
before(async () => {
  const host = new URL(process.env.DATABASE_URL ?? "postgres://localhost").hostname.toLowerCase();
  if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) throw new Error("refusing a non-disposable database");
  await db.execute(sql`INSERT INTO users (id, email, role) VALUES (${owner}, ${`${owner}@t.test`}, 'traveler')`);
  await seed(free);
  await seed(paid);
  const stop = (dayNumber: number, name: string, ref: string, at: string) => ({
    dayNumber, timeSlot: "morning", startTime: at, endTime: null, name, description: "", serviceType: "activities",
    price: 0, rating: 4.5, location: "Kyoto", duration: 60, travelTimeFromPrevious: null, isReplacement: false, replacementReason: null,
    originalServiceId: null, sourceRef: ref,
  });
  const version = (name: string) => ({
    name, description: "d", reasoning: "r",
    items: [stop(1, "Temple", "S1", "09:30"), stop(1, "Market", "S2", "12:00"), stop(2, "Villa", "S3", "10:00")],
    metrics: { totalCost: 0, totalTravelTime: 0, averageRating: 4.5, freeTimeMinutes: 0, optimizationScore: 80 },
  });
  cmp = id("cmp");
  await db.execute(sql`INSERT INTO itinerary_comparisons (id, user_id, trip_id, title, destination, status) VALUES (${cmp}, ${owner}, ${paid}, 'FB-1 te', 'Kyoto, Japan', 'generating')`);
  const { baselineItems } = await loadTripOptimizerInputs(paid);
  const out = await generateOptimizedItineraries(
    cmp, owner, baselineItems as any, [], "Kyoto, Japan", "2027-11-08", "2027-11-09", undefined, 2, paid,
    undefined, undefined, [], undefined, undefined, undefined,
    { callAI: async () => JSON.stringify({ variants: [version("a"), version("Version B"), version("Version C")] }) },
  );
  assert.ok(out.success, "the run finished");
});

after(async () => {
  await db.execute(sql`DELETE FROM place_facts WHERE plan_id IN (${free}, ${paid})`).catch(() => {});
  await db.execute(sql`DELETE FROM itinerary_comparisons WHERE id = ${cmp}`).catch(() => {});
  await db.execute(sql`DELETE FROM trips WHERE id IN (${free}, ${paid})`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id = ${owner}`).catch(() => {});
  await pool.end();
});

test("TDB1 a stated 'days ahead' the quote does not print is refused", async () => {
  assert.equal(await record(free, "m", "timed_entry_required", { required: true, opensDaysAhead: 14, quote: "Entry by timed reservation." }), 0);
  const n = ((await db.execute(sql`SELECT count(*)::int AS n FROM place_facts WHERE plan_id = ${free} AND fact_type = 'timed_entry_required'`)).rows[0] as any).n;
  assert.equal(n, 2);
});

test("TDB2 the loader feeds the checker; the slip's facts carry the fact", async () => {
  const { input } = await loadPlanCheckInput(free);
  const te = checkPlan(input).issues.filter((i) => i.type === "timed_entry_required");
  assert.deepEqual(te.map((i) => [i.day, i.stop?.itemId, i.fix.action, i.source.url]), [
    [1, `${free}-t`, "book_ahead", VILLA_URL],
    [2, `${free}-v`, "book_ahead", VILLA_URL],
  ]);
  assert.equal(te.some((i) => i.stop?.itemId === `${free}-m`), false, "the refused fact never reaches the checker");
  const facts = await factsForTrip(free);
  const view = (facts[`${free}-v`] ?? []).find((f) => f.factType === "timed_entry_required");
  assert.equal(view?.sourceUrl, VILLA_URL);
  assert.deepEqual({ required: view?.value?.required, opensDaysAhead: view?.value?.opensDaysAhead }, { required: true, opensDaysAhead: 30 });
});

test("TDB3 free retime still offers the Temple's fix", async () => {
  const fixes = await loadFreeRetimeFixes(free, owner);
  assert.deepEqual(fixes.map((f) => [f.day, f.itemId]), [[1, `${free}-t`]]);
});

test("TDB4 every version keeps the flag and passes; Your plan, fixed flags day 1 only", async () => {
  const variants = (await db.execute(sql`SELECT id, name, status FROM itinerary_variants WHERE comparison_id = ${cmp} ORDER BY name`)).rows as any[];
  assert.ok(variants.length >= 1, "versions were made");
  assert.equal(variants.some((v) => /held/.test(String(v.status))), false, "no version is held for a timed slot");
  const view = await loadFixedPlan(paid);
  assert.ok(view, "a shown Your plan, fixed");
  assert.deepEqual(view!.days.map((d) => d.day), [1], "day 2 carries only the timed-entry flag");
});
