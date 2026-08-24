/**
 * AI Cost Tracking Service
 * Logs AI API costs to ai_cost_tracking table for CON-B pricing analysis.
 * Used to derive the $9-tier included-AI-plan cap per §4.7.
 */

import { db } from "../db";
import { sql } from "drizzle-orm";

// Anthropic pricing per token (Claude Sonnet 4, as of 2026-06)
const ANTHROPIC_PRICING = {
  input: 3 / 1_000_000,    // $3 per million input tokens
  output: 15 / 1_000_000,  // $15 per million output tokens
};

export function calculateAnthropicCost(inputTokens: number, outputTokens: number): number {
  return (inputTokens * ANTHROPIC_PRICING.input) + (outputTokens * ANTHROPIC_PRICING.output);
}

export interface AICostTrackingParams {
  sourceType: "ai_concierge" | "ai_optimization" | "ai_chat" | "ai_traveler" | "ai_content" | "ai_expert" | string;
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
 * Convenience wrapper: takes an Anthropic Message response and logs the cost.
 * Use immediately after `anthropic.messages.create()`:
 *
 *   const response = await anthropic.messages.create({...});
 *   trackAnthropicResponse(response, { sourceType: "ai_concierge", userId });
 */
export function trackAnthropicResponse(
  response: { usage?: { input_tokens: number; output_tokens: number }; model?: string },
  opts: { sourceType: string; userId?: string | null; requestId?: string | null }
): void {
  if (!response.usage) return;
  const cost = calculateAnthropicCost(response.usage.input_tokens, response.usage.output_tokens);
  trackAICost({
    sourceType: opts.sourceType,
    modelUsed: response.model ?? null,
    requestId: opts.requestId ?? null,
    userId: opts.userId ?? null,
    costUsd: cost,
    tokensIn: response.usage.input_tokens,
    tokensOut: response.usage.output_tokens,
  }).catch(err => console.error("[ai-cost-tracker] async failure:", err));
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
