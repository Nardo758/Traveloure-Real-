/**
 * cost-enforcement.ts — Phase 2.1 cost-tracking enforcement for trend-engine adapters.
 *
 * Every trend-source adapter MUST call recordAndCheck() before each external API call.
 * Rules:
 *   - Logs the cost to api_usage_logs (existing infrastructure, first real consumer).
 *   - Reads month-to-date (MTD) cost for the source from api_usage_logs.
 *   - If MTD >= monthly_cost_ceiling (from trend_source_config): halts THAT source,
 *     writes health_status='halted_ceiling' to trend_source_config, throws HaltedError.
 *   - A halted source does not affect other sources.
 *   - Backfill passes are tracked identically — cannot blow through a ceiling silently.
 *
 * Adapters catch HaltedError to stop their own run; the ingestion runner does NOT
 * propagate it to other adapters.
 */

import { db } from "../../db";
import { trendSourceConfig, apiUsageLogs } from "@workspace/db";
import { eq, and, gte, sum } from "drizzle-orm";
import { sql } from "drizzle-orm";

export class TrendEngineCeilingError extends Error {
  constructor(
    public readonly source: string,
    public readonly mtdCents: number,
    public readonly ceilingCents: number,
  ) {
    super(
      `[TrendEngine] Source '${source}' halted: MTD cost ${mtdCents}¢ reached ceiling ${ceilingCents}¢`,
    );
    this.name = "TrendEngineCeilingError";
  }
}

export interface CostCheckResult {
  allowed: boolean;
  mtdCents: number;
  ceilingCents: number | null;
  healthStatus: string;
}

export class TrendEngineCostEnforcer {
  /**
   * Record a cost row and check ceiling. Call BEFORE each external API call.
   * Throws TrendEngineCeilingError if the source is at or above its ceiling.
   * If no ceiling is set (open-license sources), always allowed.
   */
  async recordAndCheck(opts: {
    source: string;
    operation: string;
    costCents: number;
    responseTimeMs?: number;
    success?: boolean;
    errorMessage?: string;
    entityCount?: number;
  }): Promise<void> {
    // 1. Write cost row unconditionally (even for failed calls — ceiling is on spend, not success)
    try {
      await db.insert(apiUsageLogs).values({
        provider: "trend_engine",
        endpoint: opts.source,
        operation: opts.operation,
        requestCount: 1,
        estimatedCostCents: opts.costCents,
        costPerCallCents: opts.costCents,
        responseTimeMs: opts.responseTimeMs ?? 0,
        success: opts.success ?? true,
        errorMessage: opts.errorMessage ?? null,
        resultCount: opts.entityCount ?? 0,
        metadata: { trend_source: opts.source },
      });
    } catch (err: any) {
      console.error(`[CostEnforcer] Failed to log cost row for ${opts.source}:`, err.message);
      // Cost logging failure does NOT block the call — observability degrades, ingestion continues.
    }

    // 2. Check ceiling
    const [config] = await db
      .select({
        monthlyCostCeiling: trendSourceConfig.monthlyCostCeiling,
        healthStatus: trendSourceConfig.healthStatus,
      })
      .from(trendSourceConfig)
      .where(eq(trendSourceConfig.source, opts.source))
      .limit(1);

    if (!config) return; // unknown source — no ceiling to enforce

    // Already halted by a previous call this run
    if (config.healthStatus === "halted_ceiling") {
      throw new TrendEngineCeilingError(opts.source, 0, Number(config.monthlyCostCeiling ?? 0));
    }

    if (config.monthlyCostCeiling === null || config.monthlyCostCeiling === undefined) {
      return; // no ceiling set (open-license sources)
    }

    const ceilingCents = Math.round(Number(config.monthlyCostCeiling) * 100);
    const mtdCents = await this.getMonthToDateCostCents(opts.source);

    if (mtdCents >= ceilingCents) {
      await this.haltSource(opts.source, `MTD cost ${mtdCents}¢ reached ceiling ${ceilingCents}¢`);
      throw new TrendEngineCeilingError(opts.source, mtdCents, ceilingCents);
    }
  }

  /** Query MTD cost in cents for a source from api_usage_logs. */
  async getMonthToDateCostCents(source: string): Promise<number> {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [row] = await db
      .select({ total: sum(apiUsageLogs.estimatedCostCents) })
      .from(apiUsageLogs)
      .where(
        and(
          eq(apiUsageLogs.endpoint, source),
          eq(apiUsageLogs.provider, "trend_engine"),
          gte(apiUsageLogs.createdAt, monthStart),
        ),
      );

    return Math.round(Number(row?.total ?? 0));
  }

  /** Mark a source as halted in trend_source_config. */
  async haltSource(source: string, reason: string): Promise<void> {
    await db
      .update(trendSourceConfig)
      .set({
        healthStatus: "halted_ceiling",
        haltedAt: new Date(),
        haltedReason: reason,
        updatedAt: new Date(),
      })
      .where(eq(trendSourceConfig.source, source));

    console.warn(`[CostEnforcer] Source '${source}' HALTED: ${reason}`);
  }

  /** Mark a source healthy (e.g. after ceiling reset or new month). */
  async clearHalt(source: string): Promise<void> {
    await db
      .update(trendSourceConfig)
      .set({
        healthStatus: "healthy",
        haltedAt: null,
        haltedReason: null,
        updatedAt: new Date(),
      })
      .where(eq(trendSourceConfig.source, source));
  }

  /** Get current health status for a source. */
  async getSourceHealth(source: string): Promise<{
    status: string;
    haltedAt: Date | null;
    reason: string | null;
    mtdCents: number;
    ceilingCents: number | null;
  }> {
    const [config] = await db
      .select()
      .from(trendSourceConfig)
      .where(eq(trendSourceConfig.source, source))
      .limit(1);

    const mtdCents = await this.getMonthToDateCostCents(source);
    return {
      status: config?.healthStatus ?? "unknown",
      haltedAt: config?.haltedAt ?? null,
      reason: config?.haltedReason ?? null,
      mtdCents,
      ceilingCents: config?.monthlyCostCeiling != null
        ? Math.round(Number(config.monthlyCostCeiling) * 100)
        : null,
    };
  }
}

export const trendEngineCostEnforcer = new TrendEngineCostEnforcer();
