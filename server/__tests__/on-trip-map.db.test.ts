/**
 * Row 185 J5 — the on-trip map on the Trip Card read.
 *
 *   D1  assembleTripPlan (card render) returns only today's confirmed stored stops,
 *       the chosen stay, and the current leg's leave-by; a non-UTC day boundary holds
 *   D2  Google sources, a missing coordinate, an expired Places fact, and leg coordinates
 *       are not in the projection
 *   D3  owner and collaborator receive it on ?surface=card; a stranger is 403; the live
 *       read omits it; a client lat/lng is ignored and not stored
 *
 * DISPOSABLE DB ONLY. Does not call pool.end().
 * Run: JOURNEY_DB_WRITES_OK=1 npx tsx --test --test-concurrency=1 --test-force-exit server/__tests__/on-trip-map.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import express from "express";
import type { AddressInfo } from "node:net";
import { sql } from "drizzle-orm";
import { db } from "../db";
import plancardRoutes from "../routes/plancard.routes";
import { assembleTripPlan } from "../services/trip-plan.service";
import { calendarDayOf } from "@shared/plan-timing";

const RUN = crypto.randomUUID().slice(0, 8);
const id = (s: string) => `j5m-${RUN}-${s}`;
const ids = {
  owner: id("owner"),
  friend: id("friend"),
  stranger: id("stranger"),
  trip: id("trip"),
  stay: id("stay"),
  stayB: id("stayb"),
  stayC: id("stayc"),
  a: id("a"),
  b: id("b"),
  planned: id("planned"),
  places: id("places"),
  unset: id("unset"),
  yesterday: id("yest"),
  bare: id("bare"),
  legStay: id("legstay"),
  legAB: id("legab"),
  legGoogle: id("legg"),
  setA: id("seta"),
  setB: id("setb"),
  setC: id("setc"),
  fact: id("fact"),
};

const TOKYO_MORNING = new Date("2026-11-01T15:30:00.000Z");
const TOKYO_NOON = new Date("2026-11-02T03:00:00.000Z");
const DEVICE_LAT = "1.2345678";

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
function assertDisposableDb(): void {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host: string | null = null;
  try { host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase(); } catch { host = null; }
  if (host === null || !DISPOSABLE_HOSTS.has(host)) {
    throw new Error(`[on-trip-map] REFUSING to write: '${host ?? "<none>"}' is not disposable. Opt in with JOURNEY_DB_WRITES_OK=1.`);
  }
}

let server: http.Server;
let base = "";

async function read(userId: string, card: boolean, extra = ""): Promise<{ status: number; body: any }> {
  const q = `${card ? "?surface=card" : "?"}${extra}`;
  const res = await fetch(`${base}/api/trips/${ids.trip}/plancard${q}`, { headers: { "x-test-user": userId } });
  const text = await res.text();
  let body: any = null;
  try { body = JSON.parse(text); } catch { body = null; }
  return { status: res.status, body };
}

before(async () => {
  assertDisposableDb();
  for (const userId of [ids.owner, ids.friend, ids.stranger]) {
    await db.execute(sql`
      INSERT INTO users (id, email, first_name, last_name, role)
      VALUES (${userId}, ${`${userId}@t.test`}, 'J5', 'Map', 'user')
    `);
  }
  await db.execute(sql`
    INSERT INTO trips (id, user_id, title, destination, start_date, end_date, status, timezone, adults)
    VALUES (${ids.trip}, ${ids.owner}, ${`Map ${RUN}`}, ${`Mp${RUN}, Testland`}, '2026-11-01', '2026-11-04', 'draft', 'Asia/Tokyo', 2)
  `);
  await db.execute(sql`
    INSERT INTO trip_collaborators (id, trip_id, user_id, role) VALUES
      (${crypto.randomUUID()}, ${ids.trip}, ${ids.owner}, 'owner'),
      (${crypto.randomUUID()}, ${ids.trip}, ${ids.friend}, 'friend')
  `);
  await db.execute(sql`
    INSERT INTO itinerary_items (id, trip_id, title, item_type, status, day_number, sort_order, start_time, duration_minutes, latitude, longitude, coord_source, origin) VALUES
      (${ids.stay}, ${ids.trip}, 'Chosen inn', 'accommodation', 'planned', 1, 0, NULL, NULL, '35.0200000', '135.7600000', 'osm', 'traveler'),
      (${ids.stayB}, ${ids.trip}, 'Other inn', 'accommodation', 'planned', 1, 1, NULL, NULL, '33.2100000', '135.1000000', 'osm', 'traveler'),
      (${ids.stayC}, ${ids.trip}, 'Open inn', 'accommodation', 'planned', 1, 2, NULL, NULL, '33.3100000', '135.2000000', 'osm', 'traveler'),
      (${ids.a}, ${ids.trip}, 'Morning stop', 'activity', 'confirmed', 2, 1, '10:00', 60, '35.1100000', '135.7700000', 'osm', 'traveler'),
      (${ids.b}, ${ids.trip}, 'Afternoon stop', 'activity', 'confirmed', 2, 2, '14:00', 60, '35.1200000', '135.7800000', 'osm', 'traveler'),
      (${ids.planned}, ${ids.trip}, 'Still planned', 'activity', 'planned', 2, 3, '11:00', 30, '4.4444001', '135.1000000', 'osm', 'traveler'),
      (${ids.places}, ${ids.trip}, 'Places pin', 'activity', 'confirmed', 2, 4, '11:30', 30, '7.7777001', '135.1000000', 'places', 'traveler'),
      (${ids.unset}, ${ids.trip}, 'Unset source', 'activity', 'confirmed', 2, 5, '11:40', 30, '6.6666001', '135.1000000', NULL, 'traveler'),
      (${ids.yesterday}, ${ids.trip}, 'Yesterday', 'activity', 'confirmed', 1, 6, '16:00', 30, '3.3333001', '135.4000000', 'osm', 'traveler'),
      (${ids.bare}, ${ids.trip}, 'No coordinates', 'activity', 'confirmed', 2, 7, '12:00', 30, NULL, NULL, 'osm', 'traveler')
  `);
  await db.execute(sql`
    INSERT INTO plan_option_sets (id, trip_id, itinerary_item_id, category_key, status, anchor_role, created_at) VALUES
      (${ids.setA}, ${ids.trip}, ${ids.stay}, 'accommodation', 'chosen', 'primary', '2026-10-01'),
      (${ids.setB}, ${ids.trip}, ${ids.stayB}, 'accommodation', 'chosen', 'secondary', '2026-10-20'),
      (${ids.setC}, ${ids.trip}, ${ids.stayC}, 'accommodation', 'open', 'primary', '2026-10-25')
  `);
  await db.execute(sql`
    INSERT INTO transport_legs (
      id, trip_id, day_number, leg_order, from_activity_id, from_name, from_lat, from_lng,
      to_activity_id, to_name, to_lat, to_lng, distance_meters, distance_display, recommended_mode,
      estimated_duration_minutes, proposal_status, source, coord_source
    ) VALUES
      (${ids.legStay}, ${ids.trip}, 2, 0, ${ids.stay}, 'inn', 8.8888001, 135.1, ${ids.a}, 'morning', 35.11, 135.77, 800, '0.8 km', 'walk', 20, 'confirmed', 'osrm', NULL),
      (${ids.legAB}, ${ids.trip}, 2, 1, ${ids.a}, 'morning', 35.11, 135.77, ${ids.b}, 'afternoon', 35.12, 135.78, 900, '0.9 km', 'walk', 25, 'confirmed', 'osrm', NULL),
      (${ids.legGoogle}, ${ids.trip}, 2, 2, ${ids.b}, 'afternoon', 9.9999001, 135.9, ${ids.planned}, 'planned', 4.44, 135.1, 100, '0.1 km', 'walk', 10, 'confirmed', 'osrm', 'google')
  `);
  await db.execute(sql`
    INSERT INTO place_facts (id, place_ref_kind, place_ref, need, fact_type, value, origin, fetched_at, expires_at, plan_id, itinerary_item_id)
    VALUES (
      ${ids.fact}, 'place_id', ${`fact-${RUN}`}, 'pin', 'location',
      ${JSON.stringify({ lat: 5.5555001, lng: 135.55 })}::jsonb,
      'places_api', now() - interval '40 days', now() - interval '10 days', ${ids.trip}, ${ids.bare}
    )
  `);

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { claims: { sub: req.headers["x-test-user"] } };
    (req as any).isAuthenticated = () => true;
    (req as any).logout = (cb?: () => void) => { cb?.(); };
    next();
  });
  app.use(plancardRoutes);
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  await db.execute(sql`DELETE FROM place_facts WHERE plan_id = ${ids.trip}`).catch(() => {});
  await db.execute(sql`DELETE FROM plan_option_sets WHERE trip_id = ${ids.trip}`).catch(() => {});
  await db.execute(sql`DELETE FROM transport_legs WHERE trip_id = ${ids.trip}`).catch(() => {});
  await db.execute(sql`DELETE FROM trip_collaborators WHERE trip_id = ${ids.trip}`).catch(() => {});
  await db.execute(sql`DELETE FROM itinerary_items WHERE trip_id = ${ids.trip}`).catch(() => {});
  await db.execute(sql`DELETE FROM trips WHERE id = ${ids.trip}`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id IN (${ids.owner}, ${ids.friend}, ${ids.stranger})`).catch(() => {});
});

function absent(map: unknown, tokens: string[]): void {
  const blob = JSON.stringify(map);
  for (const token of tokens) assert.equal(blob.includes(token), false, token);
}

/** Coordinates that are never a pin, on any clock: Google sources, the Places fact, leg endpoints, the unchosen stays. */
const NEVER = ["8.8888", "9.9999", "7.7777", "6.6666", "5.5555", "4.4444", "33.21", "33.31", "1.2345"];

