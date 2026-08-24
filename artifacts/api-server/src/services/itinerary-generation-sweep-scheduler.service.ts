/**
 * Stale paid-itinerary-generation sweep.
 *
 * Paid itinerary optimization runs as an async job AFTER `POST /api/itinerary-comparisons`
 * (and `POST /api/itinerary-comparisons/:id/generate`) responds: the comparison row is written
 * `status='generating'`, then `generateOptimizedItineraries()` (server/itinerary-optimizer.ts)
 * runs in the background and finally sets `status='generated'` (success) or `status='failed'`
 * (error). If the server restarts or crashes while a row is `generating`, that in-memory job
 * dies with it — nothing ever transitions the row, so the traveler (who already paid) is left
 * looking at an infinite spinner.
 *
 * This scheduler periodically flips orphaned `generating` rows to `failed` so the traveler sees
 * an honest failure state instead of a silent hang. A swept row still carries its
 * `optimizationPaymentId`, so `POST /api/itinerary-comparisons/:id/generate`'s regenerate-gate
 * branch (b) in server/routes.ts — "this comparison's own run was paid inside the free-rerun
 * window" — lets the traveler retry for free within 24h of the original `createdAt`, no new
 * charge. That branch keys on `optimizationPaymentId` + `createdAt`, not on `status`, so it
 * fires the same whether the row reads 'generating' or 'failed' — this sweep's real effect is
 * getting the row OUT of the perpetual 'generating' hang so the client can show a retry CTA
 * instead of polling a spinner forever.
 *
 * STALENESS THRESHOLD (15 minutes): observed normal generation completes in ~12s on small trips.
 * The job makes exactly one AI call (server/itinerary-optimizer.ts callAI(), line ~1147) with no
 * explicit request timeout configured on either the Anthropic or Grok SDK client, so a genuinely
 * hung call could in the worst case run to the SDK's own default timeout (~10 minutes). 15
 * minutes sits safely above that single-hung-call worst case plus the surrounding DB/city-intel
 * work, while still being tight enough that a traveler isn't staring at a dead spinner for hours.
 *
 * The DB update is the guard (atomic conditional UPDATE in storage.sweepStaleGeneratingComparisons,
 * WHERE status='generating' AND updatedAt < staleBefore — §15), so concurrent/overlapping runs are
 * safe and idempotent: a second pass matches nothing already flipped, and a genuinely still-alive
 * job's own (unconditional, id-keyed) success/failure write can still land after the sweep and
 * legitimately overwrite 'failed' with the real outcome — see storage.ts doc comment.
 *
 * Follows the same start()/stop()/runX() shape as the other startup schedulers
 * (earnings-release-scheduler.service.ts, trip-card-handover-scheduler.service.ts).
 */
import { storage } from "../storage";
import { logger } from "../infrastructure/logger";

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // every 5 min — tight enough that a stuck spinner clears quickly
const FIRST_RUN_DELAY_MS = 90 * 1000; // shortly after startup, once the DB has settled
const STALE_THRESHOLD_MS = 15 * 60 * 1000; // see file header for the ~12s-observed / no-SDK-timeout justification

interface SweepStats {
  swept: number;
  ranAt: Date;
  error?: string;
}

class ItineraryGenerationSweepSchedulerService {
  private timer: NodeJS.Timeout | null = null;
  private lastStats: SweepStats | null = null;

  start(): void {
    if (this.timer) {
      console.log("[ItineraryGenerationSweep] Scheduler already running");
      return;
    }
    console.log("[ItineraryGenerationSweep] Starting stale paid-generation sweep scheduler");
    setTimeout(() => { void this.runSweep(); }, FIRST_RUN_DELAY_MS);
    this.timer = setInterval(() => { void this.runSweep(); }, CHECK_INTERVAL_MS);
    console.log(`[ItineraryGenerationSweep] Scheduled to run every ${CHECK_INTERVAL_MS / (60 * 1000)} minutes`);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log("[ItineraryGenerationSweep] Scheduler stopped");
    }
  }

  /** Run one sweep pass. Safe to call ad-hoc (e.g. an admin trigger or a test). */
  async runSweep(): Promise<SweepStats> {
    try {
      const staleBefore = new Date(Date.now() - STALE_THRESHOLD_MS);
      const swept = await storage.sweepStaleGeneratingComparisons(staleBefore);
      const stats: SweepStats = { swept: swept.length, ranAt: new Date() };
      if (swept.length > 0) {
        // §13: log the honest reason server-side. The comparisons table has no error/reason
        // column, so this is NOT persisted to the row — logging is the durable record.
        for (const row of swept) {
          logger.warn(
            { comparisonId: row.id, userId: row.userId, staleBefore: staleBefore.toISOString() },
            "[ItineraryGenerationSweep] generation interrupted by server restart — marked failed"
          );
        }
        console.log(`[ItineraryGenerationSweep] Swept ${swept.length} orphaned 'generating' comparison(s) to 'failed'`);
      }
      this.lastStats = stats;
      return stats;
    } catch (err: any) {
      const stats: SweepStats = { swept: 0, ranAt: new Date(), error: err?.message || String(err) };
      console.error("[ItineraryGenerationSweep] Sweep pass failed:", err);
      this.lastStats = stats;
      return stats;
    }
  }

  getLastStats(): SweepStats | null {
    return this.lastStats;
  }
}

export const itineraryGenerationSweepScheduler = new ItineraryGenerationSweepSchedulerService();
