/**
 * FB-1 step 4 — "Your plan, fixed" by tap (decision-maker, Oct 19, 2026 — step 4 rulings (a)–(d); ledger
 * `2026-10-19-fb1-fixed-by-tap`).
 *
 * The checker only FLAGS; nothing here runs on its own. A traveler's tap adopts version A's day ("Your plan, fixed",
 * the version the step 3 gate let through) through the ONE adopt writer, `applyDays`. Two taps: one day, or every
 * flagged day at once — both on `POST /versions/apply-days` with `unchangedSinceRun: true`.
 *
 *   · FLAGGED: a day with an issue in the plan's current check (`checkPlan` over `loadPlanCheckInput`, the one input).
 *   · STALE (ruling (a)(i)): a day the plan changed on after the run STARTED — any add, edit, move, re-time or delete —
 *     is refused, never overwritten. The run's start is its baseline ("Your Plan") version, written before the model
 *     call, whose items record each plan item's day as it stood then (`staleDays`, pure, below).
 *   · No baseline to read ⇒ nothing can be shown unchanged ⇒ every day is stale (refused, never guessed).
 *   · CONFIRM BEFORE APPLY: the tap first sends `preview: true` — `applyDays` runs the same diff and rolls it back —
 *     shows each day's moved/added/removed counts, and writes only on the traveler's confirm.
 *   · MACHINE WRITES ARE NOT EDITS: a writer that re-times items on its own (the legacy leg schedule writer) does not
 *     bump `updated_at`, so it never makes a day "changed" (`trip-transport-legs.service.ts`).
 */
import { and, desc, eq, gt, lte } from "drizzle-orm";
import { db } from "../db";
import { itemTransitionLog, itineraryItems, itineraryVariantItems, itineraryVariants } from "@shared/schema";
import { checkPlan, isFlagOnlyIssue } from "@shared/plan-check";
import { FIXED_VERSION_NAME } from "@shared/version-check";
import { VersionBoardError, applyDays, latestRun } from "./version-board.service";

export interface BaselineStop {
  sourceItemId: string | null;
  dayNumber: number | null;
}
export interface PlanStopNow {
  id: string;
  dayNumber: number | null;
  createdAt: Date | string | null;
  updatedAt: Date | string | null;
}

const after = (t: Date | string | null | undefined, start: Date) => !!t && new Date(t).getTime() > start.getTime();

/**
 * PURE. The plan days that changed after the run started. A day is stale when:
 *   1. an item on it now was created or written after the start (an add, an edit, a re-time, a move in);
 *   2. an item the baseline had on it is gone or is now on another day (a delete, a move out);
 * and EVERY day is stale when an item the baseline does not know about was removed after the start (its day is
 * unknowable — a refusal is safe, an overwrite is not).
 */
export function staleDays(input: {
  runStart: Date;
  baseline: readonly BaselineStop[];
  plan: readonly PlanStopNow[];
  removedSinceStart: readonly string[];
}): { days: Set<number>; all: boolean } {
  const days = new Set<number>();
  const now = new Map(input.plan.map((p) => [p.id, p]));
  for (const p of input.plan) {
    if (p.dayNumber != null && (after(p.createdAt, input.runStart) || after(p.updatedAt, input.runStart))) days.add(p.dayNumber);
  }
  const known = new Set<string>();
  for (const b of input.baseline) {
    if (!b.sourceItemId) continue;
    known.add(b.sourceItemId);
    if (b.dayNumber == null) continue;
    const p = now.get(b.sourceItemId);
    if (!p || p.dayNumber !== b.dayNumber) days.add(b.dayNumber);
  }
  const all = input.removedSinceStart.some((id) => !known.has(id));
  return { days, all };
}

export type FixedDayState = "fixable" | "changed";
export interface FixedPlanView {
  variantId: string;
  comparisonId: string;
  days: Array<{ day: number; state: FixedDayState }>;
}

/** The run's baseline version (written before the model call) — its start and its items. */
async function runBaseline(run: NonNullable<Awaited<ReturnType<typeof latestRun>>>) {
  const where = run.runId
    ? and(eq(itineraryVariants.comparisonId, run.comparisonId), eq(itineraryVariants.source, "user"), eq(itineraryVariants.runId, run.runId))
    : and(eq(itineraryVariants.comparisonId, run.comparisonId), eq(itineraryVariants.source, "user"), lte(itineraryVariants.createdAt, run.runAt));
  const [base] = await db.select().from(itineraryVariants).where(where).orderBy(desc(itineraryVariants.createdAt)).limit(1);
  if (!base?.createdAt) return null;
  const items = await db
    .select({ sourceItemId: itineraryVariantItems.sourceItemId, dayNumber: itineraryVariantItems.dayNumber })
    .from(itineraryVariantItems)
    .where(eq(itineraryVariantItems.variantId, base.id));
  return { start: new Date(base.createdAt as any), items };
}

