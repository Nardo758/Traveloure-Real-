/**
 * STEP 9a — THE ROUTING ADAPTER CONTRACT (ruling 11; ledger `2026-10-07-step9a-routing-engine`).
 * ONE contract, run against BOTH implementations: the Google Routes adapter (network injected — no key,
 * no call leaves the process) and the CI stub. Plus the cache-first rule and the pure helpers.
 *
 *   C1  an answer carries exactly the five allowed facts — duration, distance, line, fare, provenance —
 *       and no polyline and no step-by-step, even when the source sent them (decision-maker, Oct 7)
 *   C2  provenance names the adapter's own source and a real instant
 *   C3  paused (the daily cap) is its own outcome, and makes no request
 *   C4  Google: each mode goes through its R299 caller by name; the masks never ask for geometry or steps;
 *       a transit departure is sent only when it is in the future
 *   C5  Google: a failed request is `no_route` and is reported to the gate as a failure (cost 0, ruling 7)
 *   C6  Google: transit line names and the fare in the source's own currency (L6)
 *   K1  cache-first: a fresh hit makes no call; a miss calls once and writes the allowlisted entry
 *   K2  paused and failed answers are never cached
 *   K3  the key: place ID when known, else coordinates rounded to 4 decimals; mixed keys (ruling 4)
 *   K4  freshness is checked_at against the TTL, read at lookup time
 *   P1  the default mode (L4 / ruling 9) and the transit-coverage test
 *   P2  the one LegRow line
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  ROUTE_CACHE_FIELDS,
  defaultRoutedMode,
  marketHasTransitCoverage,
  routeCacheKey,
  routeHourBucket,
  routePointKey,
  routedLegLine,
  toRouteCacheEntry,
  type RouteAnswer,
  type RoutingAdapter,
  type RoutingMode,
} from "@shared/routing-engine";
import { GoogleRoutingAdapter, callerForMode, parseRoutesResponse } from "../services/routing/google-routing-adapter";
import { StubRoutingAdapter } from "../services/routing/stub-routing-adapter";
import { ROUTED_BASIC_FIELD_MASK, ROUTED_TRANSIT_FIELD_MASK } from "../services/maps-billing/maps-requests";
import { isRouteFresh, routeLegCached, type RouteCacheStore } from "../services/routing/route-cache.service";

const GION = { lat: 35.0037, lng: 135.7788, placeId: "ChIJgion" };
const FUSHIMI = { lat: 34.9671, lng: 135.7727 };
const NEAR_GION = { lat: 35.0045, lng: 135.7795 };
const NOW = new Date("2026-10-07T03:00:00Z");

/** A Google response carrying everything Google might send — geometry and steps included. */
const GOOGLE_TRANSIT_BODY = {
  routes: [
    {
      duration: "1440s",
      distanceMeters: 5210,
      polyline: { encodedPolyline: "abc123" },
      legs: [
        {
          steps: [
            { navigationInstruction: { instructions: "Walk to Gion-Shijo" }, polyline: { encodedPolyline: "x" } },
            { transitDetails: { transitLine: { name: "Keihan Main Line", nameShort: "KH" }, stopDetails: { arrivalStop: { name: "Fushimi-Inari" } } } },
          ],
        },
      ],
      travelAdvisory: { transitFare: { currencyCode: "JPY", units: "220" } },
    },
  ],
};

type Call = { key: string; mask: string; body: any };
function googleWith(opts: { status?: number; body?: unknown; refused?: string } = {}) {
  const calls: Call[] = [];
  const failures: boolean[] = [];
  const adapter = new GoogleRoutingAdapter({
    now: () => NOW,
    gate: async (key, call) => {
      if (opts.refused) return { refused: opts.refused };
      const out = await call("test-key");
      failures.push(out.success === false);
      (calls[calls.length - 1] as any).key = key;
      return { value: out.value };
    },
    fetch: (async (_url: any, init: any) => {
      calls.push({ key: "", mask: init.headers["X-Goog-FieldMask"], body: JSON.parse(init.body) });
      const status = opts.status ?? 200;
      return { ok: status < 400, status, json: async () => opts.body ?? GOOGLE_TRANSIT_BODY, text: async () => "" } as any;
    }) as any,
  });
  return { adapter, calls, failures };
}

