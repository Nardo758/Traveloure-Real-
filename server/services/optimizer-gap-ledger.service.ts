/**
 * Optimizer gap-fill ledger — OPTIMIZER_SOURCING_BUILD_SPEC WP-B.
 *
 * The sourcing rule (docs/briefs/OPTIMIZER_SOURCING_BUILD_SPEC.md): when the optimizer places a
 * service or transport item, PLATFORM FIRST (an approved `provider_services` match), EXTERNAL FILL
 * only when nothing matches. This module is step 3 — "every external fill is LEDGERED by data
 * type … so a gap the ledger never saw is a gap the platform never fills."
 *
 * This is a NEW, narrower table (`optimizer_gap_fills`, migration 182) than the existing
 * `content_gap_alerts` (Kyoto-only editorial gauge, UPDATE-in-place). See the table comment in
 * shared/schema.ts and the migration file for the full "why a new table" rationale.
 *
 * §15b POSTURE — THE CENTRAL RULE OF THIS FILE: a ledger write is a plan FLAG, never a money- or
 * plan-adjacent decision. It must NEVER fail the optimize/Apply flow that calls it. Every exported
 * write function swallows its own errors (logs and returns) rather than throwing, so a caller never
 * strictly needs its own try/catch — callers still wrap the call site per the build spec's "single
 * try/catch'd function call" instruction, as defense in depth against a future change here.
 *
 * "Append-only … dedupe by (city, category, day-ish window) with counts, so persistent gaps read as
 * demand volume, not spam": this module never UPDATEs or DELETEs a row. Deduplication/aggregation
 * happens at READ time in `getGapFillSummary` (GROUP BY city, category, itemKind + COUNT over a
 * window) — a persistent gap simply accumulates a higher count, no fact is ever rewritten.
 */
import { desc, sql } from "drizzle-orm";
import { db } from "../db";
import {
  optimizerGapFills,
  insertOptimizerGapFillSchema,
  OPTIMIZER_GAP_ITEM_KINDS,
  OPTIMIZER_GAP_SOURCES,
  type OptimizerGapItemKind,
  type OptimizerGapSource,
} from "@shared/schema";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface GapFillInput {
  city: string;
  category: string;
  itemKind: OptimizerGapItemKind;
  source: OptimizerGapSource;
  /** Soft reference — no FK (see shared/schema.ts table comment). */
  tripId?: string | null;
  details?: Record<string, unknown>;
}

function normalizeInput(input: GapFillInput) {
  const city = (input.city || "").trim() || "Unknown";
  const category = (input.category || "").trim() || "unspecified";
  const itemKind = OPTIMIZER_GAP_ITEM_KINDS.includes(input.itemKind) ? input.itemKind : "service";
  const source = OPTIMIZER_GAP_SOURCES.includes(input.source) ? input.source : "unfilled";
  return {
    city,
    category,
    itemKind,
    source,
    tripId: input.tripId ?? null,
    details: input.details ?? {},
  };
}

/**
 * Append ONE gap-fill event to the ledger. BEST-EFFORT (§15b): never throws. Returns true if the
 * row was written, false if the write failed (logged, not surfaced) — callers should treat both as
 * "the calling flow may proceed."
 */
export async function recordGapFill(input: GapFillInput): Promise<boolean> {
  try {
    const parsed = insertOptimizerGapFillSchema.parse(normalizeInput(input));
    await db.insert(optimizerGapFills).values(parsed);
    return true;
  } catch (err: any) {
    console.warn("[optimizer-gap-ledger] best-effort write failed (non-fatal):", err?.message || err);
    return false;
  }
}

/**
 * Append MANY gap-fill events in one insert (e.g. every unmatched item from a single Apply call).
 * BEST-EFFORT (§15b): never throws, and a malformed row is dropped rather than failing the whole
 * batch. Empty input is a no-op.
 */
