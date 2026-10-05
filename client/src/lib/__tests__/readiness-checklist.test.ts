/**
 * L2-5 — the readiness checklist's client rules (ledger `2026-10-05-readiness-checklist-ui`).
 *   C1 a line's jump targets are step 7a's shared helper's (leg > gap > stop > anchor > day); the first on
 *      the page wins, a collapsed day falls back to the day, a line naming nothing has none
 *   C2 submit is disabled only on a KNOWN blocking line — loading or a failed read never blocks it
 *   C3 one readiness key, matched by the invalidator for any listing and nothing else
 *
 * Pure — no DOM, no network. Run: npx tsx --test client/src/lib/__tests__/readiness-checklist.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readinessJumpTargets } from "@shared/plan-jump-targets";
import {
  firstPresentTarget,
  isReadinessQueryKey,
  readinessLineTargets,
  readinessQueryKey,
  submitBlockedByReadiness,
} from "../readiness-checklist";

describe("C1 jump targets come from the shared helper, first present wins", () => {
  it("a line's targets are exactly @shared/plan-jump-targets' order", () => {
    const line = { requirement: "legs", message: "m", dayNumber: 2, legId: "L1", fromItemId: "a", toItemId: "b" };
    assert.deepEqual(readinessLineTargets(line), readinessJumpTargets(line));
    assert.deepEqual(readinessLineTargets(line), ["plan-leg-L1", "plan-gap-2-a-b", "plan-day-2"]);
  });
  it("a whole-listing line names nothing and has no targets", () => {
    assert.deepEqual(readinessLineTargets({ requirement: "price", message: "Set a price" }), []);
  });
  it("the first id present on the page wins; a collapsed day falls back to the day", () => {
    const ids = ["plan-item-i", "plan-day-3"];
    assert.equal(firstPresentTarget(ids, (id) => id === "plan-item-i" || id === "plan-day-3"), "plan-item-i");
    assert.equal(firstPresentTarget(ids, (id) => id === "plan-day-3"), "plan-day-3");
    assert.equal(firstPresentTarget(ids, () => false), null);
  });
});

describe("C2 submit gating", () => {
  it("blocked only when the read answered with a blocking line", () => {
    assert.equal(submitBlockedByReadiness({ blocking: [{ requirement: "price", message: "Set a price" }], advisory: [] }), true);
    assert.equal(submitBlockedByReadiness({ blocking: [], advisory: [{ requirement: "hours", message: "m" }] }), false);
  });
  it("loading or a failed read is no answer and never disables submit", () => {
    assert.equal(submitBlockedByReadiness(undefined), false);
    assert.equal(submitBlockedByReadiness(null), false);
    assert.equal(submitBlockedByReadiness({} as any), false);
  });
});

describe("C3 query key", () => {
  it("one spelling, matched for any listing and nothing else", () => {
    assert.deepEqual(readinessQueryKey("rm1"), ["/api/expert/ready-made/rm1/readiness"]);
    assert.equal(isReadinessQueryKey(readinessQueryKey("rm-2")), true);
    assert.equal(isReadinessQueryKey(["/api/expert/ready-made/rm1/earnings-preview"]), false);
    assert.equal(isReadinessQueryKey(["/api/expert/ready-made/mine"]), false);
    assert.equal(isReadinessQueryKey([42]), false);
  });
});
