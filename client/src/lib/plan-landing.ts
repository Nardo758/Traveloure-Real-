/**
 * WHERE A FINISHED PLAN LANDS (step 8b-2, brief D4; ledger `2026-10-06-step8b2-map-layout`).
 *
 * SLIP-FIRST (round 5 hotfix, ledger `2026-11-07-slip-first-landing`): every finish lands on the plan's Trip Slip —
 * `/plans/:id`, no view in the URL — so the slip opens on Days unless the traveler has saved Map as their view. The
 * branch and door no longer move the landing (they stay in the signature for the callers). Branch `local` keeps its
 * own landing (the expert door) and never calls this. ONE rule (§18 rule 1). Pure.
 */
export type LandingBranch = "ai" | "myself" | "local" | "occasion";

/** The landing's query suffix alone — always `""`: no finish names a view (slip-first). */
export function planLandingQuery(_branch: LandingBranch | string, _door?: string | null): string {
  return "";
}

export function planLandingPath(tripId: string, branch: LandingBranch | string, door?: string | null): string {
  return `/plans/${tripId}${planLandingQuery(branch, door)}`;
}

/**
 * STEP 8d (ledger `2026-10-07-step8d-guest-map`; brief items 24–26, decision 1): where a SIGNED-OUT
 * finish lands. Only `myself` from the `experiences` door goes to the guest plan page; every other door and branch keeps
 * today's sign-in gate. `/plans/:tripId` stays protected; the guest plan is its own unprotected path. Slip-first (round 5
 * hotfix): the guest path names no view, so the guest's slip opens on Days with Map one tab away. Pure.
 */
export const GUEST_PLAN_PATH = "/plans/new";

export function opensGuestMap(branch: LandingBranch | string, door: string | null | undefined): boolean {
  return branch === "myself" && door === "experiences";
}

/**
 * E2 ruling 2 / Q1 (a): a plan started to be built WITH AI lands on its slip with "Draft it with AI"
 * started — `/plans/:id?draft=ai` (slip-first: no view in the URL). `useSlipFreeDraft` reads it ONCE; unconfirmed dates are
 * asked first, exactly as the button asks them (E1).
 */
export const DRAFT_AI_QUERY = "draft";
export const DRAFT_AI_VALUE = "ai";

/**
 * PLAN-1 ruling 2 (ledger `2026-11-06-plan1-one-planner`), slip-first (round 5 hotfix): where a sign-in that claimed a
 * guest plan lands — that plan's Trip Slip, no view in the URL (Days unless the traveler saved Map). Every sign-in path
 * (the app watcher). No plan claimed ⇒ null (the traveler stays where they are). Pure.
 */
export function claimLandingPath(claimedIds: readonly string[] | null | undefined): string | null {
  const id = (claimedIds ?? []).find((x) => typeof x === "string" && x.trim());
  return id ? `/plans/${encodeURIComponent(id)}` : null;
}
