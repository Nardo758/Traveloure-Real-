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
 * `optimizationPaymentId`. If that run stored an optimized version, regenerate may still reuse
 * the payment inside the recorded-payment window. If it stored none, the outcome writer refunds
 * the PaymentIntent and that payment does not authorize another run. The same pass re-drives a
 * refund claim whose Stripe call did not finish, and claims a recent paid empty run whose
 * process died before the claim was written.
 *
 * STALENESS THRESHOLD (5 minutes): the generation-outcome email contract treats an attempt
 * exceeding five minutes as failed. A live attempt owns a deadline timer; this sweep recovers
 * attempts interrupted by process shutdown. Network work may finish later, but cannot publish
 * a contradictory ready outcome.
 *
 * The DB update is the guard (atomic conditional UPDATE in storage.sweepStaleGeneratingComparisons,
 * WHERE status='generating' AND updatedAt=attemptStartedAt — §15), so concurrent/overlapping
 * runs, late workers, and timers from an earlier attempt cannot overwrite a terminal/newer
 * attempt. Status and outbox notice commit together through the generation-outcome service.
 *
 * Follows the same start()/stop()/runX() shape as the other startup schedulers
 * (earnings-release-scheduler.service.ts, trip-card-handover-scheduler.service.ts).
 */
import { storage } from "../storage";
import { logger } from "../infrastructure/logger";
import { runBackgroundJob } from "./background-job-runner";
import { jitteredStartupDelay } from "./startup-delay";

const CHECK_INTERVAL_MS = 60 * 1000; // recovery after restart; live attempts also own deadline timers
const FIRST_RUN_DELAY_MS = 90 * 1000; // shortly after startup, once the DB has settled
const STALE_THRESHOLD_MS = 5 * 60 * 1000; // attempts exceeding five minutes are failed

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
    setTimeout(() => {
      void runBackgroundJob("itinerary-generation-sweep", () => this.runSweep()).catch((err) =>
        logger.error({ err }, "[ItineraryGenerationSweep] scheduled pass failed"),
      );
    }, jitteredStartupDelay(FIRST_RUN_DELAY_MS));
    this.timer = setInterval(() => {
      void runBackgroundJob("itinerary-generation-sweep", () => this.runSweep()).catch((err) =>
        logger.error({ err }, "[ItineraryGenerationSweep] scheduled pass failed"),
      );
    }, CHECK_INTERVAL_MS);
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
      const { retryPendingOptimizerRefunds, refundRecentUnclaimedPaidFailures, OPTIMIZER_REFUND_RETRY_WINDOW_MS } =
        await import("./optimizer-run-refund.service");
      await retryPendingOptimizerRefunds();
      await refundRecentUnclaimedPaidFailures(new Date(Date.now() - OPTIMIZER_REFUND_RETRY_WINDOW_MS));
      const stats: SweepStats = { swept: swept.length, ranAt: new Date() };
      if (swept.length > 0) {
        // The outbox metadata records the timeout reason alongside this operational log.
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
