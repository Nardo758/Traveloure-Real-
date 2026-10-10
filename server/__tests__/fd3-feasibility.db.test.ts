/**
 * FD-3 — feasibility checks on a real database (decision-maker rulings, Oct 10, 2026; ledger
 * `2026-10-10-fd3-feasibility`; brief docs/planning/briefs/fd-3-feasibility.md).
 *
 * One free Kyoto plan, Monday 2027-11-08:
 *   day 1  15:00 Temple B (90 min) · 16:45 Kiyomizu (30 min) · 20:00 Arashiyama stop (60 min)
 *   day 2  10:00 a stop with nothing stored
 *
 *   G1  an unsourced or unofficial last admission is refused by the one writer — nothing is stored
 *   G2  a stored official last_admission (stored by ANOTHER plan, for the same place id) earlier than the
 *       arrival flags after_last_admission
 *   G3  official structured hours win over Places for a hard fact and flag closes_before_visit_end
 *   G4  a missed last departure near the ride's start flags last_service_missed (the free plan's ride is
 *       derived by the engine's default-mode rule — no stored legs)
 *   G5  an UNTAGGED fact never produces a finding; a text-only crawled hours row is never read
 *   G6  the day counts: honest numbers on day 1, "not checked" on day 2
 *   G7  the extractor keeps structured fields only when they parse and the quote prints the time
 *
 * DISPOSABLE DB ONLY: every row is keyed by a per-run prefix and deleted afterwards.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db, pool } from "../db";
import { recordFacts } from "../services/content-facts/place-facts.service";
import { loadDayFeasibility, loadOptimizerFindings } from "../services/optimizer-lead.service";
import { structuredFields } from "../services/content-facts/tavily-extract-adapter";
import { feasibilityLine } from "@shared/plan-feasibility";

const RUN = crypto.randomUUID().slice(0, 8);
const id = (s: string) => `fd3-${RUN}-${s}`;
const owner = id("owner");
const trip = id("trip");
const other = id("other");
const P1 = `p1-${RUN}`;
const P2 = `p2-${RUN}`;
const P3 = `p3-${RUN}`;
const NOW = new Date();
const later = (days: number) => new Date(NOW.getTime() + days * 86_400_000);

const fact = (over: Record<string, unknown>) => ({
  placeRefKind: "place_id" as const,
  placeRef: P1,
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
  costCents: 0,
  ...over,
}) as any;

before(async () => {
  const host = new URL(process.env.DATABASE_URL ?? "postgres://localhost").hostname.toLowerCase();
  if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
    throw new Error("refusing to write fixtures to a non-disposable database");
  }
  await db.execute(sql`INSERT INTO users (id, email, role) VALUES (${owner}, ${`${owner}@t.test`}, 'traveler')`);
  for (const t of [trip, other]) {
    await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, market_slug, start_date, end_date, status)
      VALUES (${t}, ${owner}, 'FD-3', 'Kyoto, Japan', 'kyoto', '2027-11-08', '2027-11-09', 'draft')`);
  }
  // Day 1 in plan order; coordinates on the row (a traveler's own stops are trusted).
  await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, day_number, title, start_time, duration_minutes, latitude, longitude, origin, sort_order) VALUES
    (${id("b")}, ${trip}, 1, 'Temple B', '15:00', 90, '35.0000', '135.7820', 'traveler', 1),
    (${id("k")}, ${trip}, 1, 'Kiyomizu-dera', '16:45', 30, '34.9949', '135.7850', 'traveler', 2),
    (${id("a")}, ${trip}, 1, 'Arashiyama stop', '20:00', 60, '35.0094', '135.6680', 'traveler', 3),
    (${id("d2")}, ${trip}, 2, 'Day two stop', '10:00', 60, '35.0100', '135.7600', 'traveler', 1)`);

  // Places hours (aggregator): Kiyomizu 6–18, Temple B 9–20, the Arashiyama stop none.
  await recordFacts([fact({ value: { weekdayDescriptions: ["Monday: 6:00 AM – 6:00 PM"] } })], { planId: trip, itemId: id("k") });
  await recordFacts([fact({ placeRef: P2, value: { weekdayDescriptions: ["Monday: 9:00 AM – 8:00 PM"] } })], { planId: trip, itemId: id("b") });
  await recordFacts([fact({ placeRef: P3, factType: "location", value: { lat: 35.0094, lng: 135.668 } })], { planId: trip, itemId: id("a") });
  // G3: Temple B's OFFICIAL structured hours close at 16:00 — they win for a hard fact.
  await recordFacts(
    [fact({ placeRef: P2, origin: "crawled", license: "official", sourceUrl: "https://temple-b.example.jp/", value: { text: "Open 9:00–16:00", quote: "9:00–16:00", weekdayDescriptions: ["Monday: 9:00 AM – 4:00 PM"] } })],
    { planId: trip, itemId: id("b") },
  );
  // G2: Kiyomizu's last admission, stored by ANOTHER plan for the same place id (the registry's stored fact).
  await recordFacts(
    [fact({ factType: "last_admission", origin: "crawled", license: "official", sourceUrl: "https://www.kiyomizudera.or.jp/en/", value: { byWeekday: { "1": "16:30" }, quote: "Last admission 16:30" } })],
    { planId: other, itemId: null },
  );
  // G4: the last departure near Kiyomizu on Mondays is 17:00; the ride to Arashiyama leaves at 17:15.
  await recordFacts(
    [
      fact({
        placeRefKind: "free_text",
        placeRef: "Kiyomizu-gojo",
        placeLat: 34.995,
        placeLng: 135.7855,
        need: "transport.local",
        factType: "last_service",
        origin: "crawled",
        license: "official",
        sourceUrl: "https://www.city.kyoto.lg.jp/kotsu/",
        value: { operator: "Kyoto City Bus", line: "206", station: "Kiyomizu-michi", lastDeparture: "17:00", weekdays: [1], validFrom: "2027-01-01", validTo: "2028-01-01", quote: "最終 17:00" },
      }),
    ],
    { planId: other, itemId: null },
  );
  // G5: a text-only crawled hours row (never parsed) and an UNTAGGED official last admission (never read).
  await recordFacts(
    [fact({ placeRef: P3, origin: "crawled", license: "official", sourceUrl: "https://arashiyama.example.jp/", value: { text: "Open until 7 pm", quote: "until 7 pm" } })],
    { planId: trip, itemId: id("a") },
  );
  await recordFacts(
    [fact({ placeRef: P3, factType: "last_admission", origin: "crawled", license: "official", sourceUrl: "https://arashiyama.example.jp/", value: { byWeekday: { "1": "19:00" }, quote: "Last entry 19:00" } })],
    { planId: trip, itemId: id("a") },
  );
  await db.execute(sql`UPDATE place_facts SET source_class = NULL WHERE plan_id = ${trip} AND fact_type = 'last_admission'`);
});

after(async () => {
  await db.execute(sql`DELETE FROM place_facts WHERE plan_id IN (${trip}, ${other}) OR place_ref IN (${P1}, ${P2}, ${P3}, 'Kiyomizu-gojo')`);
  await db.execute(sql`DELETE FROM itinerary_items WHERE trip_id = ${trip}`);
  await db.execute(sql`DELETE FROM trips WHERE id IN (${trip}, ${other})`);
  await db.execute(sql`DELETE FROM users WHERE id = ${owner}`);
  await pool.end();
});

test("G1 — an unsourced or unofficial last admission is refused by the one writer", async () => {
  const n = await recordFacts(
    [
      fact({ factType: "last_admission", origin: "crawled", license: "official", sourceUrl: null, value: { byWeekday: { "1": "16:00" }, quote: "16:00" } }),
      fact({ factType: "last_admission", origin: "crawled", license: "editorial", sourceUrl: "https://blog.example.com/", value: { byWeekday: { "1": "16:00" }, quote: "16:00" } }),
      fact({ factType: "last_service", origin: "expert_nugget", license: null, sourceUrl: null, value: { operator: "X", line: "Y", station: null, lastDeparture: "23:00", weekdays: [1], validFrom: "2027-01-01", validTo: "2028-01-01" } }),
    ],
    { planId: trip, itemId: id("d2") },
  );
  assert.equal(n, 0);
  const rows = (await db.execute(sql`SELECT count(*)::int AS n FROM place_facts WHERE itinerary_item_id = ${id("d2")}`)).rows as any[];
  assert.equal(rows[0].n, 0);
});

test("G2–G5 — the findings: last entry, visit end, last ride; untagged and text-only facts never count", async () => {
  const { findings } = await loadOptimizerFindings(trip);
  const by = new Map(findings.map((f) => [f.kind, f]));
  assert.deepEqual(by.get("after_last_admission"), { kind: "after_last_admission", count: 1, days: [1] }, "Kiyomizu at 16:45 after 16:30 — the untagged 19:00 for the 20:00 stop is not read");
  assert.equal(by.get("closes_before_visit_end")?.count, 1, "Temple B closes at 16:00 (official) before 16:30 — Places' 20:00 lost");
  assert.equal(by.get("last_service_missed")?.count, 1, "the 17:15 ride after the 17:00 last bus");
  assert.equal(by.has("closed_on_arrival"), false);
});

test("G6 — the day counts: honest on day 1, not checked on day 2", async () => {
  const days = await loadDayFeasibility(trip);
  assert.deepEqual(days.get(1), { stops: 3, hoursChecked: 2, lastEntryChecked: 1, rides: 1, ridesChecked: 1 });
  assert.equal(feasibilityLine(days.get(1)), "Hours checked for 2 of 3 stops · last entry checked for 1 of 3 stops · last trains checked for 1 of 1 ride");
  assert.deepEqual(days.get(2), { stops: 1, hoursChecked: 0, lastEntryChecked: 0, rides: 0, ridesChecked: 0 });
  assert.equal(feasibilityLine(days.get(2)), "Hours not checked · last entry not checked");
});

test("G7 — the extractor keeps structured fields only when they parse and the quote prints the time", () => {
  assert.deepEqual(structuredFields("last_admission", { byWeekday: { "1": "16:30" } }, "Last admission 4:30 pm"), { byWeekday: { "1": "16:30" } });
  assert.equal(structuredFields("last_admission", { byWeekday: { "1": "16:30" } }, "Open until 5 pm"), "refused");
  assert.equal(structuredFields("last_admission", null, "Last admission 16:30"), "refused");
  assert.equal(structuredFields("last_service", { operator: "Keihan", line: "Main", lastDeparture: "23:40", weekdays: [1], validFrom: "2027-01-01", validTo: "2027-12-31" }, "last train 23:40")
    && typeof structuredFields("last_service", { operator: "Keihan", line: "Main", lastDeparture: "23:40", weekdays: [1], validFrom: "2027-01-01", validTo: "2027-12-31" }, "last train 23:40"), "object");
  assert.deepEqual(structuredFields("hours", { weekdayDescriptions: ["Monday: 9:00 AM – 5:00 PM"] }, "9–17"), { weekdayDescriptions: ["Monday: 9:00 AM – 5:00 PM"] });
  assert.equal(structuredFields("hours", { weekdayDescriptions: ["Monday: whenever"] }, "x"), null, "an unreadable line keeps the row text-only");
  assert.equal(structuredFields("tip", { anything: 1 }, "x"), null);
});
