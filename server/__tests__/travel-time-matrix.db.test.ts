/**
 * A2 — the travel-time matrix's refresh job and read helper against a real database, with the
 * Routes API replaced by a fake (ledger `2026-09-29-a2-travel-time-matrix`). No network call is
 * ever made here, and a run without an injected fetch and without GOOGLE_MAPS_API_KEY skips (M1).
 *
 *   M1  no key, no fake fetch ⇒ skipped "no_api_key", nothing written
 *   M2  a forced run writes n²×2 cells, costs itself at the configured prices, records complete
 *   M3  ROUTE_NOT_FOUND is stored as a NULL duration and read back as "est." (no_route_found)
 *   M4  a second run replaces cells (the UNIQUE pair+mode), never duplicates them
 *   M5  not due ⇒ skipped "not_due"; changed centroids ⇒ due again
 *   M6  a run whose ceiling cost exceeds the maximum is refused before any call
 *   M7  a failing batch marks the run failed with the error; earlier cells stay
 *   M8  transit requests never exceed 100 elements and carry a departure time
 *
 * DISPOSABLE DB ONLY: every row is under a unique fake market slug and is deleted afterwards.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db, pool } from "../db";
import { refreshMarketMatrix, loadMatrixReader, type RouteMatrixElement } from "../services/travel-time-matrix.service";
import type { Centroid } from "@shared/travel-time";

const MARKET = `test-${crypto.randomUUID().slice(0, 8)}`;
const C3: Centroid[] = [
  { slug: "gion", lat: 35.0037, lng: 135.7788, radiusKm: 0.8 },
  { slug: "kyoto-station", lat: 34.9858, lng: 135.7588, radiusKm: 1.0 },
  { slug: "arashiyama", lat: 35.0094, lng: 135.6669, radiusKm: 2.0 },
];
const load3 = async () => C3;

const bodies: any[] = [];
function fakeFetch(opts: { failOnCall?: number } = {}) {
  let calls = 0;
  return async (body: any): Promise<RouteMatrixElement[]> => {
    calls++;
    bodies.push(body);
    if (opts.failOnCall === calls) throw new Error("computeRouteMatrix 500: fake failure");
    const out: RouteMatrixElement[] = [];
    body.origins.forEach((_: unknown, o: number) =>
      body.destinations.forEach((_d: unknown, d: number) => {
        const transitNoRoute = body.travelMode === "TRANSIT" && o !== d && body.origins[o].waypoint.location.latLng.longitude < 135.7 ;
        out.push(transitNoRoute
          ? { originIndex: o, destinationIndex: d, condition: "ROUTE_NOT_FOUND" }
          : { originIndex: o, destinationIndex: d, duration: `${600 + o * 60 + d * 30}s`, distanceMeters: 1000 + o + d, condition: "ROUTE_EXISTS" });
      }),
    );
    return out;
  };
}

const cellCount = async () => Number(((await db.execute(sql`SELECT count(*)::int AS n FROM travel_time_matrix WHERE market_slug = ${MARKET}`)).rows[0] as any).n);

after(async () => {
  try {
    await db.execute(sql`DELETE FROM travel_time_matrix WHERE market_slug = ${MARKET}`);
    await db.execute(sql`DELETE FROM travel_time_matrix_refreshes WHERE market_slug = ${MARKET}`);
  } finally {
    await pool.end();
  }
});

test("M1: no API key and no injected fetch ⇒ skipped, nothing written", async () => {
  const saved = process.env.GOOGLE_MAPS_API_KEY;
  delete process.env.GOOGLE_MAPS_API_KEY;
  try {
    const r = await refreshMarketMatrix({ marketSlug: MARKET, loadCentroids: load3 });
    assert.deepEqual(r, { skipped: "no_api_key", market: MARKET });
    assert.equal(await cellCount(), 0);
  } finally {
    if (saved !== undefined) process.env.GOOGLE_MAPS_API_KEY = saved;
  }
});

test("M2/M3/M8: a forced run writes every cell, costs itself, and stores no-route as NULL", async () => {
  bodies.length = 0;
  const r: any = await refreshMarketMatrix({ marketSlug: MARKET, force: true, fetchMatrix: fakeFetch(), loadCentroids: load3 });
  assert.equal(r.status, "complete");
  assert.equal(r.elementsRequested, 18);
  assert.equal(r.elementsReturned, 18);
  assert.equal(await cellCount(), 18);
  const [run] = (await db.execute(sql`SELECT status, elements_requested, elements_returned, essentials_price_per_1000, pro_price_per_1000, estimated_list_cost_usd, centroid_count FROM travel_time_matrix_refreshes WHERE id = ${r.refreshId}`)).rows as any[];
  assert.equal(run.status, "complete");
  assert.equal(Number(run.essentials_price_per_1000), 5);
  assert.equal(Number(run.pro_price_per_1000), 10);
  // 9 walk elements at $5/1000 + 9 transit at $10/1000 = $0.135 ⇒ recorded to the cent.
  assert.equal(Number(run.estimated_list_cost_usd), 0.14);
  assert.equal(run.centroid_count, 3);
  // M3: arashiyama → gion by transit was ROUTE_NOT_FOUND in the fake.
  const [noRoute] = (await db.execute(sql`SELECT duration_seconds FROM travel_time_matrix WHERE market_slug = ${MARKET} AND origin_slug = 'arashiyama' AND dest_slug = 'gion' AND mode = 'transit'`)).rows as any[];
  assert.equal(noRoute.duration_seconds, null);
  const read = await loadMatrixReader(MARKET, load3);
  const t = read({ lat: 35.0094, lng: 135.6669 }, { lat: 35.0037, lng: 135.7788 }, "transit");
  assert.equal(t.basis === "est" && t.reason, "no_route_found");
  const m = read({ lat: 34.9858, lng: 135.7588 }, { lat: 35.0037, lng: 135.7788 }, "walk");
  assert.equal(m.basis, "matrix");
  // M8: transit bodies carry a departure time and stay within the 100-element cap.
  const transit = bodies.filter((b) => b.travelMode === "TRANSIT");
  assert.ok(transit.length > 0 && transit.every((b) => typeof b.departureTime === "string" && b.origins.length * b.destinations.length <= 100));
});

test("M4: a second forced run replaces cells, never duplicates them", async () => {
  const r: any = await refreshMarketMatrix({ marketSlug: MARKET, force: true, fetchMatrix: fakeFetch(), loadCentroids: load3 });
  assert.equal(r.status, "complete");
  assert.equal(await cellCount(), 18);
});

test("M5: not due ⇒ skipped; a changed centroid set ⇒ due again", async () => {
  const r = await refreshMarketMatrix({ marketSlug: MARKET, fetchMatrix: fakeFetch(), loadCentroids: load3 });
  assert.deepEqual(r, { skipped: "not_due", market: MARKET, reason: "fresh" });
  const moved = async () => C3.map((c) => (c.slug === "gion" ? { ...c, lat: c.lat + 0.001 } : c));
  const r2: any = await refreshMarketMatrix({ marketSlug: MARKET, fetchMatrix: fakeFetch(), loadCentroids: moved });
  assert.equal(r2.status, "complete");
});

test("M6: a run whose ceiling cost exceeds the maximum is refused before any call", async () => {
  const saved = process.env.TRAVEL_MATRIX_MAX_REFRESH_CEILING_USD;
  process.env.TRAVEL_MATRIX_MAX_REFRESH_CEILING_USD = "0.05";
  bodies.length = 0;
  try {
    const r = await refreshMarketMatrix({ marketSlug: MARKET, force: true, fetchMatrix: fakeFetch(), loadCentroids: load3 });
    assert.deepEqual(r, { refused: "over_ceiling", market: MARKET, ceilingUsd: 0.18, maxUsd: 0.05 });
    assert.equal(bodies.length, 0, "no Routes call was made");
  } finally {
    if (saved === undefined) delete process.env.TRAVEL_MATRIX_MAX_REFRESH_CEILING_USD;
    else process.env.TRAVEL_MATRIX_MAX_REFRESH_CEILING_USD = saved;
  }
});

test("M7: a failing batch marks the run failed and records the error", async () => {
  const r: any = await refreshMarketMatrix({ marketSlug: MARKET, force: true, fetchMatrix: fakeFetch({ failOnCall: 2 }), loadCentroids: load3 });
  assert.equal(r.status, "failed");
  assert.match(r.error, /fake failure/);
  const [run] = (await db.execute(sql`SELECT status, error, finished_at FROM travel_time_matrix_refreshes WHERE id = ${r.refreshId}`)).rows as any[];
  assert.equal(run.status, "failed");
  assert.ok(run.finished_at);
  assert.equal(await cellCount(), 18, "cells from earlier runs stay");
});
