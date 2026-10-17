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
 *   G12 R-u (surface step 3): two PLANS naming one place by DIFFERENT titles make ONE billed lookup —
 *       the cache key is Google's place ID (resolved by the no-charge IDs-only search), so the
 *       second plan's facts come from that cache at 0 cost, with the original fetch's own checkedAt
 *   G13 R-u: the allocator reaches ≥ 2 named items on EVERY day within the cap (round-robin across
 *       days before any day's third)
 *   G15 PF-1 (ledger `2026-10-11-pf1-lookup-outcomes`): every item a run touches gets ONE outcome row —
 *       attached / unmatched / capped(draft_cap) / skipped(no_named_tokens | area_title) — ids only, one
 *       run id, the trigger stored; the log lines print the same enum (ruling 4)
 *   G16 PF-1: a Maps-gate refusal is `capped` with maps_id_lookup or maps_details; a thrown lookup is
 *       `error` with a code, never the message
 *   G17 PF-1: retention prunes rows past the config window; counts group by outcome/reason in a window;
 *       the plan view gives each item's LATEST outcome with its CURRENT title (null once deleted)
 *   G18 PF-1: a failed outcome write never fails the lookup; a failed prune is the facts-recheck job's
 *       error but the re-check still runs
 *
 * DISPOSABLE DB ONLY: every row is keyed by a per-run prefix and deleted afterwards.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db, pool } from "../db";
import { enrichPlanItems, lookupOrder, pendingFactLookups, type EnrichItem } from "../services/content-facts/place-facts.service";
import { latestLookupOutcomesForPlan, lookupOutcomeCounts, pruneLookupOutcomes, recordLookupOutcomes } from "../services/content-facts/lookup-outcomes.service";
import { runFactsRecheck } from "../jobs/factsRecheck";
import { PlacesAdapter } from "../services/content-facts/places-adapter";
import { matchNamesItem, namedPlaceTokens } from "@shared/place-name-gate";

const RUN = crypto.randomUUID().slice(0, 8);
const id = (s: string) => `png-${RUN}-${s}`;
const OWNER = id("owner");
const TRIP = id("trip");
const TRIP2 = id("trip2");
const CITY = "Kyoto, Japan";
const GENERIC = ["Dinner at Local Izakaya", "Lunch at Traditional Restaurant", "Traditional Tea Ceremony Experience"];

/**
 * A fake Places API. `answer(query)` names the place returned. R-u (surface step 3): it serves the
 * no-charge IDs-only search (`X-Goog-FieldMask: places.id`) and the BILLED Place Details by ID.
 * `state.calls` counts BILLED calls only; `state.idCalls` the free ID resolutions. The place ID is
 * derived from the ANSWER's name, so two titles naming one place resolve to one ID.
 */
function placesFake(
  answer: (query: string) => string,
  opts: {
    types?: (query: string) => string[];
    address?: (query: string) => { formattedAddress?: string; addressComponents?: unknown[] } | null;
  } = {},
) {
  const state = { calls: 0, idCalls: 0, billed: [] as string[] };
  const byId = new Map<string, { q: string; name: string }>();
  const placeFor = (q: string) => {
    const name = answer(q);
    const pid = `${id("place")}-${crypto.createHash("sha1").update(name).digest("hex").slice(0, 10)}`;
    byId.set(pid, { q, name });
    return { pid, name };
  };
  const full = (pid: string, q: string, name: string) => ({
    id: pid,
    displayName: { text: name },
    location: { latitude: 35.0, longitude: 135.7 },
    // Smoke 7: Google's types — a point of interest by default; a test can answer an area.
    types: opts.types?.(q) ?? ["tourist_attraction", "point_of_interest", "establishment"],
    ...(opts.address?.(q) ?? {}),
  });
  const adapter = new PlacesAdapter(
    async (url, init) => {
      if (init.method === "GET") {
        state.calls += 1;
        const pid = decodeURIComponent(url.split("/places/")[1].split("?")[0]);
        const { q, name } = byId.get(pid)!;
        state.billed.push(q.split(",")[0]);
        return { ok: true, status: 200, json: async () => full(pid, q, name) };
      }
      const q = JSON.parse(init.body!).textQuery as string;
      const { pid, name } = placeFor(q);
      if (init.headers["X-Goog-FieldMask"] === "places.id") {
        state.idCalls += 1;
        return { ok: true, status: 200, json: async () => ({ places: [{ id: pid }] }) };
      }
      state.calls += 1;
      state.billed.push(q.split(",")[0]);
      return { ok: true, status: 200, json: async () => ({ places: [full(pid, q, name)] }) };
    },
    () => "test-key",
    () => true,
  );
  return { adapter, state };
}

