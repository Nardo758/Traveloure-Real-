/**
 * The offering-type clamp signal — ledger `2026-09-04-earn-planner-roles`,
 * CLAUDE.md Locked Decision 36.
 *
 * `local_expert_forms.offering_type_key` FKs into `expert_offering_types` (migration 107) and the
 * storage writer clamps an unknown key to NULL rather than failing the application. That NULL
 * fallback is correct — an applicant must never lose a signup to a stale link — but for its whole
 * life it was SILENT, so "picked something we refused" and "picked nothing" rendered identically
 * everywhere downstream. §13 says those are different facts.
 *
 * `offeringKeyUnrecorded` is the derivation the route uses to tell them apart, and it is a pure
 * comparison of what was sent against what the server actually stored — it consults no catalog and
 * restates no rule, because a second copy of the clamp rule is the derivation-drift class §18
 * rule 1 names.
 *
 * Pure unit — no DB, no server, no network.
 * Run: npx tsx --test server/__tests__/offering-type-clamp.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import { offeringKeyUnrecorded } from "../services/offering-type-clamp";

describe("offeringKeyUnrecorded", () => {
  it("C1 reports the refused key when one was asked for and none was stored", () => {
    // The exact bug this lane fixes: an /earn link carrying a PROVIDER-catalog key into the
    // expert application. The row is created, the column is NULL, and the applicant is told.
    assert.equal(offeringKeyUnrecorded("wedding_coordinator", null), "wedding_coordinator");
  });

  it("C2 reports nothing when the key was stored as asked", () => {
    assert.equal(offeringKeyUnrecorded("wedding_planner", "wedding_planner"), null);
  });

  it("C3 reports nothing when no offering was asked for — an absent answer is not a refusal", () => {
    for (const requested of [null, undefined, ""]) {
      assert.equal(offeringKeyUnrecorded(requested, null), null);
      assert.equal(offeringKeyUnrecorded(requested, "wedding_planner"), null);
    }
  });

  it("C4 never reports a clamp when the row came back carrying SOME key", () => {
    // A stored key that differs from the requested one is not a clamp, and calling it one would
    // be inventing a refusal that did not happen. Silence is the honest answer.
    assert.equal(offeringKeyUnrecorded("proposal_planner", "wedding_planner"), null);
  });

  it("C5 treats an empty stored string as unrecorded — an empty column is not a recorded choice", () => {
    assert.equal(offeringKeyUnrecorded("wedding_planner", ""), "wedding_planner");
  });

  it("C6 is pure: the same inputs always answer the same, and nothing is mutated", () => {
    const requested = "date_night_designer";
    const first = offeringKeyUnrecorded(requested, null);
    const second = offeringKeyUnrecorded(requested, null);
    assert.equal(first, second);
    assert.equal(requested, "date_night_designer");
  });
});
