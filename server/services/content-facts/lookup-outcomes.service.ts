/**
 * PF-1 — `place_lookup_outcomes`: the ONE writer, the retention prune and the two admin reads (decision-maker
 * rulings 1–4, Oct 11, 2026; ledger `2026-10-11-pf1-lookup-outcomes`; migration 373).
 *
 *   · ONE batch INSERT per lookup run. It NEVER throws: a failed write is logged and the lookup it describes
 *     is unaffected (§15b — the record may not break the operation it records).
 *   · Ids only. A row carries the plan id, item id, run id/start, trigger, outcome, reason, place id, cache,
 *     cost and latency — never a title or query text.
 *   · No FK (ruling 1): a row outlives the plan and the item it is about.
 *   · Retention is `placeLookupOutcomeRetentionDays()` (ruling 2), pruned by the daily facts-recheck job.
 *   · The reads sit behind `/api/admin/*` (§2's blanket guard). The plan view joins the item's CURRENT title
 *     for display only; the table itself never stores one.
 */
import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "../../db";
import { itineraryItems, placeLookupOutcomes } from "@shared/schema";
import { latestOutcomePerItem, type PlaceLookupOutcomeRow, type PlaceLookupTrigger } from "@shared/place-lookup-outcomes";
import { placeLookupOutcomeCountsDays, placeLookupOutcomeRetentionDays } from "../../config/content-facts.config";

export interface LookupRun {
  runId: string;
  runStartedAt: Date;
  trigger: PlaceLookupTrigger | null;
}

/** The ONE writer. One INSERT for the whole run; returns how many rows were written (0 on failure). */
export async function recordLookupOutcomes(run: LookupRun, rows: readonly PlaceLookupOutcomeRow[]): Promise<number> {
  if (rows.length === 0) return 0;
  try {
    await db.insert(placeLookupOutcomes).values(
      rows.map((r) => ({
        runId: run.runId,
        runStartedAt: run.runStartedAt,
        tripId: r.tripId,
        itineraryItemId: r.itemId,
        runTrigger: run.trigger,
        dayNumber: r.day,
        outcome: r.outcome,
        reason: r.reason,
        placeId: r.placeId,
        cache: r.cache,
        costCents: r.costCents,
        latencyMs: r.latencyMs,
      })),
    );
    return rows.length;
  } catch (err) {
    console.error(`[place-facts] outcome write failed run_id=${run.runId} rows=${rows.length}:`, (err as Error)?.message ?? err);
    return 0;
  }
}

/** Ruling 2: delete rows older than the retention window. Returns the number deleted. Throws on a DB error. */
export async function pruneLookupOutcomes(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - placeLookupOutcomeRetentionDays() * 24 * 60 * 60 * 1000);
  const deleted = await db.delete(placeLookupOutcomes).where(lt(placeLookupOutcomes.createdAt, cutoff)).returning({ id: placeLookupOutcomes.id });
  return deleted.length;
}

export interface LookupOutcomeCount {
  outcome: string;
  reason: string | null;
  count: number;
}

/** Ruling 3 (counts): rows by outcome and reason over the last `days` days (default and cap: config). */
export async function lookupOutcomeCounts(days?: number, now: Date = new Date()): Promise<{ days: number; since: string; counts: LookupOutcomeCount[] }> {
  const max = placeLookupOutcomeRetentionDays();
  const window = days && Number.isFinite(days) && days > 0 ? Math.min(Math.floor(days), max) : placeLookupOutcomeCountsDays();
  const since = new Date(now.getTime() - window * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({ outcome: placeLookupOutcomes.outcome, reason: placeLookupOutcomes.reason, count: sql<number>`count(*)::int` })
    .from(placeLookupOutcomes)
    .where(gte(placeLookupOutcomes.createdAt, since))
    .groupBy(placeLookupOutcomes.outcome, placeLookupOutcomes.reason)
    .orderBy(desc(sql`count(*)`));
  return { days: window, since: since.toISOString(), counts: rows.map((r) => ({ outcome: r.outcome, reason: r.reason ?? null, count: Number(r.count) })) };
}

export interface PlanLookupOutcome {
  itemId: string;
  /** The item's CURRENT title, read at display time; null when the item no longer exists. Never stored. */
  itemTitle: string | null;
  day: number | null;
  outcome: string;
  reason: string | null;
  trigger: string | null;
  runId: string;
  runStartedAt: string;
  placeId: string | null;
  cache: string | null;
}

/** Ruling 3 (plan view): each item's LATEST outcome on one plan, within the retention window. */
export async function latestLookupOutcomesForPlan(tripId: string): Promise<PlanLookupOutcome[]> {
  const rows = await db
    .select({
      itemId: placeLookupOutcomes.itineraryItemId,
      itemTitle: itineraryItems.title,
      day: placeLookupOutcomes.dayNumber,
      outcome: placeLookupOutcomes.outcome,
      reason: placeLookupOutcomes.reason,
      trigger: placeLookupOutcomes.runTrigger,
      runId: placeLookupOutcomes.runId,
      runStartedAt: placeLookupOutcomes.runStartedAt,
      createdAt: placeLookupOutcomes.createdAt,
      placeId: placeLookupOutcomes.placeId,
      cache: placeLookupOutcomes.cache,
    })
    .from(placeLookupOutcomes)
    .leftJoin(itineraryItems, and(eq(itineraryItems.id, placeLookupOutcomes.itineraryItemId), eq(itineraryItems.tripId, placeLookupOutcomes.tripId)))
    .where(eq(placeLookupOutcomes.tripId, tripId));
  return latestOutcomePerItem(rows)
    .sort((a, b) => (a.day ?? 0) - (b.day ?? 0) || a.itemId.localeCompare(b.itemId))
    .map((r) => ({
      itemId: r.itemId,
      itemTitle: r.itemTitle ?? null,
      day: r.day ?? null,
      outcome: r.outcome,
      reason: r.reason ?? null,
      trigger: r.trigger ?? null,
      runId: r.runId,
      runStartedAt: new Date(r.runStartedAt).toISOString(),
      placeId: r.placeId ?? null,
      cache: r.cache ?? null,
    }));
}
