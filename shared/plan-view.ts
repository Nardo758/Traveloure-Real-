/**
 * PLAN-1 Phase 2 (ledger `2026-11-06-plan1-phase2-view-toggle`; ruling 4): which planner a plan opens on.
 *
 * The planners on `/plans/{id}` are Days and Map (Calendar follows once its Design artifact is approved — ruling,
 * Nov 6). The traveler's last toggle is remembered server-side (`users.preferences.settings.planView`, written through
 * the allow-listed `PATCH /api/me/preferences`; never localStorage).
 *
 * SLIP-FIRST (round 5 hotfix, ledger `2026-11-07-slip-first-landing`): every plan opens on Days; the saved view
 * overrides only once the traveler has set one. The Phase 2 "a map-created plan opens on Map" default is gone: no mint
 * stamps `trips.preferences.opensOn` any more, and nothing reads it. Rows stamped Nov 6–7 keep the key; it stays
 * server-owned (a client write can neither set nor erase it) and is inert.
 *
 *   the URL's `?view=` (a reload, a shared link, the traveler's toggle) → that view;
 *   otherwise                                                           → the remembered view, else Days.
 * Pure.
 */
export const PLAN_VIEWS = ["days", "map"] as const;
export type PlanView = (typeof PLAN_VIEWS)[number];

/** The server-owned `trips.preferences` key Nov 6–7 mints stamped (inert since the slip-first hotfix; still guarded). */
export const PLAN_OPENS_ON_KEY = "opensOn" as const;

export function isPlanView(v: unknown): v is PlanView {
  return typeof v === "string" && (PLAN_VIEWS as readonly string[]).includes(v);
}

/**
 * The URL's view: `map`, or `days` (also the legacy `list`). The expert door's link (`?help=expert`) opens its help card,
 * which lives in the Days view — so it states Days unless the URL names a view. Anything else ⇒ none stated.
 */
export function planViewFromUrl(search: string | null | undefined): PlanView | null {
  try {
    const params = new URLSearchParams(search ?? "");
    const v = params.get("view");
    if (v === "map") return "map";
    if (v === "days" || v === "list") return "days";
    if (params.get("help") === "expert") return "days";
    return null;
  } catch {
    return null;
  }
}

export function resolvePlanView(input: { url: PlanView | null; remembered: unknown }): PlanView {
  if (input.url) return input.url;
  return isPlanView(input.remembered) ? input.remembered : "days";
}
