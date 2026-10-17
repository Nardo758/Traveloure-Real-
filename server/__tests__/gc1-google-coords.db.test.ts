/**
 * GC-1 (ledger `2026-10-17-gc1-google-coords`; migration 387): Google coordinates are never drawn on a
 * non-Google rendering, and no image carries a minute or a distance.
 *
 *   G1  A write that sets a coordinate stores the source the rail admitted (`places` | `geocode_google`), else
 *       NULL (= Google); a generic body can never set the column, and a write that does not touch the
 *       coordinate leaves the stored source alone.
 *   G2  The geocode backfill's writer stamps `geocode_google`.
 *   G3  The map share format is not served while any located stop's point is Google (NULL included); cover,
 *       story and og still are. Served once every located stop is non-Google.
 *   G4  The map caption carries the stop count and no minute.
 *   G5  The teaser draws one region per neighbourhood per day at the neighbourhood's own centroid — never at a
 *       stop's point — and no distance legend; a stop in no neighbourhood draws nothing.
 *
 * Run against a disposable database:
 *   npx tsx --test --test-concurrency=1 --test-force-exit server/__tests__/gc1-google-coords.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { _clearReadyMadeShareCaches, getReadyMadeShareImage, MAP_FORMAT_NOT_SERVED } from "../services/ready-made-share-data.service";
import { mapDayCaption } from "../services/ready-made-share-image.service";
import { renderReadyMadeTeaserMapSvg, teaserDayRegions } from "../services/ready-made-teaser-map.service";

const RUN = `gc1-${process.pid}`;
let authorId: string;
let tripId: string;
let rmId: string;
const itemIds: string[] = [];

async function source(id: string): Promise<string | null> {
  const r = await db.execute(sql`SELECT coord_source FROM itinerary_items WHERE id = ${id}`);
  return ((r.rows[0] as any)?.coord_source ?? null) as string | null;
}

before(async () => {
  const u = await db.execute(sql`
    INSERT INTO users (id, email, role, first_name) VALUES (gen_random_uuid()::text, ${`a-${RUN}@traveloure.test`}, 'travel_expert', 'Aiko')
    RETURNING id
  `);
  authorId = String((u.rows[0] as any).id);
  const t = await db.execute(sql`
    INSERT INTO trips (id, user_id, destination, start_date, end_date)
    VALUES (gen_random_uuid()::text, ${authorId}, 'Kyoto, Japan', '2027-11-01', '2027-11-02')
    RETURNING id
  `);
  tripId = String((t.rows[0] as any).id);
  const rm = await db.execute(sql`
    INSERT INTO ready_made_trips (id, author_id, source_trip_id, market, title, duration_days, status, active)
    VALUES (gen_random_uuid()::text, ${authorId}, ${tripId}, 'Kyoto', ${`GC-1 ${RUN}`}, 2, 'approved', true)
    RETURNING id
  `);
  rmId = String((rm.rows[0] as any).id);
  _clearReadyMadeShareCaches();
});

after(async () => {
  await db.execute(sql`DELETE FROM itinerary_items WHERE trip_id = ${tripId}`);
  await db.execute(sql`DELETE FROM ready_made_trips WHERE id = ${rmId}`);
  await db.execute(sql`DELETE FROM trips WHERE id = ${tripId}`);
  await db.execute(sql`DELETE FROM users WHERE id = ${authorId}`);
  _clearReadyMadeShareCaches();
});

test("G1 · the source rides the write that sets the coordinate; a generic body never sets it", async () => {
  const picked = await storage.createItineraryItem(
    { tripId, dayNumber: 1, title: "Kinkaku-ji", itemType: "activity", latitude: "35.0394000", longitude: "135.7292000", coordSource: "osm" } as any,
    { coordSource: "places" },
  );
  itemIds.push(picked.id);
  assert.equal(await source(picked.id), "places", "the rail's admitted source, never the body's");
  const plain = await storage.createItineraryItem(
    { tripId, dayNumber: 1, title: "Ryoan-ji", itemType: "activity", latitude: "35.0345000", longitude: "135.7182000", coordSource: "osm" } as any,
  );
  itemIds.push(plain.id);
  assert.equal(await source(plain.id), null, "no stated source ⇒ NULL (Google)");
  await storage.updateItineraryItem(picked.id, { title: "Kinkaku-ji Temple" } as any);
  assert.equal(await source(picked.id), "places", "a write that does not touch the point keeps its source");
  await storage.updateItineraryItem(picked.id, { latitude: "35.0395000", longitude: "135.7293000", coordSource: "osm" } as any);
  assert.equal(await source(picked.id), null, "a new point with no stated source is NULL");
  await storage.updateItineraryItem(picked.id, { latitude: "35.0394000" } as any, { coordSource: "geocode_google" });
  assert.equal(await source(picked.id), "geocode_google");
});

test("G2 · the geocode backfill stamps geocode_google", async () => {
  await storage.updateItineraryItemCoordinates(itemIds[1], "35.0346000", "135.7183000");
  assert.equal(await source(itemIds[1]), "geocode_google");
});

test("G3 · the map format is not served while a located stop's point is Google", async () => {
  assert.equal(await getReadyMadeShareImage(rmId, "map"), MAP_FORMAT_NOT_SERVED);
  for (const format of ["cover", "story", "og"] as const) {
    const img = await getReadyMadeShareImage(rmId, format);
    assert.ok(img && img !== MAP_FORMAT_NOT_SERVED, `${format} is served`);
  }
  // Every located stop non-Google (a value no writer stamps today, set here directly) ⇒ served.
  await db.execute(sql`UPDATE itinerary_items SET coord_source = 'osm' WHERE trip_id = ${tripId}`);
  _clearReadyMadeShareCaches();
  const map = await getReadyMadeShareImage(rmId, "map");
  assert.ok(map && map !== MAP_FORMAT_NOT_SERVED && map.png.length > 0);
  await db.execute(sql`UPDATE itinerary_items SET coord_source = NULL WHERE id = ${itemIds[1]}`);
  _clearReadyMadeShareCaches();
  assert.equal(await getReadyMadeShareImage(rmId, "map"), MAP_FORMAT_NOT_SERVED, "one Google stop is enough to withhold it");
});

test("G4 · the map caption carries the stop count and no minute", () => {
  assert.equal(mapDayCaption({ dayNumber: 1, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }), "Day 1 · 2 stops");
  assert.equal(mapDayCaption({ dayNumber: 2, points: [{ x: 0, y: 0 }] }), "Day 2 · 1 stop");
});

test("G5 · the teaser snaps each stop to its neighbourhood's own centroid; no legend", () => {
  const neighborhoods = [
    { name: "Kitayama", lat: 35.04, lng: 135.73, radiusKm: 1.5 },
    { name: "Higashiyama", lat: 35.0, lng: 135.78, radiusKm: null },
  ];
  const items = [
    { id: "a", dayNumber: 1, latitude: "35.0394", longitude: "135.7292" },
    { id: "b", dayNumber: 1, latitude: "35.0345", longitude: "135.7182" },
    { id: "c", dayNumber: 2, latitude: "34.9949", longitude: "135.7850" },
    { id: "d", dayNumber: 2, latitude: "36.5", longitude: "137.0" },
    { id: "e", dayNumber: 2, latitude: null, longitude: null },
  ];
  assert.deepEqual(teaserDayRegions(items, neighborhoods), [
    { dayNumber: 1, name: "Kitayama", lat: 35.04, lon: 135.73, radiusM: 1500 },
    { dayNumber: 2, name: "Higashiyama", lat: 35.0, lon: 135.78, radiusM: 1000 },
  ]);
  const svg = renderReadyMadeTeaserMapSvg({ listingId: "rm", destination: "Nowhere", items, neighborhoods });
  assert.equal((svg.match(/filter="url\(#teaser-blur\)"/g) ?? []).length, 2);
  assert.doesNotMatch(svg, /\bkm\b|\bmin\b/, "no distance or minute");
  assert.equal(teaserDayRegions(items, []).length, 0, "no spine ⇒ no region");
});
