/**
 * GH-1 (ledger `2026-10-17-gh1-no-google-hours`; terms ruling, Oct 16, 2026): Google's opening hours are never
 * stored and never read.
 *
 *   H1  The Places Details mask asks no opening-hours field; the default call bills at Pro; an answer that
 *       carries hours drafts no hours fact.
 *   H2  The one writer refuses a `places_api` hours draft and stores everything else in the same call.
 *   H3  A `places_api` hours row stored before GH-1 is never read: not by the plan's fact views, and not by
 *       the cached-place reuse (another plan looking the same place up gets no hours).
 *   H4  An official hours fact is still stored and read.
 *   H5  The lookup scheduler moves a day on when its first lookup attaches nothing, not on missing hours.
 *   H6  An outcome row records whole cents, rounded up, so a fractional price never fails the insert.
 *
 * Run against a disposable database:
 *   npx tsx --test --test-concurrency=1 --test-force-exit server/__tests__/gh1-no-google-hours.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { PlacesAdapter, placesFieldMask } from "../services/content-facts/places-adapter";
import { enrichPlanItems, factsForTrip, recordFacts } from "../services/content-facts/place-facts.service";
import { LookupScheduler } from "../services/content-facts/lookup-scheduler.pure";
import { recordLookupOutcomes } from "../services/content-facts/lookup-outcomes.service";
import { isGoogleHoursFact } from "@shared/content-facts";

const RUN = crypto.randomUUID().slice(0, 8);
const id = (s: string) => `gh1-${RUN}-${s}`;
const owner = id("owner");
const tripA = id("trip-a");
const tripB = id("trip-b");
const PLACE = `ChIJ-${RUN}`;
const NOW = new Date();
const later = (days: number) => new Date(NOW.getTime() + days * 86_400_000);

const draft = (over: Record<string, unknown>) =>
  ({
    placeRefKind: "place_id",
    placeRef: PLACE,
    placeLat: 35.0,
    placeLng: 135.7,
    market: "kyoto",
    need: "stop.hours",
    factType: "hours",
    value: { weekdayDescriptions: ["Monday: 9:00 AM – 5:00 PM"] },
    origin: "places_api",
    sourceId: null,
    sourceUrl: null,
    license: "restricted",
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
  for (const t of [tripA, tripB]) {
    await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, market_slug, start_date, end_date, status)
      VALUES (${t}, ${owner}, 'GH-1', 'Kyoto, Japan', 'kyoto', '2027-11-08', '2027-11-09', 'draft')`);
  }
  await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, day_number, title, item_type, origin, sort_order) VALUES
    (${id("a1")}, ${tripA}, 1, ${`Kinkaku-ji ${RUN}`}, 'attraction', 'traveler', 1),
    (${id("b1")}, ${tripB}, 1, ${`Kinkaku-ji ${RUN}`}, 'attraction', 'traveler', 1)`);
});

after(async () => {
  await db.execute(sql`DELETE FROM place_lookup_outcomes WHERE trip_id IN (${tripA}, ${tripB})`);
  await db.execute(sql`DELETE FROM place_facts WHERE plan_id IN (${tripA}, ${tripB}) OR place_ref = ${PLACE}`);
  await db.execute(sql`DELETE FROM itinerary_items WHERE trip_id IN (${tripA}, ${tripB})`);
  await db.execute(sql`DELETE FROM trips WHERE id IN (${tripA}, ${tripB})`);
  await db.execute(sql`DELETE FROM users WHERE id = ${owner}`);
});

test("H1 · the mask asks no hours, bills at Pro, and an answer's hours draft nothing", async () => {
  const mask = placesFieldMask("stop.hours");
  assert.equal(mask.sku, "details_pro");
  assert.equal(mask.fields.some((f) => /OpeningHours/i.test(f)), false);
  assert.equal(placesFieldMask("dining").sku, "details_enterprise_atmosphere");
  process.env.PLACE_FACTS_PLACES_ENABLED = "1";
  process.env.GOOGLE_MAPS_API_KEY = "test-key";
  try {
    const adapter = new PlacesAdapter(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        id: PLACE,
        displayName: { text: "Kinkaku-ji" },
        location: { latitude: 35.0394, longitude: 135.7292 },
        regularOpeningHours: { weekdayDescriptions: ["Monday: 9:00 AM – 5:00 PM"] },
      }),
    }));
    const drafts = await adapter.fetchByPlaceId(PLACE, { need: "stop.hours", market: "kyoto", query: { text: "Kinkaku-ji", city: "Kyoto" }, budgetCents: 0 });
    assert.ok(drafts.length > 0);
    assert.equal(drafts.some((d) => d.factType === "hours"), false);
  } finally {
    delete process.env.PLACE_FACTS_PLACES_ENABLED;
    delete process.env.GOOGLE_MAPS_API_KEY;
  }
});

test("H2 · the writer refuses Google hours and stores the rest of the call", async () => {
  assert.equal(isGoogleHoursFact({ origin: "places_api", factType: "hours" }), true);
  assert.equal(isGoogleHoursFact({ origin: "crawled", factType: "hours" }), false);
  assert.equal(isGoogleHoursFact({ origin: "places_api", factType: "location" }), false);
  const n = await recordFacts(
    [draft({}), draft({ factType: "location", value: { lat: 35.0394, lng: 135.7292, name: "Kinkaku-ji" } })],
    { planId: tripA, itemId: id("a1") },
  );
  assert.equal(n, 1, "only the location row");
  const rows = (await db.execute(sql`SELECT fact_type FROM place_facts WHERE plan_id = ${tripA}`)).rows as any[];
  assert.deepEqual(rows.map((r) => r.fact_type), ["location"]);
});

test("H3 · a legacy Google hours row is never read, nor copied to another plan", async () => {
  // A row as stored before GH-1, written directly (the writer would refuse it).
  await db.execute(sql`INSERT INTO place_facts (id, place_ref_kind, place_ref, place_lat, place_lng, market, need, fact_type, value, origin, license, fetched_at, expires_at, plan_id, itinerary_item_id)
    VALUES (${crypto.randomUUID()}, 'place_id', ${PLACE}, 35.0394, 135.7292, 'kyoto', 'stop.hours', 'hours', ${JSON.stringify({ weekdayDescriptions: ["Monday: 9:00 AM – 5:00 PM"] })}::jsonb,
      'places_api', 'restricted', ${NOW}, ${later(30)}, ${tripA}, ${id("a1")})`);
  const views = await factsForTrip(tripA);
  assert.equal((views[id("a1")] ?? []).some((v) => v.factType === "hours"), false, "the plan's views carry no Google hours");
  const r = await enrichPlanItems({
    tripId: tripB,
    market: "kyoto",
    city: "Kyoto",
    items: [{ id: id("b1"), title: `Kinkaku-ji ${RUN}`, type: "attraction", dayNumber: 1, googlePlaceId: PLACE } as any],
    adapters: [
      Object.assign(new PlacesAdapter(async () => { throw new Error("no network in this test"); }), { covers: () => true }) as any,
    ],
    trigger: "draft",
  });
  assert.equal(r.cached, 1, "the place's facts were reused from plan A");
  const copied = (await db.execute(sql`SELECT fact_type FROM place_facts WHERE plan_id = ${tripB}`)).rows as any[];
  assert.ok(copied.length > 0);
  assert.equal(copied.some((x) => x.fact_type === "hours"), false, "no hours were copied");
});

test("H4 · an official hours fact is still stored and read", async () => {
  const n = await recordFacts(
    [draft({ /* CS-1 item 3 (ledger `2026-10-19-cs1-fact-review`): reviewed by a person */ verifiedBy: owner, origin: "crawled", license: "official", sourceUrl: "https://www.shokoku-ji.jp/kinkakuji/", value: { text: "Open 9:00–17:00", quote: "9:00–17:00", weekdayDescriptions: ["Monday: 9:00 AM – 5:00 PM"] } })],
    { planId: tripA, itemId: id("a1") },
  );
  assert.equal(n, 1);
  const views = await factsForTrip(tripA);
  assert.ok((views[id("a1")] ?? []).some((v) => v.factType === "hours" && v.origin === "crawled"));
});

