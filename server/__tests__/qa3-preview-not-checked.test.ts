/**
 * QA round 3 PR 5 (Leon, Nov 12, 2026): "preview GET: loader failures → named notChecked, 200, error still logged
 * with stack." The trip-addressed preview's assembly (`buildTripPreviewResponse`) with each loader made to throw.
 *
 *   N1 every loader answers: the response is the computed preview, `notChecked` carries only the findings' own entries
 *   N2 findings throw: no `findings` / `hasPricedItems` key (never an empty "nothing found"), `notChecked` names the part,
 *      the error is logged as the Error itself (its stack), and the score still answers
 *   N3 leg coverage throws: no `coverage` / `routedPlan` key (read as incomplete — never an all-clear), named
 *   N4 the plan's items throw: computable false with the code `plan_items_not_loaded`; findings and coverage still answer
 *   N5 open comparisons throw: the field is left out, named; the rest is unchanged
 *   N6 every loader throws: still an answer, every part named, nothing invented
 *
 * Run: npx tsx --test server/__tests__/qa3-preview-not-checked.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTripPreviewResponse, type TripPreviewLoaders } from "../services/optimization-preview-trip.service";

const TRIP = "trip-qa3-n";
const item = (n: number) => ({ serviceType: "sightseeing", dayNumber: 1, price: undefined, duration: undefined, id: `i${n}` });
const INPUTS = { baselineItems: [item(1), item(2), item(3)], fixedCommitments: [] } as any;
const FINDINGS = { findings: [{ kind: "leg_unreachable", count: 1 }] as any, hasPricedItems: false, notChecked: [{ kind: "city_crossing", reason: "no_open_coordinates", days: [2] }] as any };
const LEGS = { coverage: { complete: true, unlocated: [] }, routedPlan: true } as any;

function loaders(over: Partial<TripPreviewLoaders> = {}): { l: TripPreviewLoaders; logged: Array<{ message: string; err: unknown }> } {
  const logged: Array<{ message: string; err: unknown }> = [];
  const l: TripPreviewLoaders = {
    inputs: async () => INPUTS,
    eventType: async () => undefined,
    findings: async () => FINDINGS,
    legCoverage: async () => LEGS,
    openComparisons: async () => 1,
    log: (message, err) => logged.push({ message, err }),
    ...over,
  };
  return { l, logged };
}
const boom = (what: string) => async () => {
  throw new Error(`${what} exploded`);
};

test("N1 every loader answers: the computed preview, notChecked = the findings' own entries", async () => {
  const { l, logged } = loaders();
  const out = await buildTripPreviewResponse(TRIP, l);
  assert.equal(out.computable, true);
  assert.equal(out.itemCount, 3);
  assert.deepEqual(out.findings, FINDINGS.findings);
  assert.deepEqual(out.notChecked, FINDINGS.notChecked);
  assert.deepEqual(out.coverage, LEGS.coverage);
  assert.equal(out.openComparisons, 1);
  assert.equal(logged.length, 0);
});

test("N2 findings throw: the part is named and left out; logged with the Error (stack); the score still answers", async () => {
  const { l, logged } = loaders({ findings: boom("findings") as any });
  const out = await buildTripPreviewResponse(TRIP, l);
  assert.equal(out.computable, true, "the score is independent of the findings");
  assert.ok(!("findings" in out), "no findings key — never an empty 'nothing found'");
  assert.ok(!("hasPricedItems" in out));
  assert.deepEqual(out.notChecked, [{ part: "findings", reason: "load_failed" }]);
  assert.deepEqual(out.coverage, LEGS.coverage);
  assert.equal(logged.length, 1);
  assert.match(logged[0].message, /findings failed for trip trip-qa3-n/);
  assert.ok(logged[0].err instanceof Error && typeof (logged[0].err as Error).stack === "string", "logged with its stack");
});

test("N3 leg coverage throws: no coverage / routedPlan key (incomplete, never an all-clear), named", async () => {
  const { l } = loaders({ legCoverage: boom("legs") as any });
  const out = await buildTripPreviewResponse(TRIP, l);
  assert.ok(!("coverage" in out) && !("routedPlan" in out));
  assert.deepEqual(out.findings, FINDINGS.findings);
  assert.deepEqual(out.notChecked, [...FINDINGS.notChecked, { part: "leg_coverage", reason: "load_failed" }]);
});

test("N4 the plan's items throw: computable false with the code; findings and coverage still answer", async () => {
  const { l } = loaders({ inputs: boom("inputs") as any });
  const out = await buildTripPreviewResponse(TRIP, l);
  assert.equal(out.computable, false);
  assert.equal(out.reason, "plan_items_not_loaded");
  assert.ok(!("itemCount" in out) && !("fixedCount" in out) && !("openComparisons" in out), "no score is claimed");
  assert.deepEqual(out.findings, FINDINGS.findings);
  assert.deepEqual(out.coverage, LEGS.coverage);
  assert.deepEqual(out.notChecked, [...FINDINGS.notChecked, { part: "plan_items", reason: "load_failed" }]);
});

test("N5 open comparisons throw: the field is left out and named; the rest unchanged", async () => {
  const { l } = loaders({ openComparisons: boom("sets") as any });
  const out = await buildTripPreviewResponse(TRIP, l);
  assert.equal(out.computable, true);
  assert.ok(!("openComparisons" in out));
  assert.deepEqual(out.notChecked, [...FINDINGS.notChecked, { part: "open_comparisons", reason: "load_failed" }]);
  // With the per-option versions off the field is simply not emitted, and nothing is named.
  const off = await buildTripPreviewResponse(TRIP, loaders({ openComparisons: null }).l);
  assert.ok(!("openComparisons" in off));
  assert.deepEqual(off.notChecked, FINDINGS.notChecked);
});

test("N6 every loader throws: still an answer, every part named, nothing invented", async () => {
  const { l, logged } = loaders({ inputs: boom("a") as any, findings: boom("b") as any, legCoverage: boom("c") as any, openComparisons: boom("d") });
  const out = await buildTripPreviewResponse(TRIP, l);
  assert.deepEqual(out, {
    computable: false,
    reason: "plan_items_not_loaded",
    notChecked: [
      { part: "plan_items", reason: "load_failed" },
      { part: "findings", reason: "load_failed" },
      { part: "leg_coverage", reason: "load_failed" },
    ],
  });
  assert.equal(logged.length, 3, "open comparisons are not asked without the plan's items");
});
