/**
 * Partner Demand Phase 4 · R32 — the approval keep-rule (pure, no DB). An approval is KEPT only while
 * the template version matches AND the market still clears the public floor for the SAME variant.
 *
 * Run: tsx --test server/__tests__/demand-onepager-approval.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { isApprovalKept } from "../services/demand-onepager.compute";
import type { DemandOnepagerApproval } from "@shared/schema";
import type { OnepagerModel } from "../services/demand-onepager.compute";

const TV = 3;

function approval(over: Partial<DemandOnepagerApproval> = {}): DemandOnepagerApproval {
  return {
    id: "a1",
    marketSlug: "kyoto",
    variant: "property-led",
    approvedBy: "admin1",
    approvedAt: new Date(0),
    templateVersion: TV,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...over,
  } as DemandOnepagerApproval;
}

// A minimal model — only `variant` is read by the keep-rule.
const model = (variant: OnepagerModel["variant"]): OnepagerModel => ({ variant } as OnepagerModel);

test("kept: template matches, market qualifies, same variant", () => {
  assert.equal(isApprovalKept(approval(), model("property-led"), TV), true);
});

test("not kept: no approval row", () => {
  assert.equal(isApprovalKept(null, model("property-led"), TV), false);
});

test("not kept: template version bumped (layout changed) ⇒ re-approval required", () => {
  assert.equal(isApprovalKept(approval({ templateVersion: 2 }), model("property-led"), TV), false);
});

test("not kept: market dropped below the public floor (no model)", () => {
  assert.equal(isApprovalKept(approval(), null, TV), false);
});

test("not kept: leading class flipped (approved property-led, now service-led)", () => {
  assert.equal(isApprovalKept(approval({ variant: "property-led" }), model("service-led"), TV), false);
});
