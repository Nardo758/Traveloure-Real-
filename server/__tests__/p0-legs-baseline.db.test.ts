/**
 * P0 legs baseline (decision-maker rulings, Oct 10, 2026 — ledger `2026-10-10-p0-legs-baseline`).
 *
 *   L1 an unlocated stop is reported AND bridged: A→C is routed, the B pairs are skipped (ruling 1)
 *   L2 a default-transit leg with no transit route is asked once as a drive and flagged (ruling 2)
 *   L3 transit and drive both without a route ⇒ the pair gets no leg, the prior leg is gone (E8 kept)
 *   L4 a leg with no time of day departs at 10:00 local on its trip day, never server-now (ruling 3)
 *   L5 a day already over is frozen: no call, nothing recomputed, nothing deleted (ruling 3)
 *   L6 the gap count ("no route found") reads the same desired pairs; the re-check reports it, writes nothing (rulings 2, 6)
 *   L7 generate on a routed plan with the engine off writes nothing (ruling 4)
 *   L8 confirmed legacy legs shaped like production's 9 (source NULL, "driving"/"taxi") are re-routed on
 *      the first engine run: the new row keeps `confirmed` and the expert's stamp, the legacy row is
 *      superseded (hidden, `superseded_at` — migration 368) not deleted, and the mode change is logged (ruling 7)
 *
 * NEGATIVE SPACE (§18d): the adapter is an in-test fake (no Google call). The activate-transport ROUTE
 * branch is a straight `travelTimeServiceEnabled()` read; L7 proves the service it shares the rule with.
 *
 * DISPOSABLE DB ONLY. Run solo:
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/traveloure npx tsx --test --test-force-exit server/__tests__/p0-legs-baseline.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import type { RouteOutcome, RoutePoint, RoutingAdapter, RoutingMode } from "@shared/routing-engine";

process.env.STRIPE_SECRET_KEY ||= "sk_test_p0_legs";
process.env.TRAVEL_TIME_SERVICE_ENABLED = "1";
process.env.ROUTING_ADAPTER_STUB = "1";
delete process.env.GOOGLE_MAPS_API_KEY;
const { db } = await import("../db");
const { computePlanLegs, planLegGapsByDay } = await import("../services/routing/plan-legs-engine.service");
const { recheckPlanLegs } = await import("../services/routing/leg-recheck.service");
const { generateTripTransportLegs } = await import("../services/trip-transport-legs.service");
const { TRANSIT_UNAVAILABLE_REASON } = await import("@shared/routing-engine");

const RUN = crypto.randomUUID().slice(0, 8);
const K = crypto.randomInt(0, 100_000) / 1e4;
const P = (dLat: number, dLng: number) => ({ lat: 35 + dLat, lng: 128 + K + dLng });
const id = (s: string) => `p0l-${RUN}-${s}`;
const owner = id("owner");
const BRIDGE = id("bridge");
const NOTRANSIT = id("notransit");
const PAST = id("past");
const LEGACY = id("legacy");

class FakeAdapter implements RoutingAdapter {
  readonly source = "stub";
  calls: Array<{ mode: RoutingMode; departAt: Date | null }> = [];
  constructor(private readonly fail: ReadonlySet<RoutingMode> = new Set()) {}
  async route(_o: RoutePoint, _d: RoutePoint, mode: RoutingMode, departAt: Date | null): Promise<RouteOutcome> {
    this.calls.push({ mode, departAt });
    if (this.fail.has(mode)) return { kind: "no_route" };
    return { kind: "ok", route: { durationMin: mode === "drive" ? 11 : 17, distanceM: 3600, line: null, fare: null, provenance: { source: "stub", checkedAt: new Date().toISOString() } } };
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
  if (!DISPOSABLE_HOSTS.has(host)) throw new Error(`[p0-legs] REFUSING to write fixtures to '${host}'.`);
}

async function item(trip: string, key: string, day: number, order: number, p: { lat: number; lng: number } | null, start: string | null, end: string | null) {
  await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, title, item_type, day_number, sort_order, latitude, longitude, start_time, end_time, origin)
    VALUES (${`${trip}-${key}`}, ${trip}, ${key.toUpperCase()}, 'activity', ${day}, ${order}, ${p ? String(p.lat) : null}, ${p ? String(p.lng) : null}, ${start}, ${end}, 'traveler')`);
}
async function legs(trip: string): Promise<any[]> {
  return (await db.execute(sql`SELECT * FROM transport_legs WHERE trip_id = ${trip} ORDER BY day_number, leg_order`)).rows as any[];
}
const pairs = (rows: any[]) => rows.map((l) => `${l.day_number}:${String(l.from_activity_id).split("-").pop()}>${String(l.to_activity_id).split("-").pop()}`);

async function trip(t: string, start: string, end: string) {
  await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, market_slug, timezone, start_date, end_date, status, dates_confirmed_at)
    VALUES (${t}, ${owner}, 'P0L', 'Kyoto, Japan', 'kyoto', 'Asia/Tokyo', ${start}, ${end}, 'draft', now())`);
  await db.execute(sql`INSERT INTO trip_entitlements (id, trip_id, plan_key, status, source) VALUES (${`${t}-pass`}, ${t}, 'trip_pass', 'active', 'manual')`);
}

before(async () => {
  assertDisposableDb();
  await db.execute(sql`INSERT INTO users (id, email, first_name, last_name, role) VALUES (${owner}, ${`${owner}@t.test`}, 'P0L', 'traveler', 'traveler')`);
  await trip(BRIDGE, "2026-11-11", "2026-11-11");
  await item(BRIDGE, "a", 1, 0, P(0, 0), "09:00", "10:00");
  await item(BRIDGE, "b", 1, 1, null, "11:00", "12:00"); // unlocated
  await item(BRIDGE, "c", 1, 2, P(0.03, 0.02), "13:00", "14:00");
  await trip(NOTRANSIT, "2026-11-11", "2026-11-11");
  await item(NOTRANSIT, "a", 1, 0, P(0.2, 0), null, null); // no time of day
  await item(NOTRANSIT, "b", 1, 1, P(0.23, 0.02), null, null); // ~3.6 km — transit by default
  await trip(PAST, "2026-11-11", "2026-11-12");
  await item(PAST, "a", 1, 0, P(-0.2, 0), "09:00", "10:00");
  await item(PAST, "b", 1, 1, P(-0.17, 0.02), "11:00", "12:00");
  await item(PAST, "c", 2, 0, P(-0.3, 0), "09:00", "10:00");
  await item(PAST, "d", 2, 1, P(-0.27, 0.02), "11:00", "12:00");
  await trip(LEGACY, "2026-11-11", "2026-11-11");
  await item(LEGACY, "a", 1, 0, P(0.5, 0), "09:00", "10:00");
  await item(LEGACY, "b", 1, 1, P(0.53, 0.02), "11:00", "12:00");
  await item(LEGACY, "c", 1, 2, P(0.56, 0.04), "13:00", "14:00");
  // Production's shape: trip-scoped, confirmed, no source, the legacy writer's "driving"; one an expert picked taxi on.
  for (const [k, from, to, sel] of [["ab", "a", "b", null], ["bc", "b", "c", "taxi"]] as const) {
    await db.execute(sql`INSERT INTO transport_legs (id, trip_id, day_number, leg_order, from_activity_id, from_name, from_lat, from_lng, to_activity_id, to_name, to_lat, to_lng,
        distance_meters, distance_display, recommended_mode, user_selected_mode, estimated_duration_minutes, alternative_modes, energy_cost, proposal_status, checked_by, checked_at, author_tip)
      VALUES (${`${LEGACY}-${k}`}, ${LEGACY}, 1, ${k === "ab" ? 1 : 2}, ${`${LEGACY}-${from}`}, ${from.toUpperCase()}, 0, 0, ${`${LEGACY}-${to}`}, ${to.toUpperCase()}, 0, 0,
        3600, '3.6 km', 'driving', ${sel}, 14, '[]'::jsonb, 0, 'confirmed', ${owner}, now(), 'Ask for the back exit')`);
  }
});

after(async () => {
  await db.execute(sql`DELETE FROM itinerary_changes WHERE trip_id = ${LEGACY}`);
  await db.execute(sql`DELETE FROM trips WHERE id IN (${BRIDGE}, ${NOTRANSIT}, ${PAST}, ${LEGACY})`);
  await db.execute(sql`DELETE FROM users WHERE id = ${owner}`);
});

test("L1: an unlocated stop is reported for both pairs it breaks, and A→C is routed", async () => {
  const r: any = await computePlanLegs(BRIDGE, { adapter: new FakeAdapter() });
  assert.equal(r.skippedPairs, 2, "a>b and b>c are reported");
  assert.deepEqual(pairs(await legs(BRIDGE)), ["1:a>c"], "the located stops either side are connected");
});

test("L2: transit with no route ⇒ ONE drive ask, stored as a drive and flagged", async () => {
  const fake = new FakeAdapter(new Set<RoutingMode>(["transit"]));
  const r: any = await computePlanLegs(NOTRANSIT, { adapter: fake });
  assert.deepEqual(fake.calls.map((c) => c.mode), ["transit", "drive"]);
  assert.equal(r.calls, 2);
  const [leg] = await legs(NOTRANSIT);
  assert.equal(leg.recommended_mode, "driving");
  assert.equal(leg.user_selected_mode, null);
  assert.equal(leg.alternative_modes[0].reason, TRANSIT_UNAVAILABLE_REASON);
  assert.equal(Number(leg.estimated_duration_minutes), 11);
  const again = new FakeAdapter(new Set<RoutingMode>(["transit"]));
  await computePlanLegs(NOTRANSIT, { adapter: again });
  assert.equal(again.calls.length, 0, "an unchanged pair keeps its fallback drive — not re-asked every run");
});

test("L3: transit and drive both without a route ⇒ the pair has no leg (E8 as amended)", async () => {
  await db.execute(sql`UPDATE itinerary_items SET longitude = ${String(P(0.23, 0.025).lng)} WHERE id = ${`${NOTRANSIT}-b`}`);
  const r: any = await computePlanLegs(NOTRANSIT, { adapter: new FakeAdapter(new Set<RoutingMode>(["transit", "drive"])) });
  assert.equal(r.noRoute, 1);
  assert.deepEqual(await legs(NOTRANSIT), [], "the prior leg is gone, never shown stale");
});

test("L4: no time of day ⇒ departs 10:00 local on the trip day (01:00 UTC in Kyoto)", async () => {
  await db.execute(sql`DELETE FROM transport_legs WHERE trip_id = ${NOTRANSIT}`);
  const fake = new FakeAdapter();
  await computePlanLegs(NOTRANSIT, { adapter: fake });
  assert.equal(fake.calls[0]?.departAt?.toISOString(), "2026-11-11T01:00:00.000Z");
});

test("L5: a day already over is frozen — no call, nothing recomputed, nothing deleted", async () => {
  await computePlanLegs(PAST, { adapter: new FakeAdapter() });
  const before = pairs(await legs(PAST));
  assert.deepEqual(before, ["1:a>b", "2:c>d"]);
  // Day 1 (Nov 11) is over; day 2 (Nov 12) is today in Kyoto.
  await db.execute(sql`UPDATE itinerary_items SET longitude = ${String(P(-0.17, 0.03).lng)} WHERE id = ${`${PAST}-b`}`);
  await db.execute(sql`UPDATE itinerary_items SET longitude = ${String(P(-0.27, 0.03).lng)} WHERE id = ${`${PAST}-d`}`);
  const fake = new FakeAdapter();
  await computePlanLegs(PAST, { adapter: fake, now: () => new Date("2026-11-12T03:00:00Z") });
  assert.equal(fake.calls.length, 1, "only today's moved leg is asked");
  const rows = await legs(PAST);
  assert.deepEqual(pairs(rows), ["1:a>b", "2:c>d"], "day 1's leg is kept as it was");
});

test("L6: the gap count reads the desired pairs; the re-check reports it and writes nothing", async () => {
  await db.execute(sql`DELETE FROM transport_legs WHERE trip_id = ${BRIDGE}`);
  const gaps = await planLegGapsByDay(BRIDGE, new Date("2026-11-01T00:00:00Z"));
  assert.equal(gaps.get(1), 1, "a>c has no leg");
  const fake = new FakeAdapter();
  const r = await recheckPlanLegs(
    { tripId: BRIDGE, userId: owner, destination: "Kyoto", startDate: "2026-11-11", timezone: "Asia/Tokyo", datesConfirmed: true, since: new Date(0), checkDate: "2026-11-08", now: new Date() },
    {
      adapter: () => fake,
      qualifies: async () => true,
      legs: async () => [],
      missingPairs: async () => 1,
      claim: async () => ({ claimed: false }),
      release: async () => undefined,
      writeStatus: async () => undefined,
      notifyOnce: async () => false,
    },
  );
  assert.equal(r.missing, 1);
  assert.equal(fake.calls.length, 0, "a missing pair is counted, never routed");
  assert.deepEqual(await legs(BRIDGE), [], "never writes a leg");
});

test("L7: generate on a routed plan with the engine off writes nothing", async () => {
  const prev = process.env.TRAVEL_TIME_SERVICE_ENABLED;
  delete process.env.TRAVEL_TIME_SERVICE_ENABLED;
  try {
    const r = await generateTripTransportLegs(BRIDGE);
    assert.equal(r.created, 0);
    assert.deepEqual(await legs(BRIDGE), [], "no legacy driving legs on a routed plan");
  } finally {
    process.env.TRAVEL_TIME_SERVICE_ENABLED = prev;
  }
});

test("L8: confirmed legacy legs are re-routed once, keep confirmed, the legacy rows superseded not deleted", async () => {
  const fake = new FakeAdapter();
  const r: any = await computePlanLegs(LEGACY, { adapter: fake });
  assert.equal(r.superseded, 2);
  const rows = await legs(LEGACY);
  const legacy = rows.filter((l) => l.source == null);
  const routed = rows.filter((l) => l.source != null);
  assert.equal(legacy.length, 2, "never deleted");
  for (const l of legacy) {
    assert.equal(l.proposal_status, null, "hidden from every trip reader");
    assert.ok(l.superseded_at, "superseded_at stamped (migration 368 moved the marker off origin)"); assert.equal(l.superseded_by_item_id, null, "an engine supersede names no ride — never restored");
  }
  assert.deepEqual(pairs(routed), ["1:a>b", "1:b>c"]);
  for (const l of routed) {
    assert.equal(l.proposal_status, "confirmed", "keeps confirmed");
    assert.equal(l.checked_by, owner, "keeps the expert's stamp");
    assert.equal(l.author_tip, "Ask for the back exit");
  }
  const ab = routed.find((l) => String(l.from_activity_id).endsWith("-a"));
  const bc = routed.find((l) => String(l.from_activity_id).endsWith("-b"));
  assert.equal(ab.recommended_mode, "transit", "no expert pick ⇒ the engine's default");
  assert.equal(bc.recommended_mode, "driving", "the expert's taxi pick is kept, as a drive");
  assert.equal(bc.user_selected_mode, "driving");
  const log = (await db.execute(sql`SELECT action, metadata FROM itinerary_changes WHERE trip_id = ${LEGACY} ORDER BY created_at`)).rows as any[];
  assert.equal(log.length, 2, "both mode changes are logged (driving → transit; taxi → driving)");
  assert.ok(log.some((c) => c.metadata.previousMode === "driving" && c.metadata.newMode === "transit"));
  const again = new FakeAdapter();
  const r2: any = await computePlanLegs(LEGACY, { adapter: again });
  assert.equal(r2.superseded, undefined, "first run only");
  assert.equal(again.calls.length, 0, "the confirmed engine legs are never recomputed");
  assert.equal((await legs(LEGACY)).length, 4, "and never removed");
});
