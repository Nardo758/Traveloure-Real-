/**
 * P0-e — seasonal hours and named findings on a real database (decision-maker, Oct 12, 2026; ledger
 * `2026-10-12-p0e-findings-and-gaps`).
 *
 * Ginkaku-ji Temple, 16:45 for 30 minutes, on a winter Monday (2027-01-11) and a summer Monday (2027-07-12).
 * Its official hours are seasonal (summer 8:30–17:00, Mar–Nov; winter 9:00–16:30, Dec–Feb); the Places
 * weekly list (9:00–17:00) is the fallback. Its official last entry is seasonal too, stored winter first.
 *
 *   SH1 winter: the winter hours apply — reached after closing, named with its day and time
 *   SH2 summer: the summer hours apply — open on arrival, but it closes before the visit ends
 *   SH3 summer: the summer last entry applies although the winter fact is stored first
 *   SH4 an off-map placeholder ("Late Dinner in Shimogyo") and an off-map real place are told apart
 *   SH5 addition 7: the row's facts carry both seasons (GH-1: no Places list); the row shows the season
 *       covering its date, and its closing warning names that fact's source
 *   SH6 the row's warning prefers the last entry covering its date ("Last entry 4:30 PM · …")
 *   SH7 the extractor admits a season on an hours row; a malformed one stores no structured hours, nor
 *       one whose quote does not print the stated times; structured hours keep the lines as their text
 *
 * DISPOSABLE DB ONLY. Run solo:
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/traveloure npx tsx --test --test-force-exit server/__tests__/p0e-seasonal-hours.db.test.ts
 */
process.env.STRIPE_SECRET_KEY ||= "sk_test_p0e";

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
  throw new Error(`[p0e] REFUSING to write fixtures to '${host}'.`);
}

const { db, pool } = await import("../db");
const { recordFacts } = await import("../services/content-facts/place-facts.service");
const { loadOptimizerFindings, loadLegCoverage } = await import("../services/optimizer-lead.service");
const { findingStopLines } = await import("@shared/optimizer-lead");
const { factsForTrip } = await import("../services/content-facts/place-facts.service");
const { itemClosingWarning, itemFactsLine } = await import("../../client/src/lib/place-facts");
const { structuredFields, admitExtractedFacts } = await import("../services/content-facts/tavily-extract-adapter");

const RUN = crypto.randomUUID().slice(0, 8);
const id = (s: string) => `p0e-${RUN}-${s}`;
const owner = id("owner");
const winter = id("winter");
const summer = id("summer");
const PLACE = `ginkaku-${RUN}`;
const NOW = new Date();
const later = (days: number) => new Date(NOW.getTime() + days * 86_400_000);

const fact = (over: Record<string, unknown>) =>
  ({
    placeRefKind: "place_id" as const,
    placeRef: PLACE,
    placeLat: null,
    placeLng: null,
    market: "kyoto",
    need: "stop.hours" as const,
    factType: "hours" as const,
    value: {},
    origin: "places_api" as const,
    sourceId: null,
    sourceUrl: null,
    license: "restricted" as const,
    fetchedAt: NOW,
    expiresAt: later(30),
    // CS-1 item 3 (ledger `2026-10-19-cs1-fact-review`): a dated, machine-read fact shows only once a person reviewed it.
    verifiedBy: owner,
    costCents: 0,
    ...over,
  }) as any;

const official = (over: Record<string, unknown>) =>
  fact({ origin: "crawled", license: "official", sourceUrl: "https://www.shokoku-ji.jp/ginkakuji/", ...over });

