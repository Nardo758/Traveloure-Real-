/**
 * L1-4 — re-route a ready-made copy's first and last legs to the buyer's stay; a first re-date moves
 * the copy's anchors (work plan docs/planning/expert-console-ready-made-work-plan.md; R-ba, R-bg).
 *
 *   R1  a located `hotel_checkin` anchor on a copy (through the REAL anchors rail) replaces the
 *       author's lodging end legs with exactly 2 `rerouted_for_stay` legs (stay → first stop of day 1,
 *       last stop of the last day → stay) in the replaced legs' modes; the middle legs are unchanged
 *   R2  changing the stay re-routes again: still exactly 2 re-routed legs, now from the new point
 *   R3  a plan that is not a copy is never touched; an anchor with no coordinate re-routes nothing
 *   D1  the first re-date of a copy (dates still a placeholder) shifts its anchors by the same days;
 *       a second re-date (dates now confirmed) does not
 *   D2  re-dating a plan that is not a copy never moves its anchors
 *   R0  with no way to compute a route (service off, no Google key), the author's end legs are KEPT
 *       and nothing is invented
 *   U1  `stayPointsFromAnchors` pure cases
 *
 * NEGATIVE SPACE (§18d): a stay chosen through the where-to-stay chooser writes no hotel anchor and
 * is not re-routed (stated limit in stay-reroute.service.ts). Leg durations come from the engine
 * without a Google key here; only the shape and the modes are asserted.
 *
 * DISPOSABLE DB ONLY. Run solo:
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/traveloure npx tsx --test server/__tests__/stay-reroute.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import express from "express";
import type { AddressInfo } from "node:net";
import { sql } from "drizzle-orm";

// trips.routes builds a Stripe client at import; a test key, never a real one.
process.env.STRIPE_SECRET_KEY ||= "sk_test_stay_reroute";
// The ONE travel-time service, on with no Google key: legs resolve to its labelled straight-line
// estimate, offline (R0 below turns it off to prove the no-route branch).
process.env.TRAVEL_TIME_SERVICE_ENABLED = "1";
delete process.env.GOOGLE_MAPS_API_KEY;
const { db } = await import("../db");
const { storage } = await import("../storage");
const tripsRoutes = (await import("../routes/trips.routes")).default;
const { stayPointsFromAnchors } = await import("../services/stay-reroute.service");

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
  plainFlight: `l14-${RUN}-plainflight`,
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

async function call(method: "POST" | "PUT", url: string, body: unknown) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { claims: { sub: ids.owner } };
    (req as any).isAuthenticated = () => true;
    next();
  });
  app.use(tripsRoutes);
  const server = app.listen(0);
  await new Promise<void>((r) => server.once("listening", () => r()));
  const { port } = server.address() as AddressInfo;
  try {
    const res = await fetch(`http://127.0.0.1:${port}${url}`, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return { status: res.status, body: await res.json().catch(() => null) };
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
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
  await db.execute(sql`INSERT INTO temporal_anchors (id, trip_id, anchor_type, anchor_datetime) VALUES
    (${ids.flight}, ${ids.copy}, 'flight_arrival', '2026-10-04 14:30:00'),
    (${ids.plainFlight}, ${ids.plain}, 'flight_arrival', '2026-10-04 14:30:00')`);
});

after(async () => {
  await db.execute(sql`DELETE FROM ready_made_purchases WHERE id = ${ids.purchase}`);
  await db.execute(sql`DELETE FROM ready_made_trips WHERE id = ${ids.listing}`);
  await db.execute(sql`DELETE FROM trips WHERE id IN (${ids.copy}, ${ids.plain}, ${ids.build})`);
  await db.execute(sql`DELETE FROM users WHERE id IN (${ids.owner}, ${ids.author})`);
});

let stayAnchorId = "";

test("R0: no computable route ⇒ the author's end legs are kept", async () => {
  delete process.env.TRAVEL_TIME_SERVICE_ENABLED;
  const { rerouteCopyForStay } = await import("../services/stay-reroute.service");
  await db.execute(sql`INSERT INTO temporal_anchors (id, trip_id, anchor_type, anchor_datetime, location, latitude, longitude)
    VALUES (${`${ids.copy}-tmp`}, ${ids.copy}, 'hotel_checkin', '2026-10-04 15:00:00', 'Tmp', 34.98, 135.75)`);
  const result = await rerouteCopyForStay(ids.copy);
  assert.deepEqual(result, { rerouted: 0, removed: 0 });
  assert.deepEqual((await legs(ids.copy)).map((l) => l.id).sort(), [ids.legAB, ids.legCD, ids.legDH, ids.legHA].sort());
  await db.execute(sql`DELETE FROM temporal_anchors WHERE id = ${`${ids.copy}-tmp`}`);
  process.env.TRAVEL_TIME_SERVICE_ENABLED = "1";
});

test("R1: a located check-in anchor re-routes exactly the two end legs", async () => {
  const r = await call("POST", `/api/trips/${ids.copy}/anchors`, {
    anchorType: "hotel_checkin", anchorDatetime: "2026-10-04T15:00:00Z", location: "Hotel Granvia Kyoto", latitude: "34.9850", longitude: "135.7588",
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  stayAnchorId = r.body.id;
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
  const ab = rows.find((l) => l.id === ids.legAB)!;
  assert.deepEqual([ab.origin, ab.user_selected_mode], ["author_pick", "walk"]);
});

test("R2: changing the stay re-routes again without stacking legs", async () => {
  const r = await call("PUT", `/api/anchors/${stayAnchorId}`, { location: "Ace Hotel Kyoto", latitude: "35.0050", longitude: "135.7620" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const rerouted = (await legs(ids.copy)).filter((l) => l.origin === "rerouted_for_stay");
  assert.equal(rerouted.length, 2);
  assert.ok(rerouted.every((l) => l.from_name === "Ace Hotel Kyoto" || l.to_name === "Ace Hotel Kyoto"));
  assert.equal((await legs(ids.copy)).length, 4);
});

test("R3: not a copy, or no coordinate ⇒ nothing re-routed", async () => {
  const before = await legs(ids.plain);
  const r = await call("POST", `/api/trips/${ids.plain}/anchors`, {
    anchorType: "hotel_checkin", anchorDatetime: "2026-10-04T15:00:00Z", location: "Somewhere", latitude: "35.0", longitude: "135.7",
  });
  assert.equal(r.status, 201);
  assert.deepEqual((await legs(ids.plain)).map((l) => l.id), before.map((l) => l.id));
  assert.deepEqual(stayPointsFromAnchors([{ anchorType: "hotel_checkin", latitude: null, longitude: null, location: "x" }]), { start: null, end: null });
});

test("D1: the first re-date of a copy shifts its anchors; a later one does not", async () => {
  const at = async (id: string) => new Date(((await db.execute(sql`SELECT anchor_datetime FROM temporal_anchors WHERE id = ${id}`)).rows[0] as any).anchor_datetime).getTime();
  const before = await at(ids.flight);
  await storage.updateTrip(ids.copy, { startDate: "2026-11-14", endDate: "2026-11-15" } as any);
  assert.equal(await at(ids.flight), before + 41 * 86_400_000);
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

test("U1: stayPointsFromAnchors", () => {
  const t1 = new Date("2026-10-01T00:00:00Z");
  const t2 = new Date("2026-10-02T00:00:00Z");
  const both = stayPointsFromAnchors([
    { anchorType: "hotel_checkin", latitude: "35", longitude: "135", location: "Old", updatedAt: t1 },
    { anchorType: "hotel_checkin", latitude: "35.1", longitude: "135.1", location: "New", updatedAt: t2 },
    { anchorType: "hotel_checkout", latitude: "34", longitude: "134", location: " ", updatedAt: t1 },
  ]);
  assert.deepEqual(both, { start: { name: "New", lat: 35.1, lng: 135.1 }, end: { name: "Your stay", lat: 34, lng: 134 } });
  const inOnly = stayPointsFromAnchors([{ anchorType: "hotel_checkin", latitude: 35, longitude: 135, location: "A" }]);
  assert.deepEqual(inOnly.end, inOnly.start, "no check-out ⇒ the day ends where it started");
  assert.deepEqual(stayPointsFromAnchors([{ anchorType: "hotel_checkin", latitude: 0, longitude: 0, location: "Null Island" }]).start, null);
});
