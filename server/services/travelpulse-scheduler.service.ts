import { travelPulseService } from "./travelpulse.service";
import { serviceRecommendationEngine } from "./recommendation.service";
import { refreshDestinationTrends } from "./destination-trends.service";
import { OPERATING_MARKETS } from "./trend-engine/operating-markets";

// Phase 2.3 — GROK SCORING REMOVED.
// updateCityWithAI is no longer called from the daily scheduler.
// crowdLevel and trend/pulse scores are static (option b) until the Phase 4 resolver takes over.
// Reason: R2 (Grok not a scoring source), R7 (no AI-fabricated history), scope limited to 8 markets.
// HUMAN READ REQUIRED before this file is merged to main.

const DAILY_REFRESH_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
const INITIAL_DELAY = 5 * 60 * 1000; // 5 minutes after server start
const PER_CITY_RATE_LIMIT_MS = 1000; // reduced: no AI call per city, demand-only

let schedulerTimer: NodeJS.Timeout | null = null;
let isRunning = false;

export interface DailyRefreshResult {
  // Phase 2.3: refreshed/errors are always 0 — Grok scoring removed (R2/R7).
  // Fields kept for interface backward-compatibility with callers.
  refreshed: number;
  errors: number;
  demandSignalsGenerated: number;
  demandSignalErrors: number;
  marketCount: number; // Phase 2.3: always = OPERATING_MARKETS.length
}

export interface FeedbackLoopStats {
  lastRunAt: Date | null;
  totalSignalsProcessed: number;
  totalRunCount: number;
  citiesProcessed: number;
}

export class TravelPulseScheduler {
  private lastRunAt: Date | null = null;
  private nextRunAt: Date | null = null;
  private feedbackLoop: FeedbackLoopStats = {
    lastRunAt: null,
    totalSignalsProcessed: 0,
    totalRunCount: 0,
    citiesProcessed: 0,
  };

  async start(): Promise<void> {
    if (schedulerTimer) {
      console.log("[TravelPulse Scheduler] Already running");
      return;
    }

    console.log("[TravelPulse Scheduler] Starting daily AI intelligence refresh scheduler");

    // Schedule first run after initial delay
    this.nextRunAt = new Date(Date.now() + INITIAL_DELAY);
    console.log(`[TravelPulse Scheduler] First run scheduled at: ${this.nextRunAt.toISOString()}`);

    // Run once after initial delay
    setTimeout(async () => {
      await this.runDailyRefresh();

      // Then schedule to run every 24 hours
      schedulerTimer = setInterval(async () => {
        await this.runDailyRefresh();
      }, DAILY_REFRESH_INTERVAL);
    }, INITIAL_DELAY);
  }

  async stop(): Promise<void> {
    if (schedulerTimer) {
      clearInterval(schedulerTimer);
      schedulerTimer = null;
      console.log("[TravelPulse Scheduler] Stopped");
    }
  }

