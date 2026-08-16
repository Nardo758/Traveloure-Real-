/**
 * ingestion-runner.ts — Orchestrates all trend-engine adapter runs.
 *
 * Runs adapters in source-by-source isolation: a TrendEngineCeilingError or adapter
 * failure on one source never stops other sources.
 *
 * Phase 2.1 gate: run with a tiny synthetic ceiling to verify halt behaviour.
 * Phase 2.2a gate: run daily() to verify cost rows and idempotency.
 * Phase 2.4: call backfill() per adapter with full historical ranges.
 */

import { db } from "../../db";
import { trendSourceConfig } from "@shared/schema";
import { eq } from "drizzle-orm";
import { AdapterRunResult } from "./adapters/base.adapter";
import { wikimediaPageviewsAdapter } from "./adapters/wikimedia-pageviews.adapter";
import { gdeltAdapter } from "./adapters/gdelt.adapter";
import { nagerDateAdapter } from "./adapters/nager-date.adapter";
import { openMeteoAdapter } from "./adapters/open-meteo.adapter";
import { internalTripsAdapter } from "./adapters/internal-trips.adapter";
import { bestTimeAdapter } from "./adapters/besttime.adapter";
import { predictHQAdapter } from "./adapters/predicthq.adapter";
import { xApiAdapter } from "./adapters/x-api.adapter";

export const ALL_ADAPTERS = [
  wikimediaPageviewsAdapter,
  gdeltAdapter,
  nagerDateAdapter,
  openMeteoAdapter,
  internalTripsAdapter,
  bestTimeAdapter,   // disabled skeleton — exits immediately with error
  predictHQAdapter,  // disabled skeleton — exits immediately with error
  xApiAdapter,       // disabled skeleton — exits immediately with error
];

export interface IngestionRunResult {
  ranAt: Date;
  mode: "daily" | "backfill";
  perSource: Record<string, AdapterRunResult>;
  totalInserted: number;
  totalSkipped: number;
  haltedSources: string[];
  disabledSources: string[];
  errors: Record<string, string[]>;
}

export class TrendEngineIngestionRunner {
  /**
   * Run daily() on all enabled adapters.
   */
  async runDaily(): Promise<IngestionRunResult> {
    const result: IngestionRunResult = {
      ranAt: new Date(),
      mode: "daily",
      perSource: {},
      totalInserted: 0,
      totalSkipped: 0,
      haltedSources: [],
      disabledSources: [],
      errors: {},
    };

    const enabledSources = await this.getEnabledSources();

    for (const adapter of ALL_ADAPTERS) {
      if (!enabledSources.has(adapter.source)) {
        result.disabledSources.push(adapter.source);
        continue;
      }
      try {
        console.log(`[IngestionRunner] Starting daily() for source '${adapter.source}'`);
        const adapterResult = await adapter.daily();
        result.perSource[adapter.source] = adapterResult;
        result.totalInserted += adapterResult.rowsInserted;
        result.totalSkipped += adapterResult.rowsSkipped;
        if (adapterResult.haltedByCeiling) result.haltedSources.push(adapter.source);
        if (adapterResult.errors.length) result.errors[adapter.source] = adapterResult.errors;
        console.log(
          `[IngestionRunner] ${adapter.source}: inserted=${adapterResult.rowsInserted} skipped=${adapterResult.rowsSkipped} halted=${adapterResult.haltedByCeiling} errors=${adapterResult.errors.length}`,
        );
      } catch (err: any) {
        result.errors[adapter.source] = [err.message];
        console.error(`[IngestionRunner] ${adapter.source} threw:`, err.message);
      }
    }

    console.log(
      `[IngestionRunner] Daily run complete: inserted=${result.totalInserted} skipped=${result.totalSkipped} halted=${result.haltedSources.length} disabled=${result.disabledSources.length}`,
    );
    return result;
  }

  /**
   * Run backfill(from, to) on a specific source (or all enabled if source='all').
   * Phase 2.4 entry point.
   */
  async runBackfill(
    source: string,
    from: Date,
    to: Date,
  ): Promise<IngestionRunResult> {
    const result: IngestionRunResult = {
      ranAt: new Date(),
      mode: "backfill",
      perSource: {},
      totalInserted: 0,
      totalSkipped: 0,
      haltedSources: [],
      disabledSources: [],
      errors: {},
    };

    const enabledSources = await this.getEnabledSources();
    const targets = source === "all"
      ? ALL_ADAPTERS
      : ALL_ADAPTERS.filter(a => a.source === source);

    for (const adapter of targets) {
      if (!enabledSources.has(adapter.source)) {
        result.disabledSources.push(adapter.source);
        continue;
      }
      try {
        console.log(
          `[IngestionRunner] Starting backfill() for '${adapter.source}' ${from.toISOString().slice(0, 10)} → ${to.toISOString().slice(0, 10)}`,
        );
        const adapterResult = await adapter.backfill(from, to);
        result.perSource[adapter.source] = adapterResult;
        result.totalInserted += adapterResult.rowsInserted;
        result.totalSkipped += adapterResult.rowsSkipped;
        if (adapterResult.haltedByCeiling) result.haltedSources.push(adapter.source);
        if (adapterResult.errors.length) result.errors[adapter.source] = adapterResult.errors;
      } catch (err: any) {
        result.errors[adapter.source] = [err.message];
        console.error(`[IngestionRunner] ${adapter.source} backfill threw:`, err.message);
      }
    }

    return result;
  }

  private async getEnabledSources(): Promise<Set<string>> {
    const rows = await db
      .select({ source: trendSourceConfig.source, enabled: trendSourceConfig.enabled })
      .from(trendSourceConfig);
    return new Set(rows.filter(r => r.enabled).map(r => r.source));
  }
}

export const trendEngineIngestionRunner = new TrendEngineIngestionRunner();