test("D1–D2 card projection: today's confirmed stops, chosen stay, leave-by, zone boundary", async () => {
  const morning = await assembleTripPlan(ids.trip, "full", { render: "final", now: TOKYO_MORNING, viewerId: ids.owner, tripRole: "owner" });
  const early = morning.plancard.onTripMap;
  assert.ok(early, "card render attaches onTripMap");
  assert.equal(early.day, "2026-11-02");
  assert.deepEqual(early.stops.map((s) => s.id), [ids.a, ids.b]);
  assert.equal(early.stay?.itemId, ids.stay);
  assert.ok(Math.abs((early.stay?.lat ?? 0) - 35.02) < 1e-5);
  assert.deepEqual(early.leg, { id: ids.legStay, fromItemId: ids.stay, toItemId: ids.a, leaveBy: "09:40" });
  absent(early, [...NEVER, "3.3333"]);

  const noon = await assembleTripPlan(ids.trip, "full", { render: "final", now: TOKYO_NOON, viewerId: ids.owner, tripRole: "owner" });
  assert.deepEqual(noon.plancard.onTripMap?.leg, { id: ids.legAB, fromItemId: ids.a, toItemId: ids.b, leaveBy: "13:35" });
  assert.equal(noon.plancard.onTripMap?.stops.some((s) => s.id === ids.yesterday), false);

  const live = await assembleTripPlan(ids.trip, "full", { render: "live", now: TOKYO_NOON, viewerId: ids.owner, tripRole: "owner" });
  assert.equal(live.plancard.onTripMap, undefined);
});

