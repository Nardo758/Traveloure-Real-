/**
 * FB-1 step 1 (ledger `2026-10-17-fb1-checker-open-coords`), end to end through `loadOptimizerFindings` against a
 * real database (needs LG-1's migration 389).
 *   F1  stops carrying ONLY Google points (trusted row coordinates, which used to be read) yield neither path
 *       finding, and both sit in `notChecked` with the reason and the day — and, since LG-2 Ask 6, so does
 *       `leg_unreachable` (`leg_not_checked`): a leg with no open point at an end has no time
 *   F2  the same stops with OSM rows (`open_place_coords`) yield city_crossing and walking_saved_km, and nothing is
 *       not checked
 *   F3  a second day with one Google-only stop is not checked while the open day is still read
 *   F4  a ride whose route points are all seeded OSM nodes (TC-3) counts at its own pin — LG-1's `osm_node` origin —
 *       with no OSM or admin row for it, so that day is read
 *
 * DISPOSABLE DB ONLY. Run solo:
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/traveloure npx tsx --test --test-force-exit server/__tests__/fb1-checker-open-coords.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";

process.env.STRIPE_SECRET_KEY ||= "sk_test_fb1_checker";
delete process.env.GOOGLE_MAPS_API_KEY;
const { db } = await import("../db");
const { loadOptimizerFindings } = await import("../services/optimizer-lead.service");

const RUN = crypto.randomUUID().slice(0, 8);
const id = (s: string) => `fb1c-${RUN}-${s}`;
const owner = id("owner");
const TRIP = id("trip");
const pid = (k: string) => `ChIJ-fb1c-${RUN}-${k}`;

// Google (stored) points: a straight line, which would trip neither finding. OSM points: a zig-zag, which trips both.
const STORED: Record<string, [number, number]> = { a: [35.0, 135.76], b: [35.001, 135.761], c: [35.002, 135.762], d: [35.003, 135.763] };
const OSM: Record<string, [number, number]> = { a: [35.0, 135.76], b: [35.05, 135.76], c: [35.001, 135.761], d: [35.051, 135.761] };

before(async () => {
  const host = new URL(process.env.DATABASE_URL ?? "").hostname;
  if (!["localhost", "127.0.0.1", "::1", ""].includes(host) && process.env.JOURNEY_DB_WRITES_OK !== "1") throw new Error(`refusing ${host}`);
  await db.execute(sql`INSERT INTO users (id, email, first_name, last_name, role) VALUES (${owner}, ${`${owner}@t.test`}, 'FB1', 'traveler', 'traveler')`);
  await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, market_slug, timezone, start_date, end_date, status, dates_confirmed_at)
    VALUES (${TRIP}, ${owner}, 'FB1', 'Kyoto, Japan', 'kyoto', 'Asia/Tokyo', '2026-11-11', '2026-11-12', 'draft', now())`);
  let order = 0;
  for (const k of ["a", "b", "c", "d"]) {
    const [lat, lng] = STORED[k];
    await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, title, item_type, day_number, sort_order, latitude, longitude, origin, google_place_id)
      VALUES (${`${TRIP}-${k}`}, ${TRIP}, ${`Stop ${k.toUpperCase()}`}, 'activity', 1, ${order++}, ${String(lat)}, ${String(lng)}, 'traveler', ${pid(k)})`);
  }
});

after(async () => {
  await db.execute(sql`DELETE FROM trips WHERE id = ${TRIP}`);
  await db.execute(sql`DELETE FROM provider_services WHERE id = ${id("ride")}`);
  await db.execute(sql`DELETE FROM users WHERE id = ${owner}`);
  await db.execute(sql`DELETE FROM open_place_coords WHERE google_place_id LIKE ${`ChIJ-fb1c-${RUN}-%`}`);
});

const kinds = (fs: Array<{ kind: string }>) => fs.map((f) => f.kind);

test("F1 Google points only: neither path finding, both not checked", async () => {
  const { findings, notChecked } = await loadOptimizerFindings(TRIP);
  assert.equal(kinds(findings).includes("city_crossing"), false);
  assert.equal(kinds(findings).includes("walking_saved_km"), false);
  assert.deepEqual(notChecked, [
    { kind: "city_crossing", reason: "no_open_coordinates", days: [1] },
    { kind: "walking_saved_km", reason: "no_open_coordinates", days: [1] },
    // LG-2 Ask 6: the day's legs have no time (no open point at either end), so reachability is not checked either.
    { kind: "leg_unreachable", reason: "leg_not_checked", days: [1] },
  ]);
});

test("F2 OSM points: both path findings, nothing not checked", async () => {
  for (const k of ["a", "b", "c", "d"]) {
    await db.execute(sql`INSERT INTO open_place_coords (id, source, google_place_id, lat, lng, osm_type, osm_id, name, matched_by, attribution, matched_at)
      VALUES ('osm:node/' || ${pid(k)}, 'osm', ${pid(k)}, ${String(OSM[k][0])}, ${String(OSM[k][1])}, 'node', 1, ${`Stop ${k}`}, 'nominatim_batch', '© OpenStreetMap contributors', now())`);
  }
  const { findings, notChecked } = await loadOptimizerFindings(TRIP);
  assert.ok(kinds(findings).includes("city_crossing"), JSON.stringify(findings));
  assert.ok(kinds(findings).includes("walking_saved_km"), JSON.stringify(findings));
  assert.deepEqual(notChecked, []);
});

test("F3 a day with a Google-only stop is not checked; the open day is still read", async () => {
  await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, title, item_type, day_number, sort_order, latitude, longitude, origin, google_place_id)
    VALUES (${`${TRIP}-e`}, ${TRIP}, 'Stop E', 'activity', 2, 0, '35.01', '135.77', 'traveler', ${pid("e")})`);
  const { findings, notChecked } = await loadOptimizerFindings(TRIP);
  assert.ok(kinds(findings).includes("city_crossing"));
  assert.deepEqual(notChecked.map((n) => [n.kind, n.days]), [["city_crossing", [2]], ["walking_saved_km", [2]]]);
});

test("F4 a ride on seeded OSM nodes counts at its own pin", async () => {
  await db.execute(sql`INSERT INTO provider_services (id, user_id, service_name, description, price, status, approval_status, delivery_method, city, booking_mode)
    VALUES (${id("ride")}, ${owner}, 'FB1 ride', 'fixture', '35.00', 'active', 'approved', 'in_person', 'Kyoto', 'hidden')`);
  await db.execute(sql`INSERT INTO service_route_points (id, service_id, position, name, latitude, longitude, osm_node_id)
    VALUES (${id("rp1")}, ${id("ride")}, 1, 'Board', '35.02', '135.77', 1001), (${id("rp2")}, ${id("ride")}, 2, 'Exit', '35.03', '135.78', 1002)`);
  // Day 2's Google-only stop E becomes the ride: its own pin is now an OSM node.
  await db.execute(sql`UPDATE itinerary_items SET provider_service_id = ${id("ride")}, item_type = 'transport' WHERE id = ${`${TRIP}-e`}`);
  const { notChecked } = await loadOptimizerFindings(TRIP);
  assert.deepEqual(notChecked, [], "day 2's ride stop has an open (osm_node) point");
});