test("H5 · a day moves on when its first lookup attaches nothing", () => {
  const s = new LookupScheduler(new Map([[1, ["a", "b"]], [2, ["c", "d"]]]));
  const first = s.next()!;
  assert.deepEqual(first, { day: 1, entry: "a" });
  s.report(1, { attached: false });
  assert.deepEqual(s.next(), { day: 1, entry: "b" }, "day 1's next place is tried before day 2");
  const s2 = new LookupScheduler(new Map([[1, ["a", "b"]], [2, ["c", "d"]]]));
  s2.next();
  s2.report(1, { attached: true });
  assert.deepEqual(s2.next(), { day: 2, entry: "c" }, "an attached first lookup keeps the round-robin");
});

test("H6 · an outcome row records whole cents, rounded up", async () => {
  const run = { runId: crypto.randomUUID(), runStartedAt: new Date(), trigger: "draft" as const };
  const n = await recordLookupOutcomes(run, [
    { tripId: tripA, itemId: id("a1"), day: 1, outcome: "attached", reason: null, placeId: PLACE, cache: "miss", costCents: 1.7, latencyMs: 10 },
  ] as any);
  assert.equal(n, 1);
  const rows = (await db.execute(sql`SELECT cost_cents FROM place_lookup_outcomes WHERE run_id = ${run.runId}`)).rows as any[];
  assert.equal(Number(rows[0].cost_cents), 2);
});
