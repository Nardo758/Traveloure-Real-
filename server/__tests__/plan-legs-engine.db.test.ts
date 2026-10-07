/**
 * STEP 9a — THE PLAN'S ROUTED LEGS, end to end against a real database (ledger
 * `2026-10-07-step9a-routing-engine`; brief 9a gates; rulings 2, 3, 5, 6, 10).
 *
 *   E1  a FREE plan: zero routing calls, nothing written (R-e)
 *   E2  a qualifying plan (active Trip Pass): every consecutive pair routed once, born `proposed` with
 *       `source` set; the row carries line, fare and the leg key — and no geometry or steps
 *   E3  a recompute with nothing changed makes no call (the pair diff keeps every leg)
 *   E4  NO CROSS-PLAN REUSE (Google terms, #1325): the same stops on another plan are asked again
 *   E5  ONE EDIT ⇒ EXACTLY TWO LEGS recomputed (a stop moved); the rest kept
 *   E6  an inserted stop replaces one leg with two
 *   E7  the cap hit: `paused`, no call, the existing legs stay as last computed, the edit stands
 *   E8  a failed call: no leg for that pair (a thin connector); the next run asks again
 *   E9  an expert's CONFIRMED leg wins: the engine never computes that pair and drops its own
 *   E10 the read rule: the plan shows engine legs with their routed facts; a free plan's engine and
 *       variant legs are HIDDEN, not deleted (ruling 5)
 *   E11 activate-transport/Finalize write nothing on a free plan (ruling 5)
 *   E12 the edit trigger: a storage edit schedules ONE debounced recompute, which lands within ~2 s
 *   E14 apply after Optimize: the plan's legs are answered from its OWN run's version legs (no call)
 *   E13 a stop located only by a Google Places fact: its leg is stamped `coord_source='google'` with
 *       the fact's fetch time (LD 57 as extended to legs, R311) — a cache the daily leg job clears
 *
 * NEGATIVE SPACE (§18d): the adapter is the CI stub (no Google call — the Google adapter's half is the
 * contract test's). Hours buckets are exercised through item end times only.
 *
 * DISPOSABLE DB ONLY. Run solo:
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/traveloure npx tsx --test --test-force-exit server/__tests__/plan-legs-engine.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";

process.env.STRIPE_SECRET_KEY ||= "sk_test_plan_legs_engine";
process.env.TRAVEL_TIME_SERVICE_ENABLED = "1";
process.env.ROUTING_ADAPTER_STUB = "1";
delete process.env.GOOGLE_MAPS_API_KEY;
const { db } = await import("../db");
const { storage } = await import("../storage");
const { computePlanLegs } = await import("../services/routing/plan-legs-engine.service");
const { StubRoutingAdapter } = await import("../services/routing/stub-routing-adapter");
const { activateTripTransport } = await import("../services/trip-transport-legs.service");
const { assembleTripPlan } = await import("../services/trip-plan.service");
const { hasPendingPlanLegRecompute } = await import("../services/routing/plan-legs-queue");

const RUN = crypto.randomUUID().slice(0, 8);
// Coordinates unique to this run (one of 100,000 longitude offsets at the leg key's 4 decimals).
const K = crypto.randomInt(0, 100_000) / 1e4;
const P = (dLat: number, dLng: number) => ({ lat: 35 + dLat, lng: 125 + K + dLng });
const id = (s: string) => `ple-${RUN}-${s}`;
const owner = id("owner");
const FREE = id("free");
const PAID = id("paid");
const TWIN = id("twin");
const OPT = id("opt");

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
  if (!DISPOSABLE_HOSTS.has(host)) throw new Error(`[plan-legs-engine] REFUSING to write fixtures to '${host}'.`);
}

async function item(trip: string, key: string, day: number, order: number, p: { lat: number; lng: number }, start: string, end: string) {
  await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, title, item_type, day_number, sort_order, latitude, longitude, start_time, end_time, origin)
    VALUES (${`${trip}-${key}`}, ${trip}, ${key.toUpperCase()}, 'activity', ${day}, ${order}, ${String(p.lat)}, ${String(p.lng)}, ${start}, ${end}, 'traveler')`);
}

async function stops(trip: string) {
  await item(trip, "a", 1, 0, P(0, 0), "09:00", "10:00");
  await item(trip, "b", 1, 1, P(0.03, 0.02), "11:00", "12:00"); // ~3.6 km — transit
  await item(trip, "c", 1, 2, P(0.032, 0.021), "13:00", "14:00"); // ~250 m — walk
  await item(trip, "d", 2, 0, P(-0.02, 0.01), "09:00", "10:00");
  await item(trip, "e", 2, 1, P(-0.05, 0.03), "11:00", "12:00");
}

async function legs(trip: string): Promise<any[]> {
  return (await db.execute(sql`SELECT * FROM transport_legs WHERE trip_id = ${trip} ORDER BY day_number, leg_order`)).rows as any[];
}
const pairs = (rows: any[]) => rows.map((l) => `${l.day_number}:${String(l.from_activity_id).split("-").pop()}>${String(l.to_activity_id).split("-").pop()}`);

before(async () => {
  assertDisposableDb();
  await db.execute(sql`INSERT INTO users (id, email, first_name, last_name, role) VALUES (${owner}, ${`${owner}@t.test`}, 'PLE', 'traveler', 'traveler')`);
  for (const t of [FREE, PAID, TWIN, OPT]) {
    await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, market_slug, timezone, start_date, end_date, status)
      VALUES (${t}, ${owner}, 'PLE', 'Kyoto, Japan', 'kyoto', 'Asia/Tokyo', '2026-11-11', '2026-11-12', 'draft')`);
    await stops(t);
  }
  for (const t of [PAID, TWIN]) {
    await db.execute(sql`INSERT INTO trip_entitlements (id, trip_id, plan_key, status, source) VALUES (${`${t}-pass`}, ${t}, 'trip_pass', 'active', 'manual')`);
  }
});

after(async () => {
  await db.execute(sql`DELETE FROM trips WHERE id IN (${FREE}, ${PAID}, ${TWIN}, ${OPT})`);
  await db.execute(sql`DELETE FROM users WHERE id = ${owner}`);
});

test("E1: a free plan gets no routing call and nothing written", async () => {
  const stub = new StubRoutingAdapter();
  assert.deepEqual(await computePlanLegs(FREE, { adapter: stub }), { skipped: "free_plan" });
  assert.equal(stub.calls, 0);
  assert.equal((await legs(FREE)).length, 0);
});

test("E2: a qualifying plan routes each consecutive pair once — proposed, sourced, five facts, no geometry", async () => {
  const stub = new StubRoutingAdapter();
  const r: any = await computePlanLegs(PAID, { adapter: stub });
  assert.equal(r.skipped, undefined);
  assert.equal(stub.calls, 3);
  assert.equal(r.written, 3);
  const rows = await legs(PAID);
  assert.deepEqual(pairs(rows), ["1:a>b", "1:b>c", "2:d>e"]);
  for (const l of rows) {
    assert.equal(l.source, "stub");
    assert.equal(l.proposal_status, "proposed");
    const alt = l.alternative_modes[0];
    assert.ok(typeof alt.legKey === "string" && alt.legKey.includes("|"));
    assert.ok(!/polyline|steps|navigationInstruction/.test(JSON.stringify(l)), "no geometry or steps on the row");
  }
  const ab = rows.find((l) => String(l.to_activity_id).endsWith("-b"));
  assert.equal(ab.recommended_mode, "transit");
  assert.equal(ab.alternative_modes[0].line, "Stub Line");
  assert.deepEqual(ab.alternative_modes[0].fare, { amount: 220, currency: "JPY" });
  const bc = rows.find((l) => String(l.to_activity_id).endsWith("-c"));
  assert.equal(bc.recommended_mode, "walking");
  assert.equal(bc.alternative_modes[0].fare, null);
});

test("E3: a recompute with nothing changed makes no call", async () => {
  const stub = new StubRoutingAdapter();
  const r: any = await computePlanLegs(PAID, { adapter: stub });
  assert.equal(stub.calls, 0);
  assert.equal(r.kept, 3);
  assert.equal(r.written, 0);
});

test("E4: no reuse across plans — the same stops on another plan are asked again", async () => {
  const stub = new StubRoutingAdapter();
  const r: any = await computePlanLegs(TWIN, { adapter: stub });
  assert.equal(stub.calls, 3, "a Google answer lives only on its own plan's rows");
  assert.equal(r.reused, 0);
  assert.equal(r.written, 3);
});

test("E5: one edit ⇒ exactly two legs recomputed", async () => {
  const before = await legs(PAID);
  const p = P(0.035, 0.025);
  await db.execute(sql`UPDATE itinerary_items SET latitude = ${String(p.lat)}, longitude = ${String(p.lng)} WHERE id = ${`${PAID}-b`}`);
  const stub = new StubRoutingAdapter();
  const r: any = await computePlanLegs(PAID, { adapter: stub });
  assert.equal(stub.calls, 2, "a→b and b→c only");
  assert.equal(r.written, 2);
  assert.equal(r.kept, 1);
  const after = await legs(PAID);
  const de = (rows: any[]) => rows.find((l) => String(l.to_activity_id).endsWith("-e")).id;
  assert.equal(de(after), de(before), "the untouched leg is the same row");
});

test("E6: a stop inserted between two others replaces one leg with two", async () => {
  await item(PAID, "x", 2, 1, P(-0.03, 0.02), "10:30", "10:45");
  await db.execute(sql`UPDATE itinerary_items SET sort_order = 2 WHERE id = ${`${PAID}-e`}`);
  const stub = new StubRoutingAdapter();
  const r: any = await computePlanLegs(PAID, { adapter: stub });
  assert.equal(stub.calls, 2);
  assert.equal(r.removed, 1);
  assert.deepEqual(pairs(await legs(PAID)), ["1:a>b", "1:b>c", "2:d>x", "2:x>e"]);
});

test("E7: the cap hit — paused, no call, legs left as last computed", async () => {
  const before = await legs(PAID);
  const p = P(0.04, 0.03);
  // A direct write: this test drives the engine by hand (E12 proves the trigger).
  await db.execute(sql`UPDATE itinerary_items SET latitude = ${String(p.lat)}, longitude = ${String(p.lng)} WHERE id = ${`${PAID}-c`}`);
  const stub = new StubRoutingAdapter({ paused: true });
  const r: any = await computePlanLegs(PAID, { adapter: stub });
  assert.equal(r.paused, true);
  assert.equal(stub.calls, 0);
  assert.deepEqual((await legs(PAID)).map((l) => [l.id, l.estimated_duration_minutes]), before.map((l) => [l.id, l.estimated_duration_minutes]));
});

test("E8: a failed call leaves the pair a thin connector; the next run asks again", async () => {
  const stub = new StubRoutingAdapter({ noRoute: true });
  const r: any = await computePlanLegs(PAID, { adapter: stub });
  assert.equal(r.noRoute, 1, "only the moved stop's leg was asked");
  assert.deepEqual(pairs(await legs(PAID)), ["1:a>b", "2:d>x", "2:x>e"], "b→c is gone, never shown stale");
  const healed: any = await computePlanLegs(PAID, { adapter: new StubRoutingAdapter() });
  assert.equal(healed.written, 1, "the next run routes it — a failure was never remembered");
});

test("E9: an expert's confirmed leg wins — the engine never computes that pair", async () => {
  const a = P(0, 0);
  const b = P(0.035, 0.025);
  await db.execute(sql`INSERT INTO transport_legs (id, trip_id, day_number, leg_order, from_activity_id, from_name, from_lat, from_lng,
      to_activity_id, to_name, to_lat, to_lng, distance_meters, distance_display, recommended_mode, estimated_duration_minutes, proposal_status)
    VALUES (${id("confirmed")}, ${PAID}, 1, 1, ${`${PAID}-a`}, 'A', ${a.lat}, ${a.lng}, ${`${PAID}-b`}, 'B', ${b.lat}, ${b.lng}, 4000, '4 km', 'taxi', 15, 'confirmed')`);
  const stub = new StubRoutingAdapter();
  const r: any = await computePlanLegs(PAID, { adapter: stub });
  assert.equal(stub.calls, 0);
  assert.equal(r.removed, 1, "the engine's own a→b is dropped");
  const ab = (await legs(PAID)).filter((l) => String(l.to_activity_id).endsWith("-b"));
  assert.deepEqual(ab.map((l) => l.proposal_status), ["confirmed"]);
});

test("E10: the read rule — routed facts on a qualifying plan; a free plan's routed legs hidden, not deleted", async () => {
  const plan: any = await assembleTripPlan(PAID, "full");
  const all = plan.days.flatMap((d: any) => d.transports);
  const routed = all.filter((t: any) => t.routed);
  assert.ok(routed.length >= 3);
  for (const t of routed) {
    assert.equal(t.routed.provenance.source, "stub");
    assert.ok(!Number.isNaN(new Date(t.routed.provenance.checkedAt).getTime()));
  }
  const confirmed = all.filter((t: any) => t.toActivityId === `${PAID}-b`);
  assert.equal(confirmed.length, 1, "one leg per pair");
  assert.equal(confirmed[0].routed, undefined, "the confirmed leg carries no engine facts");

  // A free plan holding an old engine leg: hidden by the predicate, still on disk.
  const a = P(0, 0);
  await db.execute(sql`INSERT INTO transport_legs (id, trip_id, day_number, leg_order, from_activity_id, from_name, from_lat, from_lng,
      to_activity_id, to_name, to_lat, to_lng, distance_meters, distance_display, recommended_mode, estimated_duration_minutes, proposal_status, source, calculated_at)
    VALUES (${id("stale")}, ${FREE}, 1, 1, ${`${FREE}-a`}, 'A', ${a.lat}, ${a.lng}, ${`${FREE}-b`}, 'B', ${a.lat + 0.03}, ${a.lng + 0.02}, 3600, '3.6 km', 'transit', 12, 'proposed', 'google_routes', now())`);
  const free: any = await assembleTripPlan(FREE, "full");
  assert.equal(free.days.flatMap((d: any) => d.transports).length, 0);
  assert.equal((await legs(FREE)).length, 1, "hidden, not deleted");
});

test("E11: activate-transport / Finalize write nothing on a free plan", async () => {
  const r = await activateTripTransport(FREE);
  assert.equal(r.created, 0);
  assert.equal((await legs(FREE)).length, 1, "only the hidden legacy row");
});

test("E12: a storage edit schedules one debounced recompute that lands within ~2 s", async () => {
  const p = P(-0.045, 0.028);
  await storage.updateItineraryItem(`${TWIN}-e`, { latitude: String(p.lat), longitude: String(p.lng) } as any);
  await storage.updateItineraryItem(`${TWIN}-e`, { startTime: "11:05" } as any);
  assert.equal(hasPendingPlanLegRecompute(TWIN), true);
  await new Promise((r) => setTimeout(r, 3500));
  assert.equal(hasPendingPlanLegRecompute(TWIN), false);
  const de = (await legs(TWIN)).find((l) => String(l.to_activity_id).endsWith("-e"));
  assert.ok(Math.abs(Number(de.to_lat) - p.lat) < 1e-9, "the leg follows the moved stop");
});

test("E13: a leg whose end is a Google Places point is stamped as a Google coordinate cache", async () => {
  const f = P(0.06, 0.06);
  await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, title, item_type, day_number, sort_order, start_time, end_time, origin)
    VALUES (${`${PAID}-f`}, ${PAID}, 'F', 'activity', 3, 0, '09:00', '10:00', 'traveler')`);
  await item(PAID, "g", 3, 1, P(0.062, 0.061), "11:00", "12:00");
  await db.execute(sql`INSERT INTO place_facts (id, place_ref_kind, place_ref, need, fact_type, value, origin, fetched_at, expires_at, plan_id, itinerary_item_id)
    VALUES (${id("fact")}, 'place_id', ${`ChIJ-${RUN}`}, 'activity', 'location', ${JSON.stringify(f)}::jsonb, 'places_api',
      now() - interval '3 days', now() + interval '27 days', ${PAID}, ${`${PAID}-f`})`);
  await computePlanLegs(PAID, { adapter: new StubRoutingAdapter() });
  const fg = (await legs(PAID)).find((l) => l.from_activity_id === `${PAID}-f`);
  assert.ok(fg, "the fact-located stop is routed");
  assert.equal(fg.coord_source, "google");
  const age = Date.now() - new Date(fg.coord_fetched_at).getTime();
  assert.ok(age > 2.9 * 86_400_000 && age < 3.1 * 86_400_000, "the fact's own fetch time, not now");
  assert.ok(fg.alternative_modes[0].legKey.startsWith(`place:ChIJ-${RUN}|`), "keyed by its place ID");
  const located = (await legs(PAID)).find((l) => l.to_activity_id === `${PAID}-b` && l.source);
  assert.equal(located?.coord_source ?? null, null, "a trusted row point needs no record");
});

test("E14: after an Optimize run, the plan's legs come from its own version legs — no call", async () => {
  const { routeLegKey, routeHourBucket, defaultRoutedMode } = await import("@shared/routing-engine");
  const { departureWallClock } = await import("../services/routing/plan-legs");
  const cmp = id("cmp");
  const ver = id("ver");
  await db.execute(sql`INSERT INTO itinerary_comparisons (id, user_id, trip_id, status) VALUES (${cmp}, ${owner}, ${OPT}, 'generated')`);
  await db.execute(sql`INSERT INTO itinerary_variants (id, comparison_id, name, source, status) VALUES (${ver}, ${cmp}, 'V1', 'ai_optimized', 'generated')`);
  const stopsOf = [
    ["a", P(0, 0), "10:00"], ["b", P(0.03, 0.02), "12:00"], ["c", P(0.032, 0.021), "14:00"],
    ["d", P(-0.02, 0.01), "10:00"], ["e", P(-0.05, 0.03), "12:00"],
  ] as const;
  const pt = (k: string) => stopsOf.find((x) => x[0] === k)!;
  let n = 0;
  for (const [from, to, day] of [["a", "b", 1], ["b", "c", 1], ["d", "e", 2]] as const) {
    const f = pt(from); const t = pt(to);
    const mode = defaultRoutedMode(f[1], t[1], true);
    const key = routeLegKey(f[1], t[1], mode, routeHourBucket(departureWallClock({ startTime: null, endTime: f[2], durationMinutes: null })));
    await db.execute(sql`INSERT INTO transport_legs (id, variant_id, day_number, leg_order, from_activity_id, from_name, from_lat, from_lng,
        to_activity_id, to_name, to_lat, to_lng, distance_meters, distance_display, recommended_mode, estimated_duration_minutes,
        alternative_modes, source, calculated_at)
      VALUES (${id(`vleg${n++}`)}, ${ver}, ${day}, ${n}, ${`v-${from}`}, ${from}, ${f[1].lat}, ${f[1].lng}, ${`v-${to}`}, ${to}, ${t[1].lat}, ${t[1].lng},
        1000, '1 km', ${mode}, 17, ${JSON.stringify([{ mode, durationMinutes: 17, costUsd: null, energyCost: 0, reason: "stub", line: null, fare: null, legKey: key }])}::jsonb,
        'stub', now() - interval '1 hour')`);
  }
  const stub = new StubRoutingAdapter();
  const r: any = await computePlanLegs(OPT, { adapter: stub });
  assert.equal(stub.calls, 0, "every leg answered from the plan's own run");
  assert.equal(r.reused, 3);
  assert.equal(r.written, 3);
  for (const l of await legs(OPT)) assert.equal(l.estimated_duration_minutes, 17);
});
