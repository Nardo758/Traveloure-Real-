/**
 * SLIP-FIRST LANDING (round 5 smoke hotfix, ledger `2026-11-07-slip-first-landing`).
 *
 * The pin: hero → Kyoto lands on Days for the guest and the owner. Every create and every claim lands on the Trip
 * Slip's Days view; Map is one tab away; only the traveler's own saved view (or their own ?view=map) opens Map.
 * Production afaa10a landed hero → Kyoto → A trip → Continue on `/plans/new?view=map` (smoke comment on #1889).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { OPERATING_MARKETS } from "@shared/operating-markets";
import { planViewFromUrl, resolvePlanView } from "@shared/plan-view";
import { startForCity } from "../plans-new-start";
import { planEntryView, initialPlanEntry } from "../plan-entry";
import * as landing from "../plan-landing";

const ROOT = process.cwd();
const src = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
const kyoto = OPERATING_MARKETS.find((m) => m.marketKey === "kyoto")!;

test("SF1 hero → Kyoto: the start a city pick makes lands on Days", () => {
  assert.equal(startForCity(kyoto).view, "list");
  assert.equal(planEntryView(initialPlanEntry(null).state), "list");
  assert.equal(planEntryView(undefined, { experienceGroup: "trips", defaultDuration: "range" } as never), "list");
});

test("SF2 guest rail: the guest start goes to /plans/new with no view", () => {
  assert.equal(landing.GUEST_PLAN_PATH, "/plans/new");
  assert.equal("GUEST_MAP_PATH" in landing, false);
  const ctx = src("client/src/contexts/PlanningContext.tsx");
  assert.match(ctx, /setLocation\(GUEST_PLAN_PATH\)/);
  assert.doesNotMatch(ctx, /view=map/);
});

test("SF3 owner rail: every finish and the claim land on /plans/:id with no view", () => {
  assert.equal(landing.planLandingPath("t1", "myself", "experiences"), "/plans/t1");
  assert.equal(landing.planLandingPath("t1", "ai"), "/plans/t1");
  assert.equal(landing.planLandingQuery("ai"), "");
  assert.equal(landing.claimLandingPath(["t1"]), "/plans/t1");
  assert.doesNotMatch(src("client/src/pages/guest-plan-map.tsx"), /view=map/);
});

test("SF4 the slip opens on Days unless the traveler asked for Map", () => {
  assert.equal(resolvePlanView({ url: null, remembered: undefined }), "days");
  assert.equal(resolvePlanView({ url: planViewFromUrl(""), remembered: null }), "days");
  assert.equal(resolvePlanView({ url: null, remembered: "map" }), "map", "a saved preference overrides once set");
  assert.equal(resolvePlanView({ url: planViewFromUrl("?view=map"), remembered: "days" }), "map", "the toggle wins");
});

test("SF5 no mint stamps a map landing on the plan", () => {
  for (const f of ["server/routes.ts", "server/services/guest-plan.service.ts", "server/storage.ts", "server/services/trip-plan.service.ts"]) {
    assert.doesNotMatch(src(f), /opensOnMap|planOpensOn/, f);
  }
});
