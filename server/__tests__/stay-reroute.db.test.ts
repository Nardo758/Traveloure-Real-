/**
 * L1-4 — re-route a ready-made copy's first and last legs to the buyer's stay; a first re-date moves
 * the copy's anchors (work plan docs/planning/expert-console-ready-made-work-plan.md; R-ba, R-bg).
 *
 *   R1  the stay chosen through the where-to-stay chooser ("Set as where you're staying" on the buyer's
 *       own lodging item — the REAL `bindWhereToStay`) replaces the author's lodging end legs with
 *       exactly 2 `rerouted_for_stay` legs (stay → first stop of day 1, last stop of the last day →
 *       stay) in the replaced legs' modes; the middle legs are unchanged
 *   R2  moving the stay's point re-routes again: still exactly 2 re-routed legs, from the new point
 *   R3  a plan that is not a copy is never touched; with no chosen set, an author's lodging item is
 *       never read as the stay; a stay with no coordinate and no fact has no point
 *   P1  a stay with no row coordinate takes its Google `location` fact — the plancard's own pin — and
 *       the re-routed legs record it as a cache: `coord_source='google'` + the fact's `coord_fetched_at`
 *       (migration 350; ledger `2026-10-04-leg-google-coords`, LD 57 extends to transport_legs)
 *   P2  with BOTH an own coordinate and a Google fact, the stay item's own coordinate wins and the
 *       legs carry no Google record (R1 also asserts NULL for an item-sourced re-route)
 *   H1  the option-set choose route calls the hook for an accommodation set (source pin)
 *   D1  the first re-date of a copy (dates still a placeholder) shifts the TEMPLATE's anchors (created
 *       with the copy) by the same days and never one the buyer added; a second re-date moves nothing
 *   D2  re-dating a plan that is not a copy never moves its anchors
 *   R0  with no way to compute a route (service off, no Google key), the author's end legs are KEPT
 *       and nothing is invented
 *   G1  Slice A3 (ledger `2026-10-05-stay-reroute-gaps`): copied or AI-drafted lodging is never the
 *       buyer's stay — an `ai` accommodation item (a clone keeps `ai`) is not read as the stay, and the
 *       hook it would fire re-routes nothing
 *   G2  a stay added by hand re-routes through the item rails' hook; a non-stay row costs nothing
 *   G3  the create / edit / delete item rails call the hook (pinned by source, like H1)
 *
 * NEGATIVE SPACE (§18d): the option-set choose route's hook is pinned by source (H1), not driven;
 * leg durations come from the travel-time service's offline estimate here, so only the shape and the
 * modes are asserted.
 *
 * DISPOSABLE DB ONLY. Run solo:
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/traveloure npx tsx --test server/__tests__/stay-reroute.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";

// trips.routes builds a Stripe client at import; a test key, never a real one.
process.env.STRIPE_SECRET_KEY ||= "sk_test_stay_reroute";
// The ONE travel-time service, on with no Google key: legs resolve to its labelled straight-line
// estimate, offline (R0 below turns it off to prove the no-route branch).
process.env.TRAVEL_TIME_SERVICE_ENABLED = "1";
delete process.env.GOOGLE_MAPS_API_KEY;
const { db } = await import("../db");
const { storage } = await import("../storage");
const { stayPointForPlan, rerouteCopyForStay } = await import("../services/stay-reroute.service");
const { bindWhereToStay } = await import("../services/where-to-stay.service");

const RUN = crypto.randomUUID().slice(0, 8);
const ids = {
  owner: `l14-${RUN}-owner`,
  author: `l14-${RUN}-author`,
  copy: `l14-${RUN}-copy`,
  plain: `l14-${RUN}-plain`,
  build: `l14-${RUN}-build`,
  listing: `l14-${RUN}-listing`,
  purchase: `l14-${RUN}-purchase`,
  hotel1: `l14-${RUN}-hotel1`,
  a: `l14-${RUN}-a`,
  b: `l14-${RUN}-b`,
  c: `l14-${RUN}-c`,
  d: `l14-${RUN}-d`,
  hotel2: `l14-${RUN}-hotel2`,
  legHA: `l14-${RUN}-ha`,
  legAB: `l14-${RUN}-ab`,
  legCD: `l14-${RUN}-cd`,
  legDH: `l14-${RUN}-dh`,
  plainLeg: `l14-${RUN}-plainleg`,
  flight: `l14-${RUN}-flight`,
  stay: `l14-${RUN}-stay`,
  plainStay: `l14-${RUN}-plainstay`,
  buyerFlight: `l14-${RUN}-buyerflight`,
  plainFlight: `l14-${RUN}-plainflight`,
  copy2: `l14-${RUN}-copy2`,
  c2hotel: `l14-${RUN}-c2hotel`,
  c2a: `l14-${RUN}-c2a`,
  c2b: `l14-${RUN}-c2b`,
  c2legHA: `l14-${RUN}-c2ha`,
  c2legAB: `l14-${RUN}-c2ab`,
};

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
function assertDisposableDb(): void {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host = "<none>";
  try {
    host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
  } catch {
    /* refuse below */
  }
  if (!DISPOSABLE_HOSTS.has(host)) {
    throw new Error(`[stay-reroute] REFUSING to write fixtures to '${host}'. Opt in with JOURNEY_DB_WRITES_OK=1.`);
  }
}

