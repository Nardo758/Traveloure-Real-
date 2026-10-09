/**
 * A3b — plan-fit, pure (ledger `2026-09-29-a3b-option-sets-slip`; product map §M3, §M9 R213).
 *
 *   P1  the burden is the day-weighted mean of per-day sums, in whole minutes per day
 *   P2  any straight-line leg makes the figure "est."; all-matrix legs make it "matrix"
 *   P3  unlocated items are excluded AND counted; too few located ⇒ no figure; no pin ⇒ no figure
 *   P4  coverage = share of the plan's neighbourhoods within the walk threshold; none known ⇒ null
 *   P5  §M9 threshold on the mock's own numbers: A 52 → B 31 counts, C 38 does not; B chosen ⇒ none
 *   P6  a different basis, or lower coverage, never counts
 *   P7  the line: "est." printed, "of N located", and no minutes when unscored
 *   P8  (A4) coverage carries its two counts — "1 of 2 areas" — and 0/0 when no area is known
 *   P9  (A4) ranks: lower minutes first, then higher coverage; unscored never ranked; ties share
 *   P10 (A4) "Easiest days": one place ranked 1 alone among ≥ 2 scored on ONE basis, else nobody
 *   P11 (A4) the event basis key and the compare view's lead sentence
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  beatsChosen,
  compareIntroLine,
  easiestIndex,
  fitBasisKey,
  fitRanks,
  planFitFor,
  planFitLine,
  toPoint,
  type FitItem,
  type PlanFit,
} from "../plan-fit";
import type { Centroid, LatLng, TravelMode, TravelTime } from "../travel-time";

const WALK = 1200;
const est = (minutes: number): TravelTime => ({ basis: "est", minutes, mode: "walk", reason: "pair_not_in_matrix", straightLineMeters: minutes * 80 });
const mat = (minutes: number): TravelTime => ({ basis: "matrix", minutes, mode: "transit", originSlug: "a", destSlug: "b" });

/** A reader answering by the destination's latitude, so each item's minutes are chosen by the test. */
function reader(table: Record<string, TravelTime>) {
  return (_from: LatLng, to: LatLng, _mode: TravelMode) => table[to.lat.toFixed(4)];
}

const O = { lat: 35.0, lng: 135.7 };
const items: FitItem[] = [
  { dayNumber: 1, lat: 35.001, lng: 135.7 },
  { dayNumber: 1, lat: 35.002, lng: 135.7 },
  { dayNumber: 2, lat: 35.003, lng: 135.7 },
  { dayNumber: 2, lat: null, lng: null },
];

test("P1: day-weighted mean of the per-day sums", () => {
  // day 1: 10 + 20 = 30 (2 located); day 2: 40 (1 located) ⇒ (30·2 + 40·1) / 3 = 33.3 ⇒ 33
  const fit = planFitFor({
    option: O,
    items,
    travel: reader({ "35.0010": est(10), "35.0020": est(20), "35.0030": est(40) }),
    centroids: [],
    walkThresholdMeters: WALK,
  });
  assert.equal(fit.scored, true);
  assert.equal((fit as any).minutesPerDay, 33);
});

test("P2: one straight-line leg makes the whole figure est.; all matrix is matrix", () => {
  const mixed = planFitFor({ option: O, items, travel: reader({ "35.0010": mat(10), "35.0020": est(20), "35.0030": mat(40) }), centroids: [], walkThresholdMeters: WALK });
  assert.equal((mixed as any).basis, "est");
  const all = planFitFor({ option: O, items, travel: reader({ "35.0010": mat(10), "35.0020": mat(20), "35.0030": mat(40) }), centroids: [], walkThresholdMeters: WALK });
  assert.equal((all as any).basis, "matrix");
});

test("P3: unlocated excluded and counted; too few located or no pin ⇒ no figure", () => {
  const fit = planFitFor({ option: O, items, travel: reader({ "35.0010": est(1), "35.0020": est(1), "35.0030": est(1) }), centroids: [], walkThresholdMeters: WALK });
  assert.equal(fit.located, 3);
  assert.equal(fit.total, 4);
  const few = planFitFor({ option: O, items: items.slice(0, 2), travel: reader({}), centroids: [], walkThresholdMeters: WALK });
  assert.deepEqual(few, { scored: false, reason: "too_few_located", located: 2, total: 2 });
  const nopin = planFitFor({ option: null, items, travel: reader({}), centroids: [], walkThresholdMeters: WALK });
  assert.equal(nopin.scored, false);
  assert.equal((nopin as any).reason, "option_unlocated");
  assert.equal(toPoint("35.1", null), null, "a half coordinate is never a point");
  assert.deepEqual(toPoint("35.1", "135.2"), { lat: 35.1, lng: 135.2 });
});

test("P4: coverage is the share of the plan's neighbourhoods within the walk threshold", () => {
  const near: Centroid = { slug: "near", lat: 35.002, lng: 135.7, radiusKm: 0.5 };
  const far: Centroid = { slug: "far", lat: 35.1, lng: 135.9, radiusKm: 0.5 };
  const spread: FitItem[] = [
    { dayNumber: 1, lat: 35.001, lng: 135.7 },
    { dayNumber: 1, lat: 35.002, lng: 135.7 },
    { dayNumber: 2, lat: 35.1, lng: 135.9 },
  ];
  const t = () => est(5);
  const fit = planFitFor({ option: O, items: spread, travel: t, centroids: [near, far], walkThresholdMeters: WALK });
  assert.equal((fit as any).coverage, 0.5);
  const none = planFitFor({ option: O, items: spread, travel: t, centroids: [], walkThresholdMeters: WALK });
  assert.equal((none as any).coverage, null);
});

