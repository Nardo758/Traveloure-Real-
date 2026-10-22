/**
 * FB-1 step 5b (ledger `2026-10-19-fb1-closed-dates`), on a real database.
 *
 * A Kyoto plan, Mon–Tue 2027-11-08/09, `trips.timezone` Asia/Tokyo. The Temple (day 1) has a stored official
 * `closed_dates` fact naming 2027-11-08.
 *
 *   CDB1 recordFacts sets the expiry to midnight, plan time, of the day after the last closed date — whatever the
 *        writer sent; a plan with no zone falls back to the market's; a fact whose date is not in its quote is refused
 *   CDB2 the trip loader feeds it to the checker: the Temple is `closed_on_arrival` / `closed_date`, fix `move_day`
 *   CDB3 an expired fact never reaches the checker
 *   CDB4 the crawler no longer asks for `closure`, and `closure` is no longer a fact type
 *   CDB5 row 124 (ledger `2026-10-22-add-check-closed-dates`): the single-stop add-check reads the same fact — a stop
 *        added on a named date gets the plan check's "closed on that date" line and its `move_day` fix, with or
 *        without a start time; a stop on another date gets neither
 *
 * DISPOSABLE DB ONLY.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";

process.env.STRIPE_SECRET_KEY ||= "sk_test_fb1_closed";
delete process.env.ANTHROPIC_API_KEY;
delete process.env.GOOGLE_MAPS_API_KEY;
delete process.env.TRAVEL_TIME_SERVICE_ENABLED;
const { db, pool } = await import("../db");
const { recordFacts } = await import("../services/content-facts/place-facts.service");
const { loadPlanCheckInput } = await import("../services/optimizer-lead.service");
const { FACT_TYPES_FOR_NEED } = await import("../services/content-facts/tavily-extract-adapter");
const { FACT_TYPES } = await import("@shared/content-facts");
const { checkPlan } = await import("@shared/plan-check");
const { loadStopChecks } = await import("../services/add-checks.service");

const RUN = crypto.randomUUID().slice(0, 8);
const id = (s: string) => `fb1c-${RUN}-${s}`;
const owner = id("owner");
const trip = id("trip");
const noZone = id("nozone");
const NOW = new Date();
// Past the add-check window, so nothing reads as still arriving.
const LATER = new Date(NOW.getTime() + 60 * 60_000);

const closed = (tripId: string, k: string, ranges: Array<{ from: string; to: string }>, quote: string, expiresAt: Date | null = null) =>
  recordFacts(
    [{
      placeRefKind: "place_id", placeRef: `ChIJ-fb1c-${RUN}-${tripId}-${k}`, placeLat: null, placeLng: null, market: "kyoto", need: "stop.hours", factType: "closed_dates",
      value: { ranges, quote, text: quote },
      origin: "crawled", sourceId: null, sourceUrl: "https://official.example.jp/news", license: "official", fetchedAt: NOW, expiresAt, costCents: 0,
      // CS-1 item 3: closed_dates is a dated safety fact and is read only once a person has reviewed it.
      verifiedBy: owner,
    } as any],
    { planId: tripId, itemId: `${tripId}-${k}` },
  );
const expiryOf = async (tripId: string) =>
  ((await db.execute(sql`SELECT expires_at FROM place_facts WHERE plan_id = ${tripId} AND fact_type = 'closed_dates' ORDER BY fetched_at`)).rows as any[]).map((r) => new Date(r.expires_at).toISOString());

async function seed(tripId: string, timezone: string | null) {
  await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, market_slug, start_date, end_date, status, timezone)
    VALUES (${tripId}, ${owner}, 'FB-1 closed', 'Kyoto, Japan', 'kyoto', '2027-11-08', '2027-11-09', 'draft', ${timezone})`);
  await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, day_number, title, item_type, start_time, duration_minutes, origin, sort_order) VALUES
    (${`${tripId}-t`}, ${tripId}, 1, 'Temple', 'activity', '10:00', 60, 'ai', 1),
    (${`${tripId}-m`}, ${tripId}, 2, 'Market', 'activity', '10:00', 60, 'ai', 1),
    (${`${tripId}-g`}, ${tripId}, 1, 'Garden', 'activity', NULL, NULL, 'traveler', 2)`);
}

before(async () => {
  const host = new URL(process.env.DATABASE_URL ?? "postgres://localhost").hostname.toLowerCase();
  if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) throw new Error("refusing a non-disposable database");
  await db.execute(sql`INSERT INTO users (id, email, role) VALUES (${owner}, ${`${owner}@t.test`}, 'traveler')`);
  await seed(trip, "Asia/Tokyo");
  await seed(noZone, null);
});

after(async () => {
  await db.execute(sql`DELETE FROM place_facts WHERE plan_id IN (${trip}, ${noZone})`).catch(() => {});
  await db.execute(sql`DELETE FROM trips WHERE id IN (${trip}, ${noZone})`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id = ${owner}`).catch(() => {});
  await pool.end();
});

test("CDB1 the expiry is plan-time midnight of the day after the last date; a date not in the quote is refused", async () => {
  // The writer's own expiry (a year out) is replaced.
  assert.equal(await closed(trip, "t", [{ from: "2027-11-08", to: "2027-11-08" }], "Closed on November 8.", new Date(NOW.getTime() + 365 * 86_400_000)), 1);
  assert.deepEqual(await expiryOf(trip), ["2027-11-08T15:00:00.000Z"], "2027-11-09 00:00 Asia/Tokyo");
  // No plan zone ⇒ the market's (Kyoto is Asia/Tokyo too).
  assert.equal(await closed(noZone, "t", [{ from: "2027-12-29", to: "2028-01-03" }], "Closed 12月29日〜1月3日"), 1);
  assert.deepEqual(await expiryOf(noZone), ["2028-01-03T15:00:00.000Z"]);
  // The page does not print the date ⇒ not stored.
  assert.equal(await closed(trip, "m", [{ from: "2027-11-09", to: "2027-11-09" }], "Closed on some days."), 0);
});

test("CDB2 the loader feeds the checker: closed_date, move_day", async () => {
  const { input } = await loadPlanCheckInput(trip);
  const issues = checkPlan(input).issues;
  const t = issues.find((i) => i.stop?.itemId === `${trip}-t`);
  assert.equal(t?.type, "closed_on_arrival");
  assert.equal(t?.why, "closed_date");
  assert.deepEqual(t?.fix, { action: "move_day", itemId: `${trip}-t`, day: 1 });
  assert.equal(t?.source.url, "https://official.example.jp/news");
  assert.equal(issues.some((i) => i.stop?.itemId === `${trip}-m`), false, "the refused fact never reaches the checker");
});

test("CDB5 the single-stop add-check reads closed_dates the way the plan check does", async () => {
  // The Garden has no start time; the plan check counts a closed date "whether or not it states a time".
  assert.equal(await closed(trip, "g", [{ from: "2027-11-08", to: "2027-11-08" }], "Closed on November 8."), 1);
  const { input } = await loadPlanCheckInput(trip);
  const plan = checkPlan(input).issues;
  for (const k of ["t", "g"]) {
    const itemId = `${trip}-${k}`;
    const checks = await loadStopChecks(trip, itemId, LATER);
    assert.equal(checks?.hours.status, "checked", `${k}: checked`);
    const hours = checks!.hours as Extract<NonNullable<typeof checks>["hours"], { status: "checked" }>;
    assert.equal(hours.lines.length, 1, `${k}: one line`);
    assert.match(hours.lines[0], /: Closed on Monday, November 8\. Move this stop to another day\.$/);
    const planIssue = plan.find((i) => i.stop?.itemId === itemId);
    assert.equal(planIssue?.why, "closed_date", `${k}: the plan check names it too`);
    assert.deepEqual(hours.fixes, [planIssue!.fix], `${k}: the plan check's own fix`);
    assert.deepEqual(hours.fixes, [{ action: "move_day", itemId, day: 1 }]);
  }
  // Day 2's Market: its fact was refused, so nothing names its date.
  const m = await loadStopChecks(trip, `${trip}-m`, LATER);
  assert.equal(m?.hours.status, "not_checked");
});

test("CDB3 an expired fact never reaches the checker", async () => {
  await db.execute(sql`UPDATE place_facts SET expires_at = ${new Date(NOW.getTime() - 60_000).toISOString()}::timestamp WHERE plan_id = ${trip} AND fact_type = 'closed_dates'`);
  const { input } = await loadPlanCheckInput(trip);
  assert.equal(checkPlan(input).issues.some((i) => i.why === "closed_date"), false);
});

test("CDB4 the crawler no longer asks for closure, and closure is not a fact type", () => {
  assert.equal((FACT_TYPES as readonly string[]).includes("closure"), false);
  assert.equal((FACT_TYPES as readonly string[]).includes("closed_dates"), true);
  for (const types of Object.values(FACT_TYPES_FOR_NEED)) {
    assert.equal((types as readonly string[]).includes("closure"), false);
    assert.equal((types as readonly string[]).includes("closed_dates"), false, "the crawler is not asked for closed_dates either");
  }
});