async function insertItems(items: EnrichItem[]) {
  for (const i of items) {
    await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, day_number, title, item_type, origin, location_name)
      VALUES (${i.id}, ${TRIP}, ${i.dayNumber ?? 1}, ${i.title}, ${i.type ?? "attraction"}, 'ai', ${i.locationName ?? null})`);
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
  await db.execute(sql`
    INSERT INTO trips (id, user_id, title, destination, start_date, end_date, status, event_type)
    VALUES (${TRIP2}, ${OWNER}, ${`Gate plan 2 ${RUN}`}, ${CITY}, '2027-12-01', '2027-12-03', 'draft', 'vacation')
  `);
});

after(async () => {
  try {
    await db.execute(sql`DELETE FROM place_facts WHERE plan_id IN (${TRIP}, ${TRIP2}) OR place_ref LIKE ${`png-${RUN}-%`}`);
    await db.execute(sql`DELETE FROM place_lookup_outcomes WHERE trip_id LIKE ${`png-${RUN}-%`}`);
    await db.execute(sql`DELETE FROM itinerary_items WHERE trip_id = ${TRIP2}`);
    await db.execute(sql`DELETE FROM trips WHERE id = ${TRIP2}`);
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
  // GH-1: no Google hours are stored, so "facts on every day" is read off the location rows.
  const daysWithFacts = new Set(rows.filter((x) => x.fact_type === "location").map((x) => Number(/-d(\d)-\d+$/.exec(x.item)![1])));
  assert.deepEqual(Array.from(daysWithFacts).sort(), [1, 2, 3, 4, 5]);
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
  assert.ok(rows.some((x) => x.fact_type === "location"), "Kiyomizu-dera's location attaches");

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
  // PF-1 ruling 4: the old merged `cap` / `unnamed` are split — this cap is the draft's own cap, and this
  // skip names no place at all.
  assert.ok(facts.some((l) => l.includes(`capped plan_id=${TRIP} item_id=${id("l3")} day=3 reason=draft_cap`)), facts.join("\n"));
  assert.ok(facts.some((l) => l.includes(`skipped plan_id=${TRIP} item_id=${id("l4")} day=3 reason=no_named_tokens`)), facts.join("\n"));
  // Every item that stored a fact has a lookup line naming it.
  const r = await db.execute(sql`SELECT DISTINCT itinerary_item_id AS item FROM place_facts WHERE plan_id = ${TRIP} AND itinerary_item_id IN (${id("l1")}, ${id("l2")}, ${id("l3")})`);
  for (const row of r.rows as Array<{ item: string }>) assert.ok(facts.some((l) => l.includes(`item_id=${row.item} `)), `no line for ${row.item}`);
  for (const l of facts) assert.doesNotMatch(l, /Ryozen|Shoren|Shimogamo|Lunch/, "no traveler content in the log");
});

test("G7 smoke 5 item 7: a day whose first place attaches nothing tries its next named place next", async () => {
  process.env.PLACES_LOOKUPS_PER_DRAFT = "3";
  const items: EnrichItem[] = [
    { id: id("h1a"), title: "Teramachi Kyogoku", type: "attraction", dayNumber: 1 },
    { id: id("h1b"), title: "Entoku-in", type: "attraction", dayNumber: 1 },
    { id: id("h2a"), title: "Kodai-ji", type: "attraction", dayNumber: 2 },
    { id: id("h3a"), title: "Daisen-in", type: "attraction", dayNumber: 3 },
  ];
  await insertItems(items);
  // GH-1: the scheduler keys on "attached", so Teramachi's answer names another place and attaches nothing.
  const { adapter, state } = placesFake((q) => (q.startsWith("Teramachi") ? `Nishiki Market ${RUN} g7` : q.split(",")[0]));
  try {
    await enrichPlanItems({ tripId: TRIP, market: "kyoto", city: CITY, items, adapters: [adapter] });
  } finally {
    delete process.env.PLACES_LOOKUPS_PER_DRAFT;
  }
  // Day 1's first place attached nothing, so day 1's next place is tried BEFORE day 2 — then the
  // round-robin resumes. The cap (3) is unchanged, so day 3 waits. R-u: the cap governs BILLED
  // fetches — `state.billed` — while a capped item may still resolve its ID for free.
  assert.deepEqual(state.billed, ["Teramachi Kyogoku", "Entoku-in", "Kodai-ji"]);
  const rows = await factRows(items.map((i) => i.id));
  assert.ok(rows.some((x) => x.item === id("h1b") && x.fact_type === "location"), "day 1 ends with facts");
  assert.ok(!rows.some((x) => x.item === id("h1a") && x.fact_type === "location"));
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

test("G12 R-u: two plans sharing a place make one billed lookup; the second costs 0", async () => {
  delete process.env.PLACES_LOOKUPS_PER_DRAFT;
  // Two plans call the SAME place by DIFFERENT titles — the key is the place ID, not the text.
  const place = `Shisen-do ${RUN}`;
  const a: EnrichItem = { id: id("share-a"), title: place, type: "attraction", dayNumber: 1 };
  await insertItems([a]);
  const titleB = `Morning at Shisen-do ${RUN} gardens`;
  const b: EnrichItem = { id: id("share-b"), title: titleB, type: "attraction", dayNumber: 1 };
  await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, day_number, title, item_type, origin) VALUES (${b.id}, ${TRIP2}, 1, ${titleB}, 'attraction', 'ai')`);
  const { adapter, state } = placesFake(() => place);
  const r1 = await enrichPlanItems({ tripId: TRIP, market: "kyoto", city: CITY, items: [a], adapters: [adapter] });
  const r2 = await enrichPlanItems({ tripId: TRIP2, market: "kyoto", city: CITY, items: [b], adapters: [adapter] });
  assert.equal(state.calls, 1, "Places is asked once for the shared place");
  assert.equal(r1.looked, 1);
  assert.equal(r2.looked, 0, "a cached place costs nothing");
  assert.equal(r2.cached, 1);
  const rows = (await db.execute(sql`SELECT plan_id, fetched_at FROM place_facts WHERE itinerary_item_id IN (${a.id}, ${b.id}) AND fact_type = 'location'`)).rows as any[];
  assert.equal(new Set(rows.map((x) => x.plan_id)).size, 2, "both plans hold the fact");
  assert.equal(new Set(rows.map((x) => new Date(x.fetched_at).getTime())).size, 1, "with the original fetch's own checkedAt");
});