async function legs(tripId: string): Promise<any[]> {
  return (await db.execute(sql`SELECT * FROM transport_legs WHERE trip_id = ${tripId} ORDER BY day_number, leg_order`)).rows as any[];
}

const leg = (id: string, trip: string, day: number, order: number, from: string, to: string, mode: string) =>
  db.execute(sql`INSERT INTO transport_legs (id, trip_id, day_number, leg_order, from_activity_id, from_name, from_lat, from_lng,
      to_activity_id, to_name, to_lat, to_lng, distance_meters, distance_display, recommended_mode,
      estimated_duration_minutes, proposal_status, user_selected_mode, origin)
    VALUES (${id}, ${trip}, ${day}, ${order}, ${from}, 'f', 35.0, 135.7, ${to}, 't', 35.01, 135.71, 900, '0.9 km', 'walk',
      12, 'confirmed', ${mode}, ${trip === ids.copy ? "author_pick" : null})`);

before(async () => {
  assertDisposableDb();
  for (const [id, role] of [[ids.owner, "traveler"], [ids.author, "local_expert"]] as const) {
    await db.execute(sql`INSERT INTO users (id, email, first_name, last_name, role) VALUES (${id}, ${`${id}@t.test`}, 'L14', ${role}, ${role})`);
  }
  await db.execute(sql`INSERT INTO trips (id, user_id, author_id, title, destination, start_date, end_date, status) VALUES
    (${ids.copy}, ${ids.owner}, NULL, 'L1-4 copy', 'Kyoto, Japan', '2026-10-04', '2026-10-05', 'draft'),
    (${ids.plain}, ${ids.owner}, NULL, 'L1-4 plain', 'Kyoto, Japan', '2026-10-04', '2026-10-05', 'draft'),
    (${ids.build}, NULL, ${ids.author}, 'L1-4 build', 'Kyoto, Japan', '2027-03-10', '2027-03-11', 'draft')`);
  await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, title, item_type, day_number, sort_order, latitude, longitude) VALUES
    (${ids.hotel1}, ${ids.copy}, 'Author Ryokan', 'accommodation', 1, 0, 35.000, 135.770),
    (${ids.a}, ${ids.copy}, 'Kiyomizu-dera', 'activity', 1, 1, 34.9949, 135.7850),
    (${ids.b}, ${ids.copy}, 'Yasaka Shrine', 'activity', 1, 2, 35.0037, 135.7785),
    (${ids.c}, ${ids.copy}, 'Nanzen-ji', 'activity', 2, 0, 35.0110, 135.7940),
    (${ids.d}, ${ids.copy}, 'Ginkaku-ji', 'activity', 2, 1, 35.0270, 135.7982),
    (${ids.hotel2}, ${ids.copy}, 'Author Ryokan', 'accommodation', 2, 2, 35.000, 135.770)`);
  await leg(ids.legHA, ids.copy, 1, 0, ids.hotel1, ids.a, "taxi");
  await leg(ids.legAB, ids.copy, 1, 1, ids.a, ids.b, "walk");
  await leg(ids.legCD, ids.copy, 2, 0, ids.c, ids.d, "bus");
  await leg(ids.legDH, ids.copy, 2, 1, ids.d, ids.hotel2, "train");
  await leg(ids.plainLeg, ids.plain, 1, 0, ids.a, ids.b, "walk");
  await db.execute(sql`INSERT INTO ready_made_trips (id, author_id, source_trip_id, market, title, duration_days, status, active)
    VALUES (${ids.listing}, ${ids.author}, ${ids.build}, 'Kyoto', 'L1-4 listing', 2, 'approved', true)`);
  await db.execute(sql`INSERT INTO ready_made_purchases (id, buyer_id, ready_made_trip_id, price_paid_cents, stripe_payment_intent_id, clone_trip_id, status)
    VALUES (${ids.purchase}, ${ids.owner}, ${ids.listing}, 3900, ${`pi_l14_${RUN}`}, ${ids.copy}, 'cloned')`);
  // `flight` is a TEMPLATE anchor (the clone stamps the copy's own created_at); `buyerFlight` is one
  // the buyer added later — the first re-date must move the former and never the latter.
  await db.execute(sql`INSERT INTO temporal_anchors (id, trip_id, anchor_type, anchor_datetime, created_at) VALUES
    (${ids.flight}, ${ids.copy}, 'flight_arrival', '2026-10-04 14:30:00', (SELECT created_at FROM trips WHERE id = ${ids.copy})),
    (${ids.buyerFlight}, ${ids.copy}, 'flight_departure', '2026-10-05 18:00:00', (SELECT created_at FROM trips WHERE id = ${ids.copy}) + interval '1 hour'),
    (${ids.plainFlight}, ${ids.plain}, 'flight_arrival', '2026-10-04 14:30:00', (SELECT created_at FROM trips WHERE id = ${ids.plain}))`);
});

after(async () => {
  await db.execute(sql`DELETE FROM place_facts WHERE plan_id IN (${ids.copy}, ${ids.plain})`).catch(() => {});
  await db.execute(sql`DELETE FROM plan_options WHERE set_id IN (SELECT id FROM plan_option_sets WHERE trip_id IN (${ids.copy}, ${ids.plain}))`).catch(() => {});
  await db.execute(sql`DELETE FROM plan_option_sets WHERE trip_id IN (${ids.copy}, ${ids.plain})`).catch(() => {});
  await db.execute(sql`DELETE FROM ready_made_purchases WHERE id = ${ids.purchase}`);
  await db.execute(sql`DELETE FROM ready_made_trips WHERE id = ${ids.listing}`);
  await db.execute(sql`DELETE FROM trips WHERE id IN (${ids.copy}, ${ids.plain}, ${ids.build}, ${ids.copy2})`);
  await db.execute(sql`DELETE FROM users WHERE id IN (${ids.owner}, ${ids.author})`);
});

test("R0: no computable route ⇒ the author's end legs are kept", async () => {
  delete process.env.TRAVEL_TIME_SERVICE_ENABLED;
  const { rerouteCopyForStay } = await import("../services/stay-reroute.service");
  await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, title, item_type, day_number, sort_order, latitude, longitude, origin)
    VALUES (${`${ids.copy}-tmp`}, ${ids.copy}, 'Tmp Inn', 'accommodation', 1, 9, 34.98, 135.75, 'traveler')`);
  const result = await rerouteCopyForStay(ids.copy);
  assert.deepEqual(result, { rerouted: 0, removed: 0 });
  assert.deepEqual((await legs(ids.copy)).map((l) => l.id).sort(), [ids.legAB, ids.legCD, ids.legDH, ids.legHA].sort());
  await db.execute(sql`DELETE FROM itinerary_items WHERE id = ${`${ids.copy}-tmp`}`);
  process.env.TRAVEL_TIME_SERVICE_ENABLED = "1";
});