/** The plan's days changed since the run started; no baseline to read ⇒ every day (refused, never guessed). */
async function staleSinceRun(tripId: string, run: NonNullable<Awaited<ReturnType<typeof latestRun>>>): Promise<{ days: Set<number>; all: boolean }> {
  const baseline = await runBaseline(run);
  if (!baseline) return { days: new Set(), all: true };
  const plan = await db
    .select({ id: itineraryItems.id, dayNumber: itineraryItems.dayNumber, createdAt: itineraryItems.createdAt, updatedAt: itineraryItems.updatedAt })
    .from(itineraryItems)
    .where(eq(itineraryItems.tripId, tripId));
  const removed = await db
    .select({ itemId: itemTransitionLog.itemId })
    .from(itemTransitionLog)
    .where(and(eq(itemTransitionLog.tripId, tripId), eq(itemTransitionLog.eventType, "item_removed"), gt(itemTransitionLog.createdAt, baseline.start)));
  return staleDays({
    runStart: baseline.start,
    baseline: baseline.items,
    plan,
    removedSinceStart: removed.map((r) => r.itemId).filter((x): x is string => !!x),
  });
}

/** The plan's flagged days, each fixable or changed since the run; null when there is no shown "Your plan, fixed". */
export async function loadFixedPlan(tripId: string): Promise<FixedPlanView | null> {
  const run = await latestRun(tripId);
  const fixed = run?.variants.find((v) => v.name === FIXED_VERSION_NAME);
  if (!run || !fixed) return null;
  const { loadPlanCheckInput } = await import("./optimizer-lead.service");
  const { input } = await loadPlanCheckInput(tripId);
  // FB-1 step 5c: a flag-only issue (a timed slot to reserve) never flags a day — no fixed day can carry it out.
  const flagged = Array.from(new Set(checkPlan(input).issues.filter((i) => !isFlagOnlyIssue(i)).map((i) => i.day))).filter((d) => Number.isInteger(d) && d >= 1).sort((a, b) => a - b);
  if (!flagged.length) return { variantId: fixed.id, comparisonId: run.comparisonId, days: [] };

  const stale = await staleSinceRun(tripId, run);
  return {
    variantId: fixed.id,
    comparisonId: run.comparisonId,
    days: flagged.map((day) => ({ day, state: stale.all || stale.days.has(day) ? "changed" : "fixable" })),
  };
}

/**
 * The tap's rule on `apply-days` (`unchangedSinceRun: true`; the board's own adopt never sends it). A day the plan changed
 * on since the run started is never written: one asked-for day that changed is a 409 `day_changed`; several apply the
 * rest and report what they skipped. The days themselves go through the ONE adopt writer, `applyDays`.
 */
export async function applyDaysUnchangedSinceRun(input: {
  tripId: string;
  userId: string;
  days: Array<{ day: number; variantId: string }>;
  /** Confirm before apply: the same diff, rolled back — the counts the tap shows, nothing written. */
  preview?: boolean;
}): Promise<{
  days: Awaited<ReturnType<typeof applyDays>>["days"];
  stay: unknown;
  skipped: Array<{ day: number; reason: "changed_since_run" }>;
}> {
  const run = await latestRun(input.tripId);
  if (!run) throw new VersionBoardError(409, "no_run", "This plan has no optimized versions to adopt from");
  const stale = await staleSinceRun(input.tripId, run);
  const isStale = (d: number) => stale.all || stale.days.has(d);
  const skipped = input.days.filter((d) => isStale(d.day)).map((d) => ({ day: d.day, reason: "changed_since_run" as const }));
  if (input.days.length === 1 && skipped.length === 1) {
    throw new VersionBoardError(409, "day_changed", "This day changed since your versions were made");
  }
  const fresh = input.days.filter((d) => !isStale(d.day));
  if (!fresh.length) return { days: [], stay: null, skipped };
  const out = await applyDays({ tripId: input.tripId, userId: input.userId, days: fresh, dryRun: input.preview === true });
  return { ...out, skipped };
}