test("G13 R-u: every day gets two named items looked up before any day's third", async () => {
  process.env.PLACES_LOOKUPS_PER_DRAFT = "6";
  const venues = [
    [`Hokan-ji ${RUN}`, `Kodai-ji ${RUN}`, `Entoku-in ${RUN}`],
    [`Daigo-ji ${RUN}`, `Zuishin-in ${RUN}`, `Kanshuji ${RUN}`],
    [`Enryaku-ji ${RUN}`, `Sanzen-in ${RUN}`, `Jakko-in ${RUN}`],
  ];
  const items: EnrichItem[] = [];
  venues.forEach((day, d) => day.forEach((title, k) => items.push({ id: id(`two-d${d + 1}-${k}`), title, type: "attraction", dayNumber: d + 1 })));
  await insertItems(items);
  const { adapter, state } = placesFake((q) => q.split(",")[0]);
  await enrichPlanItems({ tripId: TRIP, market: "kyoto", city: CITY, items, adapters: [adapter] });
  assert.equal(state.calls, 6);
  const rows = await factRows(items.map((i) => i.id));
  const perDay = new Map<number, Set<string>>();
  for (const x of rows.filter((x) => x.fact_type === "location")) {
    const d = Number(/-two-d(\d)-\d+$/.exec(x.item)![1]);
    perDay.set(d, (perDay.get(d) ?? new Set()).add(x.item));
  }
  assert.deepEqual([1, 2, 3].map((d) => perDay.get(d)?.size ?? 0), [2, 2, 2], "two named items per day within a cap of six");
  delete process.env.PLACES_LOOKUPS_PER_DRAFT;
});

