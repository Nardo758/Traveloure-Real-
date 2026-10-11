/**
 * TC-3b — the ride recommender and the trip profile overlay against a real database (ledger
 * `2026-10-11-tc3b-ride-recommender`; migration 370).
 *   RB1 a paid plan's owner gets the swap over a routed leg; the first serving records ONE `offered` row
 *   RB2 a stranger, an unconfirmed window or a free plan's owner get no suggestions; the free plan gets the teaser
 *   RB3 the dismiss closes the corridor for this trip — once — and a later read offers nothing there
 *   RB4 the overlay's child heights hide a ride under its stated minimum; `null` clears the field
 *   RB5 the general trip rails can neither forge nor wipe the overlay
 *   RB6 the plan's profile read merges the overlay over the account profile
 *   RB7 a ride inserted between the stops reports its corridor, so the route can record `accepted`
 *
 * NEGATIVE SPACE (§18d): the dismiss and overlay ROUTES are thin owner-gated wrappers over the services proven
 * here (and are probed by the mutation-auth suite); the pure ranking rules are shared/__tests__/ride-recommender.
 *
 * DISPOSABLE DB ONLY. Run solo:
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/traveloure npx tsx --test --test-force-exit server/__tests__/tc3b-ride-recommender.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";

process.env.STRIPE_SECRET_KEY ||= "sk_test_tc3b";
const { db } = await import("../db");
const { storage } = await import("../storage");
const { rideRecommendationsForTrip } = await import("../services/ride-recommender.service");
const { addSkippedCorridor, readTripProfileOverlay, writeTripProfileOverlay } = await import("../services/trip-profile-overlay.service");
const { recordTransportOptionEvents } = await import("../services/transport-option-events.service");
const { getTravelerProfileForTrip } = await import("../services/traveler-profile.service");
const { insertRide } = await import("../services/ride-item.service");
const { corridorKey } = await import("@shared/ride-recommender");

const RUN = crypto.randomUUID().slice(0, 8);
const K = crypto.randomInt(0, 100_000) / 1e4;
const P = (dLat: number, dLng: number) => ({ lat: 34 + dLat, lng: 133 + K + dLng });
const id = (s: string) => `tc3b-${RUN}-${s}`;
const owner = id("owner");
const stranger = id("stranger");
const op = id("operator");
const PAID = id("paid");
const FREE = id("free");
const RIDE = id("ride");
const DAY = "2026-11-20";
const NOW = new Date("2026-11-01T03:00:00Z");
const A = P(0, 0);
const C = P(0.06, 0.05);

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
function assertDisposableDb(): void {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  const host = (() => {
    try {
      return new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
    } catch {
      return "<none>";
    }
  })();
  if (!DISPOSABLE_HOSTS.has(host)) throw new Error(`[tc3b] REFUSING to write fixtures to '${host}'.`);
}

async function trip(tid: string, opts: { paid: boolean; confirmed: boolean }) {
  await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, market_slug, timezone, start_date, end_date, status, dates_confirmed_at)
    VALUES (${tid}, ${owner}, 'TC3b', 'Kyoto, Japan', 'kyoto', 'Asia/Tokyo', ${DAY}, ${DAY}, 'draft', ${opts.confirmed ? sql`now()` : sql`NULL`})`);
  if (opts.paid) await db.execute(sql`INSERT INTO trip_entitlements (id, trip_id, plan_key, status, source) VALUES (${`${tid}-pass`}, ${tid}, 'trip_pass', 'active', 'manual')`);
  for (const [key, order, p, start, end] of [["a", 0, A, "09:00", "10:00"], ["c", 1, C, "13:00", "14:00"]] as const) {
    await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, title, item_type, day_number, sort_order, latitude, longitude, start_time, end_time, origin)
      VALUES (${`${tid}-${key}`}, ${tid}, ${key.toUpperCase()}, 'activity', 1, ${order}, ${String(p.lat)}, ${String(p.lng)}, ${start}, ${end}, 'traveler')`);
  }
  await db.execute(sql`INSERT INTO transport_legs (id, trip_id, day_number, leg_order, from_activity_id, from_name, from_lat, from_lng, to_activity_id, to_name, to_lat, to_lng,
      distance_meters, distance_display, recommended_mode, estimated_duration_minutes, alternative_modes, energy_cost, proposal_status, checked_by, checked_at, source, calculated_at)
    VALUES (${`${tid}-leg`}, ${tid}, 1, 1, ${`${tid}-a`}, 'A', ${A.lat}, ${A.lng}, ${`${tid}-c`}, 'C', ${C.lat}, ${C.lng}, 9000, '9 km', 'transit', 40, '[]'::jsonb, 0, 'confirmed', ${owner}, now(), 'stub', now())`);
  // P0-b item 5: a leg is routed only when the engine sourced it, so the fixture leg carries a source.
}

async function offeredRows(tid: string): Promise<number> {
  const r = await db.execute(sql`SELECT count(*)::int AS n FROM transport_option_events WHERE trip_id = ${tid} AND event = 'offered'`);
  return Number(((r as any).rows ?? r)[0].n);
}
const settle = () => new Promise((r) => setTimeout(r, 150));

before(async () => {
  assertDisposableDb();
  for (const u of [owner, stranger, op]) {
    await db.execute(sql`INSERT INTO users (id, email, first_name, last_name, role) VALUES (${u}, ${`${u}@t.test`}, 'T', 'B', 'traveler')`);
  }
  await db.execute(sql`INSERT INTO provider_services (id, user_id, service_name, city, status, approval_status, duration_minutes)
    VALUES (${RIDE}, ${op}, 'Test scenic train', 'Kyoto', 'active', 'approved', 90)`);
  // Boarding ~300 m from A, exit ~300 m from C.
  await db.execute(sql`INSERT INTO service_route_points (id, service_id, position, name, latitude, longitude) VALUES
    (${`${RIDE}-p1`}, ${RIDE}, 1, 'Upper station', ${String(A.lat + 0.0027)}, ${String(A.lng)}),
    (${`${RIDE}-p2`}, ${RIDE}, 2, 'Lower station', ${String(C.lat - 0.0027)}, ${String(C.lng)})`);
  await db.execute(sql`INSERT INTO service_transport_facts (service_id, official_source, notes)
    VALUES (${RIDE}, 'https://example.test/official', '{"childMinHeightCm": 80, "fare": {"currency": "JPY", "adult": 900, "child": 450}}'::jsonb)`);
  await db.execute(sql`INSERT INTO vendor_availability_slots (id, service_id, provider_id, date, start_time, status) VALUES
    (${`${RIDE}-s1`}, ${RIDE}, ${op}, ${DAY}, '10:30', 'available'), (${`${RIDE}-s2`}, ${RIDE}, ${op}, ${DAY}, '12:30', 'available')`);
  await trip(PAID, { paid: true, confirmed: true });
  await trip(FREE, { paid: false, confirmed: true });
});

after(async () => {
  await db.execute(sql`DELETE FROM transport_option_events WHERE trip_id IN (${PAID}, ${FREE})`);
  await db.execute(sql`DELETE FROM trips WHERE id IN (${PAID}, ${FREE}, ${id("unconfirmed")})`);
  await db.execute(sql`DELETE FROM provider_services WHERE id = ${RIDE}`);
  await db.execute(sql`DELETE FROM users WHERE id IN (${owner}, ${stranger}, ${op})`);
});

test("RB1 the paid plan's owner gets the swap; the first serving records ONE offered row", async () => {
  const first = await rideRecommendationsForTrip(PAID, owner, NOW);
  const day = first.suggestions.get(1) ?? [];
  assert.equal(day.length, 1);
  assert.equal(day[0].serviceId, RIDE);
  assert.equal(day[0].departure, "10:30"); // 12:30 + 90 min misses the 13:00 stop
  assert.equal(day[0].legId, `${PAID}-leg`);
  assert.equal(day[0].corridorKey, corridorKey(`${PAID}-a`, `${PAID}-c`));
  assert.deepEqual(day[0].fare, { currency: "JPY", adult: 900, child: 450 });
  assert.equal(first.teasers.size, 0);
  await settle();
  assert.equal(await offeredRows(PAID), 1);
  await rideRecommendationsForTrip(PAID, owner, NOW);
  await settle();
  assert.equal(await offeredRows(PAID), 1, "served again: still one row");
});

test("RB2 a stranger, an unconfirmed window or a free plan get no suggestions; the free plan gets the teaser", async () => {
  assert.equal((await rideRecommendationsForTrip(PAID, stranger, NOW)).suggestions.size, 0);
  const free = await rideRecommendationsForTrip(FREE, owner, NOW);
  assert.equal(free.suggestions.size, 0);
  assert.deepEqual(free.teasers.get(1), { rides: 1 });
  await settle();
  assert.equal(await offeredRows(FREE), 0, "a teaser records nothing");
  await trip(id("unconfirmed"), { paid: true, confirmed: false });
  assert.equal((await rideRecommendationsForTrip(id("unconfirmed"), owner, NOW)).suggestions.size, 0);
});

test("RB3 the dismiss closes the corridor for this trip, once", async () => {
  const key = corridorKey(`${PAID}-a`, `${PAID}-c`);
  assert.equal(await addSkippedCorridor(PAID, key), true);
  assert.equal(await addSkippedCorridor(PAID, key), false, "already closed: nothing written");
  await recordTransportOptionEvents([{ tripId: PAID, corridorKey: key, serviceId: RIDE, event: "skipped", dayNumber: 1 }]);
  await recordTransportOptionEvents([{ tripId: PAID, corridorKey: key, serviceId: RIDE, event: "skipped", dayNumber: 1 }]);
  const r = await db.execute(sql`SELECT count(*)::int AS n FROM transport_option_events WHERE trip_id = ${PAID} AND event = 'skipped'`);
  assert.equal(Number(((r as any).rows ?? r)[0].n), 1);
  assert.deepEqual((await readTripProfileOverlay(PAID)).skippedCorridors, [key]);
  assert.equal((await rideRecommendationsForTrip(PAID, owner, NOW)).suggestions.size, 0);
});

test("RB4 child heights hide a ride under its stated minimum; null clears", async () => {
  await writeTripProfileOverlay(FREE, { childHeightsCm: [75] });
  assert.equal((await rideRecommendationsForTrip(FREE, owner, NOW)).teasers.size, 0);
  await writeTripProfileOverlay(FREE, { childHeightsCm: null, pace: "relaxed" });
  const o = await readTripProfileOverlay(FREE);
  assert.equal(o.childHeightsCm, undefined);
  assert.equal(o.pace, "relaxed");
  assert.deepEqual((await rideRecommendationsForTrip(FREE, owner, NOW)).teasers.get(1), { rides: 1 });
});

test("RB5 the general trip rails can neither forge nor wipe the overlay", async () => {
  await storage.updateTrip(PAID, { preferences: { travelStyles: ["food"], profileOverlay: { skippedCorridors: [] } } } as any);
  const [row] = ((await db.execute(sql`SELECT preferences FROM trips WHERE id = ${PAID}`)) as any).rows;
  assert.deepEqual(row.preferences.travelStyles, ["food"]);
  assert.deepEqual(row.preferences.profileOverlay.skippedCorridors, [corridorKey(`${PAID}-a`, `${PAID}-c`)], "the stored overlay survives");
  const minted = await storage.createTrip({ userId: owner, title: "m", destination: "Kyoto, Japan", startDate: DAY, endDate: DAY, preferences: { profileOverlay: { mobility: "wheelchair" } } } as any);
  assert.equal((minted.preferences as any)?.profileOverlay, undefined, "a mint body never carries one");
  await db.execute(sql`DELETE FROM trips WHERE id = ${minted.id}`);
});

test("RB6 the plan's profile read merges the overlay over the account profile", async () => {
  await writeTripProfileOverlay(FREE, { mobility: "limited" });
  const p = await getTravelerProfileForTrip(owner, FREE);
  assert.equal(p.effective.mobility, "limited");
  assert.equal(p.effective.source.mobility, "explicit");
  const account = await getTravelerProfileForTrip(owner, null);
  assert.equal(account.effective.mobility, undefined, "the account profile itself is untouched");
});

test("RB7 a ride inserted between two stops reports its corridor", async () => {
  const out = await insertRide({ tripId: PAID, userId: owner, serviceId: RIDE, dayNumber: 1, afterItemId: `${PAID}-a`, departureTime: "10:30" });
  assert.equal(out.ok, true);
  assert.deepEqual((out as any).corridor, { fromItemId: `${PAID}-a`, toItemId: `${PAID}-c` });
});
