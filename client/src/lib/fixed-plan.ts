/**
 * FB-1 step 4 — "Your plan, fixed" by tap (ledger `2026-10-19-fb1-fixed-by-tap`). Every sentence the slip's two taps
 * say lives here (§18 rule 1); the numbers are the server's (`GET /api/trips/:tripId/versions/fixed` and the
 * apply-days answer) and nothing is computed here but plurals.
 *
 * The stale line reuses Marketing's existing "Compare versions" link (the slip header's link to the versions board,
 * Smoke 10 S10-2) — the same words, the same board.
 */

export const FIXED_DAY_BUTTON = "Use the fixed day";
export const FIXED_PLAN_BUTTON = "Use Your plan, fixed";
export const FIXED_DAY_CHANGED = "This day changed since your versions were made.";
/** The slip header's existing link label to the versions board (S10-2), reused for the stale case. */
export const COMPARE_VERSIONS_LABEL = "Compare versions";

export type FixedDayState = "fixable" | "changed";
export interface FixedPlanView {
  variantId: string;
  comparisonId: string;
  days: Array<{ day: number; state: FixedDayState }>;
}
export interface AppliedDay {
  day: number;
  moved: number;
  added: number;
  removed: number;
  kept: number;
}

/** "2 moved · 1 added · 1 removed" — the server's counts for one fixed day; zeros are omitted, all zero ⇒ null. */
export function fixedDayResultLine(d: Pick<AppliedDay, "moved" | "added" | "removed"> | null | undefined): string | null {
  if (!d) return null;
  const parts = [
    d.moved > 0 ? `${d.moved} moved` : null,
    d.added > 0 ? `${d.added} added` : null,
    d.removed > 0 ? `${d.removed} removed` : null,
  ].filter((x): x is string => !!x);
  return parts.length ? parts.join(" · ") : null;
}

/** "3 days fixed · 1 unchanged since you edited it" — the whole-plan tap's report (ruling (c)). */
export function fixedPlanResultLine(fixedCount: number, skippedCount: number): string {
  const fixed = `${fixedCount} ${fixedCount === 1 ? "day" : "days"} fixed`;
  if (skippedCount <= 0) return fixed;
  return `${fixed} · ${skippedCount} unchanged since you edited ${skippedCount === 1 ? "it" : "them"}`;
}

/**
 * The days the whole-plan tap sends: EVERY flagged day, version A's — the changed ones too, so the server skips them
 * itself and the report can say how many it left (ruling (c)). The server decides; the client restates no rule.
 */
export function flaggedPlanDays(view: FixedPlanView | null | undefined): Array<{ day: number; variantId: string }> {
  if (!view) return [];
  return view.days.map((d) => ({ day: d.day, variantId: view.variantId }));
}

/** The whole-plan button shows when at least one flagged day exists (changed days are reported, not hidden). */
export function showsFixedPlanButton(view: FixedPlanView | null | undefined): boolean {
  return !!view && view.days.length > 0 && view.days.some((d) => d.state === "fixable");
}

/** One flagged day's state, or null when the day has nothing to fix. */
export function fixedDayState(view: FixedPlanView | null | undefined, day: number | null | undefined): FixedDayState | null {
  if (!view || day == null) return null;
  return view.days.find((d) => d.day === day)?.state ?? null;
}