export async function recordGapFills(inputs: GapFillInput[]): Promise<{ written: number; dropped: number }> {
  if (!inputs || inputs.length === 0) return { written: 0, dropped: 0 };
  try {
    const rows: Array<ReturnType<typeof insertOptimizerGapFillSchema.parse>> = [];
    let dropped = 0;
    for (const input of inputs) {
      try {
        rows.push(insertOptimizerGapFillSchema.parse(normalizeInput(input)));
      } catch {
        // Validation failure: malformed input is counted as dropped and skipped rather than aborting the batch.
        dropped++;
      }
    }
    if (rows.length === 0) return { written: 0, dropped };
    await db.insert(optimizerGapFills).values(rows);
    return { written: rows.length, dropped };
  } catch (err: any) {
    console.warn("[optimizer-gap-ledger] best-effort batch write failed (non-fatal):", err?.message || err);
    return { written: 0, dropped: inputs.length };
  }
}

export interface GapFillSummaryRow {
  city: string;
  category: string;
  itemKind: string;
  totalCount: number;
  last7dCount: number;
  prior7dCount: number;
  unfilledCount: number;
  bySource: Record<string, number>;
  lastOccurredAt: string | null;
}

/**
 * Admin read: gap fills grouped by (city, category, itemKind) with counts + a 7-day trend, highest
 * volume first — "so the decision-maker sees exactly what supply to add." Read-only; never mutates.
 */
export async function getGapFillSummary(limit = 200): Promise<GapFillSummaryRow[]> {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * DAY_MS);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * DAY_MS);

  const grouped = await db
    .select({
      city: optimizerGapFills.city,
      category: optimizerGapFills.category,
      itemKind: optimizerGapFills.itemKind,
      totalCount: sql<number>`count(*)::int`,
      last7dCount: sql<number>`count(*) filter (where ${optimizerGapFills.occurredAt} >= ${sevenDaysAgo})::int`,
      prior7dCount: sql<number>`count(*) filter (where ${optimizerGapFills.occurredAt} >= ${fourteenDaysAgo} and ${optimizerGapFills.occurredAt} < ${sevenDaysAgo})::int`,
      unfilledCount: sql<number>`count(*) filter (where ${optimizerGapFills.source} = 'unfilled')::int`,
      lastOccurredAt: sql<string>`max(${optimizerGapFills.occurredAt})`,
    })
    .from(optimizerGapFills)
    .groupBy(optimizerGapFills.city, optimizerGapFills.category, optimizerGapFills.itemKind)
    .orderBy(desc(sql`count(*)`))
    .limit(limit);

  // Per-group source breakdown (a second, small query — clearer than a JSON agg for a fixed 4-value
  // vocabulary, and this table is admin-read-only so it's never on a hot path).
  const bySourceRows = await db
    .select({
      city: optimizerGapFills.city,
      category: optimizerGapFills.category,
      itemKind: optimizerGapFills.itemKind,
      source: optimizerGapFills.source,
      n: sql<number>`count(*)::int`,
    })
    .from(optimizerGapFills)
    .groupBy(optimizerGapFills.city, optimizerGapFills.category, optimizerGapFills.itemKind, optimizerGapFills.source);

  const sourceKey = (city: string, category: string, itemKind: string) => `${city} ${category} ${itemKind}`;
  const bySourceMap = new Map<string, Record<string, number>>();
  for (const r of bySourceRows) {
    const key = sourceKey(r.city, r.category, r.itemKind);
    const bucket = bySourceMap.get(key) ?? {};
    bucket[r.source] = Number(r.n);
    bySourceMap.set(key, bucket);
  }

  return grouped.map((r) => ({
    city: r.city,
    category: r.category,
    itemKind: r.itemKind,
    totalCount: Number(r.totalCount),
    last7dCount: Number(r.last7dCount),
    prior7dCount: Number(r.prior7dCount),
    unfilledCount: Number(r.unfilledCount),
    bySource: bySourceMap.get(sourceKey(r.city, r.category, r.itemKind)) ?? {},
    lastOccurredAt: r.lastOccurredAt ? new Date(r.lastOccurredAt).toISOString() : null,
  }));
}

/** Overall totals by source — cheap top-line signal for "is anything actually filling gaps." */
export async function getGapFillSourceTotals(): Promise<Record<string, number>> {
  const rows = await db
    .select({ source: optimizerGapFills.source, n: sql<number>`count(*)::int` })
    .from(optimizerGapFills)
    .groupBy(optimizerGapFills.source);
  const out: Record<string, number> = {};
  for (const r of rows) out[r.source] = Number(r.n);
  return out;
}
