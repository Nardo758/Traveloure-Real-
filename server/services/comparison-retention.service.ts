/**
 * Optimizer-run retention — owner ruling 2026-09-06 (supersedes the adopt-finalize-conform D-4
 * "proposals stay REVISITABLE forever" residue; the sweep's F2 open question, ruled by the owner):
 *
 *   A trip keeps its NEWEST 3 optimizer runs. When a 4th authorized run is created, the oldest
 *   unapplied runs beyond the window are discarded.
 *
 * Deleting the `itinerary_comparisons` row cascades the whole run tree — variants, and through
 * them variant items / metrics / transport legs / shares / map exports / transport bookings
 * (every FK in the chain is onDelete:'cascade', shared/schema.ts:1822+).
 *
 * Two deliberate scope decisions, flagged in the introducing PR:
 *
 * 1. APPLIED runs are protected. A comparison with `selected_variant_id` set is the provenance
 *    of what the live plan IS — discarding it would orphan the apply record the slip/board
 *    reads back. Applied runs do not consume the 3-slot window.
 * 2. The sweep fires only when an AUTHORIZED run is created (canRunOptimizer === true).
 *    A `pending_payment` comparison is not a run — it is free to create, so firing retention
 *    on it would let unpaid rows evict paid runs. The window still COUNTS every unapplied row
 *    (a stale pending_payment row sitting oldest is exactly the junk the ruling wants gone).
 *
 * Trip-less comparisons (cart / experience-template flows) have no review board and are out of
 * scope — the ruling is about a plan's board.
 *
 * The regenerate path (POST /api/itinerary-comparisons/:id/generate) re-runs the SAME
 * comparison row — it creates no new row, so no retention hook is needed there.
 */
import { db } from "../db";
import { itineraryComparisons } from "../../shared/schema";
import { desc, eq, inArray, isNull, and } from "drizzle-orm";

export const OPTIMIZER_RUN_WINDOW = 3;

/**
 * Discard the oldest unapplied comparisons for `tripId` beyond the newest `keep` (default 3).
 * Returns the discarded comparison ids (empty when the window was not exceeded).
 */
export async function enforceTripComparisonRetention(
  tripId: string,
  keep: number = OPTIMIZER_RUN_WINDOW,
): Promise<string[]> {
  const rows = await db
    .select({ id: itineraryComparisons.id })
    .from(itineraryComparisons)
    .where(and(
      eq(itineraryComparisons.tripId, tripId),
      isNull(itineraryComparisons.selectedVariantId), // applied runs are protected provenance
    ))
    .orderBy(desc(itineraryComparisons.createdAt));

  const toDiscard = rows.slice(keep).map((r) => r.id);
  if (toDiscard.length > 0) {
    await db.delete(itineraryComparisons).where(inArray(itineraryComparisons.id, toDiscard));
  }
  return toDiscard;
}
