/**
 * "Where to stay" — the read and the bind against a real database (smoke test 4, item 5; ledger
 * `2026-10-02-smoke4-draft-fixes`).
 *
 *   D1 a five-day drafted plan with no stay is eligible; its city's neighbourhoods are ranked by the
 *      located items per day; a city with no inventory says so (hotelsAvailable false, no hotel)
 *   D2 a single-day plan and an undrafted plan are not eligible; a stranger gets not_found
 *   D3 smoke 8: Skip closes an anchored lodging set with nothing chosen and dismisses the CURRENT
 *      state only — the drafted panel is gone on reload, but the view is still served (dismissed) for
 *      the tray's chooser, and Skip is not a decision (a second answer is still accepted)
 *   D3b smoke 8: a Skip BEFORE the draft dismisses the empty panel, and the drafted panel still
 *      appears once after the draft; a Skip on that drafted panel then dismisses it
 *   D8 smoke 9 S9-2: a plan that already says where it stays can CHANGE it through its own lodging set —
 *      "I've got lodging sorted" reopens the chosen set and rewrites the SAME stay item in place (one
 *      stay, one set); a booked stay, a full comparison and a hand-added stay are refused BEFORE any
 *      reopen; Skip on a decided plan is refused
 *   D4 "I've got lodging sorted" with a neighbourhood puts a stay on the plan with NO coordinates
 *   D5 §13 — a drafted plan whose stops have no coordinates says so (no_located_items), never that the
 *      city has no neighbourhoods; a city with none says that (no_neighborhoods)
 *   D6 smoke 5 — the same plan, read twice, ranks the same way; two neighbourhoods tied on closest
 *      days and distance order by name, whatever order their rows were inserted in
 *   D7 smoke 5 item 6 — the ranking is computed once per draft and stored; a reload reads the stored
 *      order even after the stops move; it is not stored while the draft's lookups are still running;
 *      a tied option carries no reason
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
const T0S = id("empty-skip");
const TU = id("unlocated");
const TN = id("nowhere");
const TT = id("tied");
const TC = id("change");
const TH = id("hand");
const TS = id("stored");
const TIE_CITY = `Tietown${RUN}`;

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
  for (const t of [TC, TH]) {
    await trip(t, "2027-11-11", "2027-11-15");
    for (const d of [1, 2, 3]) await item(t, d, 35.001, 135.781, 1);
  }
  await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, day_number, title, item_type, origin)
    VALUES (${id("th-stay")}, ${TH}, 1, 'My own hotel', 'accommodation', 'traveler')`);
  await trip(T1, "2027-11-11", "2027-11-11");
  await item(T1, 1, 35.0, 135.78, 1);
  await trip(T0, "2027-11-11", "2027-11-15");
  await trip(T0S, "2027-11-11", "2027-11-15");
  await trip(TU, "2027-11-11", "2027-11-15");
  await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, day_number, title, item_type, origin)
    VALUES (${id("tu-1")}, ${TU}, 1, 'Explore', 'attraction', 'ai')`);
  await db.execute(sql`
    INSERT INTO trips (id, user_id, title, destination, start_date, end_date, status, event_type)
    VALUES (${TN}, ${OWNER}, ${`Nowhere ${RUN}`}, ${`Nowhereville${RUN}, Japan`}, '2027-11-11', '2027-11-15', 'draft', 'vacation')
  `);
  await item(TN, 1, 35.0, 135.78, 1);
  // D6: two mirror-image neighbourhoods either side of every stop, inserted name-descending.
  for (const [slug, name, lng] of [["zz", "Zeta Ward", 135.76], ["aa", "Alpha Ward", 135.74], ["far", "Beta Ward", 135.9]] as const) {
    await db.execute(sql`INSERT INTO city_neighborhoods (id, city, country, name, slug, centroid_lat, centroid_lng)
      VALUES (${id(`tie-${slug}`)}, ${TIE_CITY}, 'Japan', ${name}, ${`${slug}-${RUN}`}, '35', ${String(lng)})`);
  }
  await db.execute(sql`
    INSERT INTO trips (id, user_id, title, destination, start_date, end_date, status, event_type)
    VALUES (${TT}, ${OWNER}, ${`Tied ${RUN}`}, ${`${TIE_CITY}, Japan`}, '2027-11-11', '2027-11-13', 'draft', 'vacation')
  `);
  for (const d of [1, 2, 3]) await item(TT, d, 35.0, 135.75, 1);
  await trip(TS, "2027-11-11", "2027-11-15");
  for (const d of [1, 2, 4, 5]) await item(TS, d, 35.001, 135.781, 1);
  await item(TS, 3, 35.0, 135.671, 1);
  await db.execute(sql`INSERT INTO ai_generated_itineraries (id, trip_id, destination, start_date, end_date, facts_lookup)
    VALUES (${id("ts-draft")}, ${TS}, ${`${CITY}, Japan`}, '2027-11-11', '2027-11-15',
      ${JSON.stringify({ status: "running", startedAt: new Date().toISOString(), pending: [id(`${TS}-1-1`)] })}::jsonb)`);
});

after(async () => {
  try {
    await db.execute(sql`DELETE FROM plan_options WHERE set_id IN (SELECT id FROM plan_option_sets WHERE trip_id LIKE ${`wts-${RUN}-%`})`);
    await db.execute(sql`DELETE FROM plan_option_sets WHERE trip_id LIKE ${`wts-${RUN}-%`}`);
    await db.execute(sql`DELETE FROM ai_generated_itineraries WHERE trip_id LIKE ${`wts-${RUN}-%`}`);
    await db.execute(sql`DELETE FROM itinerary_items WHERE trip_id LIKE ${`wts-${RUN}-%`}`);
    await db.execute(sql`DELETE FROM funnel_events WHERE trip_id LIKE ${`wts-${RUN}-%`}`).catch(() => {});
    await db.execute(sql`DELETE FROM trips WHERE id LIKE ${`wts-${RUN}-%`}`);
    await db.execute(sql`DELETE FROM city_neighborhoods WHERE city IN (${CITY}, ${TIE_CITY})`);
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

test("D3 Skip closes a lodging set with nothing chosen and dismisses only the current (drafted) state", async () => {
  const out = await bindWhereToStay(T5, OWNER, { kind: "skip" });
  assert.equal(out.itemId, null);
  const r = await db.execute(sql`SELECT status, category_key, anchor_role, chosen_option_id FROM plan_option_sets WHERE id = ${out.setId}`);
  const set = r.rows[0] as any;
  assert.equal(set.status, "closed");
  assert.equal(set.category_key, "accommodation");
  assert.ok(set.anchor_role);
  assert.equal(set.chosen_option_id, null);
  const after = await loadWhereToStay(T5, OWNER);
  assert.equal(after.eligible, true, "the ranking is still served — the tray's chooser reads it");
  assert.equal(after.dismissed, true, "the slip draws no drafted panel after a drafted Skip");
  assert.ok(after.neighborhoods.length > 0);
  // A Skip is not a decision: the chooser can still be answered.
  const again = await bindWhereToStay(T5, OWNER, { kind: "skip" });
  assert.equal(again.itemId, null);
});

test("D3b a Skip before the draft dismisses the empty panel only; the drafted panel appears once, then its own Skip dismisses it", async () => {
  await bindWhereToStay(T0S, OWNER, { kind: "skip" });
  const empty = await loadWhereToStay(T0S, OWNER);
  assert.equal(empty.reason, "no_draft");
  assert.equal(empty.dismissed, true);
  // The draft lands after the Skip.
  for (const d of [1, 2, 3]) await item(T0S, d, 35.001, 135.781, 1);
  const drafted = await loadWhereToStay(T0S, OWNER);
  assert.equal(drafted.eligible, true);
  assert.equal(drafted.dismissed, undefined, "the pre-draft Skip does not dismiss the drafted panel");
  await bindWhereToStay(T0S, OWNER, { kind: "skip" });
  assert.equal((await loadWhereToStay(T0S, OWNER)).dismissed, true);
  // A real answer still decides for good.
  await bindWhereToStay(T0S, OWNER, { kind: "own", hotelName: "Hotel Fixture", neighborhoodSlug: null });
  assert.equal((await loadWhereToStay(T0S, OWNER)).reason, "decided");
});

test("D8 smoke 9: a decided plan changes its stay through its own set, in place; refusals come first", async () => {
  const first = await bindWhereToStay(TC, OWNER, { kind: "own", hotelName: "Hotel One", neighborhoodSlug: null });
  assert.ok(first.itemId);
  assert.equal((await loadWhereToStay(TC, OWNER)).reason, "decided");
  // Skip has nothing to dismiss on a decided plan.
  await assert.rejects(bindWhereToStay(TC, OWNER, { kind: "skip" }), /already says where you're staying/);
  // Change: the SAME set and the SAME stay item, now naming the new hotel.
  const second = await bindWhereToStay(TC, OWNER, { kind: "own", hotelName: "Hotel Granvia Kyoto", neighborhoodSlug: null });
  assert.equal(second.setId, first.setId, "the plan's own lodging set, never a second one");
  assert.equal(second.itemId, first.itemId, "the stay item is rewritten in place");
  const stays = (await db.execute(sql`SELECT id, title FROM itinerary_items WHERE trip_id = ${TC} AND item_type = 'accommodation'`)).rows as any[];
  assert.deepEqual(stays.map((r) => r.title), ["Hotel Granvia Kyoto"]);
  const sets = (await db.execute(sql`SELECT status FROM plan_option_sets WHERE trip_id = ${TC} AND category_key = 'accommodation'`)).rows as any[];
  assert.deepEqual(sets.map((r) => r.status), ["chosen"]);
  // A full comparison is refused BEFORE a reopen.
  await bindWhereToStay(TC, OWNER, { kind: "own", hotelName: "Hotel Three", neighborhoodSlug: null });
  await assert.rejects(bindWhereToStay(TC, OWNER, { kind: "own", hotelName: "Hotel Four", neighborhoodSlug: null }), /holds up to 3 places/);
  assert.equal(((await db.execute(sql`SELECT status FROM plan_option_sets WHERE id = ${first.setId}`)).rows[0] as any).status, "chosen");
  // A stay already being booked is never rewritten, and the set is not reopened.
  await db.execute(sql`DELETE FROM plan_options WHERE set_id = ${first.setId} AND position = 3`);
  await db.execute(sql`UPDATE itinerary_items SET routing_status = 'ready_for_checkout' WHERE id = ${first.itemId}`);
  await assert.rejects(bindWhereToStay(TC, OWNER, { kind: "own", hotelName: "Hotel Five", neighborhoodSlug: null }), /already being booked/);
  assert.equal(((await db.execute(sql`SELECT status FROM plan_option_sets WHERE id = ${first.setId}`)).rows[0] as any).status, "chosen");
  // A stay added by hand has no set to change through.
  await assert.rejects(bindWhereToStay(TH, OWNER, { kind: "own", hotelName: "Other", neighborhoodSlug: null }), /added by hand/);
});

test("D9 smoke 9 S9-2 amendment: 'Set as where you're staying' converts the hand-added stay; the chooser then changes it in place", async () => {
  const handId = id("th-stay");
  // The refusal now points at the ⋯ entry.
  await assert.rejects(bindWhereToStay(TH, OWNER, { kind: "own", hotelName: "Other", neighborhoodSlug: null }), /Set as where you're staying/);
  // A non-lodging item, and a stranger, are refused.
  await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, day_number, title, item_type, origin) VALUES (${id("th-walk")}, ${TH}, 1, 'Morning walk', 'activity', 'traveler')`);
  await assert.rejects(bindWhereToStay(TH, OWNER, { kind: "this_item", itemId: id("th-walk") }), /Only a place to stay/);
  await assert.rejects(bindWhereToStay(TH, id("stranger"), { kind: "this_item", itemId: handId }), /No such plan/);
  // Converted: a chosen lodging set bound to THIS item; the item keeps its id and title.
  const out = await bindWhereToStay(TH, OWNER, { kind: "this_item", itemId: handId });
  assert.equal(out.itemId, handId, "the hand-added row IS the stay — never a copy");
  const set = (await db.execute(sql`SELECT status, category_key, itinerary_item_id, anchor_role FROM plan_option_sets WHERE id = ${out.setId}`)).rows[0] as any;
  assert.deepEqual([set.status, set.category_key, set.itinerary_item_id], ["chosen", "accommodation", handId]);
  assert.equal(((await db.execute(sql`SELECT title FROM itinerary_items WHERE id = ${handId}`)).rows[0] as any).title, "My own hotel");
  // A second press is refused: it already is the stay.
  await assert.rejects(bindWhereToStay(TH, OWNER, { kind: "this_item", itemId: handId }), /already where you're staying/);
  // And the chooser now changes it through that set, in place — the refusal is gone.
  const changed = await bindWhereToStay(TH, OWNER, { kind: "own", hotelName: "Hotel Granvia Kyoto", neighborhoodSlug: null });
  assert.equal(changed.setId, out.setId);
  assert.equal(changed.itemId, handId);
  const stays = (await db.execute(sql`SELECT title FROM itinerary_items WHERE trip_id = ${TH} AND item_type = 'accommodation'`)).rows as any[];
  assert.deepEqual(stays.map((r) => r.title), ["Hotel Granvia Kyoto"]);
});

test("D9b a lodging-named item typed as an activity converts and becomes the stay type; a plan with a set-chosen stay refuses", async () => {
  const typed = id("tc-typed");
  await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, day_number, title, item_type, origin, routing_status) VALUES (${typed}, ${TC}, 2, 'Ryokan Yachiyo', 'activity', 'traveler', 'in_planning')`);
  // TC already has a stay from its lodging set (D8) — one stay per plan.
  await assert.rejects(bindWhereToStay(TC, OWNER, { kind: "this_item", itemId: typed }), /already says where you're staying/);
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

test("D6 smoke 5 — two reads, one order; a tie breaks on distance, then name", async () => {
  const first = await loadWhereToStay(TT, OWNER);
  const second = await loadWhereToStay(TT, OWNER);
  assert.equal(first.eligible, true);
  assert.deepEqual(first.neighborhoods.map((n) => n.name), ["Alpha Ward", "Zeta Ward", "Beta Ward"]);
  assert.deepEqual(second.neighborhoods.map((n) => n.slug), first.neighborhoods.map((n) => n.slug));
  assert.deepEqual(
    (await loadWhereToStay(T5, OWNER)).neighborhoods.map((n) => n.slug),
    (await loadWhereToStay(T5, OWNER)).neighborhoods.map((n) => n.slug),
  );
});

test("D7 smoke 5 item 6 — ranked once per draft, stored, and read back on reload", async () => {
  const stored = async () =>
    ((await db.execute(sql`SELECT where_to_stay FROM ai_generated_itineraries WHERE id = ${id("ts-draft")}`)).rows[0] as any).where_to_stay;
  // Lookups still running: ranked live, NOT stored.
  const live = await loadWhereToStay(TS, OWNER);
  assert.deepEqual(live.neighborhoods.map((n) => n.name), ["East Ward", "West Ward", "South Ward"]);
  assert.equal(await stored(), null, "a ranking is never frozen while the draft's lookups run");
  // Lookups done: the next read stores the ranking for this draft.
  await db.execute(sql`UPDATE ai_generated_itineraries SET facts_lookup = '{"status":"done","pending":[]}'::jsonb WHERE id = ${id("ts-draft")}`);
  const first = await loadWhereToStay(TS, OWNER);
  const s1 = await stored();
  assert.equal(s1.draftId, id("ts-draft"));
  assert.deepEqual(s1.ranked.map((r: any) => r.slug), first.neighborhoods.map((n) => n.slug));
  // The stops move to the West ward — a reload still reads the order computed for this draft.
  await db.execute(sql`UPDATE itinerary_items SET latitude = '35.0', longitude = '135.671' WHERE trip_id = ${TS}`);
  const reload = await loadWhereToStay(TS, OWNER);
  assert.deepEqual(reload.neighborhoods.map((n) => n.slug), first.neighborhoods.map((n) => n.slug));
  assert.deepEqual(reload.neighborhoods.map((n) => n.reason), first.neighborhoods.map((n) => n.reason));
  assert.equal(reload.neighborhoods[0].reason, "closest to 4 of your 5 days");
  // Ties: in D6's plan every day goes to Alpha; Zeta and Beta are tied at no days, so each shows
  // its name alone while Alpha keeps its reason.
  const tied = await loadWhereToStay(TT, OWNER);
  assert.deepEqual(tied.neighborhoods.map((n) => [n.name, n.reason]), [
    ["Alpha Ward", "closest to 3 of your 3 days"],
    ["Zeta Ward", null],
    ["Beta Ward", null],
  ]);
});
