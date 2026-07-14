/**
 * Earnings release scheduler — escrow spine Phase 2 (docs/design/escrow-spine.md).
 *
 * Periodically flips earnings `held → releasable` once their clearance window (availableAt) has
 * passed and no dispute is open. This is the "missing transition" the ledger never performed:
 * before this, releasability was only computed at read time in the summaries. The actual money move
 * (admin payout transfer) still gates on the releasable balance and stays idempotent (§15).
 *
 * The DB update is the guard (atomic conditional UPDATE in storage.releaseMaturedEarnings), so
 * concurrent/overlapping runs are safe and idempotent — a second pass matches nothing.
 */
import { storage } from "../storage";

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // hourly — clearance windows are day-scale, so this is ample
const FIRST_RUN_DELAY_MS = 2 * 60 * 1000; // 2 min after startup, once the DB has settled

interface ReleaseStats {
  expertReleased: number;
  providerReleased: number;
  ranAt: Date;
  error?: string;
}

class EarningsReleaseSchedulerService {
  private timer: NodeJS.Timeout | null = null;
  private lastStats: ReleaseStats | null = null;

  start(): void {
    if (this.timer) {
      console.log("[EarningsRelease] Scheduler already running");
      return;
    }
    console.log("[EarningsRelease] Starting earnings release scheduler");
    setTimeout(() => { void this.runRelease(); }, FIRST_RUN_DELAY_MS);
    this.timer = setInterval(() => { void this.runRelease(); }, CHECK_INTERVAL_MS);
    console.log(`[EarningsRelease] Scheduled to run every ${CHECK_INTERVAL_MS / (60 * 1000)} minutes`);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log("[EarningsRelease] Scheduler stopped");
    }
  }

  /** Run one release pass. Safe to call ad-hoc (e.g. an admin trigger). */
  async runRelease(): Promise<ReleaseStats> {
    try {
      const { expert, provider } = await storage.releaseMaturedEarnings();
      const stats: ReleaseStats = { expertReleased: expert, providerReleased: provider, ranAt: new Date() };
      if (expert > 0 || provider > 0) {
        console.log(`[EarningsRelease] Released ${expert} expert + ${provider} provider earning(s) → releasable`);
      }
      this.lastStats = stats;
      return stats;
    } catch (err: any) {
      const stats: ReleaseStats = { expertReleased: 0, providerReleased: 0, ranAt: new Date(), error: err?.message || String(err) };
      console.error("[EarningsRelease] Release pass failed:", err);
      this.lastStats = stats;
      return stats;
    }
  }

  getLastStats(): ReleaseStats | null {
    return this.lastStats;
  }
}

export const earningsReleaseScheduler = new EarningsReleaseSchedulerService();
