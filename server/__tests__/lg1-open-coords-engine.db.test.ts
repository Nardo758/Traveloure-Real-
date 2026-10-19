/**
 * LG-1 — THE ENGINE ROUTES ONLY BETWEEN OPEN COORDINATES when its adapter says so (ledger
 * `2026-10-17-lg1-osm-place-coords`; migration 389), end to end against a real database.
 *
 *   LG1  an adapter with the OSRM rule is never handed a Google point: a stop whose place has no OSM/admin row gets
 *        no routed leg in or out, and no leg goes round it (LG-2 Ask 6); the adapter IS called for the located stops
 *        (a fourth stop d, for this test only, gives c>d) and every leg end is the OSM coordinate
 *   LG2  an admin row for that stop's place id makes it routable on the next recompute, from the admin coordinate;
 *        the two legs through it are routed
 *   LG3  an admin row wins over an OSM match for the same place id
 *
 * NEGATIVE SPACE (§18d): the adapter is the CI stub wearing the OSRM adapter's acceptsPoint rule (no request leaves
 * the process). The OSRM adapter's own refusal is OS9 in osrm-routing-adapter.test.ts.
 *
 * DISPOSABLE DB ONLY. Run solo:
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/traveloure npx tsx --test --test-force-exit server/__tests__/lg1-open-coords-engine.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";

process.env.STRIPE_SECRET_KEY ||= "sk_test_lg1_open_coords";
process.env.TRAVEL_TIME_SERVICE_ENABLED = "1";
process.env.ROUTING_ADAPTER_STUB = "1";
delete process.env.GOOGLE_MAPS_API_KEY;
const { db } = await import("../db");
const { computePlanLegs } = await import("../services/routing/plan-legs-engine.service");
const { StubRoutingAdapter } = await import("../services/routing/stub-routing-adapter");
const { isOpenCoordOrigin } = await import("@shared/open-coords");

const RUN = crypto.randomUUID().slice(0, 8);
const id = (s: string) => `lg1-${RUN}-${s}`;
const owner = id("owner");
const TRIP = id("trip");
const pid = (k: string) => `ChIJ-lg1-${RUN}-${k}`;
// A per-run OSM element id range, so concurrent runs never share an open place.
const OSM_BASE = 9_000_000_000 + Math.floor(Math.random() * 1_000_000) * 10;
const osmId = (n: number) => `osm:node/${OSM_BASE + n}`;

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

// Stored (Google) points and the OSM points, deliberately different so a leg end says which it was built from.
const STORED = { a: [35.0037, 135.7788], b: [35.0001, 135.781], c: [34.9949, 135.785] } as const;
const OSM = { a: [35.00365, 135.77851], c: [34.99486, 135.78504] } as const;
const ADMIN_B = [35.00021, 135.78111] as const;
// LG1's own fourth stop (Ask 6): stored and OSM points differ, like the others.
const STORED_D = [34.9901, 135.7901] as const;
const OSM_D = [34.99009, 135.79012] as const;

async function legs(): Promise<any[]> {
  return (await db.execute(sql`SELECT * FROM transport_legs WHERE trip_id = ${TRIP} AND variant_id IS NULL ORDER BY day_number, leg_order`)).rows as any[];
}
const pairs = (rows: any[]) => rows.map((l) => `${String(l.from_activity_id).split("-").pop()}>${String(l.to_activity_id).split("-").pop()}`);

before(async () => {
  const host = new URL(process.env.DATABASE_URL ?? "").hostname;
  if (!["localhost", "127.0.0.1", "::1", ""].includes(host) && process.env.JOURNEY_DB_WRITES_OK !== "1") throw new Error(`refusing ${host}`);
  await db.execute(sql`INSERT INTO users (id, email, first_name, last_name, role) VALUES (${owner}, ${`${owner}@t.test`}, 'LG1', 'traveler', 'traveler')`);
  await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, market_slug, timezone, start_date, end_date, status, dates_confirmed_at)
    VALUES (${TRIP}, ${owner}, 'LG1', 'Kyoto, Japan', 'kyoto', 'Asia/Tokyo', '2026-11-11', '2026-11-11', 'draft', now())`);
  await db.execute(sql`INSERT INTO trip_entitlements (id, trip_id, plan_key, status, source) VALUES (${`${TRIP}-pass`}, ${TRIP}, 'trip_pass', 'active', 'manual')`);
  const rows: Array<[string, number, string, string]> = [
    ["a", 0, "09:00", "10:00"],
    ["b", 1, "11:00", "12:00"],
    ["c", 2, "13:00", "14:00"],
  ];
  for (const [k, order, start, end] of rows) {
    const [lat, lng] = STORED[k as keyof typeof STORED];
    await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, title, item_type, day_number, sort_order, latitude, longitude, start_time, end_time, origin, google_place_id)
      VALUES (${`${TRIP}-${k}`}, ${TRIP}, ${`Stop ${k.toUpperCase()}`}, 'activity', 1, ${order}, ${String(lat)}, ${String(lng)}, ${start}, ${end}, 'traveler', ${pid(k)})`);
  }
  // Migration 390: an open place keyed by its own OSM element, carrying the item's place id as an attribute.
  for (const [n, k] of [[1, "a"], [2, "c"]] as const) {
    await db.execute(sql`INSERT INTO open_place_coords (id, source, osm_type, osm_id, lat, lng, name, google_place_id, matched_by, attribution, matched_at)
      VALUES (${osmId(n)}, 'osm', 'node', ${OSM_BASE + n}, ${String(OSM[k][0])}, ${String(OSM[k][1])}, ${`Stop ${k}`}, ${pid(k)}, 'nominatim_batch', '© OpenStreetMap contributors', now())`);
  }
});

after(async () => {
  await db.execute(sql`DELETE FROM trips WHERE id = ${TRIP}`);
  await db.execute(sql`DELETE FROM users WHERE id = ${owner}`);
  await db.execute(sql`DELETE FROM open_place_coords WHERE google_place_id LIKE ${`ChIJ-lg1-${RUN}-%`}`);
  await db.execute(sql`DELETE FROM admin_place_coords WHERE place_id LIKE ${`ChIJ-lg1-${RUN}-%`}`);
});

test("LG1: a Google-only stop gets no routed leg; every leg end is the OSM point", async () => {
  // LG-2 Ask 6: legs are adjacent-only, so a·b·c alone (b Google-only) has no located pair. A fourth located stop d,
  // for this test only, gives c>d — the leg proving the adapter IS called for located stops, from their OSM points.
  await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, title, item_type, day_number, sort_order, latitude, longitude, start_time, end_time, origin, google_place_id)
    VALUES (${`${TRIP}-d`}, ${TRIP}, 'Stop D', 'activity', 1, 3, ${String(STORED_D[0])}, ${String(STORED_D[1])}, '15:00', '16:00', 'traveler', ${pid("d")})`);
  await db.execute(sql`INSERT INTO open_place_coords (id, source, osm_type, osm_id, lat, lng, name, google_place_id, matched_by, attribution, matched_at)
    VALUES (${osmId(3)}, 'osm', 'node', ${OSM_BASE + 3}, ${String(OSM_D[0])}, ${String(OSM_D[1])}, 'Stop d', ${pid("d")}, 'nominatim_batch', '© OpenStreetMap contributors', now())`);
  try {
    const adapter = new OpenOnlyStub();
    await computePlanLegs(TRIP, { adapter });
    const rows = await legs();
    assert.deepEqual(pairs(rows), ["c>d"], "LG-2 Ask 6: no leg in or out of b, and none goes round it; c>d is routed");
    assert.ok(adapter.seen.length > 0, "the adapter is called for the located stops");
    assert.ok(adapter.seen.every((p) => isOpenCoordOrigin(p.coordOrigin)), "the adapter was never handed a Google point");
    assert.equal(Number(rows[0].from_lat), OSM.c[0]);
    assert.equal(Number(rows[0].from_lng), OSM.c[1]);
    assert.equal(Number(rows[0].to_lat), OSM_D[0]);
  } finally {
    await db.execute(sql`DELETE FROM transport_legs WHERE trip_id = ${TRIP}`);
    await db.execute(sql`DELETE FROM itinerary_items WHERE id = ${`${TRIP}-d`}`);
    await db.execute(sql`DELETE FROM open_place_coords WHERE id = ${osmId(3)}`);
  }
});

test("LG2: an admin row makes the stop routable from the admin coordinate", async () => {
  await db.execute(sql`INSERT INTO admin_place_coords (place_id, lat, lng, source_url, entered_by, entered_at)
    VALUES (${pid("b")}, ${String(ADMIN_B[0])}, ${String(ADMIN_B[1])}, 'https://example.jp/official', ${owner}, now())`);
  const adapter = new OpenOnlyStub();
  await computePlanLegs(TRIP, { adapter });
  const rows = await legs();
  assert.deepEqual(pairs(rows), ["a>b", "b>c"]);
  assert.equal(Number(rows[0].to_lat), ADMIN_B[0]);
  assert.equal(Number(rows[1].from_lng), ADMIN_B[1]);
  assert.ok(adapter.seen.every((p) => isOpenCoordOrigin(p.coordOrigin)));
});

test("LG3: an admin row wins over an OSM match for the same place", async () => {
  await db.execute(sql`INSERT INTO admin_place_coords (place_id, lat, lng, source_url, entered_by, entered_at)
    VALUES (${pid("c")}, '34.99500', '135.78510', 'https://example.jp/official', ${owner}, now())`);
  await computePlanLegs(TRIP, { adapter: new OpenOnlyStub() });
  const rows = await legs();
  const last = rows.find((l) => String(l.to_activity_id).endsWith("-c"));
  assert.equal(Number(last.to_lat), 34.995);
  assert.equal(Number(last.to_lng), 135.7851);
});
