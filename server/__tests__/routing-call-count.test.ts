/**
 * STEP 9a — CALLS PER OPTIMIZE RUN AND PER EDIT (brief L10; architect's note, Oct 7, 2026: "dedupe pairs
 * across the four versions through the cache before you measure; report the cold-run number after
 * that"). Ledger `2026-10-07-step9a-routing-engine`.
 *
 * The fixture is a settled 5-day plan, 5 located stops a day (4 stop pairs a day, 20 per version), and
 * the run's four versions: the baseline; a version that shifts every time by 30 minutes (some
 * departure hours move bucket); one that swaps each day's middle two stops; one that reverses each day.
 * Each version's legs go through the SAME pairing rule (`buildSameDayActivityPairs`) and the SAME
 * cache path (`routeLegCached`) the optimizer uses, against a cold cache and the counting stub.
 *
 *   N1  the cold run makes exactly as many calls as there are DISTINCT cache keys across the versions —
 *       a pair two versions share (same stops, same mode, same hour) is asked once; the number is printed
 *   N2  the four versions run in parallel and still ask each distinct key once (in-flight de-dup)
 *   N3  a second run over the same plan makes no call
 *   N4  an edit moving one stop asks at most two legs
 */
import assert from "node:assert/strict";
import test from "node:test";
import { buildSameDayActivityPairs, type ActivityLocation } from "../services/transport-leg-calculator";
import { defaultRoutedMode, routeCacheKey, routeHourBucket, type RouteAnswer } from "@shared/routing-engine";
import { routeLegCached, type RouteCacheStore } from "../services/routing/route-cache.service";
import { StubRoutingAdapter } from "../services/routing/stub-routing-adapter";
import { departureWallClock } from "../services/routing/plan-legs";

function memoryStore(): RouteCacheStore {
  const rows = new Map<string, RouteAnswer>();
  return { get: async (k) => rows.get(k) ?? null, put: async (k, _p, r) => void rows.set(k, r) };
}

const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/** 5 days × 5 stops around Kyoto; stops 1.5–3 km apart so most legs are transit, a few walk. */
function basePlan(): ActivityLocation[] {
  const out: ActivityLocation[] = [];
  for (let d = 1; d <= 5; d++) {
    for (let i = 0; i < 5; i++) {
      out.push({
        id: `d${d}s${i}`,
        name: `D${d} S${i}`,
        lat: 34.98 + d * 0.01 + i * (i % 2 ? 0.004 : 0.016),
        lng: 135.74 + i * 0.012,
        scheduledTime: hhmm(9 * 60 + i * 120),
        durationMinutes: 75,
        dayNumber: d,
        order: i,
        placeId: `ChIJ-d${d}s${i}`,
      });
    }
  }
  return out;
}

function versions(): ActivityLocation[][] {
  const base = basePlan();
  const shifted = base.map((a) => ({ ...a, scheduledTime: hhmm(9 * 60 + 30 + a.order * 120) }));
  const swapped = base.map((a) => ({ ...a, order: a.order === 1 ? 2 : a.order === 2 ? 1 : a.order }));
  const reversed = base.map((a) => ({ ...a, order: 4 - a.order }));
  return [base, shifted, swapped, reversed];
}

async function runVersion(acts: ActivityLocation[], stub: StubRoutingAdapter, store: RouteCacheStore, keys: Set<string>) {
  for (const pair of buildSameDayActivityPairs(acts)) {
    const o = { lat: pair.from.lat, lng: pair.from.lng, placeId: pair.from.placeId };
    const t = { lat: pair.to.lat, lng: pair.to.lng, placeId: pair.to.placeId };
    const mode = defaultRoutedMode(o, t, true);
    const wall = departureWallClock({ startTime: pair.from.scheduledTime, endTime: null, durationMinutes: pair.from.durationMinutes ?? null });
    const hourBucket = routeHourBucket(wall);
    keys.add(routeCacheKey(o, t, mode, hourBucket));
    await routeLegCached({ origin: o, destination: t, mode, departAt: null, hourBucket }, stub, store);
  }
}

test("N1: a cold Optimize run asks each distinct pair-mode-hour once across the four versions", async () => {
  const stub = new StubRoutingAdapter();
  const store = memoryStore();
  const keys = new Set<string>();
  for (const v of versions()) await runVersion(v, stub, store, keys);
  const legsAsked = versions().length * 20;
  assert.equal(stub.calls, keys.size);
  assert.ok(stub.calls < legsAsked, "versions share pairs");
  console.log(`[routing-call-count] cold Optimize run: ${stub.calls} calls for ${legsAsked} version legs (4 versions × 20)`);
});

test("N2: in parallel, as the optimizer runs them, still one call per distinct key", async () => {
  const stub = new StubRoutingAdapter();
  const store = memoryStore();
  const keys = new Set<string>();
  await Promise.all(versions().map((v) => runVersion(v, stub, store, keys)));
  assert.equal(stub.calls, keys.size);
});

test("N3 / N4: a second run makes no call; one moved stop asks at most two legs", async () => {
  const stub = new StubRoutingAdapter();
  const store = memoryStore();
  const keys = new Set<string>();
  for (const v of versions()) await runVersion(v, stub, store, keys);
  const cold = stub.calls;
  for (const v of versions()) await runVersion(v, stub, store, keys);
  assert.equal(stub.calls, cold, "warm cache: no call");
  const moved = basePlan().map((a) => (a.id === "d3s2" ? { ...a, lat: a.lat + 0.01, placeId: "ChIJ-moved" } : a));
  await runVersion(moved, stub, store, keys);
  assert.equal(stub.calls - cold, 2);
  console.log(`[routing-call-count] one edit (a stop moved): ${stub.calls - cold} calls`);
});
