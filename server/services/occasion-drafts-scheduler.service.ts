/**
 * Occasion drafts scheduler — Plus occasions lane (ledger 2026-08-27-plus-is-delivery).
 *
 * DEFENSE-IN-DEPTH ONLY. On Autoscale the app scales to zero between requests, so an in-process
 * timer is NOT a reliable runner — the authoritative path is the idempotent internal endpoint
 * (POST /internal/run-occasion-drafts) fired by a daily external trigger (Replit Scheduled
 * Deployment / cron). This timer is a best-effort second rail while an instance is warm; because
 * runOccasionDrafts() is idempotent by the occasion_drafts ledger, the endpoint and this timer
 * firing in the same window produce exactly ONE draft per occasion cycle.
 *
 * Matches the ~17 existing in-process schedulers started in server/index.ts onServerReady().
 */
import { runOccasionDrafts, type RunOccasionDraftsResult } from "./occasion-drafts.service";

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // daily — occasion windows are day-scale
const FIRST_RUN_DELAY_MS = 110 * 60 * 1000; // ~110 min after startup, behind the heavier daily jobs

interface RunStats extends RunOccasionDraftsResult {
  ranAt: Date;
  error?: string;
}

class OccasionDraftsSchedulerService {
  private timer: NodeJS.Timeout | null = null;
  private lastStats: RunStats | null = null;

  start(): void {
    if (this.timer) {
      console.log("[OccasionDrafts] Scheduler already running");
      return;
    }
    // Tests drive runOccasionDrafts() directly; never arm the timer under NODE_ENV=test.
    if (process.env.NODE_ENV === "test") {
      console.log("[OccasionDrafts] Scheduler disabled under NODE_ENV=test");
      return;
    }
    console.log("[OccasionDrafts] Starting occasion drafts scheduler (defense-in-depth; endpoint is authoritative)");
    setTimeout(() => { void this.runOnce(); }, FIRST_RUN_DELAY_MS);
    this.timer = setInterval(() => { void this.runOnce(); }, CHECK_INTERVAL_MS);
    console.log(`[OccasionDrafts] Scheduled to run every ${CHECK_INTERVAL_MS / (60 * 60 * 1000)} hours`);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log("[OccasionDrafts] Scheduler stopped");
    }
  }

  /** Run one pass. Safe to call ad-hoc; never throws. */
  async runOnce(): Promise<RunStats> {
    try {
      const r = await runOccasionDrafts();
      const stats: RunStats = { ...r, ranAt: new Date() };
      this.lastStats = stats;
      return stats;
    } catch (err: any) {
      const stats: RunStats = {
        scanned: 0, created: 0, skippedNotDue: 0, skippedNotPlus: 0,
        skippedNoHomeCity: 0, skippedExisting: 0, errors: 0,
        ranAt: new Date(), error: err?.message || String(err),
      };
      console.error("[OccasionDrafts] Pass failed:", err);
      this.lastStats = stats;
      return stats;
    }
  }

  getLastStats(): RunStats | null {
    return this.lastStats;
  }
}

export const occasionDraftsScheduler = new OccasionDraftsSchedulerService();
