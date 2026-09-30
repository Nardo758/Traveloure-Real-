/**
 * B1/B2 (production smoke test Sep 30, 2026 — ledger `2026-09-30-b1-new-plan-inherits-nothing`):
 * an ENTRY door opened while a minted plan is bound starts a NEW plan and inherits nothing; an EDIT
 * door keeps editing. The rule is `doorStartsNewPlan`; the DOM half is the Kyoto spec's §1 B1 test.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DOORS_THAT_START_A_NEW_PLAN, doorStartsNewPlan } from "../plan-steps";
import { PLAN_DOORS } from "@shared/slip-funnel-events";

describe("doorStartsNewPlan", () => {
  it("N1 the hero, opened with a minted plan bound, starts a new plan", () => {
    assert.equal(doorStartsNewPlan({ door: "hero" }, "trip-1"), true);
  });
  it("N2 with no plan bound nothing changes (the unminted pen and its Resume offer stand)", () => {
    for (const door of DOORS_THAT_START_A_NEW_PLAN) assert.equal(doorStartsNewPlan({ door }, null), false);
  });
  it("N3 the edit doors keep editing the bound plan", () => {
    assert.equal(doorStartsNewPlan({ door: "trip_strip_edit" }, "trip-1"), false);
    assert.equal(doorStartsNewPlan({ door: "experience_cta" }, "trip-1"), false);
  });
  it("N4 a door naming its plan is an edit, whatever the door", () => {
    assert.equal(doorStartsNewPlan({ door: "hero", tripId: "trip-1" }, "trip-1"), false);
  });
  it("N5 a source with no door assumes nothing; an explicit newPlan always stands", () => {
    assert.equal(doorStartsNewPlan({}, "trip-1"), false);
    assert.equal(doorStartsNewPlan(null, "trip-1"), false);
    assert.equal(doorStartsNewPlan({ newPlan: true }, null), true);
  });
  it("N6 every entry door is a real door, and every door is classified", () => {
    const edit = ["trip_strip_edit", "experience_cta"];
    for (const d of DOORS_THAT_START_A_NEW_PLAN) assert.ok((PLAN_DOORS as readonly string[]).includes(d), d);
    for (const d of PLAN_DOORS) {
      assert.ok(
        (DOORS_THAT_START_A_NEW_PLAN as readonly string[]).includes(d) || edit.includes(d),
        `door "${d}" is neither an entry door nor a named edit door — classify it`,
      );
    }
  });
});
