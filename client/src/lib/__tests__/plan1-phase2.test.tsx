/**
 * PLAN-1 Phase 2 (ledger `2026-11-06-plan1-phase2-view-toggle`; ruling 4): the Days / Map toggle on /plans/{id}, remembered
 * per traveler SERVER-SIDE (Calendar follows its Design artifact — ruling, Nov 6).
 *
 *   V1 the opening view: the URL's `?view=` → a map-created plan opens on Map → the remembered view → Days.
 *   V2 the toggle saves the traveler's choice through `PATCH /api/me/preferences` (`planView`); no localStorage.
 *   V3 the URL always states the shown planner (`days` too), so a reload keeps it on a plan that opens on Map.
 *   V4 the page reads the remembered view before the plan opens (no flash of the other planner).
 *
 * Run: node --import ./client/src/lib/__tests__/lc1-css-register.mjs --import tsx --test client/src/lib/__tests__/plan1-phase2.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import * as planViewModule from "@shared/plan-view";
import { PLAN_VIEWS, planViewFromUrl, resolvePlanView } from "@shared/plan-view";
import { rememberedPlanView } from "../plan-view-preference";

const ROOT = resolve(import.meta.dirname, "../../../..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

describe("PLAN-1 Phase 2 — the planner toggle", () => {
  it("V1 the opening view (ruling 4)", () => {
    assert.deepEqual([...PLAN_VIEWS], ["days", "map"], "Calendar waits for its Design artifact");
    assert.equal(planViewFromUrl("?view=map"), "map");
    assert.equal(planViewFromUrl("?view=days"), "days");
    assert.equal(planViewFromUrl("?view=list"), "days", "the legacy word");
    assert.equal(planViewFromUrl("?item=x"), null);
    // The expert door's card lives in the Days view: its link opens Days on any plan (a `local` finish lands there).
    assert.equal(planViewFromUrl("?help=expert"), "days");
    assert.equal(planViewFromUrl("?help=expert&view=map"), "map", "a named view still wins");
    // TEST EDIT (slip-first hotfix, ledger `2026-11-07-slip-first-landing`): no plan opens on Map by itself any more —
    // the URL (the traveler's toggle), else the remembered view, else Days.
    assert.equal(resolvePlanView({ url: "days", remembered: "map" }), "days", "URL first");
    assert.equal(resolvePlanView({ url: "map", remembered: "days" }), "map", "the traveler's toggle");
    assert.equal(resolvePlanView({ url: null, remembered: "map" }), "map", "the saved view, once set");
    assert.equal(resolvePlanView({ url: null, remembered: "days" }), "days");
    assert.equal(resolvePlanView({ url: null, remembered: undefined }), "days", "nothing saved ⇒ Days");
    assert.equal(resolvePlanView({ url: null, remembered: "calendar" }), "days", "an unknown view is not one");
    assert.equal("planOpensOn" in planViewModule, false, "the map-created default is gone");
    assert.equal(rememberedPlanView({ planView: "map", language: "en" }), "map");
    assert.equal(rememberedPlanView({}), null);
  });

  it("V2 the toggle saves server-side; nothing in localStorage", () => {
    const slip = read("client/src/components/plancard/SlipView.tsx");
    assert.match(slip, /onClick=\{\(\) => chooseView\("list"\)\}\s*aria-pressed=\{slipView === "list"\}/);
    assert.match(slip, /onClick=\{\(\) => chooseView\("map"\)\}\s*aria-pressed=\{slipView === "map"\}/);
    assert.match(slip, /const chooseView = \(v: "list" \| "map"\) => \{\s*setSlipView\(v\);\s*(?:\/\/[^\n]*\n\s*)?if \(!isGuest\) void savePlanView\(v === "map" \? "map" : "days"\);/);
    const pref = read("client/src/lib/plan-view-preference.ts");
    assert.match(pref, /apiRequest\("PATCH", ME_PREFERENCES_QUERY_KEY\[0\], \{ planView: view \}\)/);
    for (const f of ["client/src/lib/plan-view-preference.ts", "client/src/pages/slip-view.tsx", "shared/plan-view.ts"]) {
      const code = read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      assert.doesNotMatch(code, /localStorage|sessionStorage/, f);
    }
    const route = read("server/routes/storefront.routes.ts");
    assert.match(route, /planView: z\.enum\(PLAN_VIEWS\)\.optional\(\),/);
    assert.match(route, /\.\.\.\(patch\.planView !== undefined \? \{ planView: patch\.planView \} : \{\}\),/);
  });

  it("V3 the URL always states the shown planner", () => {
    const slip = read("client/src/components/plancard/SlipView.tsx");
    assert.match(slip, /params\.set\("view", slipView === "map" \? "map" : "days"\);/);
    assert.doesNotMatch(slip, /params\.delete\("view"\)/);
  });

  it("V4 the remembered view is read before the plan opens", () => {
    const page = read("client/src/pages/slip-view.tsx");
    assert.match(page, /const urlView = planViewFromUrl\(searchStr\);/);
    assert.doesNotMatch(page, /opensOn/, "slip-first: the plan's own opening view is not read");
    assert.match(page, /remembered: rememberedPlanView\(prefsQ\.data\),/);
    assert.match(page, /if \(isLoading \|\| !viewReady\) \{/);
  });
});
