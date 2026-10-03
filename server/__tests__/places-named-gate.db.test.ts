/**
 * The Places named-place gate and the per-draft budget (ledger `2026-09-30-places-named-gate`;
 * decision-maker, from production smoke test 3 — plan 8086e76d: hours on 11/11 items for days 1–2 and
 * 0/19 for days 3–5, and generic items given hours from places they do not name).
 *
 *   G1  pure: the three generic titles from the smoke test name no place; named titles do; a matched
 *       name counts only when more than half its distinctive words are in the item
 *   G2  "Dinner at Local Izakaya", "Lunch at Traditional Restaurant", "Traditional Tea Ceremony
 *       Experience" produce NO fact rows, and Places is never even asked
 *   G3  a named item whose Places answer names somewhere else records nothing (the answer is dropped)
 *   G4  a 5-day plan with named venues on every day gets facts on EVERY day under a cap smaller than
 *       its item count; a cache reuse does not spend the cap
 *   G5  smoke 4 P2: "Fushimi Inari Taisha Alternative: Kiyomizu-dera Temple" is looked up as
 *       Kiyomizu-dera, and an answer naming Fushimi Inari is never attached to it
 *   G6  smoke 4 P1: every named item logs its DAY and OUTCOME (attached / unmatched / none), and a
 *       skipped item logs why, so "never attempted" and "attempted and missed" read differently
 *
 * DISPOSABLE DB ONLY: every row is keyed by a per-run prefix and deleted afterwards.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db, pool } from "../db";
import { enrichPlanItems, lookupOrder, pendingFactLookups, type EnrichItem } from "../services/content-facts/place-facts.service";
import { PlacesAdapter } from "../services/content-facts/places-adapter";
import { matchNamesItem, namedPlaceTokens } from "@shared/place-name-gate";

const RUN = crypto.randomUUID().slice(0, 8);
const id = (s: string) => `png-${RUN}-${s}`;
const OWNER = id("owner");
const TRIP = id("trip");
const CITY = "Kyoto, Japan";
const GENERIC = ["Dinner at Local Izakaya", "Lunch at Traditional Restaurant", "Traditional Tea Ceremony Experience"];

/** A fake Places API. `answer(query)` names the place returned; every call is counted. */
function placesFake(
  answer: (query: string) => string,
  opts: { noHours?: (query: string) => boolean; types?: (query: string) => string[] } = {},
) {
  const state = { calls: 0 };
  const adapter = new PlacesAdapter(
    async (_url, init) => {
      state.calls += 1;
      const q = JSON.parse(init.body).textQuery as string;
      const name = answer(q);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          places: [{
            id: `${id("place")}-${crypto.createHash("sha1").update(q).digest("hex").slice(0, 10)}`,
            displayName: { text: name },
            location: { latitude: 35.0, longitude: 135.7 },
            // Smoke 7: Google's types — a point of interest by default; a test can answer an area.
            types: opts.types?.(q) ?? ["tourist_attraction", "point_of_interest", "establishment"],
            ...(opts.noHours?.(q) ? {} : { regularOpeningHours: { weekdayDescriptions: [`Monday: ${RUN}`] } }),
          }],
        }),
      };
    },
    () => "test-key",
    () => true,
  );
  return { adapter, state };
}

