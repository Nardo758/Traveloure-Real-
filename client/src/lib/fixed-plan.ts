/**
 * FB-1 step 4 — "Your plan, fixed" by tap (ledger `2026-10-19-fb1-fixed-by-tap`). Every sentence the slip's two taps
 * say lives here (§18 rule 1), in Marketing's words (Oct 19, 2026); the numbers are the server's
 * (`GET /api/trips/:tripId/versions/fixed` and the apply-days answer, its preview included) and nothing is computed
 * here but plurals.
 *
 * The stale line ends with Marketing's existing "Compare versions" link (the slip header's link to the versions board,
 * Smoke 10 S10-2) — the same words, the same board.
 */

export const FIXED_DAY_BUTTON = "Use the fixed day";
export const FIXED_PLAN_BUTTON = "Use all fixed days";
export const FIXED_DAY_CHANGED = "You’ve changed this day since these versions were made, so we didn’t replace it.";
/** The slip header's existing link label to the versions board (S10-2), reused for the stale case. */
export const COMPARE_VERSIONS_LABEL = "Compare versions";
/** Confirm before apply: the preview's two choices. */
export const FIXED_CONFIRM = "Confirm";
export const FIXED_CANCEL = "Cancel";

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

/**
 * "Day 2 updated: 2 stops moved, 1 added, 1 removed" — one day's counts from the server (the preview shows the same
 * line before the write). Zero parts are omitted; "stop(s)" rides the first part; all zero ⇒ null.
 */
export function fixedDayResultLine(d: Pick<AppliedDay, "day" | "moved" | "added" | "removed"> | null | undefined): string | null {
  if (!d) return null;
  const parts = (
    [
      [d.moved, "moved"],
      [d.added, "added"],
      [d.removed, "removed"],
    ] as const
  ).filter(([n]) => n > 0);
  if (!parts.length) return null;
  const words = parts.map(([n, verb], i) => (i === 0 ? `${n} ${n === 1 ? "stop" : "stops"} ${verb}` : `${n} ${verb}`));
  return `Day ${d.day} updated: ${words.join(", ")}`;
}

function dayList(days: readonly number[]): string {
  const named = days.map((d) => `Day ${d}`);
  if (named.length <= 1) return named.join("");
  return `${named.slice(0, -1).join(", ")} and ${named[named.length - 1]}`;
}

/** "Updated 3 days. Skipped Day 2 because you’ve changed it." — the whole-plan tap's report (ruling (c)). */
export function fixedPlanResultLine(updatedCount: number, skippedDays: readonly number[]): string {
  const updated = `Updated ${updatedCount} ${updatedCount === 1 ? "day" : "days"}.`;
  if (!skippedDays.length) return updated;
  return `${updated} Skipped ${dayList(skippedDays)} because you’ve changed ${skippedDays.length === 1 ? "it" : "them"}.`;
}

/**
 * The days the whole-plan tap sends: EVERY flagged day, version A's — the changed ones too, so the server skips them
 * itself and the report can name them (ruling (c)). The server decides; the client restates no rule.
 */
export function flaggedPlanDays(view: FixedPlanView | null | undefined): Array<{ day: number; variantId: string }> {
  if (!view) return [];
  return view.days.map((d) => ({ day: d.day, variantId: view.variantId }));
}

/** The whole-plan button shows while at least one flagged day is fixable (changed days are reported, not hidden). */
export function showsFixedPlanButton(view: FixedPlanView | null | undefined): boolean {
  return !!view && view.days.some((d) => d.state === "fixable");
}

/** One flagged day's state, or null when the day has nothing to fix. */
export function fixedDayState(view: FixedPlanView | null | undefined, day: number | null | undefined): FixedDayState | null {
  if (!view || day == null) return null;
  return view.days.find((d) => d.day === day)?.state ?? null;
}

/**
 * FB-1 step 4b (ledger `2026-10-19-fb1-free-retime`): a free plan's retime fix on tap. "Move Temple to 9:00 AM" — the
 * stop's own title and the server's new time. The confirm step shows the same counts line (`fixedDayResultLine`).
 */
export function freeRetimeButton(title: string, time: string): string {
  return `Move ${title} to ${time}`;
}
export interface FreeRetimeMove {
  itemId: string;
  title: string;
  fromMin: number;
  toMin: number;
  endMin: number;
}
export interface FreeRetimeFix {
  itemId: string;
  title: string;
  day: number;
  moves: FreeRetimeMove[];
}
/** The counts line for a free fix: every stop it moves is "moved"; it adds and removes nothing. */
export function freeRetimeResultLine(fix: Pick<FreeRetimeFix, "day" | "moves">): string | null {
  return fixedDayResultLine({ day: fix.day, moved: fix.moves.length, added: 0, removed: 0 });
}
