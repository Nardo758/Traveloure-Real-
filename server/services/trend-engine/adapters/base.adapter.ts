/**
 * base.adapter.ts — Base interface every trend-engine adapter must implement.
 *
 * Contract:
 *   - daily():           ingest yesterday's signals for all resolved entities of this source.
 *   - backfill(from,to): ingest historical signals for the given date range (inclusive).
 *   - Both modes MUST:
 *       1. Call trendEngineCostEnforcer.recordAndCheck() before each external call.
 *       2. Use ON CONFLICT DO NOTHING when inserting trend_signals (idempotency).
 *       3. Declare resale_class explicitly — never infer from context.
 *       4. Set pre_launch = true for internal-reconstruction signals before the
 *          PRE_LAUNCH_CUTOFF date (R8).
 *   - TrendEngineCeilingError propagates up to the ingestion runner to halt THIS source
 *     without affecting others.
 */

export interface AdapterRunResult {
  source: string;
  rowsInserted: number;
  rowsSkipped: number;   // duplicates that hit ON CONFLICT DO NOTHING
  entitiesProcessed: number;
  errors: string[];
  haltedByCeiling: boolean;
  rangeStart?: Date;
  rangeEnd?: Date;
}

export interface TrendEngineAdapter {
  /** Adapter identifier — must match trend_source_config.source */
  readonly source: string;

  /** Ingest yesterday's signals for all resolved entities. */
  daily(): Promise<AdapterRunResult>;

  /** Ingest historical signals for [from, to] inclusive (R7). */
  backfill(from: Date, to: Date): Promise<AdapterRunResult>;
}

/** Shared cutoff date for R8 pre_launch flagging.
 *  Any internal-reconstruction signal observed before this date is flagged pre_launch=true.
 *  Config, not a literal — change this constant if the launch date is revised. */
export const PRE_LAUNCH_CUTOFF = new Date("2024-01-01T00:00:00Z");

/** Build an empty AdapterRunResult. */
export function emptyResult(source: string): AdapterRunResult {
  return {
    source,
    rowsInserted: 0,
    rowsSkipped: 0,
    entitiesProcessed: 0,
    errors: [],
    haltedByCeiling: false,
  };
}
