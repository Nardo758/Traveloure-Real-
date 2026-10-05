/**
 * L2-5 — the readiness checklist's client rules (ledger `2026-10-05-readiness-checklist-ui`).
 *   C1 a line jumps to the most specific thing it names: leg > stop > day; an anchor line does not jump
 *   C2 submit is disabled only on a KNOWN blocking line — loading or a failed read never blocks it
 *   C3 one readiness key, matched by the invalidator for any listing and nothing else
 *
 * Pure — no DOM, no network. Run: npx tsx --test client/src/lib/__tests__/readiness-checklist.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isReadinessQueryKey,
  readinessJumpTarget,
  readinessQueryKey,
  submitBlockedByReadiness,
} from "../readiness-checklist";

describe("C1 jump targets", () => {
  it("a confirmed-leg line jumps to the leg, with its stops", () => {
    assert.deepEqual(
      readinessJumpTarget({ requirement: "legs", message: "m", dayNumber: 2, legId: "L1", fromItemId: "a", toItemId: "b" }),
      { kind: "leg", legId: "L1", fromItemId: "a", toItemId: "b" },
    );
  });
  it("a missing leg (no id yet) jumps to the gap between its two stops", () => {
    assert.deepEqual(
      readinessJumpTarget({ requirement: "legs", message: "m", dayNumber: 2, fromItemId: "a", toItemId: "b" }),
      { kind: "leg", legId: null, fromItemId: "a", toItemId: "b" },
    );
  });
  it("a stop line jumps to the stop; a day line to the day", () => {
    assert.deepEqual(readinessJumpTarget({ requirement: "hours", message: "m", dayNumber: 1, itemId: "i" }), { kind: "item", itemId: "i" });
    assert.deepEqual(readinessJumpTarget({ requirement: "x", message: "m", dayNumber: 3 }), { kind: "day", dayNumber: 3 });
  });
  it("an anchor line, a whole-listing line or an unknown line does not jump", () => {
    assert.equal(readinessJumpTarget({ requirement: "anchor_window", message: "m", anchorId: "an" }), null);
    assert.equal(readinessJumpTarget({ requirement: "price", message: "Set a price" }), null);
    assert.equal(readinessJumpTarget({ requirement: "something_new", message: "m" }), null);
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
