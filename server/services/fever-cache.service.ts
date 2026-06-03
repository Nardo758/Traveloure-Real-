import { db } from "../db";
import { travelpayoutsCache, destinationEvents } from "@shared/schema";
import { eq, and, gt } from "drizzle-orm";
import { feverService, FeverEvent } from "./fever.service";
import { sharedCache } from "./shared-cache.service";

const CACHE_DURATION_HOURS = 24;
const CACHE_TTL_MS = CACHE_DURATION_HOURS * 60 * 60 * 1000;
const STALE_THRESHOLD_HOURS = 20;
const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 2000;
const NAMESPACE = "fever";

interface FeverCachePayload {
  events: FeverEvent[];
  refreshedAt: string;
}

class FeverCacheService {
  async getCachedEvents(cityCode: string): Promise<FeverEvent[]> {
    const payload = await sharedCache.get<FeverCachePayload>(NAMESPACE, cityCode.toUpperCase());
    return payload?.events ?? [];
  }

  async getCachedEventsByCity(cityName: string): Promise<FeverEvent[]> {
    const allCities = feverService.getSupportedCities();
    const matchingCodes = allCities
      .filter(c => c.name.toLowerCase().includes(cityName.toLowerCase()))
      .map(c => c.code.toUpperCase());

    const results: FeverEvent[] = [];
    for (const code of matchingCodes) {
      const payload = await sharedCache.get<FeverCachePayload>(NAMESPACE, code);
      if (payload?.events) results.push(...payload.events);
    }
    return results;
  }

  async getCachedEventById(eventId: string): Promise<FeverEvent | null> {
    const allCities = feverService.getSupportedCities();
    for (const city of allCities) {
      const payload = await sharedCache.get<FeverCachePayload>(NAMESPACE, city.code.toUpperCase());
      if (payload?.events) {
        const match = payload.events.find(e => e.id === eventId);
        if (match) return match;
      }
    }
    return null;
  }

  async isCacheStale(cityCode: string): Promise<boolean> {
    const payload = await sharedCache.get<FeverCachePayload>(NAMESPACE, cityCode.toUpperCase());
    if (!payload) return true;
    const staleThreshold = new Date();
    staleThreshold.setHours(staleThreshold.getHours() - STALE_THRESHOLD_HOURS);
    return new Date(payload.refreshedAt) < staleThreshold;
  }

  async refreshCityCache(cityCode: string): Promise<{ refreshed: number; errors: string[] }> {
    const result = { refreshed: 0, errors: [] as string[] };

    try {
      console.log(`[FeverCache] Refreshing events for city: ${cityCode}`);

      const response = await feverService.searchEvents({ city: cityCode, limit: 100 });

      if (!response || !response.events || response.events.length === 0) {
        console.log(`[FeverCache] No events found for ${cityCode}`);
        return result;
      }

      const normalizedCityCode = cityCode.toUpperCase();
      const payload: FeverCachePayload = {
        events: response.events,
        refreshedAt: new Date().toISOString(),
      };
      await sharedCache.set<FeverCachePayload>(NAMESPACE, normalizedCityCode, payload, CACHE_TTL_MS);
      result.refreshed = response.events.length;

      // Also write each event into the canonical destination_events table
      for (const event of response.events) {
        try {
          await this.upsertFeverEventToCanonical(event);
        } catch (err: any) {
          result.errors.push(`Failed canonical upsert for event ${event.id}: ${err.message}`);
        }
      }

      console.log(`[FeverCache] Cached ${result.refreshed} events for ${cityCode}`);
    } catch (err: any) {
      result.errors.push(`Failed to refresh ${cityCode}: ${err.message}`);
      console.error(`[FeverCache] Error refreshing ${cityCode}:`, err.message);
    }

    return result;
  }

  async refreshAllCities(): Promise<{ totalRefreshed: number; errors: string[] }> {
    const cities = feverService.getSupportedCities();
    const result = { totalRefreshed: 0, errors: [] as string[] };

    for (let i = 0; i < cities.length; i += BATCH_SIZE) {
      const batch = cities.slice(i, i + BATCH_SIZE);

      for (const city of batch) {
        const isStale = await this.isCacheStale(city.code);
        if (isStale) {
          const cityResult = await this.refreshCityCache(city.code);
          result.totalRefreshed += cityResult.refreshed;
          result.errors.push(...cityResult.errors);
        }
      }

      if (i + BATCH_SIZE < cities.length) {
        await this.delay(BATCH_DELAY_MS);
      }
    }

    return result;
  }

