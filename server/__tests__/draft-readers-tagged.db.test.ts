/**
 * EV-P0 PR 3 — NOTHING UNTAGGED REACHES A DRAFT (content-tiers brief §6, "Nothing untagged reaches a draft" test;
 * ledger `2026-10-18-fact-tags-exhaustive`).
 *
 *   T1  every gem a draft read returns is tagged — untagged rows (seeded with the highest scores) never come back
 *   T2  every hours / last-entry fact the feasibility reader returns comes from a PUBLIC row — an untagged official
 *       row and a local expert row for the same place are never read
 *   T3  every last departure the feasibility reader returns comes from a PUBLIC row
 *   T4  both fact writers refuse an untagged row: `recordFacts` stores nothing for an origin with no ruled tier
 *   T5  an expert confirming an OFFICIAL fact leaves it in the checks (linked, never superseded); a second confirm
 *       is refused
 *   T6  migration 394 (run in a ROLLED-BACK transaction): an official last-entry expert row 362 tagged local becomes
 *       public + link_only, exactly what placeFactTags answers; other local rows are untouched; a second run is 0 rows
 *
 * The test reads every row a reader returns and fails on an untagged one; it never filters a row out to pass.
 * DISPOSABLE DB ONLY: every row is keyed by a per-run prefix and deleted afterwards.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { eq, inArray, sql } from "drizzle-orm";
import { db, pool } from "../db";
import { placeFacts, travelPulseHiddenGems } from "@shared/schema";
import { placeFactTags } from "@shared/content-tiers";
import { travelPulseService } from "../services/travelpulse.service";
import { confirmFactAsNugget, feasibilityFactsForTrip, FactConfirmError, recordFacts } from "../services/content-facts/place-facts.service";

const RUN = crypto.randomUUID().slice(0, 8);
const id = (s: string) => `dtr-${RUN}-${s}`;
const OWNER = id("owner");
const EXPERT = id("expert");
const TRIP = id("trip");
const ITEM = id("item");
const CITY = `DraftTagCity-${RUN}`;
const MARKET = `dtr-${RUN}`;
const PLACE = id("place");
const NOW = new Date();
const later = (days: number) => new Date(NOW.getTime() + days * 86_400_000);
const url = (k: string) => `https://dtr-${RUN}.example.jp/${k}`;

async function insertFact(k: string, over: Record<string, unknown>) {
  await db.insert(placeFacts).values({
    id: id(k),
    placeRefKind: "place_id",
    placeRef: PLACE,
    market: MARKET,
    need: "stop.hours",
    factType: "hours",
    value: {},
    origin: "crawled",
    license: "official",
    sourceUrl: url(k),
    fetchedAt: NOW,
    expiresAt: later(30),
    costCents: "0",
    // CS-1 item 3: a dated, machine-read fact is read only once a person has reviewed it.
    verifiedBy: OWNER,
    ...over,
  } as any);
}

async function sourceClassOf(ids: string[]): Promise<Map<string, string | null>> {
  if (!ids.length) return new Map();
  const rows = await db.select({ id: placeFacts.id, sourceUrl: placeFacts.sourceUrl, sourceClass: placeFacts.sourceClass }).from(placeFacts).where(inArray(placeFacts.sourceUrl, ids));
  return new Map(rows.map((r) => [r.sourceUrl!, r.sourceClass]));
}

before(async () => {
  const host = new URL(process.env.DATABASE_URL ?? "postgres://localhost").hostname.toLowerCase();
  if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
    throw new Error("refusing to write fixtures to a non-disposable database");
  }
  await db.execute(sql`INSERT INTO users (id, email, role) VALUES (${OWNER}, ${`${OWNER}@t.test`}, 'traveler'), (${EXPERT}, ${`${EXPERT}@t.test`}, 'expert')`);
  await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, market_slug, start_date, end_date, status)
    VALUES (${TRIP}, ${OWNER}, 'Draft tags', 'Kyoto, Japan', ${MARKET}, '2027-11-08', '2027-11-09', 'draft')`);
  await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, day_number, title, start_time, duration_minutes, latitude, longitude, origin, sort_order, google_place_id)
    VALUES (${ITEM}, ${TRIP}, 1, 'Temple', '10:00', 60, '35.0000', '135.7800', 'traveler', 1, ${PLACE})`);
});

after(async () => {
  await db.execute(sql`DELETE FROM place_facts WHERE place_ref = ${PLACE} OR plan_id = ${TRIP} OR market = ${MARKET} OR place_ref LIKE ${`dtr-${RUN}-%`}`);
  await db.delete(travelPulseHiddenGems).where(eq(travelPulseHiddenGems.city, CITY));
  await db.execute(sql`DELETE FROM itinerary_items WHERE trip_id = ${TRIP}`);
  await db.execute(sql`DELETE FROM trips WHERE id = ${TRIP}`);
  await db.execute(sql`DELETE FROM users WHERE id IN (${OWNER}, ${EXPERT})`);
  await pool.end();
});

test("T1 — every gem a draft read returns is tagged", async () => {
  await db.insert(travelPulseHiddenGems).values([
    { id: id("g-untagged-1"), city: CITY, placeName: "Untagged one", gemScore: 99 },
    { id: id("g-untagged-2"), city: CITY, placeName: "Untagged two", gemScore: 98, aiGenerated: true },
    { id: id("g-public"), city: CITY, placeName: "Public", gemScore: 50, sourceClass: "public", reuseClass: "reusable" },
    { id: id("g-local"), city: CITY, placeName: "Local", gemScore: 40, sourceClass: "local", reuseClass: "reusable" },
  ] as any);
  const direct = await travelPulseService.getDraftEligibleGems(CITY, 50);
  assert.ok(direct.length >= 2, "the tagged gems are read");
  for (const g of direct) assert.ok(g.sourceClass === "public" || g.sourceClass === "local", `gem ${g.id} reached a draft with source_class ${g.sourceClass}`);
  const viaCity = await travelPulseService.getCityIntelligence(CITY, { forDraft: true });
  for (const g of viaCity?.hiddenGems ?? []) assert.ok(g.sourceClass === "public" || g.sourceClass === "local", `gem ${g.id} reached a draft through the city read`);
});

test("T2 — every hours and last-entry fact the feasibility reader returns is from a public row", async () => {
  const hours = (text: string) => ({ text, quote: text, weekdayDescriptions: [`Monday: ${text}`] });
  await insertFact("h-public", { value: hours("9:00 AM – 5:00 PM"), sourceClass: "public", reuseClass: "link_only" });
  await insertFact("h-untagged", { value: hours("6:00 AM – 11:00 PM") });
  await insertFact("h-local", { origin: "expert_nugget", license: null, value: hours("7:00 AM – 9:00 PM"), sourceClass: "local", reuseClass: "reusable", planId: TRIP, itineraryItemId: ITEM });
  await insertFact("la-public", { factType: "last_admission", value: { byWeekday: { "1": "16:30" }, quote: "Last admission 16:30" }, sourceClass: "public", reuseClass: "link_only" });
  await insertFact("la-untagged", { factType: "last_admission", value: { byWeekday: { "1": "20:00" }, quote: "Last admission 20:00" } });
  const f = await feasibilityFactsForTrip(TRIP, MARKET, NOW);
  const read = [
    ...Array.from(f.hours.values()).flat().map((h) => h.sourceUrl),
    ...Array.from(f.lastAdmissionFacts.values()).flat().map((l) => l.sourceUrl),
  ];
  assert.ok(read.includes(url("h-public")), "the public hours are read");
  assert.ok(read.includes(url("la-public")), "the public last entry is read");
  const classes = await sourceClassOf(read.filter((u): u is string => !!u));
  for (const u of read) assert.equal(u ? classes.get(u) : "no source url", "public", `feasibility read a non-public row: ${u}`);
  const hs = f.hours.get(ITEM) ?? [];
  assert.ok(!hs.some((h) => h.weekdayDescriptions[0].includes("7:00 AM")), "a local expert row is never read for hours");
});

test("T3 — every last departure the feasibility reader returns is from a public row", async () => {
  const svc = (dep: string) => ({ operator: "Kyoto City Bus", line: "206", station: "Stop", lastDeparture: dep, weekdays: [1], validFrom: "2027-01-01", validTo: "2028-01-01", quote: `最終 ${dep}` });
  const base = { placeRefKind: "free_text", placeRef: id("stop"), placeLat: "35.0000000", placeLng: "135.7800000", need: "transport.local", factType: "last_service" };
  await insertFact("ls-public", { ...base, value: svc("22:00"), sourceClass: "public", reuseClass: "link_only" });
  await insertFact("ls-untagged", { ...base, value: svc("23:30") });
  await insertFact("ls-local", { ...base, value: svc("23:45"), sourceClass: "local", reuseClass: "reusable" });
  const f = await feasibilityFactsForTrip(TRIP, MARKET, NOW);
  const read = f.lastServices.map((s) => s.sourceUrl);
  assert.ok(read.includes(url("ls-public")), "the public last departure is read");
  const classes = await sourceClassOf(read.filter((u): u is string => !!u));
  for (const u of read) assert.equal(u ? classes.get(u) : "no source url", "public", `feasibility read a non-public last departure: ${u}`);
});

test("T4 — recordFacts stores nothing for an origin with no ruled tier", async () => {
  const draft = { placeRefKind: "free_text", placeRef: id("untiered"), placeLat: null, placeLng: null, market: MARKET, need: "stop.hours", factType: "hours", value: { text: "x" }, sourceId: null, sourceUrl: null, license: null, fetchedAt: NOW, expiresAt: null, costCents: 0 };
  for (const origin of ["platform_listing", "gem", "event", "hotel_cache", "traveler_note"]) {
    await recordFacts([{ ...draft, origin } as any], { planId: TRIP, itemId: ITEM });
  }
  const rows = await db.select({ id: placeFacts.id }).from(placeFacts).where(eq(placeFacts.placeRef, id("untiered")));
  assert.equal(rows.length, 0, "no untagged row is stored");
});

test("T5 — confirming an official fact keeps it in the checks; a second confirm is refused", async () => {
  await insertFact("c-official", { placeRefKind: "free_text", placeRef: id("confirm"), value: { text: "Open 9:00–17:00 daily.", quote: "9:00 to 17:00" }, sourceClass: "public", reuseClass: "link_only", planId: TRIP, itineraryItemId: ITEM });
  const { nuggetId } = await confirmFactAsNugget({ tripId: TRIP, factId: id("c-official"), expertId: EXPERT });
  const [official] = await db.select().from(placeFacts).where(eq(placeFacts.id, id("c-official")));
  assert.equal(official.supersededBy, null, "the official row is never superseded");
  assert.equal(official.sourceClass, "public");
  const [nugget] = await db.select().from(placeFacts).where(eq(placeFacts.id, nuggetId));
  assert.equal(nugget.officialSourceFactId, id("c-official"), "the nugget links the official row");
  assert.equal(nugget.sourceClass, "local");
  await assert.rejects(
    confirmFactAsNugget({ tripId: TRIP, factId: id("c-official"), expertId: EXPERT }),
    (e: unknown) => e instanceof FactConfirmError && e.status === 409,
  );
});

test("T6 — migration 394 re-tags official last-entry expert rows to what placeFactTags answers, idempotently", async () => {
  const la = { placeRefKind: "free_text", placeRef: id("retag"), origin: "expert_nugget", factType: "last_admission", value: { byWeekday: { "1": "16:00" }, quote: "Last entry 16:00" }, sourceClass: "local", reuseClass: "reusable" };
  await insertFact("r-official", { ...la, license: "official" });
  await insertFact("r-unlicensed", { ...la, license: null });
  await insertFact("r-hours", { ...la, license: "official", factType: "hours", value: { text: "9-5" } });
  const file = fs.readFileSync(path.join(process.cwd(), "server/migrations/394_place_facts_feasibility_retag.sql"), "utf8");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(file);
    const read = async (k: string) => (await client.query("SELECT source_class, reuse_class FROM place_facts WHERE id = $1", [id(k)])).rows[0];
    const expected = placeFactTags("expert_nugget", "official", "last_admission")!;
    assert.deepEqual(await read("r-official"), { source_class: expected.sourceClass, reuse_class: expected.reuseClass });
    assert.deepEqual(await read("r-unlicensed"), { source_class: "local", reuse_class: "reusable" }, "a row with no official licence stays local");
    assert.deepEqual(await read("r-hours"), { source_class: "local", reuse_class: "reusable" }, "only last-entry and last-train rows move");
    const again = await client.query(file.replace(/;\s*$/, " RETURNING id;"));
    assert.equal(again.rowCount, 0, "a second run touches no row");
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});
