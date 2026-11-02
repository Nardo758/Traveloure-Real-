/**
 * Row PS-2 (ledger `2026-11-02-ps2-start-a-plan-always-new`; audit D14): every "Start a plan" CTA
 * opens PlanEntry as a new plan.
 *
 *   T1  each of the eleven call sites resolves to a source with newPlan:true (or names its plan by tripId)
 *   T2  PlanEntryCta's source: no tripId ⇒ newPlan:true (city/door kept); a tripId ⇒ unchanged
 *   T3  doorStartsNewPlan: newPlan wins over a bound plan; a bare city does not (why the fix is needed)
 *   T4  the hero and the nav are unchanged
 *
 * Harness: source read with fs and the pure helpers. No git, no network.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { planEntrySource } from "@/components/planning/plan-entry-cta";
import { doorStartsNewPlan } from "@/lib/plan-steps";

const read = (p: string) => fs.readFileSync(`client/src/${p}`, "utf8");

describe("PS-2 Start a plan always starts a new plan", () => {
  it("T1 the eleven call sites", () => {
    for (const f of ["pages/about.tsx", "pages/how-it-works.tsx", "pages/features.tsx", "pages/itinerary-view.tsx"]) {
      assert.match(read(f), /openPlanning\(\{ newPlan: true \}\)/, f);
      assert.doesNotMatch(read(f), /openPlanning\(\)/, f);
    }
    // The ticker keeps its pinned call text; its local openPlanning adds newPlan.
    assert.match(read("components/CityTickerTape.tsx"), /const openPlanning = \(source: PlanningSource\) => open\(\{ \.\.\.source, newPlan: true \}\);/);
    assert.match(read("components/dashboard/WishlistSection.tsx"), /planning\.open\(\{ city, newPlan: true \}\)/);
    // The five PlanEntryCta sites go through planEntrySource (T2).
    for (const f of ["pages/ready-made-detail.tsx", "pages/shared-saved-places.tsx", "pages/providers-directory.tsx", "pages/storefront.tsx", "pages/chat.tsx"]) {
      assert.match(read(f), /<PlanEntryCta\b/, f);
    }
    assert.match(read("components/planning/plan-entry-cta.tsx"), /onClick=\{\(\) => planning\.open\(planEntrySource\(source\)\)\}/);
  });

  it("T2 PlanEntryCta asks for a new plan unless it names one", () => {
    assert.deepEqual(planEntrySource(undefined), { newPlan: true });
    assert.deepEqual(planEntrySource({ city: "Kyoto" }), { city: "Kyoto", newPlan: true });
    assert.deepEqual(planEntrySource({ door: "marketplace", city: "Kyoto" }), { door: "marketplace", city: "Kyoto", newPlan: true });
    assert.deepEqual(planEntrySource({ returnTo: { kind: "expert", handle: "aiko" } } as any), { returnTo: { kind: "expert", handle: "aiko" }, newPlan: true });
    assert.deepEqual(planEntrySource({ tripId: "t1" }), { tripId: "t1" });
  });

  it("T3 doorStartsNewPlan", () => {
    assert.equal(doorStartsNewPlan({ newPlan: true }, "bound-id"), true);
    assert.equal(doorStartsNewPlan({ city: "Kyoto" } as any, "bound-id"), false);
  });

  it("T4 the hero and the nav are unchanged", () => {
    assert.match(read("pages/landing.tsx"), /onPlanTrip=\{\(\) => open\(\{ door: "hero" \}\)\}/);
    assert.match(read("components/layout.tsx"), /newPlan: true,/);
  });
});
