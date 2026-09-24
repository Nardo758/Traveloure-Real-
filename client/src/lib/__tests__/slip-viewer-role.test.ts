/**
 * Slip viewer roles (Locked Decision 52 (C), ledger `2026-09-24-ea-plans-for-executive`).
 *   V1 the server's three named roles pass through; anything else is "other", never the owner.
 *   V2 only the owner and the delegate get item tools; an expert viewer keeps its Workstation.
 *   V3 the delegate note never implies the assistant pays.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SLIP_DELEGATE_NOTE, canEditPlanItems, slipViewer } from "../slip-viewer-role";

describe("slip viewer role", () => {
  it("V1: named roles pass through, the rest is other", () => {
    assert.equal(slipViewer("owner"), "owner");
    assert.equal(slipViewer("expert"), "expert");
    assert.equal(slipViewer("delegate"), "delegate");
    assert.equal(slipViewer("friend"), "other");
    assert.equal(slipViewer(null), "other");
    assert.equal(slipViewer("__proto__"), "other");
  });
  it("V2: item tools for owner and delegate only", () => {
    assert.equal(canEditPlanItems("owner"), true);
    assert.equal(canEditPlanItems("delegate"), true);
    assert.equal(canEditPlanItems("expert"), false);
    assert.equal(canEditPlanItems("other"), false);
  });
  it("V3: the note says who pays", () => {
    assert.match(SLIP_DELEGATE_NOTE, /they approve, book and pay/);
    assert.doesNotMatch(SLIP_DELEGATE_NOTE, /expert/i);
  });
});