  async getEventsOrRefresh(cityCode: string): Promise<FeverEvent[]> {
    const isStale = await this.isCacheStale(cityCode);
    if (isStale) {
      await this.refreshCityCache(cityCode);
    }
    return this.getCachedEvents(cityCode);
  }

  async getCacheStatus(): Promise<{
    totalCachedEvents: number;
    citiesWithCache: string[];
    oldestCache: Date | null;
    newestCache: Date | null;
  }> {
    const now = new Date();
    const prefix = `${NAMESPACE}::`;
    const rows = await db
      .select()
      .from(travelpayoutsCache)
      .where(
        and(
          eq(travelpayoutsCache.brand, NAMESPACE),
          gt(travelpayoutsCache.expiresAt, now)
        )
      );

    let totalCachedEvents = 0;
    const citiesWithCache: string[] = [];
    let oldestCache: Date | null = null;
    let newestCache: Date | null = null;

    for (const row of rows) {
      const payload = row.data as FeverCachePayload | null;
      const events = payload?.events ?? [];
      totalCachedEvents += events.length;

      const cityCode = row.cacheKey.startsWith(prefix)
        ? row.cacheKey.slice(prefix.length)
        : row.cacheKey;
      citiesWithCache.push(cityCode);

      const refreshedAt = payload?.refreshedAt ? new Date(payload.refreshedAt) : null;
      if (refreshedAt) {
        if (!oldestCache || refreshedAt < oldestCache) oldestCache = refreshedAt;
        if (!newestCache || refreshedAt > newestCache) newestCache = refreshedAt;
      }
    }

    return { totalCachedEvents, citiesWithCache, oldestCache, newestCache };
  }

  async cleanupExpiredCache(): Promise<number> {
    return sharedCache.flushExpired(NAMESPACE);
  }

  private mapFeverCategoryToEventType(category: string): string {
    const map: Record<string, string> = {
      concerts: "concert",
      music: "concert",
      festivals: "festival",
      art: "cultural",
      arts: "cultural",
      exhibitions: "cultural",
      dance: "cultural",
      sports: "sporting",
      comedy: "entertainment",
      theater: "entertainment",
      theatre: "entertainment",
      food: "food",
      nightlife: "nightlife",
      family: "family",
      wellness: "wellness",
      film: "entertainment",
      cinema: "entertainment",
    };
    return map[category?.toLowerCase()] || "other";
  }

  private async upsertFeverEventToCanonical(event: FeverEvent): Promise<void> {
    if (!event.dates?.startDate) return;

    const specificDate = event.dates.startDate.split("T")[0];

    const existing = await db
      .select({ id: destinationEvents.id })
      .from(destinationEvents)
      .where(
        and(
          eq(destinationEvents.sourceType, "fever"),
          eq(destinationEvents.sourceId, event.id)
        )
      )
      .limit(1);

    if (existing.length > 0) return;

    try {
      await db.insert(destinationEvents).values({
        title: event.title,
        city: event.city,
        country: event.country,
        description: event.description || event.shortDescription || null,
        eventType: this.mapFeverCategoryToEventType(event.category),
        specificDate,
        isRecurring: false,
        sourceType: "fever",
        sourceId: event.id,
        status: "approved",
        metadata: {
          imageUrl: event.imageUrl || null,
          thumbnailUrl: event.thumbnailUrl || null,
          bookingUrl: event.bookingUrl || null,
          affiliateUrl: event.affiliateUrl || null,
          minPrice: event.pricing?.minPrice ?? null,
          maxPrice: event.pricing?.maxPrice ?? null,
          isFree: event.isFree,
          venueName: event.venue?.name || null,
          venueAddress: event.venue?.address || null,
          rating: event.rating ?? null,
          tags: event.tags || [],
          provider: "fever",
        },
      });
    } catch (err: any) {
      console.warn(`[FeverCache] Skipping canonical upsert for event ${event.id}: ${err.message}`);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const feverCacheService = new FeverCacheService();