async function insertItems(items: EnrichItem[]) {
  for (const i of items) {
    await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, day_number, title, item_type, origin)
      VALUES (${i.id}, ${TRIP}, ${i.dayNumber ?? 1}, ${i.title}, ${i.type ?? "attraction"}, 'ai')`);
  }
}

async function factRows(itemIds: string[]) {
  const r = await db.execute(sql`SELECT itinerary_item_id AS item, fact_type FROM place_facts WHERE plan_id = ${TRIP} AND itinerary_item_id IN (${sql.join(itemIds.map((i) => sql`${i}`), sql`, `)})`);
  return r.rows as Array<{ item: string; fact_type: string }>;
}

before(async () => {
  const host = new URL(process.env.DATABASE_URL ?? "postgres://localhost").hostname.toLowerCase();
  if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
    throw new Error("refusing to write fixtures to a non-disposable database");
  }
  process.env.PLACE_FACTS_PLACES_ENABLED = "1";
  await db.execute(sql`INSERT INTO users (id, email, role) VALUES (${OWNER}, ${`${OWNER}@t.test`}, 'traveler')`);
  await db.execute(sql`
    INSERT INTO trips (id, user_id, title, destination, start_date, end_date, status, event_type)
    VALUES (${TRIP}, ${OWNER}, ${`Gate plan ${RUN}`}, ${CITY}, '2027-11-11', '2027-11-15', 'draft', 'vacation')
  `);
});

after(async () => {
  try {
    await db.execute(sql`DELETE FROM place_facts WHERE plan_id = ${TRIP} OR place_ref LIKE ${`png-${RUN}-%`}`);
    await db.execute(sql`DELETE FROM ai_generated_itineraries WHERE trip_id = ${TRIP}`);
    await db.execute(sql`DELETE FROM itinerary_items WHERE trip_id = ${TRIP}`);
    await db.execute(sql`DELETE FROM trips WHERE id = ${TRIP}`);
    await db.execute(sql`DELETE FROM users WHERE id = ${OWNER}`);
  } finally {
    delete process.env.PLACE_FACTS_PLACES_ENABLED;
    delete process.env.PLACES_LOOKUPS_PER_DRAFT;
    await pool.end();
  }
});

test("G1: generic titles name no place; a matched name must be mostly in the item", () => {
  for (const t of GENERIC) assert.equal(namedPlaceTokens({ title: t }, CITY).size, 0, t);
  assert.deepEqual(Array.from(namedPlaceTokens({ title: "Visit Kinkaku-ji" }, CITY)), ["kinkaku"]);
  assert.deepEqual(Array.from(namedPlaceTokens({ title: "Morning at Fushimi Inari Shrine" }, CITY)), ["fushimi", "inari"]);
  assert.deepEqual(Array.from(namedPlaceTokens({ title: "Explore Kyoto" }, CITY)), [], "the city is not a venue");
  const item = namedPlaceTokens({ title: "Fushimi Inari Shrine" }, CITY);
  assert.equal(matchNamesItem("Fushimi Inari Taisha", item, CITY), true, "2 of 3 of its words are in the item");
  assert.equal(matchNamesItem("Torikizoku", item, CITY), false);
  assert.equal(matchNamesItem("Pontocho Kappa", namedPlaceTokens({ title: "Dinner in Pontocho" }, CITY), CITY), false, "1 of 2 is not more than half");
  assert.equal(matchNamesItem(null, item, CITY), false, "an answer with no name is never attached");
});

test("G2: the three generic titles produce no fact rows, and Places is never asked", async () => {
  const items: EnrichItem[] = GENERIC.map((title, i) => ({ id: id(`g${i}`), title, type: i === 2 ? "activity" : "dinner", dayNumber: i + 1 }));
  await insertItems(items);
  const { adapter, state } = placesFake(() => "Torikizoku Kawaramachi");
  const r = await enrichPlanItems({ tripId: TRIP, market: "kyoto", city: CITY, items, adapters: [adapter] });
  assert.equal(state.calls, 0);
  assert.equal(r.unnamed, 3);
  assert.deepEqual(await factRows(items.map((i) => i.id)), []);
});

test("G3: a named item whose answer names somewhere else records nothing", async () => {
  const item: EnrichItem = { id: id("gion"), title: "Dinner at Gion Karyo", type: "dinner", dayNumber: 1 };
  await insertItems([item]);
  const { adapter, state } = placesFake(() => "Torikizoku Kawaramachi");
  const r = await enrichPlanItems({ tripId: TRIP, market: "kyoto", city: CITY, items: [item], adapters: [adapter] });
  assert.equal(state.calls, 1, "a named item is looked up");
  assert.equal(r.unmatched, 1);
  assert.deepEqual(await factRows([item.id]), []);
});

test("G4: a 5-day plan with named venues on every day gets facts on every day under a small cap", async () => {
  process.env.PLACES_LOOKUPS_PER_DRAFT = "5";
  const venues = [
    ["Kinkaku-ji", "Ryoan-ji", "Daitoku-ji", "Kitano Tenmangu"],
    ["Fushimi Inari Shrine", "Tofuku-ji", "Sanjusangen-do", "Kiyomizu-dera"],
    ["Arashiyama Bamboo Grove", "Tenryu-ji", "Okochi Sanso", "Togetsukyo Bridge"],
    ["Nishiki Market", "Pontocho Alley", "Yasaka Shrine", "Kennin-ji"],
    ["Ginkaku-ji", "Philosopher's Path", "Nanzen-ji", "Heian Shrine"],
  ];
  const items: EnrichItem[] = [];
  venues.forEach((day, d) => day.forEach((title, k) => items.push({ id: id(`d${d + 1}-${k}`), title, type: "attraction", dayNumber: d + 1 })));
  await insertItems(items);
  // Days listed in plan order; the old loop spent a cap of 5 on day 1 and the first item of day 2.
  assert.deepEqual(lookupOrder(items, CITY).slice(0, 5).map((e) => e.item.dayNumber), [1, 2, 3, 4, 5]);
  const { adapter, state } = placesFake((q) => q.split(",")[0]);
  const r = await enrichPlanItems({ tripId: TRIP, market: "kyoto", city: CITY, items, adapters: [adapter] });
  assert.equal(state.calls, 5, "the cap still caps billed lookups");
  const rows = await factRows(items.map((i) => i.id));
  const daysWithHours = new Set(rows.filter((x) => x.fact_type === "hours").map((x) => Number(/-d(\d)-\d+$/.exec(x.item)![1])));
  assert.deepEqual(Array.from(daysWithHours).sort(), [1, 2, 3, 4, 5]);
  assert.equal(r.looked, 5);

  // A cache reuse costs nothing and spends no cap: re-running for fresh item ids reuses day 1–5's
  // answers AND still looks up five more.
  const again: EnrichItem[] = items.map((i) => ({ ...i, id: `${i.id}-b` }));
  await insertItems(again);
  const r2 = await enrichPlanItems({ tripId: TRIP, market: "kyoto", city: CITY, items: again, adapters: [adapter] });
  assert.equal(r2.cached, 5);
  assert.equal(r2.looked, 5);
  assert.equal(state.calls, 10);
});

test("G5: a two-place 'A Alternative: B' title is looked up as B and never given A's facts", async () => {
  delete process.env.PLACES_LOOKUPS_PER_DRAFT;
  const item: EnrichItem = { id: id("alt"), title: "Fushimi Inari Taisha Alternative: Kiyomizu-dera Temple", type: "attraction", dayNumber: 2 };
  await insertItems([item]);
  const queries: string[] = [];
  // A search for the whole title returns Fushimi Inari (Google's top hit in production).
  const { adapter } = placesFake((q) => {
    queries.push(q);
    return q.startsWith("Fushimi") ? "Fushimi Inari Taisha" : "Kiyomizu-dera";
  });
  const r = await enrichPlanItems({ tripId: TRIP, market: "kyoto", city: CITY, items: [item], adapters: [adapter] });
  assert.equal(queries.length, 1);
  assert.match(queries[0], /^Kiyomizu-dera Temple/);
  assert.doesNotMatch(queries[0], /Fushimi/);
  assert.equal(r.unmatched, 0);
  const rows = await factRows([item.id]);
  assert.ok(rows.some((x) => x.fact_type === "hours"), "Kiyomizu-dera's hours attach");

  // And an answer naming Fushimi Inari for that item is refused outright.
  const fushimiOnly: EnrichItem = { ...item, id: id("alt2"), title: "Fushimi Inari Taisha Alternative: Kiyomizu-dera Temple (2)" };
  await insertItems([fushimiOnly]);
  const { adapter: wrong } = placesFake(() => "Fushimi Inari Taisha");
  const r2 = await enrichPlanItems({ tripId: TRIP, market: "kyoto", city: CITY, items: [fushimiOnly], adapters: [wrong] });
  assert.equal(r2.unmatched, 1);
  assert.deepEqual(await factRows([fushimiOnly.id]), []);
});

test("G6: each item logs its day and outcome; skips log a reason", async () => {
  process.env.PLACES_LOOKUPS_PER_DRAFT = "2";
  const items: EnrichItem[] = [
    { id: id("l1"), title: "Ryozen Kannon", type: "attraction", dayNumber: 1 },
    { id: id("l2"), title: "Shoren-in", type: "attraction", dayNumber: 2 },
    { id: id("l3"), title: "Shimogamo Jinja", type: "attraction", dayNumber: 3 },
    { id: id("l4"), title: "Lunch at Traditional Restaurant", type: "lunch", dayNumber: 3 },
  ];
  await insertItems(items);
  const lines: string[] = [];
  const orig = console.info;
  console.info = (...a: unknown[]) => { lines.push(a.map(String).join(" ")); };
  try {
    const { adapter } = placesFake((q) => (q.startsWith("Shoren") ? "Somewhere Else Entirely" : q.split(",")[0]));
    await enrichPlanItems({ tripId: TRIP, market: "kyoto", city: CITY, items, adapters: [adapter] });
  } finally {
    console.info = orig;
    delete process.env.PLACES_LOOKUPS_PER_DRAFT;
  }
  const facts = lines.filter((l) => l.startsWith("[place-facts]"));
  // Smoke 5: every line carries plan_id and item_id (opaque ids, never a title).
  assert.ok(facts.some((l) => l.includes(`lookup plan_id=${TRIP} item_id=${id("l1")} day=1 outcome=attached `)), facts.join("\n"));
  assert.ok(facts.some((l) => l.includes(`lookup plan_id=${TRIP} item_id=${id("l2")} day=2 outcome=unmatched `)), facts.join("\n"));
  assert.ok(facts.some((l) => l.includes(`skipped plan_id=${TRIP} item_id=${id("l3")} day=3 reason=cap`)), facts.join("\n"));
  assert.ok(facts.some((l) => l.includes(`skipped plan_id=${TRIP} item_id=${id("l4")} day=3 reason=unnamed`)), facts.join("\n"));
  // Every item that stored a fact has a lookup line naming it.
  const r = await db.execute(sql`SELECT DISTINCT itinerary_item_id AS item FROM place_facts WHERE plan_id = ${TRIP} AND itinerary_item_id IN (${id("l1")}, ${id("l2")}, ${id("l3")})`);
  for (const row of r.rows as Array<{ item: string }>) assert.ok(facts.some((l) => l.includes(`item_id=${row.item} `)), `no line for ${row.item}`);
  for (const l of facts) assert.doesNotMatch(l, /Ryozen|Shoren|Shimogamo|Lunch/, "no traveler content in the log");
});

test("G7 smoke 5 item 7: a day whose first place stores no hours tries its next named place next", async () => {
  process.env.PLACES_LOOKUPS_PER_DRAFT = "3";
  const items: EnrichItem[] = [
    { id: id("h1a"), title: "Teramachi Kyogoku", type: "attraction", dayNumber: 1 },
    { id: id("h1b"), title: "Entoku-in", type: "attraction", dayNumber: 1 },
    { id: id("h2a"), title: "Kodai-ji", type: "attraction", dayNumber: 2 },
    { id: id("h3a"), title: "Daisen-in", type: "attraction", dayNumber: 3 },
  ];
  await insertItems(items);
  const queries: string[] = [];
  const { adapter } = placesFake(
    (q) => {
      queries.push(q.split(",")[0]);
      return q.split(",")[0];
    },
    { noHours: (q) => q.startsWith("Teramachi") },
  );
  try {
    await enrichPlanItems({ tripId: TRIP, market: "kyoto", city: CITY, items, adapters: [adapter] });
  } finally {
    delete process.env.PLACES_LOOKUPS_PER_DRAFT;
  }
  // Day 1's first place had no hours, so day 1's next place is tried BEFORE day 2 — then the
  // round-robin resumes. The cap (3) is unchanged, so day 3 waits.
  assert.deepEqual(queries, ["Teramachi Kyogoku", "Entoku-in", "Kodai-ji"]);
  const rows = await factRows(items.map((i) => i.id));
  assert.ok(rows.some((x) => x.item === id("h1b") && x.fact_type === "hours"), "day 1 ends with hours");
  assert.ok(!rows.some((x) => x.item === id("h1a") && x.fact_type === "hours"));
});

test("G8 smoke 5 item 9: an attached Google name replaces the drafted title — only on attach", async () => {
  const typo: EnrichItem = { id: id("bam"), title: "Arashiyama Bamboo Groove", type: "attraction", dayNumber: 4 };
  const off: EnrichItem = { id: id("off"), title: "Shisen-do", type: "attraction", dayNumber: 4 };
  const renamedByTraveler: EnrichItem = { id: id("trv"), title: "Okochi Sanso Villa", type: "attraction", dayNumber: 5 };
  await insertItems([typo, off, renamedByTraveler]);
  // The traveler renamed this one after the draft: its row no longer carries the drafted title.
  await db.execute(sql`UPDATE itinerary_items SET title = 'My garden visit' WHERE id = ${renamedByTraveler.id}`);
  const { adapter } = placesFake((q) => (q.startsWith("Arashiyama") ? "Arashiyama Bamboo Grove" : q.startsWith("Shisen") ? "Somewhere Else Entirely" : "Okochi Sanso Villa"));
  const r = await enrichPlanItems({ tripId: TRIP, market: "kyoto", city: CITY, items: [typo, off, renamedByTraveler], adapters: [adapter] });
  const title = async (itemId: string) =>
    ((await db.execute(sql`SELECT title FROM itinerary_items WHERE id = ${itemId}`)).rows[0] as any).title as string;
  assert.equal(await title(typo.id), "Arashiyama Bamboo Grove", "attached ⇒ the place's own name");
  assert.equal(await title(off.id), "Shisen-do", "unmatched ⇒ never renamed");
  assert.equal(await title(renamedByTraveler.id), "My garden visit", "a traveler's rename is never overwritten");
  assert.equal(r.renamed, 1);
});

test("G10 smoke 7: an area-named title is never looked up and never renamed", async () => {
  const district: EnrichItem = { id: id("dist"), title: "Fushimi Sake District", type: "attraction", dayNumber: 2 };
  const photo: EnrichItem = { id: id("photo"), title: "Yasaka Pagoda Photo Stop", type: "attraction", dayNumber: 2 };
  await insertItems([district, photo]);
  const queries: string[] = [];
  const { adapter, state } = placesFake((q) => {
    queries.push(q);
    return "Kizakura Kappa Country"; // what smoke 7 renamed an area item to
  });
  const r = await enrichPlanItems({ tripId: TRIP, market: "kyoto", city: CITY, items: [district, photo], adapters: [adapter] });
  assert.equal(state.calls, 0, "no lookup for either");
  assert.deepEqual(queries, []);
  assert.equal(r.renamed, 0);
  const titles = (await db.execute(sql`SELECT title FROM itinerary_items WHERE id IN (${district.id}, ${photo.id}) ORDER BY title`)).rows.map((x: any) => x.title);
  assert.deepEqual(titles, ["Fushimi Sake District", "Yasaka Pagoda Photo Stop"]);
  assert.deepEqual(await factRows([district.id, photo.id]), []);
});

test("G11 smoke 7: a rename adopts only a point of interest — a street- or area-typed answer never renames", async () => {
  // The answer MATCHES the item (its words are all in the title), so it attaches — and without the
  // point-of-interest rule it would rename "Sannenzaka Lane" to "Sannenzaka".
  const item: EnrichItem = { id: id("street"), title: "Sannenzaka Lane", type: "attraction", dayNumber: 3 };
  await insertItems([item]);
  const { adapter } = placesFake(() => "Sannenzaka", { types: () => ["route"] });
  const r = await enrichPlanItems({ tripId: TRIP, market: "kyoto", city: CITY, items: [item], adapters: [adapter] });
  const title = ((await db.execute(sql`SELECT title FROM itinerary_items WHERE id = ${item.id}`)).rows[0] as any).title;
  assert.equal(title, "Sannenzaka Lane");
  assert.equal(r.renamed, 0);
  assert.ok((await factRows([item.id])).length > 0, "the facts still attach — only the rename is withheld");
});

test("G9 smoke 5 item 8: the run records progress on its draft and ends with nothing pending", async () => {
  const [{ id: draftId }] = (await db.execute(sql`
    INSERT INTO ai_generated_itineraries (id, trip_id, destination, start_date, end_date)
    VALUES (${id("draft")}, ${TRIP}, ${CITY}, '2027-11-11', '2027-11-15') RETURNING id`)).rows as Array<{ id: string }>;
  const item: EnrichItem = { id: id("prog"), title: "Ryoan-ji", type: "attraction", dayNumber: 1 };
  await insertItems([item]);
  // While it runs, the item is pending; this snapshot is what a mid-run plancard read would see.
  const { LookupProgress } = await import("../services/content-facts/lookup-progress");
  await new LookupProgress(draftId).start([item.id]);
  assert.deepEqual(await pendingFactLookups(TRIP), [item.id]);
  const { adapter } = placesFake((q) => q.split(",")[0]);
  await enrichPlanItems({ tripId: TRIP, market: "kyoto", city: CITY, items: [item], adapters: [adapter], draftId });
  assert.deepEqual(await pendingFactLookups(TRIP), []);
  const row = (await db.execute(sql`SELECT facts_lookup FROM ai_generated_itineraries WHERE id = ${draftId}`)).rows[0] as any;
  assert.equal(row.facts_lookup.status, "done");
  assert.deepEqual(row.facts_lookup.pending, []);
});