  async runDailyRefresh(): Promise<DailyRefreshResult> {
    if (isRunning) {
      console.log("[TravelPulse Scheduler] Refresh already in progress, skipping...");
      return { refreshed: 0, errors: 0, demandSignalsGenerated: 0, demandSignalErrors: 0, marketCount: 0 };
    }

    isRunning = true;
    this.lastRunAt = new Date();
    this.nextRunAt = new Date(Date.now() + DAILY_REFRESH_INTERVAL);

    console.log(`[TravelPulse Scheduler] Starting daily refresh at ${this.lastRunAt.toISOString()}`);
    console.log(`[TravelPulse Scheduler] Next run scheduled at: ${this.nextRunAt.toISOString()}`);

    // Phase 2.3: AI scoring removed; 0 placeholders kept for interface compat.
    const refreshed = 0;
    const errors = 0;
    let demandSignalsGenerated = 0;
    let demandSignalErrors = 0;

    try {
      // Phase 2.3 — iterate over the 8 configured operating markets only.
      // Grok/LLM scoring is NOT called here (R2, R7). crowdLevel and pulse/trend scores
      // remain static from last write until the Phase 4 resolver replaces them.
      // Demand signals are refreshed each cycle; no AI dependency.
      console.log(
        `[TravelPulse Scheduler] Phase 2.3 demand-signal cycle: ${OPERATING_MARKETS.length} markets (Grok removed)`,
      );

      for (const market of OPERATING_MARKETS) {
        const cityStartedAt = Date.now();

        // Un-starve the demand-signal generator: prime the trending cache before
        // calling refreshDemandSignalsForCity (same logic as before, AI-free).
        try {
          await travelPulseService.getTrendingDestinations(market.cityName, 20);
        } catch (err: any) {
          console.error(
            `[TravelPulse Scheduler] Trending prime failed for ${market.cityName} (continuing):`,
            err?.message ?? err,
          );
        }

        try {
          const generated = await serviceRecommendationEngine.refreshDemandSignalsForCity(
            market.cityName,
          );
          demandSignalsGenerated += generated;
        } catch (err: any) {
          demandSignalErrors++;
          console.error(
            `[TravelPulse Scheduler] Demand-signal refresh failed for ${market.cityName}:`,
            err?.message ?? err,
          );
        }

        const elapsedMs = Date.now() - cityStartedAt;
        console.log(
          `[TravelPulse Scheduler] ${market.cityName}: demand elapsed=${elapsedMs}ms`,
        );

        await new Promise((resolve) => setTimeout(resolve, PER_CITY_RATE_LIMIT_MS));
      }

      // Compute destination trends from accumulated booking/search data.
      let trendsComputed = 0;
      try {
        const trendsResult = await refreshDestinationTrends();
        trendsComputed = trendsResult.computed;
        console.log(`[TravelPulse Scheduler] Destination trends refreshed: ${trendsComputed} countries`);
      } catch (err: any) {
        console.error("[TravelPulse Scheduler] Trend computation failed:", err?.message ?? err);
      }

      // Feedback loop stats
      this.feedbackLoop.lastRunAt = new Date();
      this.feedbackLoop.totalSignalsProcessed += demandSignalsGenerated;
      this.feedbackLoop.totalRunCount += 1;
      this.feedbackLoop.citiesProcessed += OPERATING_MARKETS.length;

      console.log(
        `[TravelPulse Scheduler] Daily refresh complete (Phase 2.3): markets=${OPERATING_MARKETS.length} demand_signals=${demandSignalsGenerated} demand_errors=${demandSignalErrors} trends=${trendsComputed}`,
      );
      return { refreshed, errors, demandSignalsGenerated, demandSignalErrors, marketCount: OPERATING_MARKETS.length };
    } catch (error: any) {
      console.error("[TravelPulse Scheduler] Error during daily refresh:", error.message);
      return { refreshed, errors: errors + 1, demandSignalsGenerated, demandSignalErrors, marketCount: OPERATING_MARKETS.length };
    } finally {
      isRunning = false;
    }
  }

  // Manual trigger for testing or admin use.
  // Phase 2.3: Grok AI refresh removed — only demand signals are refreshed.
  // Admin wanting to manually run Grok for a city should call
  // travelPulseService.updateCityWithAI() directly from an admin endpoint.
  async triggerManualRefresh(
    cityName?: string,
    _country?: string,
  ): Promise<{ success: boolean; message: string; data?: any }> {
    if (cityName) {
      // Demand-signal refresh for a specific city (Phase 2.3: no AI call)
      console.log(`[TravelPulse Scheduler] Manual demand-signal refresh for ${cityName}`);
      let demandSignalsGenerated = 0;
      try {
        await travelPulseService.getTrendingDestinations(cityName, 20);
      } catch (_err) { /* best-effort trending prime */ }
      try {
        demandSignalsGenerated = await serviceRecommendationEngine.refreshDemandSignalsForCity(cityName);
      } catch (err: any) {
        return {
          success: false,
          message: `Demand-signal refresh failed for ${cityName}: ${err?.message}`,
        };
      }
      return {
        success: true,
        message: `Demand signals refreshed for ${cityName} (${demandSignalsGenerated} signals). AI scoring removed per Phase 2.3.`,
        data: { demandSignalsGenerated },
      };
    } else {
      // Full cycle across all 8 operating markets
      console.log("[TravelPulse Scheduler] Manual full-cycle refresh (8 markets, Phase 2.3)");
      const result = await this.runDailyRefresh();
      return {
        success: result.demandSignalErrors === 0,
        message: `Demand signals refreshed for ${result.marketCount} markets (${result.demandSignalErrors} errors); ${result.demandSignalsGenerated} signals generated`,
        data: result,
      };
    }
  }

  getStatus(): {
    isRunning: boolean;
    lastRunAt: Date | null;
    nextRunAt: Date | null;
    feedbackLoop: FeedbackLoopStats;
  } {
    return {
      isRunning,
      lastRunAt: this.lastRunAt,
      nextRunAt: this.nextRunAt,
      feedbackLoop: { ...this.feedbackLoop },
    };
  }
}

export const travelPulseScheduler = new TravelPulseScheduler();
