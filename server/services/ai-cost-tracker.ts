/**
 * AI Cost Tracking Service
 * Logs AI API costs to ai_cost_tracking table for CON-B pricing analysis.
 * Used to derive the $9-tier included-AI-plan cap per §4.7.
 */

import { db } from "../db";
import { sql, type SQL } from "drizzle-orm";
import { logger } from "../infrastructure/logger";

/**
 * `ai_cost_tracking.user_id` is a **uuid** column (migration `025b_ai_cost_tracking.sql`) while
 * `users.id` is a **varchar** (`DEFAULT gen_random_uuid()`, so a normally-minted account happens to
 * fit and an OIDC/Replit subject or any legacy row does not). Handing Postgres a non-uuid string for
 * that column raises `22P02` and, because this module swallows its own insert errors by design, the
 * WHOLE cost row used to vanish with no log anyone reads.
 *
 * Migration 310 (ledger `2026-09-17-ai-cost-actor-id`) adds `actor_id varchar(255)`, which holds the
 * attribution whatever shape the id has. This predicate decides the ONE remaining question: may the
 * legacy uuid column also carry it? `user_id` is left EXACTLY as it is — the alternative,
 * `ALTER COLUMN user_id TYPE varchar`, is a §20 publish-time DECLINE prompt.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The driver's SQLSTATE, read through drizzle's wrapper. `db.execute` rejects with a
 * `DrizzleQueryError` that carries the pg error as its `cause`, so reading `err.code` alone would
 * log `null` for every failure and the log line would be honest about nothing (§13). Stated once
 * here and asserted by the proofs, so the two cannot disagree about where the code lives.
 */
function pgCodeOf(err: any): string | null {
  return err?.code ?? err?.cause?.code ?? null;
}

/** Exported for the proofs: the uuid gate on `user_id`, stated once. */
export function fitsUuidColumn(id: string | null | undefined): boolean {
  return typeof id === "string" && UUID_RE.test(id);
}

/**
 * THE ONE ATTRIBUTION EXPRESSION (§18 rule 1). Every reader that asks "whose spend is this row?"
 * calls this and never re-types the COALESCE, because a second copy is how one surface starts
 * attributing a pre-310 row and another stops seeing it.
 *
 * §13 — the fallback is EXPLICIT and said out loud: a row written BEFORE migration 310 carries no
 * `actor_id` at all, and its `user_id` (a uuid, cast to text so a non-uuid probe can never raise
 * `22P02` here either) is the only attribution it ever had. Nothing was backfilled, so the absence
 * stays an absence; a row with NEITHER is honestly unattributed and matches no actor.
 */
export function aiCostActorMatchesSql(actorId: string): SQL {
  return sql`COALESCE(actor_id, user_id::text) = ${actorId}`;
}

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
  /**
   * The ACTING user id, in whatever shape `users.id` carries. Written to `actor_id` always, and to
   * the legacy uuid `user_id` only when it parses as a uuid (see `fitsUuidColumn`).
   */
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
  // THE ONE WRITER of this table (pinned by `server/__tests__/ai-cost-attribution.db.test.ts` W5:
  // no `INSERT INTO ai_cost_tracking` exists anywhere else under `server/`). `actor_id` takes the
  // acting id as given; `user_id` takes it only when the uuid column can hold it, and otherwise
  // stays NULL rather than taking the row down with it.
  const actorId = params.userId ?? null;
  const uuidUserId = fitsUuidColumn(actorId) ? actorId : null;
  try {
    await db.execute(sql`
      INSERT INTO ai_cost_tracking (
        source_type, model_used, request_id, actor_id, user_id, cost, tokens_in, tokens_out, created_at, updated_at
      ) VALUES (
        ${params.sourceType},
        ${params.modelUsed ?? null},
        ${params.requestId ?? null},
        ${actorId},
        ${uuidUserId},
        ${params.costUsd},
        ${params.tokensIn ?? null},
        ${params.tokensOut ?? null},
        NOW(),
        NOW()
      )
    `);
  } catch (err: any) {
    // §13 — A LOST COST ROW IS NOW SAID OUT LOUD. It still never throws into the caller (a cost log
    // must not break the request it is logging), but the silence is over: the sourceType, the
    // requestId and the driver's own SQLSTATE are named, so a gap in `ai_cost_tracking` is
    // reconcilable rather than invisible. The id itself is NOT logged (it is a user identity).
    logger.warn(
      {
        sourceType: params.sourceType,
        requestId: params.requestId ?? null,
        pgCode: pgCodeOf(err),
        hasActor: actorId !== null,
        actorFitsUuidColumn: uuidUserId !== null,
        err: err?.message ?? String(err),
      },
      "[ai-cost-tracker] ai_cost_tracking insert failed — this spend is NOT recorded",
    );
  }
}

/**
 * Convenience wrapper: takes an Anthropic Message response and logs the cost.
 * Use immediately after `anthropic.messages.create()`:
 *
 *   const response = await anthropic.messages.create({...});
 *   await trackAnthropicResponse(response, { sourceType: "ai_concierge", userId });
 *
 * Returns the insert's own promise (never rejects — `trackAICost` catches and logs its own
 * failures) so a caller that AWAITS this is guaranteed the row has been attempted before it moves
 * on; a caller that treats this as a statement, as most existing callers do, is unaffected.
 */
export function trackAnthropicResponse(
  response: { usage?: { input_tokens: number; output_tokens: number }; model?: string },
  opts: { sourceType: string; userId?: string | null; requestId?: string | null }
): Promise<void> {
  if (!response.usage) return Promise.resolve();
  const cost = calculateAnthropicCost(response.usage.input_tokens, response.usage.output_tokens);
  return trackAICost({
    sourceType: opts.sourceType,
    modelUsed: response.model ?? null,
    requestId: opts.requestId ?? null,
    userId: opts.userId ?? null,
    costUsd: cost,
    tokensIn: response.usage.input_tokens,
    tokensOut: response.usage.output_tokens,
  });
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
