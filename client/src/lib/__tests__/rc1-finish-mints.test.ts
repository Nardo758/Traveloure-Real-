/**
 * Audit RC-1 — "only one exit from the planning modal creates a Trip" (ledger
 * `2026-09-24-rc1-finish-mints`; `docs/audits/GAP_REGISTER.md` §A).
 *
 * The decision-maker ruled on 2026-09-24: (1) "Plan with AI" mints the plan FIRST and the free draft
 * then runs INTO it (LD 41 (b)'s empty slip; LD 45's "a door before the mint, a drawer after it");
 * (2) "Save" on a plan that does not exist yet creates it; (3) dismissal (Escape / ✕ / backdrop)
 * still creates nothing — out of this lane.
 *
 * R1–R5 are PURE (`saveMintsPlan` and the branch sets). R6–R10 are source pins over the three files
 * that carry the wiring, each asserting the invariant rather than a line count, on the H6
 * precedent in `local-finish-mints.test.ts`.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import {
  BRANCHES_THAT_MINT,
  BRANCHES_THAT_REQUIRE_THE_MINT,
  saveMintsPlan,
} from "../plan-steps";

const complete = {
  boundTripId: null,
  signedIn: true,
  destination: "Kyoto, Japan",
  startDate: "2026-11-03",
  endDate: "2026-11-08",
};

test("R1: the AI finish mints, and is not REQUIRED to — a guest still reaches the AI form", () => {
  assert.ok(BRANCHES_THAT_MINT.includes("ai"));
  // Required would stop the finish on a refused mint; the AI form has always opened for a guest,
  // and making it a sign-in wall is a change nobody ruled.
  assert.equal(BRANCHES_THAT_REQUIRE_THE_MINT.includes("ai"), false);
});

test("R2: Save on a new, complete plan for a signed-in member creates it", () => {
  assert.equal(saveMintsPlan(complete), true);
});

test("R3: Save on a plan that already exists stays the edit it always was", () => {
  assert.equal(saveMintsPlan({ ...complete, boundTripId: "trip-1" }), false);
});

test("R4: a guest's Save is never turned into a sign-in wall", () => {
  assert.equal(saveMintsPlan({ ...complete, signedIn: false }), false);
});

test("R5: D12 — an incomplete answer is never minted; no mint invents a destination or a date", () => {
  assert.equal(saveMintsPlan({ ...complete, destination: "  " }), false);
  assert.equal(saveMintsPlan({ ...complete, destination: null }), false);
  assert.equal(saveMintsPlan({ ...complete, startDate: "" }), false);
  assert.equal(saveMintsPlan({ ...complete, endDate: undefined }), false);
});

const read = (rel: string) =>
  readFileSync(new URL(rel, import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");

test("R6: the modal's Save decides through `saveMintsPlan` and mints through the ONE mint step", () => {
  const src = read("../../components/trip/plan-modal.tsx");
  const save = src.slice(src.indexOf("const save = async"), src.indexOf("const finish = async"));
  assert.ok(save.includes("saveMintsPlan("), "Save must ask the one predicate");
  assert.ok(save.includes("mintThisPlan()"), "Save must mint through the shared step");
  assert.ok(save.includes("commitPlan(bound)"), "the minted id must reach the commit");
});

test("R7: the finish and Save share ONE mint step — no second pen release or mint body", () => {
  const src = read("../../components/trip/plan-modal.tsx");
  assert.equal(src.split("releasePendingEventsPen()").length - 1, 1, "one pen release");
  assert.equal(src.split("mintPlan({").length - 1, 1, "one mint body");
});

test("R8: a door that NAMES a plan is never minted a second one", () => {
  const src = read("../../components/trip/plan-modal.tsx");
  const finish = src.slice(src.indexOf("const finish = async"));
  assert.ok(finish.includes("!source?.tripId"), "the finish's mint gate must honour source.tripId");
  assert.ok(src.includes("getTripContext().tripId || source?.tripId"), "Save must treat source.tripId as bound");
});

test("R9: the minted plan reaches the AI generation request", () => {
  const ctx = read("../../contexts/PlanningContext.tsx");
  assert.ok(ctx.includes("tripId={committed?.tripId}"), "the opener must hand the AI form the minted plan");
  const ai = read("../../components/EnhancedPlanningModal.tsx");
  assert.ok(/tripId:\s*tripId\s*\|\|\s*undefined/.test(ai), "the AI form must send it to /api/ai/generate-itinerary");
});

test("R10: §13 — Save never mints in an unconfirmed home-city SUGGESTION", () => {
  const src = read("../../components/trip/plan-modal.tsx");
  const save = src.slice(src.indexOf("const save = async"), src.indexOf("const finish = async"));
  assert.ok(
    /destination:\s*destinationSuggested\s*\?\s*""\s*:\s*destination/.test(save),
    "a suggested destination must read as unanswered to saveMintsPlan",
  );
});
