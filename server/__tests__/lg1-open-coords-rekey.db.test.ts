/**
 * LG-1 re-key (migration 390; ledger `2026-10-18-lg1-open-coords-rekey`): an open coordinate is keyed by its OWN source's
 * id and reached from the item through a join row, so an item with no Google place id can be routed.
 *
 *   RK1 the writer: one open place per OSM element ('osm:<type>/<id>', credited), one link per item, insert-once both;
 *       two items naming one element share the row; a match with no OSM element is refused; a re-run writes nothing
 *   RK2 the engine routes an item with NO place id from its linked OSM point (no Google point reaches the adapter)
 *   RK3 the order: an admin row for the place id, then the item's own link, then an open place carrying the place id
 *   RK4 deleting the item deletes its link and nothing else
 *   RK5 390's copy: a 389 row naming its OSM element becomes an open place carrying its place id (idempotent)
 *
 * NEGATIVE SPACE (§18d): the adapter is a stub that accepts open origins only; the batch's Nominatim call is not made
 * here — the writer is called directly with what a resolved match carries.
 *
 * DISPOSABLE DB ONLY. Run solo:
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/traveloure npx tsx --test --test-force-exit server/__tests__/lg1-open-coords-rekey.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";

process.env.STRIPE_SECRET_KEY ||= "sk_test_lg1_rekey";
process.env.TRAVEL_TIME_SERVICE_ENABLED = "1";
process.env.ROUTING_ADAPTER_STUB = "1";
delete process.env.GOOGLE_MAPS_API_KEY;
const { db } = await import("../db");
const { computePlanLegs } = await import("../services/routing/plan-legs-engine.service");
const { StubRoutingAdapter } = await import("../services/routing/stub-routing-adapter");
const { recordOpenCoordForItem, itemsWithOpenCoord, osmOpenCoordId } = await import("../services/routing/open-place-coords.service");
const { isOpenCoordOrigin } = await import("@shared/open-coords");

const RUN = crypto.randomUUID().slice(0, 8);
const id = (s: string) => `rk-${RUN}-${s}`;
const owner = id("owner");
const TRIP = id("trip");
const OSM_BASE = 8_000_000_000 + Math.floor(Math.random() * 1_000_000) * 10;

class OpenOnlyStub extends StubRoutingAdapter {
  seen: Array<{ coordOrigin?: string | null }> = [];
  acceptsPoint(p: { coordOrigin?: string | null }): boolean {
    return isOpenCoordOrigin(p.coordOrigin);
  }
  async route(o: any, d: any, mode: any, at: Date | null) {
    this.seen.push(o, d);
    return super.route(o, d, mode, at);
  }
}

// Stored (Google) points and the OSM points differ, so a leg end says which one it was built from.
const STORED = { a: [35.0037, 135.7788], b: [35.0001, 135.781] } as const;
const OSM = { a: [35.00365, 135.77851], b: [35.00011, 135.78102] } as const;
const legs = async () => ((await db.execute(sql`SELECT * FROM transport_legs WHERE trip_id = ${TRIP} AND variant_id IS NULL ORDER BY day_number, leg_order`)) as any).rows as any[];

before(async () => {
  const host = new URL(process.env.DATABASE_URL ?? "").hostname;
  if (!["localhost", "127.0.0.1", "::1", ""].includes(host) && process.env.JOURNEY_DB_WRITES_OK !== "1") throw new Error(`refusing ${host}`);
  await db.execute(sql`INSERT INTO users (id, email, first_name, last_name, role) VALUES (${owner}, ${`${owner}@t.test`}, 'RK', 'traveler', 'traveler')`);
  await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, market_slug, timezone, start_date, end_date, status, dates_confirmed_at)
    VALUES (${TRIP}, ${owner}, 'RK', 'Kyoto, Japan', 'kyoto', 'Asia/Tokyo', '2026-11-11', '2026-11-11', 'draft', now())`);
  await db.execute(sql`INSERT INTO trip_entitlements (id, trip_id, plan_key, status, source) VALUES (${`${TRIP}-pass`}, ${TRIP}, 'trip_pass', 'active', 'manual')`);
  // Neither item carries a Google place id — the case 389 could not key.
  await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, title, item_type, day_number, sort_order, latitude, longitude, start_time, end_time, origin) VALUES
    (${id("a")}, ${TRIP}, 'Stop A', 'activity', 1, 0, ${String(STORED.a[0])}, ${String(STORED.a[1])}, '09:00', '10:00', 'traveler'),
    (${id("b")}, ${TRIP}, 'Stop B', 'activity', 1, 1, ${String(STORED.b[0])}, ${String(STORED.b[1])}, '11:00', '12:00', 'traveler'),
    (${id("x")}, ${TRIP}, 'Stop B again', 'activity', 2, 0, ${String(STORED.b[0])}, ${String(STORED.b[1])}, '11:00', '12:00', 'traveler')`);
});

after(async () => {
  await db.execute(sql`DELETE FROM trips WHERE id = ${TRIP}`);
  await db.execute(sql`DELETE FROM users WHERE id = ${owner}`);
  await db.execute(sql`DELETE FROM open_place_coords WHERE osm_id BETWEEN ${OSM_BASE} AND ${OSM_BASE + 9}`);
  await db.execute(sql`DELETE FROM osm_place_coords WHERE place_id LIKE ${`ChIJ-rk-${RUN}-%`}`);
  await db.execute(sql`DELETE FROM admin_place_coords WHERE place_id LIKE ${`ChIJ-rk-${RUN}-%`}`);
});

const write = (item: string, n: number, k: "a" | "b", over: Record<string, unknown> = {}) =>
  recordOpenCoordForItem({ itemId: id(item), googlePlaceId: null, lat: OSM[k][0], lng: OSM[k][1], osmType: "node", osmId: OSM_BASE + n, osmName: `Stop ${k}`, matchedAt: new Date(), ...over } as any);

test("RK1: one open place per OSM element, one link per item, insert-once; no element ⇒ refused", async () => {
  assert.equal(osmOpenCoordId("Node", 5), "osm:node/5");
  assert.equal(osmOpenCoordId("area", 5), null);
  assert.equal(osmOpenCoordId("way", null), null);
  assert.deepEqual(await write("a", 1, "a"), { written: true, rowInserted: true, linked: true });
  assert.deepEqual(await write("b", 2, "b"), { written: true, rowInserted: true, linked: true });
  assert.deepEqual(await write("x", 2, "b"), { written: true, rowInserted: false, linked: true }, "a second item naming the same element shares the row");
  assert.deepEqual(await write("a", 1, "a"), { written: false, rowInserted: false, linked: false }, "a re-run writes nothing");
  assert.deepEqual((await write("a", 3, "a", { osmType: null })).reason, "no_osm_id");
  const row: any = ((await db.execute(sql`SELECT * FROM open_place_coords WHERE id = ${`osm:node/${OSM_BASE + 1}`}`)) as any).rows[0];
  assert.deepEqual([row.source, row.attribution, row.google_place_id, Number(row.lat)], ["osm", "© OpenStreetMap contributors", null, OSM.a[0]]);
  assert.deepEqual([...(await itemsWithOpenCoord([id("a"), id("b"), id("x"), id("nope")]))].sort(), [id("a"), id("b"), id("x")].sort());
});

test("RK2: an item with no place id is routed from its linked OSM point", async () => {
  const adapter = new OpenOnlyStub();
  await computePlanLegs(TRIP, { adapter });
  const rows = (await legs()).filter((l) => l.day_number === 1);
  assert.equal(rows.length, 1, "a → b on day 1");
  assert.deepEqual([Number(rows[0].from_lat), Number(rows[0].to_lat)], [OSM.a[0], OSM.b[0]], "both ends are the OSM points, not the stored ones");
  assert.ok(adapter.seen.length > 0 && adapter.seen.every((p) => p.coordOrigin === "osm"));
});

test("RK3: admin row for the place id, then the item's own link, then an open place carrying the place id", async () => {
  const { routingPointFor } = await import("../services/routing/open-routing-points");
  const item = { lat: 1, lng: 1, origin: "osm" as const };
  const byPlaceOsm = new Map([["P", { lat: 2, lng: 2, origin: "osm" as const }]]);
  const byPlaceAdmin = new Map([["P", { lat: 3, lng: 3, origin: "admin" as const }]]);
  const base = { placeId: "P", ownPoint: { lat: 9, lng: 9 }, factPoint: null, osmRide: false };
  assert.equal(routingPointFor({ ...base, open: byPlaceAdmin, itemOpen: item })!.lat, 3, "admin wins");
  assert.equal(routingPointFor({ ...base, open: byPlaceOsm, itemOpen: item })!.lat, 1, "the item's own link over a place-id match");
  assert.equal(routingPointFor({ ...base, open: byPlaceOsm, itemOpen: null })!.lat, 2, "a place-id match when the item has no link");
  assert.deepEqual(routingPointFor({ ...base, placeId: null, open: new Map(), itemOpen: item }), { lat: 1, lng: 1, placeId: null, coordOrigin: "osm" }, "no place id at all");
});

test("RK4: deleting an item deletes its link and nothing else", async () => {
  await db.execute(sql`DELETE FROM itinerary_items WHERE id = ${id("x")}`);
  assert.equal([...(await itemsWithOpenCoord([id("x")]))].length, 0);
  const n: any = ((await db.execute(sql`SELECT count(*)::int AS n FROM open_place_coords WHERE id = ${`osm:node/${OSM_BASE + 2}`}`)) as any).rows[0];
  assert.equal(n.n, 1, "the open place stays (item b still names it)");
});

test("RK5: 390's copy turns a 389 row naming its OSM element into an open place carrying its place id", async () => {
  const pid = `ChIJ-rk-${RUN}-legacy`;
  await db.execute(sql`INSERT INTO osm_place_coords (place_id, lat, lng, osm_type, osm_id, osm_name, matched_by, attribution, matched_at)
    VALUES (${pid}, '35.01000', '135.77000', 'way', ${OSM_BASE + 5}, 'Legacy', 'nominatim_batch', '© OpenStreetMap contributors', now()),
           (${`${pid}-noel`}, '35.02000', '135.78000', NULL, NULL, 'No element', 'nominatim_batch', '© OpenStreetMap contributors', now())`);
  const file = fs.readFileSync(path.join(process.cwd(), "server/migrations/390_open_coords_rekey.sql"), "utf8");
  const copy = file.slice(file.indexOf("INSERT INTO open_place_coords"));
  await db.execute(sql.raw(copy));
  await db.execute(sql.raw(copy)); // idempotent
  const rows: any[] = ((await db.execute(sql`SELECT * FROM open_place_coords WHERE google_place_id LIKE ${`${pid}%`}`)) as any).rows;
  assert.deepEqual(rows.map((r) => [r.id, r.source, r.google_place_id, r.name]), [[`osm:way/${OSM_BASE + 5}`, "osm", pid, "Legacy"]], "a row with no OSM element has no key and is not copied");
});
