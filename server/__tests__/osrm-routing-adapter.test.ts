/**
 * 9b-a — THE OSRM ROUTING ADAPTER (9b spec v1.0 T2; ledger `2026-10-16-9b-a-osrm-adapter`). Run against a
 * fake OSRM (network injected — no request leaves the process). The same contract as the Google adapter and
 * the stub (`routing-adapter-contract.test.ts`) for the two modes OSRM serves, plus what is OSRM's own.
 *
 *   OS1  drive and walk answer the five facts and OSRM's own provenance — never geometry or steps, even
 *        when the server sent them
 *   OS2  the request: lng,lat order, the car profile for drive and the foot profile for walk, no overview,
 *        no steps, no alternatives
 *   OS3  transit and cycle have no OSRM source: `no_route` (unanswered: unsupported_mode) and NO request
 *   OS4  a failed call is `no_route` (a thin connector, cost 0) marked unanswered: failed — a non-200, a
 *        non-Ok code, an unreadable body, a throw, a timeout, no base URL; OSRM's own NoRoute/NoSegment is
 *        a plain `no_route` (an answer, 9b-d); OSRM is never `paused`
 *   OS5  OSRM's answers are cacheable (Google's still are not) and read "© OpenStreetMap contributors"
 *   OS6  the adapter choice: the stub wins in CI, OSRM when enabled with a base URL, else NONE — 9b-b: every
 *        caller stores its answer, so Google Routes is never chosen (9b spec T1)
 *   OS7  a transit ask through the engine's one fallback becomes an OSRM drive
 *   OS8  "checked" is the extract date the proxy states in X-OSRM-Extract; the call time only when the
 *        header is absent or unreadable; the default request timeout is 15 s (cold mmap page-in)
 *
 * Run: npx tsx --test server/__tests__/osrm-routing-adapter.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  CACHEABLE_ROUTE_SOURCES,
  OSRM_ROUTES_SOURCE,
  ROUTE_FACT_FIELDS,
  cacheableRouteEntry,
  routeProvenanceLabel,
  routedLegLine,
  type RoutingMode,
} from "@shared/routing-engine";
import { OSRM_EXTRACT_HEADER, OsrmRoutingAdapter, osrmCheckedAt, osrmRouteUrl, parseOsrmResponse } from "../services/routing/osrm-routing-adapter";
import { RouteRunMemo, routeWithTransitFallback } from "../services/routing/route-memo";

const GION = { lat: 35.0037, lng: 135.7788, placeId: "ChIJgion" };
const KIYOMIZU = { lat: 34.9949, lng: 135.785 };
const NOW = new Date("2026-10-12T00:40:00Z");
const BASE = "http://osrm.internal:5000";

/** An OSRM `route` answer carrying everything OSRM might send — geometry and steps included. */
const OSRM_BODY = {
  code: "Ok",
  routes: [
    {
      duration: 754.3,
      distance: 3120.6,
      geometry: "_p~iF~ps|U_ulLnnqC",
      legs: [{ steps: [{ maneuver: { instruction: "Turn left" }, geometry: "x" }], summary: "Higashioji-dori" }],
      weight: 754.3,
    },
  ],
  waypoints: [{ name: "Gion" }, { name: "Kiyomizu" }],
};

function osrmWith(opts: { status?: number; body?: unknown; throws?: Error; hang?: boolean; baseUrl?: string | null } = {}) {
  const urls: string[] = [];
  const adapter = new OsrmRoutingAdapter({
    now: () => NOW,
    baseUrl: () => (opts.baseUrl === undefined ? BASE : opts.baseUrl),
    profile: (mode) => (mode === "drive" ? "car" : "foot"),
    timeoutMs: () => 20,
    fetch: (async (url: any, init: any) => {
      urls.push(String(url));
      if (opts.throws) throw opts.throws;
      if (opts.hang) {
        await new Promise((resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
        });
      }
      const status = opts.status ?? 200;
      return { ok: status < 400, status, json: async () => (opts.body === undefined ? OSRM_BODY : opts.body) } as any;
    }) as any,
  });
  return { adapter, urls };
}