test("G14 smoke 9 S9-7: Google's addressComponents area replaces the AI's area — Nijo Castle → 'Nakagyo Ward, Kyoto'", async () => {
  // The stored smoke-6 fixture: the draft wrote "541 Nijocho, Horikawa-nishi-iru, Shimogyo Ward, Kyoto"
  // (the wrong ward). Google's components for Nijō Castle name Nakagyo Ward.
  const NIJO_COMPONENTS = [
    { longText: "541", types: ["street_number"] },
    { longText: "Nijojocho", types: ["sublocality_level_2", "sublocality", "political"] },
    { longText: "Nakagyo Ward", types: ["ward", "political"] },
    { longText: "Kyoto", types: ["locality", "political"] },
    { longText: "Kyoto", types: ["administrative_area_level_1", "political"] },
    { longText: "Japan", types: ["country", "political"] },
  ];
  const nijo: EnrichItem = { id: id("nijo"), title: "Nijō Castle", type: "attraction", dayNumber: 2, locationName: "541 Nijocho, Horikawa-nishi-iru, Shimogyo Ward, Kyoto" };
  const edited: EnrichItem = { id: id("nijo-edit"), title: "Nishiki Market", type: "attraction", dayNumber: 2, locationName: "Nishiki" };
  await insertItems([nijo, edited]);
  // The traveler edited this row's location after the draft: it is never overwritten.
  await db.execute(sql`UPDATE itinerary_items SET location_name = 'Our meeting spot' WHERE id = ${edited.id}`);
  const { adapter } = placesFake((q) => (q.startsWith("Nij") ? "Nijō Castle" : "Nishiki Market"), {
    address: (q) =>
      q.startsWith("Nij")
        ? { formattedAddress: "541 Nijojocho, Nakagyo Ward, Kyoto, 604-8301, Japan", addressComponents: NIJO_COMPONENTS }
        : { formattedAddress: "Nakagyo Ward, Kyoto, Japan", addressComponents: [{ longText: "Nakagyo Ward", types: ["ward"] }, { longText: "Kyoto", types: ["locality"] }] },
  });
  const r = await enrichPlanItems({ tripId: TRIP, market: "kyoto", city: CITY, items: [nijo, edited], adapters: [adapter] });
  const loc = async (itemId: string) =>
    ((await db.execute(sql`SELECT location_name FROM itinerary_items WHERE id = ${itemId}`)).rows[0] as any).location_name as string;
  assert.equal(await loc(nijo.id), "Nakagyo Ward, Kyoto", "the AI's area is replaced by Google's");
  assert.equal(await loc(edited.id), "Our meeting spot", "a traveler's edit is never overwritten");
  assert.equal(r.areas, 1);
  // Stored WITH the facts: the address fact carries the same area, with its Google provenance.
  const fact = (await db.execute(sql`SELECT value, origin FROM place_facts WHERE plan_id = ${TRIP} AND itinerary_item_id = ${nijo.id} AND fact_type = 'address' AND superseded_by IS NULL`)).rows[0] as any;
  assert.equal(fact.origin, "places_api");
  assert.equal(fact.value.area, "Nakagyo Ward, Kyoto");
});


