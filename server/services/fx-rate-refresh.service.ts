/**
 * FX Rate Refresh Scheduler (migration 217)
 *
 * Refreshes the fx_rates table daily from the Frankfurter API (the same free
 * source /api/exchange-rates already fetches live). The endpoint's fallback
 * path reads fx_rates instead of a hardcoded literal, so keeping this table
 * fresh means a live-fetch outage serves at-most-a-day-old rates rather than
 * rates baked into the binary at deploy time.
 *
 * Failure posture: fetch errors are logged and the last known DB rows keep
 * serving — never a crash, never a silent overwrite with bad data.
 *
 * Restart-safety: on startup, if the newest fx_rates row is younger than the
 * refresh interval, the first run is delayed by the remainder, so restart
 * loops don't hammer the API.
 */

import { db } from "../db";
import { fxRates } from "@shared/schema";
import { desc } from "drizzle-orm";
import { storage } from "../storage";

const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000; // daily
// Full set of currencies the budget converter supports. Must stay in sync with the
// fx_rates seed rows in migrations 217 and 220.
const FX_CURRENCIES = ["EUR", "GBP", "JPY", "AUD", "SGD", "CAD", "CHF", "CNY", "INR", "MXN", "BRL", "THB"];

class FxRateRefreshService {
  private timer: NodeJS.Timeout | null = null;

  start(): void {
    if (this.timer) return;
    this.scheduleFirstRun();
    console.log("[FxRateRefresh] Scheduler started — refreshes fx_rates daily");
  }

  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private async scheduleFirstRun(): Promise<void> {
    let initialDelayMs = 0;
    try {
      const [newest] = await db
        .select({ updatedAt: fxRates.updatedAt })
        .from(fxRates)
        .orderBy(desc(fxRates.updatedAt))
        .limit(1);
      if (newest?.updatedAt) {
        const elapsed = Date.now() - new Date(newest.updatedAt).getTime();
        if (elapsed < REFRESH_INTERVAL_MS) initialDelayMs = REFRESH_INTERVAL_MS - elapsed;
      }
    } catch (err) {
      console.error("[FxRateRefresh] Failed to read last refresh time; running soon:", err);
    }
    this.timer = setTimeout(() => this.runAndReschedule(), initialDelayMs);
  }

  private async runAndReschedule(): Promise<void> {
    await this.refreshOnce();
    this.timer = setTimeout(() => this.runAndReschedule(), REFRESH_INTERVAL_MS);
  }

  /** Fetch latest USD-based rates and upsert into fx_rates. Exposed for manual/test use. */
  async refreshOnce(): Promise<{ upserted: number } | { error: string }> {
    try {
      const resp = await fetch(
        `https://api.frankfurter.app/latest?from=USD&to=${FX_CURRENCIES.join(",")}`,
      );
      if (!resp.ok) throw new Error(`Frankfurter API error: ${resp.status}`);
      const data = (await resp.json()) as { rates?: Record<string, number> };
      if (!data.rates || Object.keys(data.rates).length === 0) {
        throw new Error("Frankfurter API returned no rates");
      }
      const upserted = await storage.upsertFxRates(data.rates);
      console.log(`[FxRateRefresh] Upserted ${upserted} FX rates`);
      return { upserted };
    } catch (err: any) {
      // Keep serving the last known DB rows — log and move on.
      console.error("[FxRateRefresh] Refresh failed; last known rates remain in effect:", err?.message ?? err);
      return { error: String(err?.message ?? err) };
    }
  }
}

export const fxRateRefreshScheduler = new FxRateRefreshService();
