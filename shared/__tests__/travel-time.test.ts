/**
 * A2 — the travel-time matrix's pure rules (ledger `2026-09-29-a2-travel-time-matrix`; product map
 * §M3/§M4, R186). T1–T3 snapping, T4–T7 the read rule and its labelled estimate, T8–T9 batching to
 * the per-request cap, T10 cost at list and ceiling, T11 when a refresh is due.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  estimateRefreshCost,
  matrixKey,
  planMatrixBatches,
  refreshDue,
  resolveTravelTime,
  snapToCentroid,
  type Centroid,
  type MatrixCell,
} from "../travel-time";

const gion: Centroid = { slug: "gion", lat: 35.0037, lng: 135.7788, radiusKm: 0.8 };
const station: Centroid = { slug: "kyoto-station", lat: 34.9858, lng: 135.7588, radiusKm: 1.0 };
const arashiyama: Centroid = { slug: "arashiyama", lat: 35.0094, lng: 135.6669, radiusKm: 2.0 };
const C = [gion, station, arashiyama];

test("T1: a point inside a neighbourhood's radius snaps to it", () => {
  assert.equal(snapToCentroid({ lat: 35.0040, lng: 135.7790 }, C)?.slug, "gion");
});
test("T2: a point near no neighbourhood is NOT snapped to the nearest one (§13)", () => {
  assert.equal(snapToCentroid({ lat: 35.1500, lng: 135.9000 }, C), null);
});
test("T3: between two, the nearer centroid wins", () => {
  assert.equal(snapToCentroid({ lat: 34.9860, lng: 135.7590 }, C)?.slug, "kyoto-station");
});

const cells = new Map<string, MatrixCell>([
  [matrixKey("kyoto-station", "gion", "transit"), { originSlug: "kyoto-station", destSlug: "gion", mode: "transit", durationSeconds: 1260 }],
  [matrixKey("gion", "arashiyama", "transit"), { originSlug: "gion", destSlug: "arashiyama", mode: "transit", durationSeconds: null }],
]);
const lookup = (k: string) => cells.get(k);

test("T4: a pair the matrix holds is basis 'matrix', in whole minutes", () => {
  const t = resolveTravelTime({ from: { lat: 34.9858, lng: 135.7588 }, to: { lat: 35.0037, lng: 135.7788 }, mode: "transit", centroids: C, lookup });
  assert.deepEqual(t, { basis: "matrix", minutes: 21, mode: "transit", originSlug: "kyoto-station", destSlug: "gion" });
});
test("T5: a pair not in the matrix is the labelled estimate, with the reason", () => {
  const t = resolveTravelTime({ from: { lat: 34.9858, lng: 135.7588 }, to: { lat: 35.0037, lng: 135.7788 }, mode: "walk", centroids: C, lookup });
  assert.equal(t.basis, "est");
  assert.equal(t.basis === "est" && t.reason, "pair_not_in_matrix");
  assert.ok(t.minutes >= 1);
});
test("T6: a NULL duration (no route found) is never a number from the matrix — it is 'est.'", () => {
  const t = resolveTravelTime({ from: { lat: 35.0037, lng: 135.7788 }, to: { lat: 35.0094, lng: 135.6669 }, mode: "transit", centroids: C, lookup });
  assert.equal(t.basis === "est" && t.reason, "no_route_found");
});
test("T7: two points in one neighbourhood, or one outside any, are 'est.' and say why", () => {
  const same = resolveTravelTime({ from: { lat: 35.0037, lng: 135.7788 }, to: { lat: 35.0045, lng: 135.7780 }, mode: "walk", centroids: C, lookup });
  assert.equal(same.basis === "est" && same.reason, "same_neighbourhood");
  const out = resolveTravelTime({ from: { lat: 35.2, lng: 136.0 }, to: { lat: 35.0037, lng: 135.7788 }, mode: "walk", centroids: C, lookup });
  assert.equal(out.basis === "est" && out.reason, "not_in_a_neighbourhood");
});

test("T8: transit batches respect the 100-element cap and cover every pair exactly once", () => {
  const batches = planMatrixBatches(60, 100);
  assert.ok(batches.every((b) => b.elements <= 100));
  assert.equal(batches.reduce((n, b) => n + b.elements, 0), 3600);
  const seen = new Set<string>();
  for (const b of batches) for (let o = b.originStart; o < b.originEnd; o++) for (let d = b.destStart; d < b.destEnd; d++) {
    const k = `${o}:${d}`;
    assert.ok(!seen.has(k), `pair ${k} appears twice`);
    seen.add(k);
  }
  assert.equal(seen.size, 3600);
});
test("T9: walking batches use the 625 cap (25×25); ten centroids is one request", () => {
  assert.equal(planMatrixBatches(10, 625).length, 1);
  assert.ok(planMatrixBatches(60, 625).every((b) => b.elements <= 625));
  assert.deepEqual(planMatrixBatches(0, 100), []);
});

test("T10: cost — 60 centroids, two modes: $54 list, $72 at the $10 ceiling (§M4)", () => {
  const c = estimateRefreshCost({ centroidCount: 60, modes: ["walk", "transit"], essentialsPer1000: 5, proPer1000: 10, ceilingPer1000: 10 });
  assert.deepEqual(c, { elements: 7200, listUsd: 54, ceilingUsd: 72 });
});

test("T11: due when never run, when centroids changed, or when older than the window", () => {
  const now = new Date("2026-10-30T00:00:00Z");
  assert.equal(refreshDue({ lastComplete: null, currentHash: "a", now, afterDays: 30 }).reason, "never_refreshed");
  assert.equal(refreshDue({ lastComplete: { finishedAt: new Date("2026-10-29"), centroidHash: "a" }, currentHash: "b", now, afterDays: 30 }).reason, "centroids_changed");
  assert.equal(refreshDue({ lastComplete: { finishedAt: new Date("2026-09-29"), centroidHash: "a" }, currentHash: "a", now, afterDays: 30 }).reason, "stale");
  assert.deepEqual(refreshDue({ lastComplete: { finishedAt: new Date("2026-10-20"), centroidHash: "a" }, currentHash: "a", now, afterDays: 30 }), { due: false, reason: "fresh" });
});
