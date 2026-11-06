/**
 * PLAN-1 Phase 2 (ledger `2026-11-06-plan1-phase2-view-toggle`; ruling 4): which planner a plan opens on.
 *
 * The planners on `/plans/{id}` are Days and Map (Calendar follows once its Design artifact is approved — ruling,
 * Nov 6). The traveler's last toggle is remembered server-side (`users.preferences.settings.planView`, written through
 * the allow-listed `PATCH /api/me/preferences`; never localStorage). A plan created from the map carries the
 * server-owned key `trips.preferences.opensOn = "map"` (stamped at the mint and at the guest-plan create; a client write
 * can neither set nor erase it).
 *
 *   the URL's `?view=` (a reload, a shared link) → that view;
 *   a plan created from the map                → Map;
 *   an older plan                              → the remembered view, else Days.
 * Pure.
 */
export const PLAN_VIEWS = ["days", "map"] as const;
export type PlanView = (typeof PLAN_VIEWS)[number];

/** The server-owned `trips.preferences` key a map-created plan carries. */
export const PLAN_OPENS_ON_KEY = "opensOn" as const;

export function isPlanView(v: unknown): v is PlanView {
  return typeof v === "string" && (PLAN_VIEWS as readonly string[]).includes(v);
}

/** The URL's view: `map`, or `days` (also the legacy `list`); anything else ⇒ none stated. */
export function planViewFromUrl(search: string | null | undefined): PlanView | null {
  try {
    const v = new URLSearchParams(search ?? "").get("view");
    if (v === "map") return "map";
    if (v === "days" || v === "list") return "days";
    return null;
  } catch {
    return null;
  }
}

/** The plan's own opening view, from `trips.preferences` (server-stamped). */
export function planOpensOn(preferences: unknown): "map" | null {
  const v = preferences && typeof preferences === "object" ? (preferences as Record<string, unknown>)[PLAN_OPENS_ON_KEY] : null;
  return v === "map" ? "map" : null;
}

export function resolvePlanView(input: { url: PlanView | null; planOpensOn: PlanView | null; remembered: unknown }): PlanView {
  if (input.url) return input.url;
  if (input.planOpensOn === "map") return "map";
  return isPlanView(input.remembered) ? input.remembered : "days";
}
