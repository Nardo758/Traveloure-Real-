/**
 * A supplied Optimize pin that does not resolve after payment is a failed run
 * (fix-queue row 217). It is not auto-anchor mode.
 *
 * `resolveOptimizerPinnedAnchor` returns undefined both when the traveler sent
 * no pin and when a pin was sent but the catalog or coordinates did not resolve.
 * Only the first of those is auto-anchor. The second is this module: the
 * comparison is marked failed through the same outcome writer a model failure
 * uses, which refunds a paid run that stored no optimized version. No new
 * traveler sentence — the comparison page already renders `status: "failed"`.
 */
import { sql, eq } from "drizzle-orm";
import { db } from "../db";
import { itineraryComparisons } from "@shared/schema";
import { logger } from "../infrastructure/logger";
import { parsePinnedAnchorInput } from "./anchor-candidates-map";
import { finishComparisonGeneration } from "./itinerary-generation-outcome.service";
import { refundFailedPaidOptimizerRun } from "./optimizer-run-refund.service";

export function paidPinFellBack(rawPin: unknown, resolved: unknown): boolean {
  if (!parsePinnedAnchorInput(rawPin)) return false;
  return resolved == null;
}

/**
 * Persist the failure and refund a paid run. Never throws past the caller:
 * a record that throws is forced to `failed` so the paid work is not left
 * `generating` with no signal.
 */
export async function recordUnresolvedPaidPin(comparisonId: string): Promise<Record<string, unknown>> {
  logger.warn(
    { comparisonId },
    "[optimizer-pin] pin unresolved after payment; failing the run instead of auto-anchoring",
  );
  try {
    const attemptStartedAt = new Date();
    const [stamped] = await db
      .update(itineraryComparisons)
      .set({
        status: "generating",
        updatedAt: sql`GREATEST(${attemptStartedAt.toISOString()}::timestamp,
          COALESCE(${itineraryComparisons.updatedAt}, '-infinity'::timestamp) + INTERVAL '1 millisecond')`,
      })
      .where(eq(itineraryComparisons.id, comparisonId))
      .returning({ updatedAt: itineraryComparisons.updatedAt });
    if (stamped?.updatedAt) {
      await finishComparisonGeneration({
        comparisonId,
        startedAt: stamped.updatedAt,
        outcome: "failed",
      });
    }
  } catch (err) {
    logger.error(
      { comparisonId, err: (err as Error)?.message },
      "[optimizer-pin] failure record threw; forcing failed",
    );
  }

  const [row] = await db
    .select()
    .from(itineraryComparisons)
    .where(eq(itineraryComparisons.id, comparisonId));
  if (!row || row.status !== "failed") {
    await db
      .update(itineraryComparisons)
      .set({ status: "failed", updatedAt: new Date() })
      .where(eq(itineraryComparisons.id, comparisonId));
    try {
      await refundFailedPaidOptimizerRun(comparisonId);
    } catch (err) {
      logger.error(
        { comparisonId, err: (err as Error)?.message },
        "[optimizer-pin] refund after forced fail threw",
      );
    }
  }

  const [fresh] = await db
    .select()
    .from(itineraryComparisons)
    .where(eq(itineraryComparisons.id, comparisonId));
  return { ...(fresh ?? { id: comparisonId }), status: "failed" };
}
