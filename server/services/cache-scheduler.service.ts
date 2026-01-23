import { db } from "../db";
import { hotelCache, activityCache, flightCache, hotelOfferCache } from "@shared/schema";
import { sql, eq, gte, lte, and, desc } from "drizzle-orm";
import { cacheService } from "./cache.service";
import { feverCacheService } from "./fever-cache.service";

// Configuration
const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const STALE_THRESHOLD_HOURS = 20; // Consider data stale after 20 hours (refresh before 24h expiry)
const BATCH_SIZE = 5; // Process items in batches to avoid overwhelming APIs
const BATCH_DELAY_MS = 2000; // Delay between batches

interface CacheRefreshStats {
  hotelsRefreshed: number;
  activitiesRefreshed: number;
  flightsRefreshed: number;
  feverEventsRefreshed: number;
  errors: string[];
  lastRefreshTime: Date;
}

class CacheSchedulerService {
  private refreshTimer: NodeJS.Timeout | null = null;
  private isRefreshing: boolean = false;
  private lastStats: CacheRefreshStats | null = null;

  // Start the background scheduler
  start(): void {
    if (this.refreshTimer) {
      console.log("[CacheScheduler] Scheduler already running");
      return;
    }

    console.log("[CacheScheduler] Starting background cache refresh scheduler");
    
    // Run initial check after 5 minutes (allow server to stabilize)
    setTimeout(() => this.checkAndRefreshStaleData(), 5 * 60 * 1000);
    
    // Schedule regular refresh checks
    this.refreshTimer = setInterval(() => {
      this.checkAndRefreshStaleData();
    }, REFRESH_INTERVAL_MS);

    console.log(`[CacheScheduler] Scheduled to run every ${REFRESH_INTERVAL_MS / (60 * 60 * 1000)} hours`);
  }

