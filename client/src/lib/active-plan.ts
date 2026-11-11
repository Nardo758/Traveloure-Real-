/**
 * THE ONE ACTIVE-PLAN RULE (cut-list #1 header fix v2; decision-maker Nov 11, 2026).
 *
 * Until this module three surfaces each decided "the current plan" their own way: the Trip Strip
 * followed the pen's `tripId`, the header chip took the most recently updated un-finalized trip,
 * and the Add-to-plan picker took the FIRST fitting row of an UNORDERED `/api/trips` list — which
 * is how TB1 saw an older Kyoto plan preselected over the one just claimed. One rule now, read by
 * the strip, the nav slot, the picker, the pending-add flush and the claim:
 *
 *   1. an EXPLICIT binding — `?tripId=` on the URL, then the pen's `tripId` — when that plan is in
 *      the list and not finalized;
 *   2. otherwise the most recently updated un-finalized plan.
 *
 * Finality is the ONLY lifecycle filter (`trips.status` is a display label a reopen can move). A
 * just-claimed plan carries `updatedAt = now`, so it wins under rule 2 with no special case.
 *
 * Pure. The hook that feeds it lives in `client/src/hooks/use-active-plan.ts`.
 */

export interface ActivePlanRow {
  id: string;
  updatedAt?: string | null;
  finalizedAt?: string | null;
}

/** `?tripId=` from a search string, else the pen's id; "" and junk read as no binding. */
export function boundTripId(search: string | null | undefined, ctxTripId: string | null | undefined): string | null {
  try {
    const fromUrl = new URLSearchParams(String(search ?? "").replace(/^\?/, "")).get("tripId")?.trim();
    if (fromUrl) return fromUrl;
  } catch {
    /* an unparseable search string binds nothing */
  }
  const fromCtx = typeof ctxTripId === "string" ? ctxTripId.trim() : "";
  return fromCtx || null;
}

/** Most recently updated first; a row with no `updatedAt` sorts last. Pure — returns a copy. */
export function byMostRecentlyUpdated<T extends ActivePlanRow>(rows: readonly T[]): T[] {
  return [...rows].sort((x, y) => String(y.updatedAt ?? "").localeCompare(String(x.updatedAt ?? "")));
}

export function pickActivePlan<T extends ActivePlanRow>(
  trips: readonly T[] | null | undefined,
  bound: string | null | undefined = null,
): T | null {
  const live = (trips ?? []).filter((t) => !t.finalizedAt);
  if (live.length === 0) return null;
  if (bound) {
    const hit = live.find((t) => t.id === bound);
    if (hit) return hit;
  }
  return byMostRecentlyUpdated(live)[0] ?? null;
}