const outcomeRows = async (tripId: string, itemIds: string[]) =>
  (await db.execute(sql`SELECT * FROM place_lookup_outcomes WHERE trip_id = ${tripId} AND itinerary_item_id IN (${sql.join(itemIds.map((i) => sql`${i}`), sql`, `)}) ORDER BY itinerary_item_id`)).rows as any[];

test("G15 PF-1: one outcome row per item touched — ids only, one run, the trigger, the log's own enum", async () => {
  process.env.PLACES_LOOKUPS_PER_DRAFT = "2";
  const items: EnrichItem[] = [
    { id: id("o1"), title: `Ryozen Kannon ${RUN}`, type: "attraction", dayNumber: 1 },
    { id: id("o2"), title: `Shoren-in ${RUN}`, type: "attraction", dayNumber: 2 },
    { id: id("o3"), title: `Honen-in ${RUN}`, type: "attraction", dayNumber: 3 },
    { id: id("o4"), title: "Lunch at Traditional Restaurant", type: "lunch", dayNumber: 3 },
    { id: id("o5"), title: "Higashiyama District", type: "attraction", dayNumber: 1 },
  ];
  await insertItems(items);
  const lines: string[] = [];
  const orig = console.info;
  console.info = (...a: unknown[]) => { lines.push(a.map(String).join(" ")); };
  let r;
  try {
    const { adapter } = placesFake((q) => (q.startsWith("Shoren") ? `Somewhere Else Entirely ${RUN}` : q.split(",")[0]));
    r = await enrichPlanItems({ tripId: TRIP, market: "kyoto", city: CITY, items, adapters: [adapter], trigger: "draft" });
  } finally {
    console.info = orig;
    delete process.env.PLACES_LOOKUPS_PER_DRAFT;
  }
  const rows = await outcomeRows(TRIP, items.map((i) => i.id));
  const by = new Map(rows.map((x) => [x.itinerary_item_id, x]));
  assert.equal(rows.length, 5, "one row per item");
  assert.deepEqual([by.get(id("o1")).outcome, by.get(id("o1")).reason], ["attached", null]);
  assert.deepEqual([by.get(id("o2")).outcome, by.get(id("o2")).reason], ["unmatched", null]);
  assert.deepEqual([by.get(id("o3")).outcome, by.get(id("o3")).reason], ["capped", "draft_cap"]);
  assert.deepEqual([by.get(id("o4")).outcome, by.get(id("o4")).reason], ["skipped", "no_named_tokens"]);
  assert.deepEqual([by.get(id("o5")).outcome, by.get(id("o5")).reason], ["skipped", "area_title"]);
  assert.equal(new Set(rows.map((x) => x.run_id)).size, 1, "one run");
  assert.equal(rows[0].run_id, r!.runId);
  for (const x of rows) assert.equal(x.run_trigger, "draft");
  assert.ok(by.get(id("o1")).place_id, "an attached row names its place id");
  assert.equal(by.get(id("o1")).cache, "miss");
  // Ids only: no title text anywhere in a row.
  const blob = JSON.stringify(rows);
  for (const t of ["Ryozen", "Shoren", "Honen", "Lunch", "Higashiyama"]) assert.doesNotMatch(blob, new RegExp(t), t);
  // The log prints the same words the rows store (ruling 4).
  const logs = lines.filter((l) => l.startsWith("[place-facts]"));
  assert.ok(logs.some((l) => l.includes(`skipped plan_id=${TRIP} item_id=${id("o5")} day=1 reason=area_title`)), logs.join("\n"));
  assert.ok(logs.some((l) => l.includes(`item_id=${id("o2")} day=2 outcome=unmatched `)), logs.join("\n"));
});