test("OS1: drive and walk answer the five facts and OSRM's provenance — no geometry, no steps", async () => {
  const { adapter } = osrmWith();
  for (const mode of ["drive", "walk"] as RoutingMode[]) {
    const out = await adapter.route(GION, KIYOMIZU, mode, null);
    assert.equal(out.kind, "ok", mode);
    if (out.kind !== "ok") continue;
    assert.deepEqual(Object.keys(out.route).sort(), [...ROUTE_FACT_FIELDS].sort());
    const json = JSON.stringify(out.route);
    for (const banned of ["geometry", "steps", "maneuver", "instruction", "waypoints", "summary"]) assert.ok(!json.includes(banned), `${mode}: no ${banned}`);
    assert.deepEqual(out.route, {
      durationMin: 13,
      distanceM: 3121,
      line: null,
      fare: null,
      provenance: { source: OSRM_ROUTES_SOURCE, checkedAt: NOW.toISOString() },
    });
    assert.equal(adapter.source, "osrm");
  }
});

test("OS2: the request — lng,lat, the profile per mode, no overview, no steps, no alternatives", async () => {
  const { adapter, urls } = osrmWith();
  await adapter.route(GION, KIYOMIZU, "drive", null);
  await adapter.route(GION, KIYOMIZU, "walk", new Date());
  assert.equal(urls[0], `${BASE}/route/v1/car/135.778800,35.003700;135.785000,34.994900?overview=false&steps=false&alternatives=false`);
  assert.ok(urls[1].startsWith(`${BASE}/route/v1/foot/135.778800,35.003700;135.785000,34.994900?`));
  assert.equal(osrmRouteUrl("http://x", "car", { lat: 1, lng: 2 }, { lat: 3, lng: 4 }), "http://x/route/v1/car/2.000000,1.000000;4.000000,3.000000?overview=false&steps=false&alternatives=false");
});

test("OS3: transit and cycle answer no route and make no request", async () => {
  const { adapter, urls } = osrmWith();
  for (const mode of ["transit", "cycle"] as RoutingMode[]) {
    assert.deepEqual(await adapter.route(GION, KIYOMIZU, mode, NOW), { kind: "no_route", unanswered: "unsupported_mode" }, mode);
  }
  assert.equal(urls.length, 0);
});

test("OS4: a failed call is no route — never paused, never an invented answer", async () => {
  for (const code of ["NoRoute", "NoSegment"]) {
    const { adapter } = osrmWith({ body: { code, routes: [] } });
    assert.deepEqual(await adapter.route(GION, KIYOMIZU, "drive", null), { kind: "no_route" }, `OSRM ${code} is an answer`);
  }
  const cases: Array<[string, Parameters<typeof osrmWith>[0]]> = [
    ["http 500", { status: 500 }],
    ["OSRM InvalidQuery", { body: { code: "InvalidQuery" } }],
    ["no routes", { body: { code: "Ok", routes: [] } }],
    ["zero duration", { body: { code: "Ok", routes: [{ duration: 0, distance: 10 }] } }],
    ["unreadable", { body: "<html>" }],
    ["throws", { throws: new Error("ECONNREFUSED") }],
    ["timeout", { hang: true }],
    ["no base url", { baseUrl: null }],
  ];
  for (const [label, opts] of cases) {
    const { adapter } = osrmWith(opts);
    assert.deepEqual(await adapter.route(GION, KIYOMIZU, "drive", null), { kind: "no_route", unanswered: "failed" }, label);
  }
  assert.equal(parseOsrmResponse(null, NOW), null);
});

test("OS5: OSRM answers are cacheable, Google's are not; the label is the OSM attribution", async () => {
  assert.ok(CACHEABLE_ROUTE_SOURCES.has("osrm"));
  assert.equal(CACHEABLE_ROUTE_SOURCES.has("google_routes"), false);
  const out = await osrmWith().adapter.route(GION, KIYOMIZU, "walk", null);
  assert.ok(out.kind === "ok" && cacheableRouteEntry(out.route), "the cache boundary admits an OSRM answer");
  assert.equal(routeProvenanceLabel({ source: "osrm", checkedAt: NOW.toISOString() }, "Asia/Tokyo"), "© OpenStreetMap contributors · checked 12 Oct");
  assert.equal(
    routedLegLine({ mode: "walk", route: (out as any).route }, "Asia/Tokyo"),
    "13 min · walk · © OpenStreetMap contributors · checked 12 Oct",
  );
});

