/**
 * CP-1 PR 2 — the pre-purchase teasers (ledger `2026-10-15-cp1-teasers`).
 *
 *   T1  GET /api/ready-made/preview/:slug: the sample day is an outline — `stopCount` and the areas
 *       its stops are in — and the payload names no stop title, time, place name or leg minute.
 *   T2  GET /api/ready-made/:id/teaser-map.svg: no stop pin and no route line — one blurred region
 *       per day; the per-day km legend stays.
 *   T3  The share images: the cover's day chips name the AREA, never a stop title.
 *   T4  The service route share card's data: the stop count and the areas, never a stop name.
 *
 * Run against a disposable dev database only, with the app started:
 *   JOURNEY_DB_WRITES_OK=1 npx tsx --test server/__tests__/cp1-teasers.http.test.ts
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { after, before, test } from "node:test";
import { readyMadeSlug } from "@shared/ready-made-preview";

const { Pool } = await import("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const BASE_URL = process.env.JOURNEY_BASE_URL || "http://127.0.0.1:5000";
const RUN = crypto.randomUUID().slice(0, 8);
const CITY = `Cp1teaser${RUN}`;
const TITLE = `CP-1 teaser ${RUN}`;
const ids = {
  author: crypto.randomUUID(),
  build: crypto.randomUUID(),
  listing: crypto.randomUUID(),
  service: crypto.randomUUID(),
  nA: crypto.randomUUID(),
  nB: crypto.randomUUID(),
  items: [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()],
};
const STOP_TITLES = ["Hidden Tea House", "Secret Garden Gate", "Quiet Lane Bakery", "Day Two Shrine"];

before(async () => {
  const health = await fetch(`${BASE_URL}/api/health`).catch(() => null);
  assert.ok(health?.ok, `dev server must be running on ${BASE_URL}`);
  assert.equal(process.env.JOURNEY_DB_WRITES_OK, "1", "Refusing to write fixtures without JOURNEY_DB_WRITES_OK=1");
  await pool.query(`INSERT INTO users (id, email, first_name, role, handle) VALUES ($1, $2, 'Aiko', 'local_expert', $3)`, [ids.author, `cp1t-${RUN}@traveloure.test`, `cp1t${RUN}`]);
  await pool.query(
    `INSERT INTO city_neighborhoods (id, city, country, name, slug, centroid_lat, centroid_lng) VALUES
       ($1, $3, 'Japan', 'Higashiyama Teaser', $4, 10.0000000, 100.7800000),
       ($2, $3, 'Japan', 'Arashiyama Teaser', $5, 10.0150000, 100.6750000)`,
    [ids.nA, ids.nB, CITY, `hig-${RUN}`, `ara-${RUN}`],
  );
  await pool.query(
    `INSERT INTO trips (id, user_id, author_id, title, destination, start_date, end_date, status) VALUES ($1, NULL, $2, 'build', $3, '2027-03-10', '2027-03-11', 'draft')`,
    [ids.build, ids.author, CITY],
  );
  const [a, b, c, d] = ids.items;
  await pool.query(
    `INSERT INTO itinerary_items (id, trip_id, title, item_type, day_number, sort_order, start_time, location_name, latitude, longitude) VALUES
       ($1, $5, $6, 'activity', 1, 0, '08:15', 'Lane 4', 10.0010, 100.7790),
       ($2, $5, $7, 'activity', 1, 1, '10:45', NULL, 10.0020, 100.7810),
       ($3, $5, $8, 'dining', 1, 2, NULL, 'Lane 9', 10.0140, 100.6760),
       ($4, $5, $9, 'activity', 2, 0, '09:00', NULL, 10.0145, 100.6755)`,
    [a, b, c, d, ids.build, ...STOP_TITLES],
  );
  await pool.query(
    `INSERT INTO ready_made_trips (id, author_id, source_trip_id, market, title, duration_days, price_cents, status, active)
     VALUES ($1, $2, $3, 'Kyoto', $4, 2, 4900, 'approved', true)`,
    [ids.listing, ids.author, ids.build, TITLE],
  );
  // The preview names areas from the listing's MARKET; point this run's neighbourhoods at it too.
  await pool.query(`UPDATE city_neighborhoods SET city = 'Kyoto' WHERE id = ANY($1)`, [[ids.nA, ids.nB]]);
  await pool.query(
    `INSERT INTO provider_services (id, user_id, service_name, price, status, approval_status, delivery_method, city)
     VALUES ($1, $2, 'CP-1 route walk', '30.00', 'active', 'approved', 'in_person', 'Kyoto')`,
    [ids.service, ids.author],
  );
  await pool.query(
    `INSERT INTO service_route_points (id, service_id, position, name, latitude, longitude) VALUES
       ($1, $4, 1, 'Hidden Tea House', 10.0010, 100.7790),
       ($2, $4, 2, 'Quiet Lane Bakery', 10.0140, 100.6760),
       ($3, $4, 3, 'Unplaced stop', NULL, NULL)`,
    [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID(), ids.service],
  );
});

after(async () => {
  try {
    await pool.query(`DELETE FROM service_route_points WHERE service_id = $1`, [ids.service]);
    await pool.query(`DELETE FROM provider_services WHERE id = $1`, [ids.service]);
    await pool.query(`DELETE FROM ready_made_trips WHERE id = $1`, [ids.listing]);
    await pool.query(`DELETE FROM itinerary_items WHERE trip_id = $1`, [ids.build]);
    await pool.query(`DELETE FROM trips WHERE id = $1`, [ids.build]);
    await pool.query(`DELETE FROM city_neighborhoods WHERE id = ANY($1)`, [[ids.nA, ids.nB]]);
    await pool.query(`DELETE FROM users WHERE id = $1`, [ids.author]);
  } finally {
    await pool.end();
  }
});

test("T1: the preview's sample day is an outline — a count and areas, no stop", async () => {
  const slug = readyMadeSlug({ id: ids.listing, title: TITLE });
  const r = await fetch(`${BASE_URL}/api/ready-made/preview/${slug}`);
  const text = await r.text();
  assert.equal(r.status, 200, text);
  const body = JSON.parse(text);
  assert.deepEqual(body.sampleDay, { dayNumber: 1, stopCount: 3, areas: ["Higashiyama Teaser", "Arashiyama Teaser"] });
  for (const banned of [...STOP_TITLES, "08:15", "10:45", "Lane 4", "Lane 9", "10.001"]) {
    assert.ok(!text.includes(banned), `the preview never carries '${banned}'`);
  }
});

test("T2: the teaser map draws one blurred region per day — no pin, no route", async () => {
  const r = await fetch(`${BASE_URL}/api/ready-made/${ids.listing}/teaser-map.svg`);
  const svg = await r.text();
  assert.equal(r.status, 200, svg);
  assert.equal((svg.match(/filter="url\(#teaser-blur\)"/g) ?? []).length, 2, "one region per day");
  assert.ok(!/r="6"/.test(svg), "no stop pin");
  assert.ok(!/stroke="#E85D55"|stroke="#3B6EA5"/.test(svg), "no route line in a day colour");
  for (const t of STOP_TITLES) assert.ok(!svg.includes(t));
});

test("T3: the share cover's day chips name the area, never a stop", async () => {
  const { loadReadyMadeShareInputs } = await import("../services/ready-made-share-data.service");
  const inputs = await loadReadyMadeShareInputs(ids.listing);
  assert.ok(inputs);
  assert.deepEqual(inputs!.data.dayChips, [
    { dayNumber: 1, label: "Higashiyama Teaser" },
    { dayNumber: 2, label: "Arashiyama Teaser" },
  ]);
  assert.ok(!JSON.stringify(inputs!.data).includes("Hidden Tea House"));
});

test("T4: the route share card carries the count and the areas, never a stop name", async () => {
  const { routeAreaNames } = await import("../services/listing-location-access.service");
  const points = (await pool.query(`SELECT position, latitude, longitude FROM service_route_points WHERE service_id = $1`, [ids.service])).rows;
  assert.deepEqual(await routeAreaNames(points, "Kyoto"), ["Higashiyama Teaser", "Arashiyama Teaser"]);
  assert.deepEqual(await routeAreaNames(points, null), [], "no city ⇒ no area, never a guess");
  // The route handler feeds exactly this list to the card (share-images.routes.ts); the PNG itself is
  // not asserted here — the service share renderer is a separate concern.
});