test("G16 PF-1: a Maps-gate refusal is capped with its reason; a thrown lookup is an error code, not a message", async () => {
  delete process.env.PLACES_LOOKUPS_PER_DRAFT;
  const items: EnrichItem[] = [
    { id: id("m1"), title: `Ninna-ji ${RUN}`, type: "attraction", dayNumber: 1 },
    { id: id("m2"), title: `Myoshin-ji ${RUN}`, type: "attraction", dayNumber: 2 },
  ];
  await insertItems(items);
  const { adapter } = placesFake((q) => q.split(",")[0]);
  // Ninna-ji: the IDs-only search refused. Myoshin-ji: the ID resolves, then the billed Details call is refused.
  const gate = async <T,>(key: "places_id_lookup" | "places_details", call: () => Promise<T>) => {
    if (key === "places_id_lookup") {
      const v = await call();
      return String(v).length && refuseIdFor.has(seen++) ? { refused: "cap" } : { value: v };
    }
    return { refused: "cap" };
  };
  let seen = 0;
  const refuseIdFor = new Set([0]);
  await enrichPlanItems({ tripId: TRIP, market: "kyoto", city: CITY, items, adapters: [adapter], placesGate: gate as any, trigger: "facts_recheck" });
  const rows = new Map((await outcomeRows(TRIP, items.map((i) => i.id))).map((x) => [x.itinerary_item_id, x]));
  assert.deepEqual([rows.get(id("m1")).outcome, rows.get(id("m1")).reason], ["capped", "maps_id_lookup"]);
  assert.deepEqual([rows.get(id("m2")).outcome, rows.get(id("m2")).reason], ["capped", "maps_details"]);
  assert.equal(rows.get(id("m1")).run_trigger, "facts_recheck");

  // A lookup that throws is `error` with the error's code — never its message.
  const boom: EnrichItem = { id: id("m3"), title: "Kurama-dera", type: "attraction", dayNumber: 3 };
  await insertItems([boom]);
  const thrower = {
    name: "places",
    covers: () => true,
    attribution: () => ({ sourceName: "x", sourceUrl: null, license: "restricted" as const }),
    fetch: async () => {
      throw Object.assign(new Error("Kurama-dera, Kyoto timed out"), { code: "ETIMEDOUT" });
    },
  };
  await enrichPlanItems({ tripId: TRIP, market: "kyoto", city: CITY, items: [boom], adapters: [thrower as any] });
  const [err] = await outcomeRows(TRIP, [boom.id]);
  assert.deepEqual([err.outcome, err.reason, err.run_trigger], ["error", "ETIMEDOUT", null]);
});