test("R1: the stay chosen in where-to-stay re-routes exactly the two end legs", async () => {
  await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, title, item_type, day_number, sort_order, latitude, longitude, origin)
    VALUES (${ids.stay}, ${ids.copy}, 'Hotel Granvia Kyoto', 'accommodation', 1, 9, 34.9850, 135.7588, 'traveler')`);
  await bindWhereToStay(ids.copy, ids.owner, { kind: "this_item", itemId: ids.stay });
  const rows = await legs(ids.copy);
  const ids_ = rows.map((l) => l.id);
  assert.ok(!ids_.includes(ids.legHA) && !ids_.includes(ids.legDH), "the author's lodging end legs are replaced");
  assert.ok(ids_.includes(ids.legAB) && ids_.includes(ids.legCD), "the middle legs stay");
  const rerouted = rows.filter((l) => l.origin === "rerouted_for_stay");
  assert.equal(rerouted.length, 2);
  const first = rerouted.find((l) => l.day_number === 1)!;
  const last = rerouted.find((l) => l.day_number === 2)!;
  assert.deepEqual([first.from_activity_id, first.from_name, first.to_activity_id, first.user_selected_mode, first.proposal_status],
    [null, "Hotel Granvia Kyoto", ids.a, "taxi", "confirmed"]);
  assert.deepEqual([last.from_activity_id, last.to_activity_id, last.to_name, last.user_selected_mode], [ids.d, null, "Hotel Granvia Kyoto", "train"]);
  assert.equal(Number(first.from_lat).toFixed(4), "34.9850");
  assert.deepEqual([first.coord_source, first.coord_fetched_at, last.coord_source], [null, null, null], "an own coordinate is no Google cache");
  const ab = rows.find((l) => l.id === ids.legAB)!;
  assert.deepEqual([ab.origin, ab.user_selected_mode], ["author_pick", "walk"]);
});

test("R2: moving the stay re-routes again without stacking legs", async () => {
  // "Set as where you're staying" REWRITES the plan's existing lodging row in place (S10-6), so the
  // stay is whichever row the chosen set now points at — read through the one reader.
  const stayId = (await stayPointForPlan(ids.copy))!.itemId;
  await db.execute(sql`UPDATE itinerary_items SET title = 'Ace Hotel Kyoto', latitude = 35.0050, longitude = 135.7620 WHERE id = ${stayId}`);
  await rerouteCopyForStay(ids.copy);
  const rerouted = (await legs(ids.copy)).filter((l) => l.origin === "rerouted_for_stay");
  assert.equal(rerouted.length, 2);
  assert.ok(rerouted.every((l) => l.from_name === "Ace Hotel Kyoto" || l.to_name === "Ace Hotel Kyoto"));
  assert.equal((await legs(ids.copy)).length, 4);
});

test("R3: not a copy ⇒ untouched; an author's lodging is never the stay; no point ⇒ no stay", async () => {
  const before = await legs(ids.plain);
  assert.deepEqual(await rerouteCopyForStay(ids.plain), { skipped: "not_a_copy" });
  assert.deepEqual((await legs(ids.plain)).map((l) => l.id), before.map((l) => l.id));
  // With no chosen set, the fallback reads only a lodging item that is not the author's.
  await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, title, item_type, day_number, sort_order, latitude, longitude, origin)
    VALUES (${`${ids.plainStay}-author`}, ${ids.plain}, 'Author Inn', 'accommodation', 1, 8, 35.0, 135.7, 'expert')`);
  assert.equal(await stayPointForPlan(ids.plain), null);
  await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, title, item_type, day_number, sort_order, latitude, longitude, origin)
    VALUES (${ids.plainStay}, ${ids.plain}, 'Somewhere Inn', 'accommodation', 1, 9, NULL, NULL, 'traveler')`);
  assert.equal(await stayPointForPlan(ids.plain), null, "a stay with no coordinate and no fact has no point");
  await db.execute(sql`UPDATE itinerary_items SET latitude = 35.01, longitude = 135.71 WHERE id = ${ids.plainStay}`);
  assert.equal((await stayPointForPlan(ids.plain))?.itemId, ids.plainStay);
});

test("P1: a stay with no row coordinate takes its Google location fact", async () => {
  const stayId = (await stayPointForPlan(ids.copy))!.itemId;
  await db.execute(sql`UPDATE itinerary_items SET latitude = NULL, longitude = NULL WHERE id = ${stayId}`);
  assert.equal(await stayPointForPlan(ids.copy), null);
  await db.execute(sql`INSERT INTO place_facts (id, place_ref_kind, place_ref, need, fact_type, value, origin, fetched_at, expires_at, plan_id, itinerary_item_id)
    VALUES (${`${ids.stay}-loc`}, 'place_id', 'ChIJ-test', 'lodging', 'location', ${JSON.stringify({ lat: 35.0011, lng: 135.7666 })}::jsonb,
      'places_api', now(), now() + interval '20 days', ${ids.copy}, ${stayId})`);
  const p = await stayPointForPlan(ids.copy);
  assert.deepEqual([p?.itemId, p?.lat, p?.lng], [stayId, 35.0011, 135.7666]);
  assert.deepEqual(await rerouteCopyForStay(ids.copy), { rerouted: 2, removed: 2 });
  const rerouted = (await legs(ids.copy)).filter((l) => l.origin === "rerouted_for_stay");
  assert.ok(rerouted.some((l) => Number(l.from_lat).toFixed(4) === "35.0011"));
  assert.equal(p?.source, "google");
  for (const l of rerouted) {
    assert.equal(l.coord_source, "google");
    assert.ok(l.coord_fetched_at, "the Google point's fetch time is on the leg");
  }
});

test("P2: the stay item's own coordinate wins over its Google fact; no Google record on the legs", async () => {
  const stayId = (await stayPointForPlan(ids.copy))!.itemId; // still carries P1's fact
  await db.execute(sql`UPDATE itinerary_items SET latitude = 34.9990, longitude = 135.7550 WHERE id = ${stayId}`);
  const p = await stayPointForPlan(ids.copy);
  assert.deepEqual([p?.lat, p?.lng, p?.source, p?.fetchedAt], [34.999, 135.755, "item", null]);
  await rerouteCopyForStay(ids.copy);
  const rerouted = (await legs(ids.copy)).filter((l) => l.origin === "rerouted_for_stay");
  assert.equal(rerouted.length, 2);
  assert.ok(rerouted.every((l) => l.coord_source === null && l.coord_fetched_at === null));
  assert.ok(rerouted.some((l) => Number(l.from_lat).toFixed(4) === "34.9990"));
});

test("H1: the option-set choose route re-routes when an accommodation set is chosen", () => {
  const src = fs.readFileSync(path.resolve(import.meta.dirname, "../routes/plan-option-sets.routes.ts"), "utf8");
  const handler = src.slice(src.indexOf('"/api/trips/:tripId/option-sets/:setId/choose"'));
  assert.match(handler.slice(0, 900), /categoryKey === "accommodation"\) await rerouteAfterStayChange\(/);
});

test("D1: the first re-date of a copy shifts its anchors; a later one does not", async () => {
  const at = async (id: string) => new Date(((await db.execute(sql`SELECT anchor_datetime FROM temporal_anchors WHERE id = ${id}`)).rows[0] as any).anchor_datetime).getTime();
  const before = await at(ids.flight);
  const buyerBefore = await at(ids.buyerFlight);
  await storage.updateTrip(ids.copy, { startDate: "2026-11-14", endDate: "2026-11-15" } as any);
  assert.equal(await at(ids.flight), before + 41 * 86_400_000);
  assert.equal(await at(ids.buyerFlight), buyerBefore, "an anchor the buyer added is never moved");
  const confirmed = (await db.execute(sql`SELECT dates_confirmed_at FROM trips WHERE id = ${ids.copy}`)).rows[0] as any;
  assert.ok(confirmed.dates_confirmed_at, "the re-date stamped the dates");
  await storage.updateTrip(ids.copy, { startDate: "2026-11-20", endDate: "2026-11-21" } as any);
  assert.equal(await at(ids.flight), before + 41 * 86_400_000, "a confirmed plan's anchors are the traveler's own");
});

test("D2: re-dating a plan that is not a copy never moves its anchors", async () => {
  const at = async () => ((await db.execute(sql`SELECT anchor_datetime FROM temporal_anchors WHERE id = ${ids.plainFlight}`)).rows[0] as any).anchor_datetime;
  const before = String(await at());
  await storage.updateTrip(ids.plain, { startDate: "2026-12-01", endDate: "2026-12-02" } as any);
  assert.equal(String(await at()), before);
});

async function seedCopy2(): Promise<void> {
  await db.execute(sql`INSERT INTO trips (id, user_id, author_id, title, destination, start_date, end_date, status) VALUES
    (${ids.copy2}, ${ids.owner}, NULL, 'A3 copy', 'Kyoto, Japan', '2026-10-04', '2026-10-04', 'draft')`);
  await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, title, item_type, day_number, sort_order, latitude, longitude, origin) VALUES
    (${ids.c2hotel}, ${ids.copy2}, 'Template Ryokan', 'accommodation', 1, 0, 35.000, 135.770, 'expert'),
    (${ids.c2a}, ${ids.copy2}, 'Kiyomizu-dera', 'activity', 1, 1, 34.9949, 135.7850, 'expert'),
    (${ids.c2b}, ${ids.copy2}, 'Yasaka Shrine', 'activity', 1, 2, 35.0037, 135.7785, 'expert')`);
  for (const [id, order, from, to, mode] of [[ids.c2legHA, 0, ids.c2hotel, ids.c2a, "taxi"], [ids.c2legAB, 1, ids.c2a, ids.c2b, "walk"]] as const) {
    await db.execute(sql`INSERT INTO transport_legs (id, trip_id, day_number, leg_order, from_activity_id, from_name, from_lat, from_lng,
        to_activity_id, to_name, to_lat, to_lng, distance_meters, distance_display, recommended_mode,
        estimated_duration_minutes, proposal_status, user_selected_mode, origin)
      VALUES (${id}, ${ids.copy2}, 1, ${order}, ${from}, 'f', 35.0, 135.7, ${to}, 't', 35.01, 135.71, 900, '0.9 km', 'walk',
        12, 'confirmed', ${mode}, 'author_pick')`);
  }
}