const IMPLEMENTATIONS: Array<[string, () => RoutingAdapter]> = [
  ["google", () => googleWith().adapter],
  ["stub", () => new StubRoutingAdapter({ now: () => NOW })],
];

function assertOnlyAllowedFacts(route: RouteAnswer, label: string) {
  assert.deepEqual(Object.keys(route).sort(), [...ROUTE_CACHE_FIELDS].sort(), `${label}: exactly the five facts`);
  const json = JSON.stringify(route);
  for (const banned of ["polyline", "encodedPolyline", "steps", "navigationInstruction", "instructions", "stopDetails"]) {
    assert.ok(!json.includes(banned), `${label}: no ${banned}`);
  }
  assert.ok(Number.isInteger(route.durationMin) && route.durationMin >= 1, `${label}: whole minutes`);
  assert.ok(Number.isInteger(route.distanceM) && route.distanceM >= 0, `${label}: whole metres`);
}

for (const [name, make] of IMPLEMENTATIONS) {
  test(`C1/C2 (${name}): every mode answers the five facts and its own provenance — never geometry or steps`, async () => {
    const adapter = make();
    for (const mode of ["walk", "transit", "drive", "cycle"] as RoutingMode[]) {
      const out = await adapter.route(GION, FUSHIMI, mode, null);
      assert.equal(out.kind, "ok", `${name} ${mode}`);
      if (out.kind !== "ok") continue;
      assertOnlyAllowedFacts(out.route, `${name} ${mode}`);
      assertOnlyAllowedFacts(toRouteCacheEntry(out.route), `${name} ${mode} cache entry`);
      assert.equal(out.route.provenance.source, adapter.source);
      assert.ok(!Number.isNaN(new Date(out.route.provenance.checkedAt).getTime()));
    }
  });
}

test("C1: the cache projection drops anything outside the allowlist", () => {
  const dirty = {
    durationMin: 24.4,
    distanceM: 5210.7,
    line: " Keihan Main Line ",
    fare: { amount: 220, currency: "JPY", extra: 1 },
    provenance: { source: "google_routes", checkedAt: NOW.toISOString(), raw: "x" },
    polyline: "abc",
    steps: [{ instructions: "walk" }],
  } as any;
  const e = toRouteCacheEntry(dirty);
  assertOnlyAllowedFacts(e, "projection");
  assert.deepEqual(e, { durationMin: 24, distanceM: 5211, line: "Keihan Main Line", fare: { amount: 220, currency: "JPY" }, provenance: { source: "google_routes", checkedAt: NOW.toISOString() } });
});

test("C3: paused is its own outcome and makes no request", async () => {
  const g = googleWith({ refused: "paused" });
  assert.deepEqual(await g.adapter.route(GION, FUSHIMI, "transit", null), { kind: "paused" });
  assert.equal(g.calls.length, 0);
  const off = googleWith({ refused: "disabled" });
  assert.deepEqual(await off.adapter.route(GION, FUSHIMI, "transit", null), { kind: "no_route" }, "a switched-off caller is not 'paused'");
  const s = new StubRoutingAdapter({ paused: true });
  assert.deepEqual(await s.route(GION, FUSHIMI, "walk", null), { kind: "paused" });
  assert.equal(s.calls, 0);
});

test("C4: Google — one R299 caller per mode; masks never ask for geometry or steps; departure only in the future", async () => {
  assert.equal(callerForMode("walk"), "routes_mode");
  assert.equal(callerForMode("cycle"), "routes_mode");
  assert.equal(callerForMode("transit"), "routes_transit");
  assert.equal(callerForMode("drive"), "routes_drive");
  for (const mask of [ROUTED_BASIC_FIELD_MASK, ROUTED_TRANSIT_FIELD_MASK]) {
    assert.ok(!/polyline|navigationInstruction|startLocation|endLocation|staticDuration/.test(mask), mask);
  }
  const g = googleWith();
  await g.adapter.route(GION, FUSHIMI, "transit", new Date("2026-11-11T01:00:00Z"));
  await g.adapter.route(GION, FUSHIMI, "transit", new Date("2026-10-01T01:00:00Z"));
  await g.adapter.route(GION, FUSHIMI, "drive", null);
  await g.adapter.route(GION, FUSHIMI, "walk", null);
  assert.deepEqual(g.calls.map((c) => c.key), ["routes_transit", "routes_transit", "routes_drive", "routes_mode"]);
  assert.equal(g.calls[0].body.departureTime, "2026-11-11T01:00:00.000Z");
  assert.equal("departureTime" in g.calls[1].body, false, "a past departure is not sent");
  assert.equal(g.calls[0].mask, ROUTED_TRANSIT_FIELD_MASK);
  assert.equal(g.calls[2].mask, ROUTED_BASIC_FIELD_MASK);
  assert.equal(g.calls[2].body.routingPreference, "TRAFFIC_UNAWARE", "drive stays Essentials");
  assert.equal(g.calls[3].body.travelMode, "WALK");
});