test("D3 auth: owner and collaborator on the card, stranger refused, no device position", async () => {
  const owner = await read(ids.owner, true, `&lat=${DEVICE_LAT}&lng=2.3456789`);
  assert.equal(owner.status, 200, JSON.stringify(owner.body)?.slice(0, 400));
  assert.equal(owner.body.tripRole, "owner");
  assert.equal(owner.body.onTripMap.day, calendarDayOf(new Date(), "Asia/Tokyo"));
  assert.ok(Array.isArray(owner.body.onTripMap.stops));
  absent(owner.body.onTripMap, NEVER);

  const friend = await read(ids.friend, true);
  assert.equal(friend.status, 200, JSON.stringify(friend.body)?.slice(0, 400));
  assert.equal(friend.body.tripRole, "friend");
  assert.ok(friend.body.onTripMap);

  const stranger = await read(ids.stranger, true);
  assert.equal(stranger.status, 403);
  assert.equal(stranger.body?.onTripMap, undefined);

  const slip = await read(ids.owner, false);
  assert.equal(slip.status, 200, JSON.stringify(slip.body)?.slice(0, 300));
  assert.equal("onTripMap" in slip.body, false);

  const stored = await db.execute(sql`SELECT latitude::text AS lat FROM itinerary_items WHERE trip_id = ${ids.trip}`);
  const lats = (stored.rows as Array<{ lat: string | null }>).map((r) => r.lat);
  assert.equal(lats.some((lat) => (lat ?? "").includes(DEVICE_LAT)), false);
});
