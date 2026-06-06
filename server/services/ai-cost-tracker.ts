/**
 * AI Cost Tracking Service
 * Logs AI API costs to ai_cost_tracking table for CON-B pricing analysis.
 * Used to derive the $9-tier included-AI-plan cap per §4.7.
 */

import { db } from "../db";
import { sql } from "drizzle-orm";

export interface AICostTrackingParams {
  sourceType: "ai_concierge" | "ai_optimization" | "ai_traveler" | string;
  modelUsed?: string | null;
  requestId?: string | null;
  userId?: string | null;
  costUsd: number;
  tokensIn?: number | null;
  tokensOut?: number | null;
}

/**
 * Log an AI request cost to the tracking table.
 * Called after successful Anthropic API calls to record actual usage.
 */
export async function trackAICost(params: AICostTrackingParams): Promise<void> {
  try {
    await db.execute(sql`
      INSERT INTO ai_cost_tracking (
        source_type, model_used, request_id, user_id, cost, tokens_in, tokens_out, created_at, updated_at
      ) VALUES (
        ${params.sourceType},
        ${params.modelUsed ?? null},
        ${params.requestId ?? null},
        ${params.userId ?? null},
        ${params.costUsd},
        ${params.tokensIn ?? null},
        ${params.tokensOut ?? null},
        NOW(),
        NOW()
      )
    `);
  } catch (err) {
    console.error("[ai-cost-tracker] failed to log cost:", err);
    // Do not throw — logging failures should not block the request
  }
}

/**
 * Get cost statistics for a given time window and source type.
 * Used for CON-B cap calculation (§4.7).
 */
export async function getCostStats(
  sourceType: string,
  hoursAgo: number = 24 * 7 * 4 // default 4 weeks
): Promise<{
  count: number;
  median: number;
  p90: number;
  p99: number;
  mean: number;
}> {
  try {
    const result = await db.execute(sql`
      SELECT
        COUNT(*) AS count,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY cost) AS median,
        PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY cost) AS p90,
        PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY cost) AS p99,
        AVG(cost) AS mean
      FROM ai_cost_tracking
      WHERE source_type = ${sourceType}
        AND created_at > NOW() - INTERVAL '${hoursAgo} hours'
    `);
    const row = result.rows?.[0] as any;
    return {
      count: parseInt(row?.count ?? "0"),
      median: parseFloat(row?.median ?? "0"),
      p90: parseFloat(row?.p90 ?? "0"),
      p99: parseFloat(row?.p99 ?? "0"),
      mean: parseFloat(row?.mean ?? "0"),
    };
  } catch (err) {
    console.error("[ai-cost-tracker] failed to get stats:", err);
    return { count: 0, median: 0, p90: 0, p99: 0, mean: 0 };
  }
}