test("C5: Google — a failed request is no_route and is reported as a failure (cost 0); an empty answer is no_route", async () => {
  const g = googleWith({ status: 500 });
  assert.deepEqual(await g.adapter.route(GION, FUSHIMI, "transit", null), { kind: "no_route" });
  assert.deepEqual(g.failures, [true]);
  const empty = googleWith({ body: { routes: [] } });
  assert.deepEqual(await empty.adapter.route(GION, FUSHIMI, "walk", null), { kind: "no_route" });
});

test("C6: Google — transit line names in order and the fare in the source's currency", async () => {
  const r = parseRoutesResponse(GOOGLE_TRANSIT_BODY, NOW)!;
  assert.equal(r.durationMin, 24);
  assert.equal(r.line, "Keihan Main Line");
  assert.deepEqual(r.fare, { amount: 220, currency: "JPY" });
  const two = parseRoutesResponse(
    { routes: [{ duration: "600s", distanceMeters: 100, legs: [{ steps: [{ transitDetails: { transitLine: { name: "A" } } }, { transitDetails: { transitLine: { name: "B" } } }] }] }] },
    NOW,
  )!;
  assert.equal(two.line, "A → B");
  assert.equal(two.fare, null, "no fare unless the source gives one");
  const walk = parseRoutesResponse({ routes: [{ duration: "900s", distanceMeters: 1000 }] }, NOW)!;
  assert.equal(walk.line, null);
  assert.equal(walk.fare, null);
});

function memoryStore(seed: Record<string, RouteAnswer> = {}) {
  const rows = new Map(Object.entries(seed));
  const puts: string[] = [];
  const store: RouteCacheStore = {
    get: async (k) => rows.get(k) ?? null,
    put: async (k, _parts, r) => {
      puts.push(k);
      rows.set(k, r);
    },
  };
  return { store, rows, puts };
}

test("K1: a cache hit makes no call; a miss calls once and writes the allowlisted entry", async () => {
  const stub = new StubRoutingAdapter({ now: () => NOW });
  const mem = memoryStore();
  const input = { origin: GION, destination: FUSHIMI, mode: "transit" as RoutingMode, departAt: null, hourBucket: 10 };
  const first = await routeLegCached(input, stub, mem.store);
  assert.equal(first.cached, false);
  assert.equal(stub.calls, 1);
  assert.deepEqual(mem.puts, [first.cacheKey]);
  assertOnlyAllowedFacts(mem.rows.get(first.cacheKey)!, "stored");
  const second = await routeLegCached(input, stub, mem.store);
  assert.equal(second.cached, true);
  assert.equal(stub.calls, 1, "the hit made no call");
  assert.deepEqual(second.outcome, first.outcome, "a hit keeps the original checked date");
});

test("K2: paused and failed answers are never cached", async () => {
  const mem = memoryStore();
  const input = { origin: GION, destination: FUSHIMI, mode: "walk" as RoutingMode, departAt: null, hourBucket: null };
  assert.equal((await routeLegCached(input, new StubRoutingAdapter({ paused: true }), mem.store)).outcome.kind, "paused");
  assert.equal((await routeLegCached(input, new StubRoutingAdapter({ noRoute: true }), mem.store)).outcome.kind, "no_route");
  assert.equal(mem.puts.length, 0);
});

