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

// E2 (ledger `2026-10-09-e2-plan-entry`; sanctioned retarget of R6–R10): a NEW plan is created by
// PlanEntry's Start a plan, through the provider's ONE start; the edit window creates nothing.
test("R6: PlanEntry's Start a plan mints through the ONE mint step, after releasing the pen", () => {
  const ctx = read("../../contexts/PlanningContext.tsx");
  const start = ctx.slice(ctx.indexOf("const startFromEntry = useCallback"), ctx.indexOf("// ── Step 8b-2 (D3)"));
  assert.ok(start.includes("await releasePendingEventsPen();"), "the pen is released first");
  assert.ok(start.indexOf("releasePendingEventsPen") < start.indexOf("mintTripSlip("), "…before the mint");
  assert.ok(start.includes("mintTripSlip("), "the ONE traveler-owned client mint door");
});

test("R7: ONE pen release and ONE mint body for a new plan", () => {
  const ctx = read("../../contexts/PlanningContext.tsx");
  assert.equal(ctx.split("releasePendingEventsPen()").length - 1, 1, "one pen release");
  assert.equal(ctx.split("mintTripSlip(").length - 1, 1, "one mint body");
  const modal = read("../../components/trip/plan-modal.tsx");
  assert.ok(!/mintPlan\(|mintTripSlip\(|releasePendingEventsPen\(/.test(modal), "the edit window mints nothing");
});

test("R8: a door that NAMES a plan is never minted a second one", () => {
  const ctx = read("../../contexts/PlanningContext.tsx");
  assert.ok(ctx.includes("if (next?.tripId && next.branch && !next.newPlan) {"), "a named plan + a way to build continues on it");
  assert.ok(ctx.includes("const bound = !!(getTripContext().tripId || next?.tripId);"), "a named plan opens the edit window");
});

test("R9: the minted plan lands with Draft it with AI started (`?draft=ai`)", () => {
  const ctx = read("../../contexts/PlanningContext.tsx");
  assert.ok(ctx.includes("setLocation(`/plans/${tripId}?view=map&${DRAFT_AI_QUERY}=${DRAFT_AI_VALUE}`);"));
  const hook = read("../../components/plan/useSlipFreeDraft.tsx");
  assert.ok(/asksToStartDraft\(window\.location\.search\)/.test(hook), "the hook reads the request once");
});

test("R10: §13 — Start a plan mints only in a city the traveler chose", () => {
  const entry = read("../../components/plan/PlanEntry.tsx");
  assert.ok(entry.includes("destination: planEntryDestination(m),"), "the destination is the chosen market");
  assert.ok(entry.includes("if (!canStartPlan(state) || starting || !state.market) return;"));
});