test("G1: copied or AI-drafted lodging is never the buyer's stay", async () => {
  const { rerouteIfStayItemChanged } = await import("../services/stay-reroute.service");
  await seedCopy2();
  assert.equal(await stayPointForPlan(ids.copy2), null, "the template's own (expert) lodging is not the stay");
  const aiRow = { id: `${ids.copy2}-ai`, itemType: "accommodation" };
  await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, title, item_type, day_number, sort_order, latitude, longitude, origin)
    VALUES (${aiRow.id}, ${ids.copy2}, 'AI-drafted Hotel', 'accommodation', 1, 9, 34.99, 135.76, 'ai')`);
  assert.equal(await stayPointForPlan(ids.copy2), null, "an AI-drafted (or AI-copied) lodging is not the stay");
  const before = (await legs(ids.copy2)).map((l) => l.id).sort();
  await rerouteIfStayItemChanged(ids.copy2, [aiRow]);
  assert.deepEqual((await legs(ids.copy2)).map((l) => l.id).sort(), before, "nothing re-routed to an AI hotel");
  await db.execute(sql`DELETE FROM itinerary_items WHERE id = ${aiRow.id}`);
});

test("G2: a stay added by hand re-routes through the hook; a non-stay row costs nothing", async () => {
  const { rerouteIfStayItemChanged } = await import("../services/stay-reroute.service");
  const before = (await legs(ids.copy2)).map((l) => l.id).sort();
  await rerouteIfStayItemChanged(ids.copy2, [{ itemType: "activity" }, null]);
  assert.deepEqual((await legs(ids.copy2)).map((l) => l.id).sort(), before);
  const stay = { id: `${ids.copy2}-mine`, itemType: "accommodation" };
  await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, title, item_type, day_number, sort_order, latitude, longitude, origin)
    VALUES (${stay.id}, ${ids.copy2}, 'My Hotel', 'accommodation', 1, 9, 34.9850, 135.7588, 'traveler')`);
  await rerouteIfStayItemChanged(ids.copy2, [stay]);
  const rows = await legs(ids.copy2);
  const rerouted = rows.filter((l) => l.origin === "rerouted_for_stay");
  assert.ok(rerouted.length >= 1, "the hand-added stay took the end legs");
  assert.ok(rerouted.every((l) => l.from_name === "My Hotel" || l.to_name === "My Hotel"));
  assert.ok(!rows.some((l) => l.id === ids.c2legHA), "the template-lodging leg is replaced");
  assert.ok(rows.some((l) => l.id === ids.c2legAB && l.origin === "author_pick"), "the author's middle leg is unchanged");
});

test("G3: the create, edit and delete item rails call the stay hook", () => {
  const mono = fs.readFileSync(path.resolve(import.meta.dirname, "../routes.ts"), "utf8");
  const create = mono.slice(mono.indexOf('app.post("/api/trips/:tripId/itinerary-items"'));
  assert.match(create.slice(0, create.indexOf("Failed to create itinerary item")), /rerouteIfStayItemChanged\(tripId, \[item/);
  const trips = fs.readFileSync(path.resolve(import.meta.dirname, "../routes/trips.routes.ts"), "utf8");
  const patch = trips.slice(trips.indexOf('router.patch("/api/trips/:tripId/itinerary-items/:itemId"'));
  assert.match(patch.slice(0, patch.indexOf("Failed to update itinerary item")), /rerouteIfStayItemChanged\(tripId, \[existing as any, updated as any\]\)/);
  const del = trips.slice(trips.indexOf('router.delete("/api/trips/:tripId/itinerary-items/:itemId"'));
  assert.match(del.slice(0, del.indexOf("Failed to delete itinerary item")), /rerouteIfStayItemChanged\(tripId, \[existing as any\]\)/);
});