  // Stop the scheduler
  stop(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
      console.log("[CacheScheduler] Scheduler stopped");
    }
  }

  // Get the last refresh stats
  getLastStats(): CacheRefreshStats | null {
    return this.lastStats;
  }

  // Check if currently refreshing
  isCurrentlyRefreshing(): boolean {
    return this.isRefreshing;
  }

  // Manual trigger for refresh (e.g., via admin API)
  async triggerManualRefresh(): Promise<CacheRefreshStats> {
    return this.checkAndRefreshStaleData();
  }

  // Main refresh logic
  private async checkAndRefreshStaleData(): Promise<CacheRefreshStats> {
    if (this.isRefreshing) {
      console.log("[CacheScheduler] Refresh already in progress, skipping");
      return this.lastStats || this.createEmptyStats();
    }

    this.isRefreshing = true;
    console.log("[CacheScheduler] Starting cache refresh check...");

    const stats: CacheRefreshStats = this.createEmptyStats();

    try {
      // Refresh hotels
      const hotelsResult = await this.refreshStaleHotels();
      stats.hotelsRefreshed = hotelsResult.refreshed;
      stats.errors.push(...hotelsResult.errors);

      // Refresh activities
      const activitiesResult = await this.refreshStaleActivities();
      stats.activitiesRefreshed = activitiesResult.refreshed;
      stats.errors.push(...activitiesResult.errors);

      // Refresh flights (optional - flights change frequently)
      const flightsResult = await this.refreshStaleFlights();
      stats.flightsRefreshed = flightsResult.refreshed;
      stats.errors.push(...flightsResult.errors);

      // Refresh Fever events
      const feverResult = await this.refreshStaleFeverEvents();
      stats.feverEventsRefreshed = feverResult.refreshed;
      stats.errors.push(...feverResult.errors);

      // Clean up expired cache entries
      await cacheService.cleanupExpiredCache();
      await feverCacheService.cleanupExpiredCache();

      console.log(`[CacheScheduler] Refresh complete - Hotels: ${stats.hotelsRefreshed}, Activities: ${stats.activitiesRefreshed}, Flights: ${stats.flightsRefreshed}, Fever: ${stats.feverEventsRefreshed}`);
    } catch (error: any) {
      console.error("[CacheScheduler] Refresh error:", error);
      stats.errors.push(`General error: ${error.message}`);
    } finally {
      this.isRefreshing = false;
      this.lastStats = stats;
    }

    return stats;
  }

  private createEmptyStats(): CacheRefreshStats {
    return {
      hotelsRefreshed: 0,
      activitiesRefreshed: 0,
      flightsRefreshed: 0,
      feverEventsRefreshed: 0,
      errors: [],
      lastRefreshTime: new Date(),
    };
  }

  // Refresh stale Fever event data
  private async refreshStaleFeverEvents(): Promise<{ refreshed: number; errors: string[] }> {
    try {
      console.log("[CacheScheduler] Checking Fever events for refresh...");
      const result = await feverCacheService.refreshAllCities();
      console.log(`[CacheScheduler] Fever refresh complete: ${result.totalRefreshed} events refreshed`);
      return { refreshed: result.totalRefreshed, errors: result.errors };
    } catch (error: any) {
      console.error("[CacheScheduler] Fever refresh error:", error);
      return { refreshed: 0, errors: [`Fever refresh error: ${error.message}`] };
    }
  }

  // Refresh stale hotel data
  private async refreshStaleHotels(): Promise<{ refreshed: number; errors: string[] }> {
    const errors: string[] = [];
    let refreshed = 0;

    try {
      // Find unique city codes with stale data (lastUpdated is null OR older than threshold)
      const staleThreshold = new Date();
      staleThreshold.setHours(staleThreshold.getHours() - STALE_THRESHOLD_HOURS);

      // Get all unique city codes and check their freshness
      const allCityCodes = await db
        .selectDistinct({ 
          cityCode: hotelCache.cityCode,
          lastUpdated: hotelCache.lastUpdated 
        })
        .from(hotelCache);

      // Filter for stale or null lastUpdated
      const staleCityCodes = allCityCodes.filter(({ lastUpdated }) => 
        !lastUpdated || new Date(lastUpdated) < staleThreshold
      );

      console.log(`[CacheScheduler] Found ${staleCityCodes.length} city codes with stale hotel data`);

      // Process in batches
      for (let i = 0; i < staleCityCodes.length; i += BATCH_SIZE) {
        const batch = staleCityCodes.slice(i, i + BATCH_SIZE);
        
        await Promise.all(batch.map(async ({ cityCode }) => {
          try {
            // Generate future dates for refresh (next 7 days as default search)
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            const checkInDate = tomorrow.toISOString().split('T')[0];
            
            const nextWeek = new Date();
            nextWeek.setDate(nextWeek.getDate() + 8);
            const checkOutDate = nextWeek.toISOString().split('T')[0];

            // Try to get existing offers to use their date range if available
            const existingData = await db.select()
              .from(hotelOfferCache)
              .innerJoin(hotelCache, eq(hotelOfferCache.hotelCacheId, hotelCache.id))
              .where(eq(hotelCache.cityCode, cityCode))
              .orderBy(desc(hotelOfferCache.checkInDate))
              .limit(1);

            let finalCheckIn = checkInDate;
            let finalCheckOut = checkOutDate;

            if (existingData.length > 0) {
              const existingCheckIn = new Date(existingData[0].hotel_offer_cache.checkInDate);
              // Only use existing dates if they're still in the future
              if (existingCheckIn > new Date()) {
                finalCheckIn = existingData[0].hotel_offer_cache.checkInDate;
                finalCheckOut = existingData[0].hotel_offer_cache.checkOutDate;
              }
            }

            await cacheService.getHotelsWithCache({
              cityCode,
              checkInDate: finalCheckIn,
              checkOutDate: finalCheckOut,
              adults: 2,
              roomQuantity: 1,
              currency: 'USD',
            });
            refreshed++;
            console.log(`[CacheScheduler] Refreshed hotels for ${cityCode}`);
          } catch (error: any) {
            errors.push(`Hotel refresh error for ${cityCode}: ${error.message}`);
          }
        }));

        // Delay between batches
        if (i + BATCH_SIZE < staleCityCodes.length) {
          await this.delay(BATCH_DELAY_MS);
        }
      }
    } catch (error: any) {
      errors.push(`Hotel refresh general error: ${error.message}`);
    }

    return { refreshed, errors };
  }

  // Refresh stale activity data
  private async refreshStaleActivities(): Promise<{ refreshed: number; errors: string[] }> {
    const errors: string[] = [];
    let refreshed = 0;

    try {
      // Find unique destinations with stale data (lastUpdated is null OR older than threshold)
      const staleThreshold = new Date();
      staleThreshold.setHours(staleThreshold.getHours() - STALE_THRESHOLD_HOURS);

      // Get all unique destinations and check their freshness
      const allDestinations = await db
        .selectDistinct({ 
          destination: activityCache.destination,
          lastUpdated: activityCache.lastUpdated 
        })
        .from(activityCache);

      // Filter for stale or null lastUpdated
      const staleDestinations = allDestinations.filter(({ lastUpdated }) => 
        !lastUpdated || new Date(lastUpdated) < staleThreshold
      );

      console.log(`[CacheScheduler] Found ${staleDestinations.length} destinations with stale activity data`);

      // Process in batches
      for (let i = 0; i < staleDestinations.length; i += BATCH_SIZE) {
        const batch = staleDestinations.slice(i, i + BATCH_SIZE);
        
        await Promise.all(batch.map(async ({ destination }) => {
          try {
            await cacheService.getActivitiesWithCache(destination, 'USD', 20);
            refreshed++;
            console.log(`[CacheScheduler] Refreshed activities for ${destination}`);
          } catch (error: any) {
            errors.push(`Activity refresh error for ${destination}: ${error.message}`);
          }
        }));

        // Delay between batches
        if (i + BATCH_SIZE < staleDestinations.length) {
          await this.delay(BATCH_DELAY_MS);
        }
      }
    } catch (error: any) {
      errors.push(`Activity refresh general error: ${error.message}`);
    }

    return { refreshed, errors };
  }

  // Refresh stale flight data (optional - flights change very frequently)
  private async refreshStaleFlights(): Promise<{ refreshed: number; errors: string[] }> {
    const errors: string[] = [];
    let refreshed = 0;

    try {
      // Find unique flight routes with stale data (lastUpdated is null OR older than threshold)
      const staleThreshold = new Date();
      staleThreshold.setHours(staleThreshold.getHours() - STALE_THRESHOLD_HOURS);
      const todayStr = new Date().toISOString().split('T')[0];

      // Get all unique flight routes and check their freshness
      const allFlights = await db
        .selectDistinct({
          origin: flightCache.originCode,
          destination: flightCache.destinationCode,
          departureDate: flightCache.departureDate,
          returnDate: flightCache.returnDate,
          lastUpdated: flightCache.lastUpdated,
        })
        .from(flightCache)
        .where(gte(flightCache.departureDate, todayStr)); // Only future flights

      // Filter for stale or null lastUpdated
      const staleFlights = allFlights.filter(({ lastUpdated }) => 
        !lastUpdated || new Date(lastUpdated) < staleThreshold
      );

      console.log(`[CacheScheduler] Found ${staleFlights.length} flight routes with stale data`);

      // Process in batches
      for (let i = 0; i < staleFlights.length; i += BATCH_SIZE) {
        const batch = staleFlights.slice(i, i + BATCH_SIZE);
        
        await Promise.all(batch.map(async (flight) => {
          try {
            await cacheService.getFlightsWithCache({
              originLocationCode: flight.origin,
              destinationLocationCode: flight.destination,
              departureDate: flight.departureDate,
              returnDate: flight.returnDate || undefined,
              adults: 2,
              travelClass: 'ECONOMY',
              nonStop: false,
              max: 20,
            });
            refreshed++;
            console.log(`[CacheScheduler] Refreshed flights for ${flight.origin} -> ${flight.destination}`);
          } catch (error: any) {
            errors.push(`Flight refresh error for ${flight.origin}-${flight.destination}: ${error.message}`);
          }
        }));

        // Delay between batches
        if (i + BATCH_SIZE < staleFlights.length) {
          await this.delay(BATCH_DELAY_MS);
        }
      }
    } catch (error: any) {
      errors.push(`Flight refresh general error: ${error.message}`);
    }

    return { refreshed, errors };
  }

  // Utility function to delay execution
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Pre-checkout verification - refresh specific items
  async verifyAndRefreshForCheckout(items: Array<{
    type: 'hotel' | 'activity' | 'flight';
    id: string;
    params?: any;
  }>): Promise<Array<{
    id: string;
    type: string;
    verified: boolean;
    priceChanged: boolean;
    currentPrice?: number;
    cachedPrice?: number;
    error?: string;
  }>> {
    console.log(`[CacheScheduler] Pre-checkout verification for ${items.length} items`);
    
    const results = await Promise.all(items.map(async (item) => {
      try {
        if (item.type === 'hotel') {
          const hotelId = item.id.replace('hotel-', '');
          const result = await cacheService.verifyHotelAvailability(
            hotelId,
            item.params?.checkInDate,
            item.params?.checkOutDate,
            {
              adults: item.params?.adults,
              rooms: item.params?.rooms,
              currency: item.params?.currency,
            }
          );
          return {
            id: item.id,
            type: item.type,
            verified: result.available,
            priceChanged: result.priceChanged || false,
            currentPrice: result.currentPrice,
            cachedPrice: result.cachedPrice,
          };
        } else if (item.type === 'activity') {
          const productCode = item.id.replace('activity-', '');
          const result = await cacheService.verifyActivityAvailability(
            productCode,
            item.params?.travelDate
          );
          return {
            id: item.id,
            type: item.type,
            verified: result.available,
            priceChanged: result.priceChanged || false,
            currentPrice: result.currentPrice,
            cachedPrice: result.cachedPrice,
          };
        } else {
          // Flights - just verify from cache for now
          return {
            id: item.id,
            type: item.type,
            verified: true,
            priceChanged: false,
          };
        }
      } catch (error: any) {
        return {
          id: item.id,
          type: item.type,
          verified: false,
          priceChanged: false,
          error: error.message,
        };
      }
    }));

    return results;
  }

  // Get cache freshness status for UI indicators
  async getCacheFreshnessStatus(): Promise<{
    hotels: { total: number; fresh: number; stale: number; expired: number };
    activities: { total: number; fresh: number; stale: number; expired: number };
    flights: { total: number; fresh: number; stale: number; expired: number };
    lastRefresh: Date | null;
    isRefreshing: boolean;
  }> {
    const now = new Date();
    const staleThreshold = new Date();
    staleThreshold.setHours(staleThreshold.getHours() - STALE_THRESHOLD_HOURS);

    // Get hotel counts
    const allHotels = await db.select({ id: hotelCache.id, lastUpdated: hotelCache.lastUpdated, expiresAt: hotelCache.expiresAt }).from(hotelCache);
    const hotelStats = this.categorizeByFreshness(allHotels, now, staleThreshold);

    // Get activity counts
    const allActivities = await db.select({ id: activityCache.id, lastUpdated: activityCache.lastUpdated, expiresAt: activityCache.expiresAt }).from(activityCache);
    const activityStats = this.categorizeByFreshness(allActivities, now, staleThreshold);

    // Get flight counts
    const allFlights = await db.select({ id: flightCache.id, lastUpdated: flightCache.lastUpdated, expiresAt: flightCache.expiresAt }).from(flightCache);
    const flightStats = this.categorizeByFreshness(allFlights, now, staleThreshold);

    return {
      hotels: hotelStats,
      activities: activityStats,
      flights: flightStats,
      lastRefresh: this.lastStats?.lastRefreshTime || null,
      isRefreshing: this.isRefreshing,
    };
  }

  private categorizeByFreshness(items: Array<{ lastUpdated: Date | null; expiresAt: Date }>, now: Date, staleThreshold: Date): { total: number; fresh: number; stale: number; expired: number } {
    let fresh = 0, stale = 0, expired = 0;
    
    for (const item of items) {
      if (item.expiresAt < now) {
        expired++;
      } else if (item.lastUpdated && item.lastUpdated < staleThreshold) {
        stale++;
      } else {
        fresh++;
      }
    }

    return { total: items.length, fresh, stale, expired };
  }
}

export const cacheSchedulerService = new CacheSchedulerService();
