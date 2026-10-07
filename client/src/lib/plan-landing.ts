/**
 * WHERE A FINISHED PLAN LANDS (step 8b-2, brief D4; ledger `2026-10-06-step8b2-map-layout`).
 *
 * The landing is keyed on the finish's BRANCH (never its label) and the DOOR it was opened from:
 *   · branch `ai`, from ANY door                → the plan's map view (`/plans/:id?view=map`);
 *   · branch `myself` from the `experiences` door → the map view;
 *   · every other finish                          → the plan's list view (`/plans/:id`), as before.
 * Branch `local` keeps its own landing (the expert door) and never calls this. ONE rule, read by the
 * planning context's finish and by the AI form's post-draft landing (§18 rule 1). Pure.
 */
export type LandingBranch = "ai" | "myself" | "local" | "occasion";

export function opensOnMap(branch: LandingBranch | string, door: string | null | undefined): boolean {
  return branch === "ai" || (branch === "myself" && door === "experiences");
}

/** The landing's query suffix alone — `"?view=map"` or `""` — for a caller that builds the path. */
export function planLandingQuery(branch: LandingBranch | string, door?: string | null): string {
  return opensOnMap(branch, door) ? "?view=map" : "";
}

export function planLandingPath(tripId: string, branch: LandingBranch | string, door?: string | null): string {
  return `/plans/${tripId}${planLandingQuery(branch, door)}`;
}

/**
 * STEP 8d (ledger `2026-10-07-step8d-guest-map`; brief items 24–26, decision 1): where a SIGNED-OUT
 * finish lands. Only `myself` from the `experiences` door goes to the guest map — a plan-less map on
 * Browse, its answers carried by the sign-in record. Every other door and branch keeps today's sign-in
 * gate. `/plans/:tripId` stays protected; the guest map is its own unprotected path. Pure.
 */
export const GUEST_MAP_PATH = "/plans/new?view=map";

export function opensGuestMap(branch: LandingBranch | string, door: string | null | undefined): boolean {
  return branch === "myself" && door === "experiences";
}
