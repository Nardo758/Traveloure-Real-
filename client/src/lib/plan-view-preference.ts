/**
 * PLAN-1 Phase 2 (ruling 4): the traveler's planner view, remembered SERVER-SIDE — `users.preferences.settings.planView`
 * through the allow-listed `PATCH /api/me/preferences` (never localStorage), so it follows the traveler to a second
 * browser. Read by `/plans/{id}` (`resolvePlanView`, shared/plan-view.ts); written by the Days / Map toggle.
 */
import { apiRequest, queryClient } from "@/lib/queryClient";
import { isPlanView, type PlanView } from "@shared/plan-view";

export const ME_PREFERENCES_QUERY_KEY = ["/api/me/preferences"] as const;

/** The remembered view from a `/api/me/preferences` answer; anything else ⇒ null. */
export function rememberedPlanView(prefs: unknown): PlanView | null {
  const v = prefs && typeof prefs === "object" ? (prefs as { planView?: unknown }).planView : null;
  return isPlanView(v) ? v : null;
}

/** Save the toggle. A failed save changes nothing on screen (the view the traveler chose stays shown). */
export async function savePlanView(view: PlanView): Promise<void> {
  queryClient.setQueryData(ME_PREFERENCES_QUERY_KEY, (old: unknown) => ({ ...((old as object) ?? {}), planView: view }));
  try {
    await apiRequest("PATCH", ME_PREFERENCES_QUERY_KEY[0], { planView: view });
  } catch {
    // Best effort: the next toggle saves again.
  }
}