before(async () => {
  await db.execute(sql`INSERT INTO users (id, email, role) VALUES (${owner}, ${`${owner}@t.test`}, 'traveler')`);
  for (const [t, d] of [[winter, "2027-01-11"], [summer, "2027-07-12"]]) {
    await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, market_slug, start_date, end_date, status)
      VALUES (${t}, ${owner}, 'P0-e', 'Kyoto, Japan', 'kyoto', ${d}, ${d}, 'draft')`);
    await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, day_number, title, start_time, duration_minutes, latitude, longitude, origin, sort_order)
      VALUES (${`${t}-g`}, ${t}, 1, 'Ginkaku-ji Temple', '16:45', 30, '35.0270', '135.7982', 'traveler', 1)`);
    // Places' weekly list — the fallback; then the two seasonal official sets.
    await recordFacts([fact({ value: { weekdayDescriptions: ["Monday: 9:00 AM – 5:00 PM"] } })], { planId: t, itemId: `${t}-g` });
    await recordFacts(
      [
        official({ value: { text: "8:30–17:00 (Mar–Nov)", quote: "8:30–17:00", weekdayDescriptions: ["Monday: 8:30 AM – 5:00 PM"], season: { from: "03-01", to: "11-30" } } }),
        official({ value: { text: "9:00–16:30 (Dec–Feb)", quote: "9:00–16:30", weekdayDescriptions: ["Monday: 9:00 AM – 4:30 PM"], season: { from: "12-01", to: "02-28" } } }),
      ],
      { planId: t, itemId: `${t}-g` },
    );
  }
  // Last entry, winter fact first: 16:00 (Dec–Feb), then 16:30 (Mar–Nov).
  await recordFacts(
    [
      official({ factType: "last_admission", value: { byWeekday: { "1": "16:00" }, season: { from: "12-01", to: "02-28" }, quote: "最終入場 16:00" } }),
      official({ factType: "last_admission", value: { byWeekday: { "1": "16:30" }, season: { from: "03-01", to: "11-30" }, quote: "最終入場 16:30" } }),
    ],
    { planId: summer, itemId: `${summer}-g` },
  );
  // SH4: two stops with no point on the summer plan.
  await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, day_number, title, origin, sort_order) VALUES
    (${`${summer}-ph`}, ${summer}, 1, 'Late Dinner in Shimogyo', 'ai', 2),
    (${`${summer}-real`}, ${summer}, 1, 'Soba Restaurant Owariya', 'ai', 3)`);
});

after(async () => {
  try {
    await db.execute(sql`DELETE FROM place_facts WHERE plan_id IN (${winter}, ${summer}) OR place_ref = ${PLACE}`);
    await db.execute(sql`DELETE FROM itinerary_items WHERE trip_id IN (${winter}, ${summer})`);
    await db.execute(sql`DELETE FROM trips WHERE id IN (${winter}, ${summer})`);
    await db.execute(sql`DELETE FROM users WHERE id = ${owner}`);
  } finally {
    await pool.end();
  }
});

test("SH1 winter: the winter hours apply — reached after closing, named with day and time", async () => {
  const { findings } = await loadOptimizerFindings(winter);
  const closed = findings.find((f) => f.kind === "closed_on_arrival");
  assert.ok(closed, "16:45 is after the 16:30 winter close");
  assert.deepEqual(findingStopLines(closed!), ["Ginkaku-ji Temple · Day 1 · 16:45 starts after closing (4:30 PM)"]);
});

test("SH2 summer: the summer hours apply — open on arrival, closes before the visit ends", async () => {
  const { findings } = await loadOptimizerFindings(summer);
  assert.equal(findings.find((f) => f.kind === "closed_on_arrival"), undefined, "open until 17:00 in summer");
  const early = findings.find((f) => f.kind === "closes_before_visit_end");
  assert.ok(early);
  assert.deepEqual(findingStopLines(early!), ["Ginkaku-ji Temple · Day 1 · 16:45 closes at 5:00 PM, before your visit ends"]);
});

test("SH3 summer: the summer last entry applies although the winter fact is stored first", async () => {
  const { findings } = await loadOptimizerFindings(summer);
  const entry = findings.find((f) => f.kind === "after_last_admission");
  assert.ok(entry, "the 16:30 summer last entry is read");
  assert.deepEqual(findingStopLines(entry!), ["Ginkaku-ji Temple · Day 1 · 16:45 arrives after last entry (4:30 PM)"]);
});

test("SH4 an off-map placeholder and an off-map real place are told apart", async () => {
  const { coverage } = await loadLegCoverage(summer, new Date("2027-07-01T00:00:00Z"));
  const by = new Map(coverage.unlocated.map((s) => [s.title, s]));
  assert.equal(by.get("Late Dinner in Shimogyo")?.placeholder, true);
  assert.equal(by.get("Soba Restaurant Owariya")?.placeholder, undefined);
});

test("SH5 the row reads the season covering its date and warns from that fact", async () => {
  const w = (await factsForTrip(winter))[`${winter}-g`] ?? [];
  assert.equal(w.filter((f) => f.factType === "hours").length, 2, "both official seasons reach the row (GH-1: no Places list is stored)");
  assert.match(itemFactsLine(w, "2027-01-11", "Asia/Tokyo")!.text, /^Mon · 9:00 AM – 4:30 PM · /);
  // The winter last entry (16:00, stored for this place by the other plan) is preferred over the 16:30 close.
  assert.match(itemClosingWarning(w, "2027-01-11", { time: "16:45", durationMinutes: 30 }, "Asia/Tokyo")!.text, /^Last entry 4:00 PM · /);
  assert.match(itemClosingWarning(w.filter((f) => f.factType !== "last_admission"), "2027-01-11", { time: "16:45", durationMinutes: 30 }, "Asia/Tokyo")!.text, /^Closes 4:30 PM · /);
  const s = (await factsForTrip(summer))[`${summer}-g`] ?? [];
  assert.match(itemFactsLine(s, "2027-07-12", "Asia/Tokyo")!.text, /^Mon · 8:30 AM – 5:00 PM · /);
  assert.match(itemClosingWarning(s.filter((f) => f.factType !== "last_admission"), "2027-07-12", { time: "16:45", durationMinutes: 30 }, "Asia/Tokyo")!.text, /^Closes 5:00 PM · /);
});

test("SH6 the row's warning prefers the last entry covering its date", async () => {
  const s = (await factsForTrip(summer))[`${summer}-g`] ?? [];
  assert.equal(s.filter((f) => f.factType === "last_admission").length, 2, "both seasonal last-entry rows reach the row");
  assert.match(itemClosingWarning(s, "2027-07-12", { time: "16:45", durationMinutes: 30 }, "Asia/Tokyo")!.text, /^Last entry 4:30 PM · /);
  // Arriving at the last entry is still in; the visit then runs past the 17:00 close.
  assert.match(itemClosingWarning(s, "2027-07-12", { time: "16:30", durationMinutes: 45 }, "Asia/Tokyo")!.text, /^Closes 5:00 PM · /);
});

test("SH7 the extractor admits a season on an hours row; a malformed one stores no structured hours", () => {
  const lines = ["Monday: 8:30 AM – 5:00 PM", "Tuesday: Closed"];
  assert.deepEqual(structuredFields("hours", { weekdayDescriptions: lines, season: { from: "03-01", to: "11-30" } }, "8:30–17:00"), { weekdayDescriptions: lines, season: { from: "03-01", to: "11-30" } });
  assert.deepEqual(structuredFields("hours", { weekdayDescriptions: lines }, "8:30–17:00"), { weekdayDescriptions: lines });
  assert.equal(structuredFields("hours", { weekdayDescriptions: lines, season: { from: "March", to: "11-30" } }, "8:30–17:00"), null);
  assert.equal(structuredFields("hours", { weekdayDescriptions: lines }, "Open in the morning, all year"), null, "the quote must print the times");
  const page = "銀閣寺 Ginkaku-ji Hours 8:30–17:00 (March 1 – November 30). Please enjoy the garden.";
  const { facts } = admitExtractedFacts({ facts: [{ factType: "hours", text: "Open daily from early morning", quote: "8:30–17:00", fields: { weekdayDescriptions: lines, season: { from: "03-01", to: "11-30" } } }] }, { allowed: ["hours"], page, quoteMax: 300 });
  assert.equal(facts[0].text, lines.join("; "), "the stored text is the weekly lines, not the model's prose");
});
