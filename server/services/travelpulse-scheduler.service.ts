import { travelPulseService } from "./travelpulse.service";

const DAILY_REFRESH_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
const INITIAL_DELAY = 5 * 60 * 1000; // 5 minutes after server start

let schedulerTimer: NodeJS.Timeout | null = null;
let isRunning = false;

export class TravelPulseScheduler {
  private lastRunAt: Date | null = null;
  private nextRunAt: Date | null = null;

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

  async runDailyRefresh(): Promise<{ refreshed: number; errors: number }> {
    if (isRunning) {
      console.log("[TravelPulse Scheduler] Refresh already in progress, skipping...");
      return { refreshed: 0, errors: 0 };
    }

    isRunning = true;
    this.lastRunAt = new Date();
    this.nextRunAt = new Date(Date.now() + DAILY_REFRESH_INTERVAL);
    
    console.log(`[TravelPulse Scheduler] Starting daily AI refresh at ${this.lastRunAt.toISOString()}`);
    console.log(`[TravelPulse Scheduler] Next run scheduled at: ${this.nextRunAt.toISOString()}`);

    try {
      const result = await travelPulseService.refreshStaleAICities();
      console.log(`[TravelPulse Scheduler] Daily refresh complete: ${result.refreshed} cities updated, ${result.errors} errors`);
      return result;
    } catch (error: any) {
      console.error("[TravelPulse Scheduler] Error during daily refresh:", error.message);
      return { refreshed: 0, errors: 1 };
    } finally {
      isRunning = false;
    }
  }

  // Manual trigger for testing or admin use
  async triggerManualRefresh(cityName?: string, country?: string): Promise<{ success: boolean; message: string; data?: any }> {
    if (cityName && country) {
      // Refresh specific city
      console.log(`[TravelPulse Scheduler] Manual refresh triggered for ${cityName}, ${country}`);
      const result = await travelPulseService.updateCityWithAI(cityName, country);
      return {
        success: result.success,
        message: result.success 
          ? `Successfully updated ${cityName} with AI intelligence` 
          : `Failed to update ${cityName}: ${result.error}`,
        data: result.city,
      };
    } else {
      // Refresh all stale cities
      console.log("[TravelPulse Scheduler] Manual refresh triggered for all stale cities");
      const result = await this.runDailyRefresh();
      return {
        success: result.errors === 0,
        message: `Refreshed ${result.refreshed} cities with ${result.errors} errors`,
        data: result,
      };
    }
  }

  getStatus(): { isRunning: boolean; lastRunAt: Date | null; nextRunAt: Date | null } {
    return {
      isRunning,
      lastRunAt: this.lastRunAt,
      nextRunAt: this.nextRunAt,
    };
  }
}

export const travelPulseScheduler = new TravelPulseScheduler();
