/**
 * crowd-band.test.ts — TravelPulse PR 2 (ledger `2026-09-30-travelpulse-crowd-band`): the ONE crowd
 * band computation reads crowd metrics only, needs a fresh signal and a real baseline, cuts by the
 * configured bands, and never carries a raw value.
 * Run: npx tsx --test server/services/trend-engine/__tests__/crowd-band.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeCrowdBand, bandForDeviation, type CrowdSignal } from "../crowd-band";

const NOW = new Date("2026-09-30T12:00:00Z");
const DAY = 86_400_000;
const CUTOFFS = [
  { band: "low", lowerBoundVsBaseline: 0 },
  { band: "moderate", lowerBoundVsBaseline: 0.7 },
  { band: "high", lowerBoundVsBaseline: 1.3 },
  { band: "peak", lowerBoundVsBaseline: 2.0 },
];
const WEIGHTS = new Map([["besttime", 1], ["predicthq", 1], ["x", 1]]);
const OPTS = { now: NOW, baselineWindowDays: 90, maxSignalAgeDays: 7, minBaselinePoints: 7 };

/** `n` daily observations of `base`, the newest (today) replaced by `latest`. */
function series(source: string, metric: string, base: number, latest: number, n = 30, newestAgeDays = 0): CrowdSignal[] {
  const out: CrowdSignal[] = [];
  for (let i = n - 1; i >= 1; i--) out.push({ source, metric, value: base, observedAt: new Date(NOW.getTime() - (i + newestAgeDays) * DAY) });
  out.push({ source, metric, value: latest, observedAt: new Date(NOW.getTime() - newestAgeDays * DAY) });
  return out;
}

test("C1: interest signals alone set NO band — X mentions are attention, not crowds", () => {
  const r = computeCrowdBand(series("x", "x_mention_count", 100, 500), WEIGHTS, CUTOFFS, OPTS);
  assert.deepEqual(r, { band: null, confidence: null, why: null, missing: "no_crowd_signals" });
});

test("C2: a fresh BestTime surge well above its own usual is high/peak; at the usual it is moderate", () => {
  const surge = computeCrowdBand(series("besttime", "foot_traffic_forecast_mean", 40, 100), WEIGHTS, CUTOFFS, OPTS);
  // mean of 29×40 + 100 = 42, 100/42 ≈ 2.38 → peak
  assert.equal(surge.band, "peak");
  const usual = computeCrowdBand(series("besttime", "foot_traffic_forecast_mean", 40, 40), WEIGHTS, CUTOFFS, OPTS);
  assert.equal(usual.band, "moderate");
});

test("C3: a crowd signal older than the max age sets no band (PredictHQ stuck at Aug 29 stays silent)", () => {
  const r = computeCrowdBand(series("predicthq", "phq_attendance_forecast", 1000, 3000, 30, 32), WEIGHTS, CUTOFFS, OPTS);
  assert.equal(r.band, null);
  assert.equal(r.missing, "no_fresh_crowd_signals");
});

test("C4: too few observations for a usual, or a zero weight, sets no band", () => {
  const thin = computeCrowdBand(series("besttime", "foot_traffic_forecast_mean", 40, 100, 3), WEIGHTS, CUTOFFS, OPTS);
  assert.equal(thin.missing, "no_fresh_crowd_signals");
  const off = computeCrowdBand(series("besttime", "foot_traffic_forecast_mean", 40, 100), new Map([["besttime", 0]]), CUTOFFS, OPTS);
  assert.equal(off.band, null);
});

test("C5: incomplete cutoff config sets no band rather than guessing a scale", () => {
  const r = computeCrowdBand(series("besttime", "foot_traffic_forecast_mean", 40, 100), WEIGHTS, CUTOFFS.slice(0, 3), OPTS);
  assert.equal(r.missing, "cutoffs_incomplete");
  assert.equal(bandForDeviation(1.5, []), null);
});

test("C6: two crowd sources raise confidence; the why names sources and carries no number", () => {
  const one = computeCrowdBand(series("besttime", "foot_traffic_forecast_mean", 40, 60), WEIGHTS, CUTOFFS, OPTS);
  const two = computeCrowdBand(
    [...series("besttime", "foot_traffic_forecast_mean", 40, 60), ...series("predicthq", "phq_attendance_forecast", 1000, 1500)],
    WEIGHTS, CUTOFFS, OPTS,
  );
  assert.ok(two.confidence! > one.confidence!, `${two.confidence} > ${one.confidence}`);
  assert.equal(two.band, "high");
  assert.match(two.why!, /foot-traffic/);
  assert.match(two.why!, /attendance/);
  assert.doesNotMatch(two.why!, /\d/);
});

test("C7: deterministic — identical inputs give identical outputs", () => {
  const s = [...series("predicthq", "phq_attendance_forecast", 1000, 1500), ...series("besttime", "foot_traffic_live", 20, 22)];
  assert.deepEqual(computeCrowdBand(s, WEIGHTS, CUTOFFS, OPTS), computeCrowdBand([...s].reverse(), WEIGHTS, CUTOFFS, OPTS));
});
