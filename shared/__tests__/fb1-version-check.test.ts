/**
 * FB-1 step 3 (ledger `2026-10-18-fb1-version-gate`), the pure gate.
 *   V1  a version that resolves the draft's issue passes; one that leaves it fails (unresolved)
 *   V2  an issue the draft did not have fails the version (added), matched by the PLACE the stop keeps
 *   V3  a stop issue is matched across a day move (same place, new day = same issue)
 *   V4  not checked never fails: pace on a version with no energy rows is not checkable, the version passes, and its
 *       coverage is reduced
 *   V5  the metric rows: one per finding kind, unresolved, added, coverage; the sequencing stage writes only its two
 *   V6  version A's descriptor and the fix lines name the stop by its tag and the minute as HH:MM
 *   V7  the traveler's lines for an issue and its fix; a held status is never shown
 *
 * Run: npx tsx --test shared/__tests__/fb1-version-check.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkPlan, type PlanCheckInput } from "../plan-check";
import {
  FIXED_VERSION_NAME,
  HELD_VARIANT_STATUS,
  NO_VERSION_PASSES_LEAD,
  compareVersionToDraft,
  fixLine,
  fixedVersionDescriptor,
  gateVersion,
  isShownVariantStatus,
  issueLine,
  versionCheckMetricRows,
} from "../version-check";

const HOURS = (desc: string) => [{ weekdayDescriptions: [desc], checkedAt: "2026-10-18T00:00:00.000Z", official: true, sourceUrl: "https://t.example.jp/", provenance: "t · checked 18 Oct 2026", sourceKind: "official_fact" as const }];

/** Monday 2027-11-08. Temple opens 9:00; the market closes 17:00. */
function draft(over: Partial<PlanCheckInput> = {}): PlanCheckInput {
  return {
    tripStartIso: "2027-11-08",
    transitCoverage: true,
    stops: [
      { id: "t", title: "Temple", dayNumber: 1, startTime: "08:00", endTime: null, durationMinutes: 60, point: null },
      { id: "m", title: "Market", dayNumber: 1, startTime: "12:00", endTime: null, durationMinutes: 60, point: null },
    ],
    hours: new Map([["t", HOURS("Monday: 9:00 AM – 5:00 PM")], ["m", HOURS("Monday: 9:00 AM – 5:00 PM")]]),
    lastAdmission: new Map(),
    lastServices: [],
    anchors: [],
    legs: [],
    energy: [],
    ...over,
  };
}

/** A version of the draft: stop ids are version ids; `src` maps them to the draft items they keep. */
function version(stops: Array<{ id: string; src: string | null; day: number; at: string }>, d: PlanCheckInput) {
  const sourceOf = new Map(stops.map((s) => [s.id, s.src] as const));
  const input: PlanCheckInput = {
    ...d,
    stops: stops.map((s) => ({ id: s.id, title: s.src === "t" ? "Temple" : s.src === "m" ? "Market" : "New stop", dayNumber: s.day, startTime: s.at, endTime: null, durationMinutes: 60, point: null })),
    hours: new Map(stops.filter((s) => s.src && d.hours.get(s.src)).map((s) => [s.id, d.hours.get(s.src!)!])),
    energy: [],
  };
  return { input, sourceOf };
}

const draftOf = (d: PlanCheckInput) => ({ input: d, result: checkPlan(d) });

test("V1 resolves ⇒ passes; leaves ⇒ unresolved", () => {
  const d = draftOf(draft());
  assert.equal(d.result.issues.length, 1);
  const fixed = version([{ id: "v1", src: "t", day: 1, at: "09:30" }, { id: "v2", src: "m", day: 1, at: "12:00" }], d.input);
  const ok = gateVersion(d, fixed.input, fixed.sourceOf).verdict;
  assert.equal(ok.passes, true);
  assert.deepEqual([ok.unresolved.length, ok.added.length], [0, 0]);
  const same = version([{ id: "v1", src: "t", day: 1, at: "08:00" }, { id: "v2", src: "m", day: 1, at: "12:00" }], d.input);
  const bad = gateVersion(d, same.input, same.sourceOf).verdict;
  assert.equal(bad.passes, false);
  assert.deepEqual(bad.unresolved.map((i) => [i.type, i.stop?.itemId]), [["closed_on_arrival", "v1"]]);
});

