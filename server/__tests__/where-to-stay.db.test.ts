/**
 * "Where to stay" — the read and the bind against a real database (smoke test 4, item 5; ledger
 * `2026-10-02-smoke4-draft-fixes`).
 *
 *   D1 a five-day drafted plan with no stay is eligible; its city's neighbourhoods are ranked by the
 *      located items per day; a city with no inventory says so (hotelsAvailable false, no hotel)
 *   D2 a single-day plan and an undrafted plan are not eligible; a stranger gets not_found
 *   D3 Skip closes an anchored lodging set with nothing chosen, and the panel is then gone
 *   D4 "I've got lodging sorted" with a neighbourhood puts a stay on the plan with NO coordinates
 *   D5 §13 — a drafted plan whose stops have no coordinates says so (no_located_items), never that the
 *      city has no neighbourhoods; a city with none says that (no_neighborhoods)
 *
 * DISPOSABLE DB ONLY: every row is keyed by a per-run prefix and deleted afterwards.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db, pool } from "../db";
import { bindWhereToStay, loadWhereToStay } from "../services/where-to-stay.service";

const RUN = crypto.randomUUID().slice(0, 8);
const id = (s: string) => `wts-${RUN}-${s}`;
const OWNER = id("owner");
const STRANGER = id("stranger");
const CITY = `Staytown${RUN}`;
const T5 = id("five");
const T5B = id("five-b");
const T1 = id("one");
const T0 = id("empty");
const TU = id("unlocated");
const TN = id("nowhere");

async function trip(tripId: string, start: string, end: string) {
  await db.execute(sql`
    INSERT INTO trips (id, user_id, title, destination, start_date, end_date, status, event_type)
    VALUES (${tripId}, ${OWNER}, ${`Stay ${RUN}`}, ${`${CITY}, Japan`}, ${start}, ${end}, 'draft', 'vacation')
  `);
}

async function item(tripId: string, day: number, lat: number, lng: number, k: number) {
  await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, day_number, title, item_type, origin, latitude, longitude)
    VALUES (${id(`${tripId}-${day}-${k}`)}, ${tripId}, ${day}, ${`Stop ${day}.${k}`}, 'attraction', 'ai', ${String(lat)}, ${String(lng)})`);
}

before(async () => {
  const host = new URL(process.env.DATABASE_URL ?? "postgres://localhost").hostname.toLowerCase();
  if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
    throw new Error("refusing to write fixtures to a non-disposable database");
  }
  for (const u of [OWNER, STRANGER]) await db.execute(sql`INSERT INTO users (id, email, role) VALUES (${u}, ${`${u}@t.test`}, 'traveler')`);
  for (const [slug, name, lat, lng] of [
    ["east", "East Ward", 35.0, 135.78],
    ["west", "West Ward", 35.0, 135.67],
    ["south", "South Ward", 34.98, 135.76],
  ] as const) {
    await db.execute(sql`INSERT INTO city_neighborhoods (id, city, country, name, slug, centroid_lat, centroid_lng)
      VALUES (${id(slug)}, ${CITY}, 'Japan', ${name}, ${`${slug}-${RUN}`}, ${String(lat)}, ${String(lng)})`);
  }
  for (const t of [T5, T5B]) {
    await trip(t, "2027-11-11", "2027-11-15");
    for (const d of [1, 2, 4, 5]) await item(t, d, 35.001, 135.781, 1);
    await item(t, 3, 35.0, 135.671, 1);
  }
  await trip(T1, "2027-11-11", "2027-11-11");
  await item(T1, 1, 35.0, 135.78, 1);
  await trip(T0, "2027-11-11", "2027-11-15");
  await trip(TU, "2027-11-11", "2027-11-15");
  await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, day_number, title, item_type, origin)
    VALUES (${id("tu-1")}, ${TU}, 1, 'Explore', 'attraction', 'ai')`);
  await db.execute(sql`
    INSERT INTO trips (id, user_id, title, destination, start_date, end_date, status, event_type)
    VALUES (${TN}, ${OWNER}, ${`Nowhere ${RUN}`}, ${`Nowhereville${RUN}, Japan`}, '2027-11-11', '2027-11-15', 'draft', 'vacation')
  `);
  await item(TN, 1, 35.0, 135.78, 1);
});

after(async () => {
  try {
    await db.execute(sql`DELETE FROM plan_options WHERE set_id IN (SELECT id FROM plan_option_sets WHERE trip_id LIKE ${`wts-${RUN}-%`})`);
    await db.execute(sql`DELETE FROM plan_option_sets WHERE trip_id LIKE ${`wts-${RUN}-%`}`);
    await db.execute(sql`DELETE FROM itinerary_items WHERE trip_id LIKE ${`wts-${RUN}-%`}`);
    await db.execute(sql`DELETE FROM funnel_events WHERE trip_id LIKE ${`wts-${RUN}-%`}`).catch(() => {});
    await db.execute(sql`DELETE FROM trips WHERE id LIKE ${`wts-${RUN}-%`}`);
    await db.execute(sql`DELETE FROM city_neighborhoods WHERE city = ${CITY}`);
    await db.execute(sql`DELETE FROM users WHERE id IN (${OWNER}, ${STRANGER})`);
  } finally {
    await pool.end();
  }
});

test("D1 a drafted five-day plan is ranked by its own days; no inventory is said, not invented", async () => {
  const view = await loadWhereToStay(T5, OWNER);
  assert.equal(view.eligible, true);
  assert.equal(view.basis, "straight_line");
  assert.deepEqual(view.neighborhoods.map((n) => n.name), ["East Ward", "West Ward", "South Ward"]);
  assert.equal(view.neighborhoods[0].reason, "closest to 4 of your 5 days");
  assert.equal(view.neighborhoods[1].reason, "closest to 1 of your 5 days");
  assert.equal(view.unranked, undefined, "a ranked view carries no empty-state reason");
  assert.equal(view.hotelsAvailable, false);
  for (const n of view.neighborhoods) assert.deepEqual(n.hotels, []);
  assert.doesNotMatch(JSON.stringify(view), /minutes|meters|"lat"|"lng"/);
});

test("D2 single-day, undrafted and a stranger's plan get no panel", async () => {
  assert.equal((await loadWhereToStay(T1, OWNER)).reason, "single_day");
  assert.equal((await loadWhereToStay(T0, OWNER)).reason, "no_draft");
  assert.equal((await loadWhereToStay(T5, STRANGER)).reason, "not_found");
});

test("D3 Skip closes an anchored lodging set with nothing chosen, and the panel is gone", async () => {
  const out = await bindWhereToStay(T5, OWNER, { kind: "skip" });
  assert.equal(out.itemId, null);
  const r = await db.execute(sql`SELECT status, category_key, anchor_role, chosen_option_id FROM plan_option_sets WHERE id = ${out.setId}`);
  const set = r.rows[0] as any;
  assert.equal(set.status, "closed");
  assert.equal(set.category_key, "accommodation");
  assert.ok(set.anchor_role);
  assert.equal(set.chosen_option_id, null);
  assert.equal((await loadWhereToStay(T5, OWNER)).reason, "decided");
  await assert.rejects(bindWhereToStay(T5, OWNER, { kind: "skip" }), /already says where you're staying/);
});

test("D4 'I've got lodging sorted' with a neighbourhood adds a stay with no coordinates", async () => {
  const out = await bindWhereToStay(T5B, OWNER, { kind: "own", hotelName: null, neighborhoodSlug: `east-${RUN}` });
  assert.ok(out.itemId);
  const r = await db.execute(sql`SELECT item_type, title, location_name, latitude, longitude FROM itinerary_items WHERE id = ${out.itemId}`);
  const row = r.rows[0] as any;
  assert.equal(row.item_type, "accommodation");
  assert.equal(row.title, "Staying in East Ward");
  assert.equal(row.location_name, "East Ward");
  assert.equal(row.latitude, null);
  assert.equal(row.longitude, null);
  await assert.rejects(bindWhereToStay(T5B, STRANGER, { kind: "skip" }), /No such plan/);
});

test("D5 §13 — an empty ranking names its real reason", async () => {
  const unlocated = await loadWhereToStay(TU, OWNER);
  assert.equal(unlocated.eligible, true);
  assert.deepEqual(unlocated.neighborhoods, []);
  assert.equal(unlocated.unranked, "no_located_items");
  const nowhere = await loadWhereToStay(TN, OWNER);
  assert.equal(nowhere.eligible, true);
  assert.equal(nowhere.unranked, "no_neighborhoods");
});