test("G17 PF-1: retention prunes past the window; counts group in a window; the plan view is latest-per-item", async () => {
  const PLAN = id("ret-plan");
  const keep: EnrichItem = { id: id("r1"), title: "Okutan", type: "dinner", dayNumber: 1 };
  const gone = id("r2-deleted");
  await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, start_date, end_date, status, event_type)
    VALUES (${PLAN}, ${OWNER}, ${`Ret plan ${RUN}`}, ${CITY}, '2027-11-11', '2027-11-12', 'draft', 'vacation')`);
  await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, day_number, title, item_type, origin) VALUES (${keep.id}, ${PLAN}, 1, ${keep.title}, 'dinner', 'ai')`);
  const now = new Date("2026-10-11T12:00:00Z");
  const day = 24 * 60 * 60 * 1000;
  const base = { day: 1, placeId: null, cache: null, costCents: null, latencyMs: null };
  await recordLookupOutcomes({ runId: id("run-old"), runStartedAt: new Date(now.getTime() - 120 * day), trigger: "draft" }, [
    { ...base, tripId: PLAN, itemId: keep.id, outcome: "skipped", reason: "no_named_tokens" },
  ]);
  await recordLookupOutcomes({ runId: id("run-new"), runStartedAt: new Date(now.getTime() - 2 * day), trigger: "facts_recheck" }, [
    { ...base, tripId: PLAN, itemId: keep.id, outcome: "unmatched", reason: null },
    { ...base, tripId: PLAN, itemId: gone, outcome: "no_place", reason: null, day: 2 },
  ]);
  // Rows are stamped created_at = now() by the DB; age the "old" run's row to match its run start.
  await db.execute(sql`UPDATE place_lookup_outcomes SET created_at = run_started_at WHERE trip_id = ${PLAN}`);

  const view = await latestLookupOutcomesForPlan(PLAN);
  assert.deepEqual(view.map((v) => [v.itemId, v.outcome, v.itemTitle]), [
    [keep.id, "unmatched", "Okutan"],
    [gone, "no_place", null],
  ], "latest per item; a deleted item has no title rather than an invented one");

  const counts = await lookupOutcomeCounts(7, now);
  const mine = (await db.execute(sql`SELECT outcome, count(*)::int AS n FROM place_lookup_outcomes WHERE trip_id = ${PLAN} AND created_at >= ${new Date(now.getTime() - 7 * day)} GROUP BY outcome`)).rows as any[];
  for (const m of mine) assert.ok(counts.counts.some((c) => c.outcome === m.outcome && c.count >= m.n), m.outcome);
  assert.equal(counts.days, 7);

  process.env.PLACE_LOOKUP_OUTCOME_RETENTION_DAYS = "90";
  try {
    const before = (await db.execute(sql`SELECT count(*)::int AS n FROM place_lookup_outcomes WHERE trip_id = ${PLAN}`)).rows[0] as any;
    assert.equal(before.n, 3);
    const deleted = await pruneLookupOutcomes(now);
    assert.ok(deleted >= 1);
    const left = (await db.execute(sql`SELECT run_id FROM place_lookup_outcomes WHERE trip_id = ${PLAN}`)).rows as any[];
    assert.deepEqual(left.map((x) => x.run_id).sort(), [id("run-new"), id("run-new")], "only the run inside the window survives");
  } finally {
    delete process.env.PLACE_LOOKUP_OUTCOME_RETENTION_DAYS;
    await db.execute(sql`DELETE FROM itinerary_items WHERE trip_id = ${PLAN}`);
    await db.execute(sql`DELETE FROM trips WHERE id = ${PLAN}`);
  }
});

test("G18 PF-1: a failed outcome write never throws; a failed prune is the job's error and the re-check still runs", async () => {
  const n = await recordLookupOutcomes({ runId: id("run-bad"), runStartedAt: new Date(), trigger: null }, [
    { tripId: null as any, itemId: id("x"), day: 1, outcome: "attached", reason: null, placeId: null, cache: null, costCents: null, latencyMs: null },
  ]);
  assert.equal(n, 0, "the write failed, and said so by returning 0 — no throw");

  let relooked = 0;
  const r = await runFactsRecheck(new Date(), {
    pruneLookupOutcomes: async () => {
      throw new Error("db down");
    },
    candidates: async () => [{ id: id("rc"), userId: OWNER, destination: CITY, marketSlug: "kyoto" }],
    relookup: async () => {
      relooked += 1;
    },
    findings: async () => [],
    notifyOnce: async () => false,
    legRecheck: async () => ({ checked: 0, changed: 0, broken: 0, notified: 0 }) as any,
  });
  assert.equal(relooked, 1, "the re-check ran");
  assert.equal(r.checked, 1);
  assert.match(r.error ?? "", /lookup-outcomes prune failed: db down/);
});
