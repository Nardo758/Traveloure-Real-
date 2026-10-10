/**
 * TC-3a — the ride as a plan item (ledger `2026-10-11-tc3a-ride-item`; migration 368).
 *   R1 a ride's exit pin is the origin of the FOLLOWING leg; the leg into it ends at the boarding pin
 *   R2 insertRide: born locked, item_type transport, pins and schedule from the catalog row
 *   R3 refusals: a departure the catalog doesn't offer, a service with no facts row, an inactive ride, a stranger
 *   R4 the swap supersedes a confirmed A→C leg (kept, hidden); removing the ride restores it
 *   R5 a leg the ENGINE superseded (P0 ruling 7 — no ride link) is never restored by a ride's removal
 *   R6 a locked ride survives every rebuild delete (the one deletable predicate)
 *   R7 the exit pin is never client-settable: the insert schema drops it, generic writes strip it
 *
 * NEGATIVE SPACE (§18d): the adapter is an in-test fake. The route's 404/400/409 mapping is a thin switch
 * over `insertRide`'s codes, proven here at the service.
 *
 * DISPOSABLE DB ONLY. Run solo:
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/traveloure npx tsx --test --test-force-exit server/__tests__/tc3a-ride-item.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { RouteOutcome, RoutePoint, RoutingAdapter, RoutingMode } from "@shared/routing-engine";

process.env.STRIPE_SECRET_KEY ||= "sk_test_tc3a";
process.env.TRAVEL_TIME_SERVICE_ENABLED = "1";
process.env.ROUTING_ADAPTER_STUB = "1";
delete process.env.GOOGLE_MAPS_API_KEY;
const { db } = await import("../db");
const { storage } = await import("../storage");
const { itineraryItems, insertItineraryItemSchema } = await import("@shared/schema");
const { insertRide } = await import("../services/ride-item.service");
const { computePlanLegs } = await import("../services/routing/plan-legs-engine.service");
const { getTripTransportLegs } = await import("../services/trip-transport-legs.service");
const { itineraryItemRebuildDeletable } = await import("../services/itinerary-rebuild-guard");

const RUN = crypto.randomUUID().slice(0, 8);
const K = crypto.randomInt(0, 100_000) / 1e4;
const P = (dLat: number, dLng: number) => ({ lat: 35 + dLat, lng: 131 + K + dLng });
const id = (s: string) => `tc3a-${RUN}-${s}`;
const owner = id("owner");
const stranger = id("stranger");
const op = id("operator");
const PLAN = id("plan");
const RIDE_SVC = id("svc-ride");
const NOFACTS_SVC = id("svc-nofacts");
const INACTIVE_SVC = id("svc-inactive");
const BOARD = P(0.01, 0.0);
const EXIT = P(0.04, 0.03);

class FakeAdapter implements RoutingAdapter {
  readonly source = "stub";
  calls: Array<{ o: RoutePoint; d: RoutePoint; mode: RoutingMode }> = [];
  async route(o: RoutePoint, d: RoutePoint, mode: RoutingMode): Promise<RouteOutcome> {
    this.calls.push({ o, d, mode });
    return { kind: "ok", route: { durationMin: 12, distanceM: 3000, line: null, fare: null, provenance: { source: "stub", checkedAt: new Date().toISOString() } } };
  }
}

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
  if (!DISPOSABLE_HOSTS.has(host)) throw new Error(`[tc3a] REFUSING to write fixtures to '${host}'.`);
}

async function item(key: string, order: number, p: { lat: number; lng: number }, start: string, end: string) {
  await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, title, item_type, day_number, sort_order, latitude, longitude, start_time, end_time, origin)
    VALUES (${id(key)}, ${PLAN}, ${key.toUpperCase()}, 'activity', 1, ${order}, ${String(p.lat)}, ${String(p.lng)}, ${start}, ${end}, 'traveler')`);
}
async function service(sid: string, opts: { facts: boolean; status?: string }) {
  await db.execute(sql`INSERT INTO provider_services (id, user_id, service_name, status, approval_status, duration_minutes, earliest_start_time)
    VALUES (${sid}, ${op}, 'Test river boat', ${opts.status ?? "active"}, 'approved', 90, '10:30')`);
  await db.execute(sql`INSERT INTO service_route_points (id, service_id, position, name, latitude, longitude) VALUES
    (${`${sid}-p1`}, ${sid}, 1, 'Pier', ${String(BOARD.lat)}, ${String(BOARD.lng)}), (${`${sid}-p2`}, ${sid}, 2, 'Landing', ${String(EXIT.lat)}, ${String(EXIT.lng)})`);
  if (opts.facts) await db.execute(sql`INSERT INTO service_transport_facts (service_id, official_source) VALUES (${sid}, 'https://example.test/official')`);
}
async function legs(): Promise<any[]> {
  return (await db.execute(sql`SELECT * FROM transport_legs WHERE trip_id = ${PLAN} ORDER BY day_number, leg_order`)).rows as any[];
}
const close = (a: unknown, b: number) => Math.abs(Number(a) - b) < 1e-6;

before(async () => {
  assertDisposableDb();
  for (const u of [owner, stranger, op]) {
    await db.execute(sql`INSERT INTO users (id, email, first_name, last_name, role) VALUES (${u}, ${`${u}@t.test`}, 'T', 'C', 'traveler')`);
  }
  await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, market_slug, timezone, start_date, end_date, status, dates_confirmed_at)
    VALUES (${PLAN}, ${owner}, 'TC3a', 'Kyoto, Japan', 'kyoto', 'Asia/Tokyo', '2026-11-20', '2026-11-20', 'draft', now())`);
  await db.execute(sql`INSERT INTO trip_entitlements (id, trip_id, plan_key, status, source) VALUES (${`${PLAN}-pass`}, ${PLAN}, 'trip_pass', 'active', 'manual')`);
  await item("a", 0, P(0, 0), "09:00", "10:00");
  await item("c", 1, P(0.06, 0.05), "13:00", "14:00");
  await service(RIDE_SVC, { facts: true });
  await service(NOFACTS_SVC, { facts: false });
  await service(INACTIVE_SVC, { facts: true, status: "paused" });
  // An expert's confirmed A→C leg, from before the ride.
  await db.execute(sql`INSERT INTO transport_legs (id, trip_id, day_number, leg_order, from_activity_id, from_name, from_lat, from_lng, to_activity_id, to_name, to_lat, to_lng,
      distance_meters, distance_display, recommended_mode, estimated_duration_minutes, alternative_modes, energy_cost, proposal_status, checked_by, checked_at)
    VALUES (${id("leg-ac")}, ${PLAN}, 1, 1, ${id("a")}, 'A', 0, 0, ${id("c")}, 'C', 0, 0, 8000, '8 km', 'transit', 30, '[]'::jsonb, 0, 'confirmed', ${owner}, now())`);
});

after(async () => {
  await db.execute(sql`DELETE FROM trips WHERE id = ${PLAN}`);
  await db.execute(sql`DELETE FROM provider_services WHERE id IN (${RIDE_SVC}, ${NOFACTS_SVC}, ${INACTIVE_SVC})`);
  await db.execute(sql`DELETE FROM users WHERE id IN (${owner}, ${stranger}, ${op})`);
});

let rideId = "";

test("R3: refusals — not offered, not a catalog ride, inactive, a stranger", async () => {
  const base = { tripId: PLAN, userId: owner, serviceId: RIDE_SVC, dayNumber: 1, afterItemId: id("a"), departureTime: "10:30" };
  assert.equal(((await insertRide({ ...base, departureTime: "11:00" })) as any).code, "no_departure");
  assert.equal(((await insertRide({ ...base, serviceId: NOFACTS_SVC })) as any).code, "not_found", "no facts row ⇒ not a catalog ride");
  assert.equal(((await insertRide({ ...base, serviceId: INACTIVE_SVC })) as any).code, "not_a_ride");
  assert.equal(((await insertRide({ ...base, userId: stranger })) as any).code, "not_found");
  assert.equal(((await insertRide({ ...base, afterItemId: "nope" })) as any).code, "bad_position");
  assert.equal((await legs()).find((l) => l.id === id("leg-ac"))?.proposal_status, "confirmed", "no refusal touched the leg");
});

test("R2 + R4a: the ride is born locked from the catalog, and supersedes the confirmed A→C leg", async () => {
  const out = await insertRide({ tripId: PLAN, userId: owner, serviceId: RIDE_SVC, dayNumber: 1, afterItemId: id("a"), departureTime: "10:30" });
  assert.equal(out.ok, true, JSON.stringify(out));
  rideId = (out as any).itemId;
  assert.deepEqual((out as any).supersededLegIds, [id("leg-ac")]);
  const [ride] = await db.select().from(itineraryItems).where(eq(itineraryItems.id, rideId));
  assert.equal(ride.itemType, "transport");
  assert.equal(ride.providerServiceId, RIDE_SVC);
  assert.ok(ride.lockedAt, "born locked");
  assert.equal(ride.startTime, "10:30");
  assert.equal(ride.endTime, "12:00", "departure + the catalog's 90 minutes");
  assert.ok(close(ride.latitude, BOARD.lat) && close(ride.exitLatitude, EXIT.lat), "boarding and exit pins from the route points");
  const order = (await storage.getItineraryItems(PLAN)).map((i) => i.id);
  assert.deepEqual(order, [id("a"), rideId, id("c")], "spliced in after A");
  const leg = (await legs()).find((l) => l.id === id("leg-ac"));
  assert.equal(leg.proposal_status, null, "hidden");
  assert.ok(leg.superseded_at, "superseded, not deleted");
  assert.equal(leg.superseded_by_item_id, rideId);
  assert.ok(!(await getTripTransportLegs(PLAN, { includeProposed: true })).some((l: any) => l.id === id("leg-ac")), "no trip reader shows it");
});

test("R1: the engine routes A→boarding and exit→C", async () => {
  const fake = new FakeAdapter();
  await computePlanLegs(PLAN, { adapter: fake });
  const into = fake.calls.find((c) => close(c.d.lat, BOARD.lat));
  const out = fake.calls.find((c) => close(c.o.lat, EXIT.lat));
  assert.ok(into, "the leg into the ride ends at the boarding pin");
  assert.ok(out && close(out.d.lat, P(0.06, 0.05).lat), "the leg after the ride starts at the exit pin");
  assert.ok(!fake.calls.some((c) => close(c.o.lat, BOARD.lat)), "nothing leaves from the boarding pin");
  const fromRide = (await legs()).find((l) => l.from_activity_id === rideId && l.source);
  assert.ok(fromRide && close(fromRide.from_lat, EXIT.lat), "the stored leg starts at the exit pin");
});

test("R6: a locked ride survives every rebuild delete", async () => {
  const deletable = await db.select({ id: itineraryItems.id }).from(itineraryItems).where(and(eq(itineraryItems.tripId, PLAN), itineraryItemRebuildDeletable()));
  assert.ok(!deletable.some((r) => r.id === rideId), "the snapshot re-apply and proposal apply delete through this predicate");
  assert.ok(deletable.some((r) => r.id === id("a")), "an unlocked traveler item is still deletable");
});

test("R4b + R5: removing the ride restores its superseded leg — and only its own", async () => {
  // A leg the ENGINE superseded (P0 ruling 7): no ride link.
  await db.execute(sql`INSERT INTO transport_legs (id, trip_id, day_number, leg_order, from_activity_id, from_name, from_lat, from_lng, to_activity_id, to_name, to_lat, to_lng,
      distance_meters, distance_display, recommended_mode, estimated_duration_minutes, alternative_modes, energy_cost, proposal_status, superseded_at)
    VALUES (${id("leg-p0")}, ${PLAN}, 1, 9, ${id("a")}, 'A', 0, 0, ${id("c")}, 'C', 0, 0, 8000, '8 km', 'driving', 30, '[]'::jsonb, 0, NULL, now())`);
  await storage.deleteItineraryItem(rideId);
  const rows = await legs();
  const ac = rows.find((l) => l.id === id("leg-ac"));
  assert.equal(ac.proposal_status, "confirmed", "restored");
  assert.equal(ac.superseded_at, null);
  assert.equal(ac.superseded_by_item_id, null);
  const p0 = rows.find((l) => l.id === id("leg-p0"));
  assert.equal(p0.proposal_status, null, "an engine-superseded leg stays superseded");
  assert.ok(p0.superseded_at);
});

test("R7: the exit pin is never client-settable", async () => {
  const parsed = insertItineraryItemSchema.safeParse({ tripId: PLAN, title: "X", dayNumber: 1, exitLatitude: "1", exitLongitude: "2" } as any);
  assert.ok(parsed.success);
  assert.equal((parsed as any).data.exitLatitude, undefined, "the insert schema drops it");
  await storage.updateItineraryItem(id("a"), { exitLatitude: "1.5", exitLongitude: "2.5" } as any);
  const [a] = await db.select().from(itineraryItems).where(eq(itineraryItems.id, id("a")));
  assert.equal(a.exitLatitude, null, "a generic write strips it");
});