test("OS6: the adapter choice — stub in CI, OSRM when enabled with a base URL, else none (never Google)", async () => {
  const saved = { ...process.env };
  try {
    const { routingAdapter } = await import("../services/routing/index");
    process.env.TRAVEL_TIME_SERVICE_ENABLED = "1";
    delete process.env.ROUTING_ADAPTER_STUB;
    process.env.OSRM_ENABLED = "1";
    process.env.OSRM_BASE_URL = "http://osrm.internal:5000/";
    assert.equal(routingAdapter()?.source, "osrm");
    delete process.env.OSRM_BASE_URL;
    assert.equal(routingAdapter(), null, "enabled without a base URL is off, and Google is never the fallback");
    process.env.OSRM_BASE_URL = BASE;
    process.env.OSRM_ENABLED = "0";
    assert.equal(routingAdapter(), null);
    process.env.OSRM_ENABLED = "1";
    process.env.ROUTING_ADAPTER_STUB = "1";
    assert.equal(routingAdapter()?.source, "stub", "the CI stub wins");
    process.env.TRAVEL_TIME_SERVICE_ENABLED = "0";
    assert.equal(routingAdapter(), null, "the engine switch off ⇒ no adapter");
  } finally {
    for (const k of ["TRAVEL_TIME_SERVICE_ENABLED", "ROUTING_ADAPTER_STUB", "OSRM_ENABLED", "OSRM_BASE_URL"]) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
});

test("OS7: a transit ask through the engine's one fallback becomes an OSRM drive", async () => {
  const { adapter, urls } = osrmWith();
  const out = await routeWithTransitFallback(new RouteRunMemo(), adapter, { origin: GION, destination: KIYOMIZU, mode: "transit", departAt: NOW, hourBucket: 10 });
  assert.equal(out.mode, "drive");
  assert.equal(out.transitUnavailable, true);
  assert.equal(out.outcome.kind, "ok");
  assert.equal(urls.length, 1, "only the drive was requested");
  assert.ok(urls[0].includes("/route/v1/car/"));
});

test("OS8: checked is the extract date from X-OSRM-Extract, else the call time; default timeout 15 s", async () => {
  const EXTRACT = "2026-10-16T20:21:21Z";
  const headerAdapter = (value: string | null) =>
    new OsrmRoutingAdapter({
      now: () => NOW,
      baseUrl: () => BASE,
      profile: (mode) => (mode === "drive" ? "car" : "foot"),
      timeoutMs: () => 20,
      fetch: (async () => ({
        ok: true,
        status: 200,
        headers: { get: (name: string) => (name.toLowerCase() === OSRM_EXTRACT_HEADER && value !== null ? value : null) },
        json: async () => OSRM_BODY,
      })) as any,
    });
  const stated = await headerAdapter(EXTRACT).route(GION, KIYOMIZU, "drive", null);
  assert.ok(stated.kind === "ok");
  assert.equal((stated as any).route.provenance.checkedAt, new Date(EXTRACT).toISOString(), "the extract date, not the call time");
  assert.equal(routeProvenanceLabel((stated as any).route.provenance, "Asia/Tokyo"), "© OpenStreetMap contributors · checked 17 Oct");
  for (const value of [null, "", "not-a-date"]) {
    const out = await headerAdapter(value).route(GION, KIYOMIZU, "walk", null);
    assert.ok(out.kind === "ok");
    assert.equal((out as any).route.provenance.checkedAt, NOW.toISOString(), `header ${JSON.stringify(value)} ⇒ call time`);
  }
  assert.equal(osrmCheckedAt(undefined, NOW), NOW);
  const saved = process.env.OSRM_TIMEOUT_MS;
  try {
    delete process.env.OSRM_TIMEOUT_MS;
    const { osrmTimeoutMs } = await import("../config/osrm.config");
    assert.equal(osrmTimeoutMs(), 15000);
    process.env.OSRM_TIMEOUT_MS = "7000";
    assert.equal(osrmTimeoutMs(), 7000);
  } finally {
    if (saved === undefined) delete process.env.OSRM_TIMEOUT_MS;
    else process.env.OSRM_TIMEOUT_MS = saved;
  }
});