test("P8: coverage carries its two counts, and 0/0 when no area is known", () => {
  const near: Centroid = { slug: "near", lat: 35.002, lng: 135.7, radiusKm: 0.5 };
  const far: Centroid = { slug: "far", lat: 35.1, lng: 135.9, radiusKm: 0.5 };
  const spread: FitItem[] = [
    { dayNumber: 1, lat: 35.001, lng: 135.7 },
    { dayNumber: 1, lat: 35.002, lng: 135.7 },
    { dayNumber: 2, lat: 35.1, lng: 135.9 },
  ];
  const fit = planFitFor({ option: O, items: spread, travel: () => est(5), centroids: [near, far], walkThresholdMeters: WALK }) as any;
  assert.equal(fit.areasNear, 1);
  assert.equal(fit.areasTotal, 2);
  const none = planFitFor({ option: O, items: spread, travel: () => est(5), centroids: [], walkThresholdMeters: WALK }) as any;
  assert.deepEqual([none.areasNear, none.areasTotal, none.coverage], [0, 0, null]);
});

const scored = (minutesPerDay: number, basis: "matrix" | "est" = "est", coverage: number | null = 0.5): PlanFit => ({
  scored: true,
  minutesPerDay,
  minutesByDay: {},
  basis,
  coverage,
  areasNear: 0,
  areasTotal: 0,
  located: 6,
  total: 9,
});
const TH = { minMinutesPerDay: 15, minFraction: 0.2 };

test("P5: the mock's numbers — A 52 chosen: B 31 counts, C 38 does not; B chosen: nothing", () => {
  const A = scored(52);
  const B = scored(31);
  const C = scored(38);
  assert.equal(beatsChosen(B, A, TH), true, "−21 min, −40%");
  assert.equal(beatsChosen(C, A, TH), false, "−14 min is under 15");
  assert.equal(beatsChosen(A, B, TH), false);
  assert.equal(beatsChosen(C, B, TH), false);
  // 20% dominates on a long day: 100 → 84 is −16 min but only −16%
  assert.equal(beatsChosen(scored(84), scored(100), TH), false);
});

test("P6: a different basis or lower coverage never counts; unscored never counts", () => {
  assert.equal(beatsChosen(scored(10, "matrix"), scored(60, "est"), TH), false);
  assert.equal(beatsChosen(scored(10, "est", 0.2), scored(60, "est", 0.5), TH), false);
  assert.equal(beatsChosen({ scored: false, reason: "option_unlocated", located: 3, total: 3 }, scored(60), TH), false);
});

test("P7: the line says est., names the located count, and never prints minutes unscored", () => {
  assert.equal(planFitLine(scored(14)), "est. 14 min/day getting around · based on 6 of 9 located stops");
  assert.equal(planFitLine(scored(14, "matrix")), "14 min/day getting around · based on 6 of 9 located stops");
  const unscored = planFitLine({ scored: false, reason: "too_few_located", located: 1, total: 4 });
  assert.equal(unscored, "Add a few things to your days to see how each place fits");
  assert.doesNotMatch(unscored, /\d/);
});

const unscored: PlanFit = { scored: false, reason: "option_unlocated", located: 3, total: 4 };

test("P9: ranks — lower minutes first, then higher coverage; unscored never ranked; ties share", () => {
  assert.deepEqual(fitRanks([scored(52), scored(31), scored(38)]), [3, 1, 2]);
  assert.deepEqual(fitRanks([scored(30, "est", 0.2), scored(30, "est", 0.8)]), [2, 1]);
  assert.deepEqual(fitRanks([scored(30), unscored, scored(40)]), [1, null, 2]);
  assert.deepEqual(fitRanks([scored(30), scored(30)]), [1, 1]);
});

test("P10: 'Easiest days' — one place ranked 1 alone, among ≥ 2 scored on one basis", () => {
  assert.equal(easiestIndex([scored(52), scored(31), scored(38)]), 1, "the mock's B");
  assert.equal(easiestIndex([scored(30), scored(30)]), null, "a tie crowns nobody");
  assert.equal(easiestIndex([scored(30), unscored]), null, "one scored place has nothing to beat");
  assert.equal(easiestIndex([scored(20, "matrix"), scored(40, "est")]), null, "never across bases");
  assert.equal(easiestIndex([unscored, unscored]), null);
});

test("P11: the event basis key and the compare view's lead sentence", () => {
  assert.equal(fitBasisKey(scored(10, "matrix")), "matrix");
  assert.equal(fitBasisKey(scored(10, "est")), "est_straight_line");
  assert.equal(fitBasisKey(unscored), null);
  // Copy pin (held-batch-1 item 17, board copy ruled Oct 9, 2026).
  assert.equal(
    compareIntroLine(9, 12),
    "Plan-fit scores each place against the 9 of your 12 stops that have a location, day by day. Pick one and the days get built around it.",
  );
  assert.equal(compareIntroLine(24, 24), "Plan-fit scores each place against your 24 stops, day by day. Pick one and the days get built around it.");
  assert.match(compareIntroLine(0, 0), /Add a few things/);
  assert.doesNotMatch(compareIntroLine(0, 0), /\d/);
});
