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
 *
 * DISPOSABLE DB ONLY: every row is keyed by a per-run prefix and deleted afterwards.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db, pool } from "../db";
import { enrichPlanItems, lookupOrder, type EnrichItem } from "../services/content-facts/place-facts.service";
import { PlacesAdapter } from "../services/content-facts/places-adapter";
import { matchNamesItem, namedPlaceTokens } from "@shared/place-name-gate";

const RUN = crypto.randomUUID().slice(0, 8);
const id = (s: string) => `png-${RUN}-${s}`;
const OWNER = id("owner");
const TRIP = id("trip");
const CITY = "Kyoto, Japan";
const GENERIC = ["Dinner at Local Izakaya", "Lunch at Traditional Restaurant", "Traditional Tea Ceremony Experience"];

/** A fake Places API. `answer(query)` names the place returned; every call is counted. */
function placesFake(answer: (query: string) => string) {
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
            regularOpeningHours: { weekdayDescriptions: [`Monday: ${RUN}`] },
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
