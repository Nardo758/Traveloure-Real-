/**
 * Step 9a ruling 2 (ledger `2026-10-07-step9a-routing-engine`): the ONE routed-legs predicate.
 *   R1 a free plan gets none
 *   R2 each qualifying fact alone is enough
 *   R3 a handoff qualifies only when accepted or delivered — never proposed / unmatched / withdrawn
 *   R4 no second copy: the predicate's name is defined in exactly one file
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { planGetsRoutedLegs, type PlanRoutingFacts } from "../plan-routed-legs";

const FREE: PlanRoutingFacts = { finishedOptimizeRun: false, activeTripPass: false, handoffStatus: null, readyMadeCopy: false };

test("R1: a free plan gets no routed legs", () => {
  assert.equal(planGetsRoutedLegs(FREE), false);
});

test("R2: a finished Optimize run, an active Trip Pass, or a Ready Made copy each qualifies alone", () => {
  assert.equal(planGetsRoutedLegs({ ...FREE, finishedOptimizeRun: true }), true);
  assert.equal(planGetsRoutedLegs({ ...FREE, activeTripPass: true }), true);
  assert.equal(planGetsRoutedLegs({ ...FREE, readyMadeCopy: true }), true);
});

test("R3: a handoff qualifies only once an expert holds it", () => {
  for (const s of ["accepted", "delivered"]) assert.equal(planGetsRoutedLegs({ ...FREE, handoffStatus: s }), true, s);
  for (const s of ["proposed", "unmatched", "authorizing", "withdrawn", "declined"]) {
    assert.equal(planGetsRoutedLegs({ ...FREE, handoffStatus: s }), false, s);
  }
});

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "__tests__") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) files(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

test("R4: the predicate is defined once — no second copy anywhere in the app", () => {
  const defs = [...files("server"), ...files("shared"), ...files("client/src")].filter((f) =>
    /(function|const)\s+planGetsRoutedLegs\b/.test(readFileSync(f, "utf8")),
  );
  assert.deepEqual(defs, [join("shared", "plan-routed-legs.ts")]);
});
