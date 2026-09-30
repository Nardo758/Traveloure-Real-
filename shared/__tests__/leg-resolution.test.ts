/**
 * leg-resolution.test.ts — Track A step A8, ledger `2026-09-30-a8-travel-time-service` (R228).
 *
 * L1–L2 pin the ONE speeds table and its mode vocabulary. L3–L6 pin the ONE leg rule: Routes only for
 * an exact leg, the matrix only for walk|transit and only when it answers, the straight line at the
 * MODE's speed otherwise, "est." exactly on the straight line. L7–L8 pin the §7 agreement check
 * (25%, the disagreeing day NAMED). L9 is the agreement on a fixture plan through the real plan-fit
 * and the real leg rule. L10 is a source-level pin that the retired speeds are gone.
 *
 * STATED NEGATIVE SPACE (§18d): nothing here calls Google or a database; the Routes and matrix
 * sources are injected. L9 runs on the straight-line tier only (the same tier the kyoto-slice e2e
 * fixture reads, since CI has no Routes key); it proves the two per-day numbers agree for a plan
 * shaped like the fixture, not for every plan. L10 reads source text, so a speed constant spelled
 * another way is invisible to it.
 *
 * Run: npx tsx --test shared/__tests__/leg-resolution.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { haversineMeters, WALK_METERS_PER_MIN } from "../geo";
import { defaultLegMode, LEG_MODE_STORED, metersPerMinute, normalizeLegMode, straightLineMinutes } from "../travel-speeds";
import { perDayAgreement, resolveLeg, unifiedPlanTravel, type LegSources } from "../leg-resolution";
import { planFitFor } from "../plan-fit";
import type { TravelTime } from "../travel-time";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const A = { lat: 35.08, lng: 135.76 };
const B = { lat: 35.0935, lng: 135.76 }; // ~1.5 km north of A

test("L1: one speeds table — walk is 80 m/min and geo derives from it", () => {
  assert.equal(metersPerMinute("walk"), 80);
  assert.equal(WALK_METERS_PER_MIN, 80);
  assert.equal(straightLineMinutes(800, "walk"), 10);
  assert.equal(straightLineMinutes(10, "walk"), 1, "never below 1");
  assert.ok(metersPerMinute("transit") > metersPerMinute("cycle"));
  assert.ok(metersPerMinute("drive") > metersPerMinute("transit"));
});

test("L2: legacy spellings map onto the four modes; unknown is null, never guessed", () => {
  assert.equal(normalizeLegMode("walking"), "walk");
  assert.equal(normalizeLegMode("driving"), "drive");
  assert.equal(normalizeLegMode("subway"), "transit");
  assert.equal(normalizeLegMode("cycling"), "cycle");
  assert.equal(normalizeLegMode("hovercraft"), null);
  assert.equal(normalizeLegMode(""), null);
  assert.equal(LEG_MODE_STORED.drive, "driving");
  assert.equal(defaultLegMode(1200, 1200), "walk");
  assert.equal(defaultLegMode(1201, 1200), "transit");
});

const matrixSaying = (minutes: number | null): LegSources["matrix"] => (from, to, mode): TravelTime =>
  minutes === null
    ? { basis: "est", minutes: 99, mode, reason: "pair_not_in_matrix", straightLineMeters: 1 }
    : { basis: "matrix", minutes, mode, originSlug: "a", destSlug: "b" };

test("L3: an exact leg takes Routes first, in the chosen mode", async () => {
  const asked: string[] = [];
  const leg = await resolveLeg(
    { from: A, to: B, mode: "drive", exact: true },
    { routes: async (_f, _t, m) => (asked.push(m), { minutes: 6.4, distanceMeters: 1720.4 }), matrix: matrixSaying(20) },
  );
  assert.deepEqual(asked, ["drive"]);
  assert.deepEqual(leg, { mode: "drive", minutes: 6, distanceMeters: 1720, basis: "routes", label: null });
});

test("L4: no Routes answer falls to the matrix, then to the labelled straight line", async () => {
  const viaMatrix = await resolveLeg({ from: A, to: B, mode: "transit", exact: true }, { routes: async () => null, matrix: matrixSaying(20) });
  assert.equal(viaMatrix.basis, "matrix");
  assert.equal(viaMatrix.minutes, 20);
  assert.equal(viaMatrix.label, null);

  const est = await resolveLeg({ from: A, to: B, mode: "transit", exact: true }, { routes: async () => null, matrix: matrixSaying(null) });
  assert.equal(est.basis, "est");
  assert.equal(est.label, "est.");
  assert.equal(est.minutes, straightLineMinutes(est.distanceMeters, "transit"), "the MODE's speed, not walking's");
});

test("L5: a plan-level answer never calls Routes", async () => {
  let called = false;
  const leg = await resolveLeg({ from: A, to: B, mode: "walk", exact: false }, { routes: async () => ((called = true), { minutes: 1, distanceMeters: 1 }), matrix: null });
  assert.equal(called, false);
  assert.equal(leg.basis, "est");
});

test("L6: the matrix is never asked for drive or cycle", async () => {
  let asked = false;
  const matrix: LegSources["matrix"] = (f, t, m) => ((asked = true), matrixSaying(5)!(f, t, m));
  const leg = await resolveLeg({ from: A, to: B, mode: "cycle", exact: false }, { matrix });
  assert.equal(asked, false);
  assert.equal(leg.basis, "est");
  assert.equal(leg.minutes, straightLineMinutes(leg.distanceMeters, "cycle"));
});

test("L6b: plan-fit's travel under the one rule keeps a matrix answer and estimates at the mode's speed", () => {
  const withMatrix = unifiedPlanTravel(matrixSaying(17));
  assert.equal(withMatrix(A, B, "transit").minutes, 17);
  const none = unifiedPlanTravel(matrixSaying(null));
  const t = none(A, B, "transit");
  assert.equal(t.basis, "est");
  assert.equal(t.minutes, straightLineMinutes((t as any).straightLineMeters, "transit"));
  assert.ok(t.minutes < none(A, B, "walk").minutes, "transit is faster than walking on the straight line");
});

test("L7: per-day agreement within 25%", () => {
  const r = perDayAgreement({ 1: 7, 2: 20 }, { 1: 8, 2: 24 });
  assert.equal(r.agrees, true);
  assert.deepEqual(r.disagreeing, []);
});

test("L8: a disagreeing day is NAMED; unmatched days and an empty comparison are never agreement", () => {
  const r = perDayAgreement({ 1: 7, 2: 40 }, { 1: 8, 2: 24, 3: 10 });
  assert.equal(r.agrees, false);
  assert.deepEqual(r.disagreeing, [2]);
  assert.deepEqual(r.unmatched, [3]);
  assert.equal(perDayAgreement({}, {}).agrees, false);
  assert.equal(perDayAgreement({ 1: 5 }, { 2: 5 }).agrees, false);
});

test("L9: the fixture plan — Finalize legs and plan-fit agree per day within 25%", async () => {
  // The kyoto-slice §7 A8 fixture: a stay north of every seeded Kyoto neighbourhood, two stops per
  // day ~1.5 km either side of it. Plan-fit measures stay → each stop; the legs measure stop → stop.
  const stay = { lat: 35.08, lng: 135.76 };
  const days: Record<number, Array<{ lat: number; lng: number }>> = {
    1: [{ lat: 35.0935, lng: 135.76 }, { lat: 35.0665, lng: 135.76 }],
    2: [{ lat: 35.08, lng: 135.7765 }, { lat: 35.08, lng: 135.7435 }],
  };
  const travel = unifiedPlanTravel(null);
  const items = Object.entries(days).flatMap(([d, pts]) => pts.map((p) => ({ dayNumber: Number(d), ...p })));
  const fit = planFitFor({ option: stay, items, travel, centroids: [], walkThresholdMeters: 15 * 80 });
  assert.equal(fit.scored, true);
  const legs: Record<number, number> = {};
  for (const [d, pts] of Object.entries(days)) {
    for (let i = 0; i < pts.length - 1; i++) {
      const meters = haversineMeters(pts[i].lat, pts[i].lng, pts[i + 1].lat, pts[i + 1].lng);
      const leg = await resolveLeg({ from: pts[i], to: pts[i + 1], mode: defaultLegMode(meters, 15 * 80), exact: true }, {});
      legs[Number(d)] = (legs[Number(d)] ?? 0) + leg.minutes;
    }
  }
  const r = perDayAgreement(legs, (fit as any).minutesByDay);
  assert.equal(r.agrees, true, `disagreeing day(s): ${r.disagreeing.join(", ")} — ${JSON.stringify(r.days)}`);
});

test("L10: the retired speeds are gone from their three homes", () => {
  assert.doesNotMatch(read("server/services/transport-booking-options.service.ts"), /distanceMeters\s*\/\s*75\b/);
  assert.doesNotMatch(read("server/services/itinerary-intelligence.service.ts"), /walking:\s*5,/);
  assert.doesNotMatch(read("shared/geo.ts"), /WALK_METERS_PER_MIN\s*=\s*80\b/);
  assert.doesNotMatch(read("server/services/anchor-scoring.ts"), /15\s*\*\s*80\b/);
});
