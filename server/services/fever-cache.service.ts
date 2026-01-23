import { db } from "../db";
import { feverEventCache } from "@shared/schema";
import { eq, and, gte, lte, ilike, or, sql, desc } from "drizzle-orm";
import { feverService, FeverEvent } from "./fever.service";

const CACHE_DURATION_HOURS = 24;
const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 2000;

class FeverCacheService {
  private getExpiryDate(): Date {
    const expiry = new Date();
    expiry.setHours(expiry.getHours() + CACHE_DURATION_HOURS);
    return expiry;
  }

  async getCachedEvents(cityCode: string): Promise<FeverEvent[]> {
    const now = new Date();
    const cached = await db.select()
      .from(feverEventCache)
      .where(and(
        eq(feverEventCache.cityCode, cityCode.toUpperCase()),
        gte(feverEventCache.expiresAt, now)
      ))
      .orderBy(desc(feverEventCache.startDate));

    return cached.map(this.cacheToEvent);
  }

  async getCachedEventsByCity(cityName: string): Promise<FeverEvent[]> {
    const now = new Date();
    const cached = await db.select()
      .from(feverEventCache)
      .where(and(
        ilike(feverEventCache.city, `%${cityName}%`),
        gte(feverEventCache.expiresAt, now)
      ))
      .orderBy(desc(feverEventCache.startDate));

    return cached.map(this.cacheToEvent);
  }

  async getCachedEventById(eventId: string): Promise<FeverEvent | null> {
    const cached = await db.select()
      .from(feverEventCache)
      .where(eq(feverEventCache.eventId, eventId))
      .limit(1);

    return cached.length > 0 ? this.cacheToEvent(cached[0]) : null;
  }

  async isCacheStale(cityCode: string): Promise<boolean> {
    const now = new Date();
    const staleThreshold = new Date();
    staleThreshold.setHours(staleThreshold.getHours() - 20);

    const cached = await db.select({ count: sql<number>`count(*)` })
      .from(feverEventCache)
      .where(and(
        eq(feverEventCache.cityCode, cityCode.toUpperCase()),
        gte(feverEventCache.expiresAt, now),
        gte(feverEventCache.lastUpdated, staleThreshold)
      ));

    return !cached[0] || Number(cached[0].count) === 0;
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
      
      await db.delete(feverEventCache)
        .where(eq(feverEventCache.cityCode, normalizedCityCode));

      const expiresAt = this.getExpiryDate();
      const events = response.events;

      for (const event of events) {
        try {
          await db.insert(feverEventCache).values({
            eventId: event.id,
            title: event.title,
            slug: event.slug,
            description: event.description || null,
            shortDescription: event.shortDescription || null,
            imageUrl: event.imageUrl || null,
            thumbnailUrl: event.thumbnailUrl || null,
            category: event.category,
            subcategory: event.subcategory || null,
            city: event.city,
            cityCode: normalizedCityCode,
            country: event.country,
            countryCode: null,
            venueName: event.venue?.name || null,
            venueAddress: event.venue?.address || null,
            latitude: event.venue?.coordinates?.lat?.toString() || null,
            longitude: event.venue?.coordinates?.lng?.toString() || null,
            startDate: event.dates.startDate ? new Date(event.dates.startDate) : null,
            endDate: event.dates.endDate ? new Date(event.dates.endDate) : null,
            sessions: event.dates.sessions || [],
            currency: event.pricing.currency || "USD",
            minPrice: event.pricing.minPrice?.toString() || null,
            maxPrice: event.pricing.maxPrice?.toString() || null,
            priceRange: event.pricing.priceRange || null,
            isFree: event.isFree,
            isSoldOut: event.isSoldOut,
            rating: event.rating?.toString() || null,
            reviewCount: event.reviewCount || 0,
            bookingUrl: event.bookingUrl,
            affiliateUrl: event.affiliateUrl || null,
            tags: event.tags || [],
            highlights: event.highlights || [],
            provider: "fever",
            rawData: event,
            expiresAt,
          });
          result.refreshed++;
        } catch (err: any) {
          result.errors.push(`Failed to cache event ${event.id}: ${err.message}`);
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

    const [count, cities, oldest, newest] = await Promise.all([
      db.select({ count: sql<number>`count(*)` })
        .from(feverEventCache)
        .where(gte(feverEventCache.expiresAt, now)),
      db.selectDistinct({ cityCode: feverEventCache.cityCode })
        .from(feverEventCache)
        .where(gte(feverEventCache.expiresAt, now)),
      db.select({ lastUpdated: feverEventCache.lastUpdated })
        .from(feverEventCache)
        .orderBy(feverEventCache.lastUpdated)
        .limit(1),
      db.select({ lastUpdated: feverEventCache.lastUpdated })
        .from(feverEventCache)
        .orderBy(desc(feverEventCache.lastUpdated))
        .limit(1),
    ]);

    return {
      totalCachedEvents: Number(count[0]?.count || 0),
      citiesWithCache: cities.map(c => c.cityCode),
      oldestCache: oldest[0]?.lastUpdated || null,
      newestCache: newest[0]?.lastUpdated || null,
    };
  }

  async cleanupExpiredCache(): Promise<number> {
    const now = new Date();
    const result = await db.delete(feverEventCache)
      .where(lte(feverEventCache.expiresAt, now));
    return 0;
  }

  private cacheToEvent(cached: typeof feverEventCache.$inferSelect): FeverEvent {
    return {
      id: cached.eventId,
      title: cached.title,
      slug: cached.slug || "",
      description: cached.description || undefined,
      shortDescription: cached.shortDescription || undefined,
      imageUrl: cached.imageUrl || undefined,
      thumbnailUrl: cached.thumbnailUrl || undefined,
      category: cached.category,
      subcategory: cached.subcategory || undefined,
      city: cached.city,
      cityCode: cached.cityCode,
      country: cached.country,
      venue: cached.venueName ? {
        name: cached.venueName,
        address: cached.venueAddress || undefined,
        coordinates: cached.latitude && cached.longitude ? {
          lat: parseFloat(cached.latitude),
          lng: parseFloat(cached.longitude),
        } : undefined,
      } : undefined,
      dates: {
        startDate: cached.startDate?.toISOString() || "",
        endDate: cached.endDate?.toISOString() || undefined,
        sessions: cached.sessions as any[] || undefined,
      },
      pricing: {
        currency: cached.currency || "USD",
        minPrice: cached.minPrice ? parseFloat(cached.minPrice) : undefined,
        maxPrice: cached.maxPrice ? parseFloat(cached.maxPrice) : undefined,
        priceRange: cached.priceRange || undefined,
      },
      rating: cached.rating ? parseFloat(cached.rating) : undefined,
      reviewCount: cached.reviewCount || undefined,
      isFree: cached.isFree || false,
      isSoldOut: cached.isSoldOut || false,
      bookingUrl: cached.bookingUrl,
      affiliateUrl: cached.affiliateUrl || undefined,
      tags: cached.tags as string[] || undefined,
      highlights: cached.highlights as string[] || undefined,
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const feverCacheService = new FeverCacheService();
