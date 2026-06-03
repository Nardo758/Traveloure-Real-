import { travelPulseService } from "./travelpulse.service";
import { serviceRecommendationEngine } from "./recommendation.service";

const DAILY_REFRESH_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
const INITIAL_DELAY = 5 * 60 * 1000; // 5 minutes after server start
const PER_CITY_RATE_LIMIT_MS = 2000;

let schedulerTimer: NodeJS.Timeout | null = null;
let isRunning = false;

export interface DailyRefreshResult {
  refreshed: number;
  errors: number;
  demandSignalsGenerated: number;
  demandSignalErrors: number;
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
      return { refreshed: 0, errors: 0, demandSignalsGenerated: 0, demandSignalErrors: 0 };
    }

    isRunning = true;
    this.lastRunAt = new Date();
    this.nextRunAt = new Date(Date.now() + DAILY_REFRESH_INTERVAL);

    console.log(`[TravelPulse Scheduler] Starting daily refresh at ${this.lastRunAt.toISOString()}`);
    console.log(`[TravelPulse Scheduler] Next run scheduled at: ${this.nextRunAt.toISOString()}`);

    let refreshed = 0;
    let errors = 0;
    let demandSignalsGenerated = 0;
    let demandSignalErrors = 0;

    try {
      // Orchestrator: per-city AI refresh + demand-signal regeneration.
      // Per-city try/catch so one failing city doesn't kill the whole cycle.
      const staleCities = await travelPulseService.getCitiesNeedingRefresh();
      const batch = staleCities.slice(0, 10); // cost-control cap, mirrors prior behaviour

      for (const city of batch) {
        const cityStartedAt = Date.now();
        let aiOk = false;

        try {
          const aiResult = await travelPulseService.updateCityWithAI(city.cityName, city.country);
          if (aiResult.success) {
            refreshed++;
            aiOk = true;
          } else {
            errors++;
            console.error(
              `[TravelPulse Scheduler] AI refresh failed for ${city.cityName}: ${aiResult.error}`,
            );
          }
        } catch (err: any) {
          errors++;
          console.error(
            `[TravelPulse Scheduler] AI refresh threw for ${city.cityName}:`,
            err?.message ?? err,
          );
        }

        // Demand signals are appended per the v2 spec — refresh per city even if AI failed,
        // so the recommendation surface stays current independent of AI cadence.
        try {
          const generated = await serviceRecommendationEngine.refreshDemandSignalsForCity(
            city.cityName,
          );
          demandSignalsGenerated += generated;
        } catch (err: any) {
          demandSignalErrors++;
          console.error(
            `[TravelPulse Scheduler] Demand-signal refresh failed for ${city.cityName}:`,
            err?.message ?? err,
          );
        }

        const elapsedMs = Date.now() - cityStartedAt;
        console.log(
          `[TravelPulse Scheduler] ${city.cityName}: ai=${aiOk ? "ok" : "fail"} elapsed=${elapsedMs}ms`,
        );

        // Rate limit between cities (matches the prior 2s spacing).
        await new Promise((resolve) => setTimeout(resolve, PER_CITY_RATE_LIMIT_MS));
      }

      // Update feedback loop observability stats
      this.feedbackLoop.lastRunAt = new Date();
      this.feedbackLoop.totalSignalsProcessed += demandSignalsGenerated;
      this.feedbackLoop.totalRunCount += 1;
      this.feedbackLoop.citiesProcessed += batch.length;

      console.log(
        `[TravelPulse Scheduler] Daily refresh complete: ${refreshed} AI updated, ${errors} AI errors, ${demandSignalsGenerated} demand signals generated, ${demandSignalErrors} demand-signal errors`,
      );
      console.log(
        `[TravelPulse Scheduler] Feedback loop stats — last run: ${this.feedbackLoop.lastRunAt.toISOString()}, total signals processed: ${this.feedbackLoop.totalSignalsProcessed}, total cycles: ${this.feedbackLoop.totalRunCount}, cities processed (lifetime): ${this.feedbackLoop.citiesProcessed}`,
      );
      return { refreshed, errors, demandSignalsGenerated, demandSignalErrors };
    } catch (error: any) {
      console.error("[TravelPulse Scheduler] Error during daily refresh:", error.message);
      return { refreshed, errors: errors + 1, demandSignalsGenerated, demandSignalErrors };
    } finally {
      isRunning = false;
    }
  }

  // Manual trigger for testing or admin use
  async triggerManualRefresh(
    cityName?: string,
    country?: string,
  ): Promise<{ success: boolean; message: string; data?: any }> {
    if (cityName && country) {
      // Refresh specific city
      console.log(`[TravelPulse Scheduler] Manual refresh triggered for ${cityName}, ${country}`);
      const result = await travelPulseService.updateCityWithAI(cityName, country);
      let demandSignalsGenerated = 0;
      try {
        demandSignalsGenerated = await serviceRecommendationEngine.refreshDemandSignalsForCity(cityName);
      } catch (err: any) {
        console.error(
          `[TravelPulse Scheduler] Manual demand-signal refresh failed for ${cityName}:`,
          err?.message ?? err,
        );
      }
      return {
        success: result.success,
        message: result.success
          ? `Successfully updated ${cityName} with AI intelligence (${demandSignalsGenerated} demand signals)`
          : `Failed to update ${cityName}: ${result.error}`,
        data: { city: result.city, demandSignalsGenerated },
      };
    } else {
      // Refresh all stale cities
      console.log("[TravelPulse Scheduler] Manual refresh triggered for all stale cities");
      const result = await this.runDailyRefresh();
      return {
        success: result.errors === 0,
        message: `Refreshed ${result.refreshed} cities (${result.errors} errors); generated ${result.demandSignalsGenerated} demand signals (${result.demandSignalErrors} errors)`,
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