test("K3: the key — place ID when known, else 4-decimal coordinates; mixed keys; the hour bucket", () => {
  assert.equal(routePointKey(GION), "place:ChIJgion");
  assert.equal(routePointKey(FUSHIMI), "pt:34.9671,135.7727");
  assert.equal(routePointKey({ lat: 34.96714999, lng: 135.77271, placeId: "  " }), "pt:34.9671,135.7727");
  assert.equal(routeCacheKey(GION, FUSHIMI, "transit", 9), "place:ChIJgion|pt:34.9671,135.7727|transit|h9");
  assert.equal(routeCacheKey(GION, FUSHIMI, "transit", null), "place:ChIJgion|pt:34.9671,135.7727|transit|h-");
  assert.equal(routeHourBucket("09:40"), 9);
  assert.equal(routeHourBucket("9:05"), 9);
  assert.equal(routeHourBucket(""), null, "no time is its own bucket, never a guessed hour");
  assert.equal(routeHourBucket("25:00"), null);
});

test("K4: freshness is checked_at against the TTL, read at lookup time", () => {
  const day = 86_400_000;
  assert.equal(isRouteFresh(new Date(NOW.getTime() - 29 * day), 30, NOW), true);
  assert.equal(isRouteFresh(new Date(NOW.getTime() - 31 * day), 30, NOW), false);
  assert.equal(isRouteFresh(new Date(NOW.getTime() - 8 * day), 7, NOW), false, "a lowered TTL applies at once");
  assert.equal(isRouteFresh(NOW, 0, NOW), false, "0 = never reuse");
  assert.equal(isRouteFresh(null, 30, NOW), false);
});

test("P1: walk ≤ 1.2 km; else transit where the profile lists rail, bus or transit; else drive", () => {
  assert.equal(defaultRoutedMode(GION, NEAR_GION, true), "walk");
  assert.equal(defaultRoutedMode(GION, FUSHIMI, true), "transit");
  assert.equal(defaultRoutedMode(GION, FUSHIMI, false), "drive");
  assert.equal(marketHasTransitCoverage([{ mode: "walk", available: true }, { mode: "train", available: true }]), true);
  assert.equal(marketHasTransitCoverage([{ mode: "bus" }]), true);
  assert.equal(marketHasTransitCoverage([{ mode: "tram", available: true }]), true);
  assert.equal(marketHasTransitCoverage([{ mode: "train", available: false }, { mode: "taxi", available: true }]), false);
  assert.equal(marketHasTransitCoverage(null), false);
});

test("P2: the one LegRow line — duration · line or mode · fare · provenance", () => {
  const route: RouteAnswer = { durationMin: 24, distanceM: 5210, line: "Keihan Main Line", fare: { amount: 220, currency: "JPY" }, provenance: { source: "google_routes", checkedAt: "2026-10-04T05:00:00Z" } };
  assert.equal(routedLegLine({ mode: "transit", route }, "Asia/Tokyo"), "24 min · Keihan Main Line · ¥220 · Google · checked 4 Oct");
  assert.equal(
    routedLegLine({ mode: "walk", route: { ...route, durationMin: 18, line: null, fare: null } }, "Asia/Tokyo"),
    "18 min · walk · Google · checked 4 Oct",
  );
});

test("L5: routingPausedToday — a capped, switched-on routing caller pauses travel times; an off caller does not", async () => {
  const { routingPausedToday } = await import("../services/maps-billing/maps-billing.service");
  const base = { apiKey: () => "k", record: async () => {} };
  const deps = (enabled: string[], used: Record<string, number | null>, cap = 10) => ({
    ...base,
    enabled: (k: string) => enabled.includes(k),
    dailyCap: () => cap,
    countToday: async (k: string) => (k in used ? used[k] : 0),
  });
  assert.equal(await routingPausedToday(deps(["routes_transit"], { routes_transit: 9 }) as any), false);
  assert.equal(await routingPausedToday(deps(["routes_transit"], { routes_transit: 10 }) as any), true);
  assert.equal(await routingPausedToday(deps(["routes_mode"], { routes_mode: null }) as any), true, "an unreadable counter reads as paused");
  assert.equal(await routingPausedToday(deps([], { routes_transit: 99 }) as any), false, "off is not paused");
});