test("V2 a new issue fails the version", () => {
  const d = draftOf(draft());
  const v = version([{ id: "v1", src: "t", day: 1, at: "09:30" }, { id: "v2", src: "m", day: 1, at: "18:00" }], d.input);
  const r = gateVersion(d, v.input, v.sourceOf).verdict;
  assert.equal(r.passes, false);
  assert.deepEqual(r.added.map((i) => [i.type, i.why, i.stop?.itemId]), [["closed_on_arrival", "after_closing", "v2"]]);
});

test("V3 the same place on a new day is the same issue", () => {
  const d = draftOf(draft({ tripStartIso: "2027-11-08", hours: new Map([["t", HOURS("Monday: 9:00 AM – 5:00 PM").concat([])]]) }));
  // Day 2 is a Tuesday; give the temple Tuesday hours so the moved stop is still early.
  d.input.hours.set("t", [{ ...HOURS("Monday: 9:00 AM – 5:00 PM")[0], weekdayDescriptions: ["Monday: 9:00 AM – 5:00 PM", "Tuesday: 9:00 AM – 5:00 PM"] }]);
  const moved = version([{ id: "v1", src: "t", day: 2, at: "08:00" }], d.input);
  const r = gateVersion(d, moved.input, moved.sourceOf).verdict;
  assert.equal(r.passes, false);
  assert.equal(r.unresolved.length, 1, "unresolved, not added — the place is the same");
  assert.equal(r.added.length, 0);
});

test("V4 not checked never fails; coverage reduced says so", () => {
  const d = draftOf(draft({ energy: [{ dayNumber: 1, recoveryNeeded: true }] }));
  assert.ok(d.result.issues.some((i) => i.type === "pace_over"));
  const v = version([{ id: "v1", src: "t", day: 1, at: "09:30" }, { id: "v2", src: "m", day: 1, at: "12:00" }], d.input);
  const r = gateVersion(d, v.input, v.sourceOf).verdict;
  assert.equal(r.passes, true, "pace is not checkable on a version — never a failure");
  assert.deepEqual(r.notCheckable, ["pace_over"]);
  assert.equal(r.coverage.reduced, true);
  const plain = compareVersionToDraft(draftOf(draft()), { input: v.input, result: checkPlan(v.input) }, v.sourceOf);
  assert.equal(plain.coverage.reduced, false);
});

test("V5 metric rows", () => {
  const d = draftOf(draft());
  const v = version([{ id: "v1", src: "t", day: 1, at: "08:00" }, { id: "v2", src: "m", day: 1, at: "18:00" }], d.input);
  const { result, verdict } = gateVersion(d, v.input, v.sourceOf);
  const rows = versionCheckMetricRows(result, verdict);
  assert.deepEqual(rows.map((r) => [r.metricKey, r.value]), [
    ["check_closed_on_arrival", "2"],
    ["check_unresolved", "1"],
    ["check_added", "1"],
    ["check_coverage_reduced", "0"],
  ]);
  assert.equal(rows[0].description, "before_opening, after_closing");
  assert.deepEqual(versionCheckMetricRows(result, verdict, "sequencing").map((r) => r.metricKey), ["check_unresolved_after_sequencing", "check_added_after_sequencing"]);
});

test("V6 version A's descriptor names the stop by its tag and the minute", () => {
  const d = draftOf(draft());
  const a = fixedVersionDescriptor(d.result.issues, (id) => (id === "t" ? "S1" : null));
  assert.equal(a.name, FIXED_VERSION_NAME);
  assert.equal(a.name, "Your plan, fixed");
  assert.match(a.strategy, /Day 1: start \[S1\] Temple no earlier than 09:00 \(before_opening\)\./);
  assert.match(fixedVersionDescriptor([], () => null).strategy, /No problems were found/);
});

test("V7 the traveler's lines; a held version is never shown", () => {
  const [issue] = draftOf(draft()).result.issues;
  assert.equal(issueLine(issue), "Temple · Day 1 — starts before it opens");
  assert.equal(fixLine(issue), "Fix: start it at 9:00 AM or later.");
  assert.equal(NO_VERSION_PASSES_LEAD, "We couldn’t make a version of this plan that clears every problem. Here’s what’s still in the way:");
  assert.equal(isShownVariantStatus(HELD_VARIANT_STATUS), false);
  assert.equal(isShownVariantStatus("generated"), true);
  assert.equal(isShownVariantStatus(null), true);
});
