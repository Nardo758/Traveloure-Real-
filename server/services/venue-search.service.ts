/**
 * Venue Search Service
 * Handles venue/vendor searches for templates using SerpAPI (Google Maps Local Results)
 * Implements caching, rate limiting, and graceful degradation
 */

import { logger } from "../infrastructure";
import { db } from "../db";
import { serpCache } from "@shared/schema";
import { eq, and, gte } from "drizzle-orm";

const CACHE_DURATION_HOURS = 24;
const SERP_API_BASE_URL = "https://serpapi.com/search.json";

interface VenueSearchParams {
  location: string;
  type: 'wedding_venue' | 'hotel' | 'restaurant' | 'photographer' | 'florist' | 'caterer' | 'dj' | 'venue';
  radius?: number;
  minRating?: number;
  priceLevel?: string;
  keyword?: string;
}

export interface VenueResult {
  id: string;
  name: string;
  address: string;
  rating?: number;
  reviewCount?: number;
  priceLevel?: number;
  photos?: string[];
  phone?: string;
  website?: string;
  openingHours?: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
  types?: string[];
  source: 'serpapi' | 'google_places';
}

class VenueSearchService {
  private serpApiKey: string | undefined;
  private venueLogger = logger.child({ service: "venue-search" });

  constructor() {
    this.serpApiKey = process.env.SERP_API_KEY;
  }

  private generateCacheKey(params: VenueSearchParams): string {
    return `venue-${params.location}-${params.type}-${params.keyword || ''}`.toLowerCase().replace(/\s+/g, "-");
  }

  private async getCachedResults(cacheKey: string): Promise<VenueResult[] | null> {
    try {
      const expirationThreshold = new Date(Date.now() - CACHE_DURATION_HOURS * 60 * 60 * 1000);
      
      const cached = await db
        .select()
        .from(serpCache)
        .where(
          and(
            eq(serpCache.cacheKey, cacheKey),
            gte(serpCache.cachedAt, expirationThreshold)
          )
        )
        .limit(1);

      if (cached.length > 0 && cached[0].results) {
        this.venueLogger.debug({ cacheKey }, "Returning cached venue results");
        return cached[0].results as VenueResult[];
      }
      return null;
    } catch (error) {
      this.venueLogger.error({ error, cacheKey }, "Error fetching cached venue results");
      return null;
    }
  }

  private async cacheResults(cacheKey: string, results: VenueResult[], params: VenueSearchParams): Promise<void> {
    try {
      await db
        .insert(serpCache)
        .values({
          cacheKey,
          query: params.keyword || params.type,
          location: params.location,
          category: params.type,
          results: results as any,
          resultCount: results.length,
          cachedAt: new Date()
        })
        .onConflictDoUpdate({
          target: serpCache.cacheKey,
          set: {
            results: results as any,
            resultCount: results.length,
            cachedAt: new Date()
          }
        });
      this.venueLogger.debug({ cacheKey, count: results.length }, "Cached venue results");
    } catch (error) {
      this.venueLogger.error({ error, cacheKey }, "Error caching venue results");
    }
  }

  /**
   * Search for venues using SerpAPI Google Maps endpoint
   */
  async searchVenues(params: VenueSearchParams): Promise<VenueResult[]> {
    if (!this.serpApiKey) {
      this.venueLogger.warn("SERP_API_KEY not configured - returning empty results");
      return [];
    }

    // Check cache first
    const cacheKey = this.generateCacheKey(params);
    const cachedResults = await this.getCachedResults(cacheKey);
    if (cachedResults) {
      return cachedResults;
    }

    try {
      // Build query based on type and location
      let query = params.keyword || this.getDefaultQuery(params.type);
      
      // Use SerpAPI Google Maps Local Results
      const url = new URL(SERP_API_BASE_URL);
      url.searchParams.append('engine', 'google_maps');
      url.searchParams.append('q', query);
      url.searchParams.append('ll', await this.getLocationCoords(params.location) || `@0,0,12z`);
      url.searchParams.append('type', 'search');
      url.searchParams.append('api_key', this.serpApiKey);

      this.venueLogger.info({ query, location: params.location, type: params.type }, "Searching venues via SerpAPI");

      const response = await fetch(url.toString());
      const data = await response.json();

      if (data.error) {
        this.venueLogger.warn({ error: data.error }, "SerpAPI error");
        return [];
      }

      // Parse local_results from SerpAPI response
      const localResults = data.local_results || [];
      
      const results: VenueResult[] = localResults.map((place: any) => ({
        id: place.place_id || `serp-${place.position || Math.random().toString(36).slice(2)}`,
        name: place.title || place.name,
        address: place.address || '',
        rating: place.rating,
        reviewCount: place.reviews,
        priceLevel: this.parsePriceLevel(place.price),
        photos: place.thumbnail ? [place.thumbnail] : [],
        phone: place.phone,
        website: place.website,
        openingHours: place.hours || place.operating_hours?.wednesday,
        coordinates: place.gps_coordinates ? {
          lat: place.gps_coordinates.latitude,
          lng: place.gps_coordinates.longitude
        } : undefined,
        types: place.type ? [place.type] : [],
        source: 'serpapi' as const
      }));

      // Filter by minimum rating if specified
      let filteredResults = results;
      if (params.minRating) {
        filteredResults = results.filter(r => (r.rating || 0) >= params.minRating!);
      }

      // Cache results
      await this.cacheResults(cacheKey, filteredResults, params);

      this.venueLogger.info({ count: filteredResults.length, query }, "Venue search completed");
      return filteredResults;

    } catch (error) {
      this.venueLogger.error({ error, params }, "Error searching venues");
      return [];
    }
  }

  /**
   * Get location coordinates string for SerpAPI
   */
  private async getLocationCoords(location: string): Promise<string | null> {
    try {
      // Use SerpAPI's Google Maps endpoint to geocode
      const url = new URL(SERP_API_BASE_URL);
      url.searchParams.append('engine', 'google_maps');
      url.searchParams.append('q', location);
      url.searchParams.append('type', 'search');
      url.searchParams.append('api_key', this.serpApiKey!);

      const response = await fetch(url.toString());
      const data = await response.json();

      if (data.place_results?.gps_coordinates) {
        const { latitude, longitude } = data.place_results.gps_coordinates;
        return `@${latitude},${longitude},14z`;
      }
      
      // Default to searching by query only
      return null;
    } catch (error) {
      this.venueLogger.debug({ error, location }, "Could not geocode location");
      return null;
    }
  }

  /**
   * Parse price level from SerpAPI format
   */
  private parsePriceLevel(price?: string): number | undefined {
    if (!price) return undefined;
    const dollarSigns = (price.match(/\$/g) || []).length;
    return dollarSigns || undefined;
  }

  /**
   * Get venue details by place ID
   */
  async getVenueDetails(placeId: string): Promise<VenueResult | null> {
    if (!this.serpApiKey) {
      this.venueLogger.warn("SERP_API_KEY not configured");
      return null;
    }

    try {
      const url = new URL(SERP_API_BASE_URL);
      url.searchParams.append('engine', 'google_maps');
      url.searchParams.append('place_id', placeId);
      url.searchParams.append('api_key', this.serpApiKey);

      const response = await fetch(url.toString());
      const data = await response.json();

      if (data.error || !data.place_results) {
        this.venueLogger.warn({ error: data.error, placeId }, "Failed to fetch venue details");
        return null;
      }

      const place = data.place_results;
      return {
        id: placeId,
        name: place.title,
        address: place.address,
        rating: place.rating,
        reviewCount: place.reviews,
        priceLevel: this.parsePriceLevel(place.price),
        photos: place.images?.map((img: any) => img.image || img) || [],
        phone: place.phone,
        website: place.website,
        openingHours: place.hours,
        coordinates: place.gps_coordinates ? {
          lat: place.gps_coordinates.latitude,
          lng: place.gps_coordinates.longitude
        } : undefined,
        types: place.type ? [place.type] : [],
        source: 'serpapi'
      };
    } catch (error) {
      this.venueLogger.error({ error, placeId }, "Error fetching venue details");
      return null;
    }
  }

  /**
   * Get default search query based on venue type
   */
  private getDefaultQuery(type: string): string {
    const queries: Record<string, string> = {
      'wedding_venue': 'wedding venues',
      'hotel': 'hotels',
      'restaurant': 'restaurants',
      'photographer': 'wedding photographers',
      'florist': 'wedding florists',
      'caterer': 'wedding caterers',
      'dj': 'wedding DJs',
      'venue': 'event venues'
    };
    return queries[type] || type;
  }

  /**
   * Search for wedding-specific vendors (photographer, florist, etc.)
   */
  async searchWeddingVendors(location: string, vendorType: string): Promise<VenueResult[]> {
    const typeMap: Record<string, string> = {
      'photographer': 'wedding photographer',
      'florist': 'wedding florist',
      'caterer': 'wedding catering',
      'dj': 'wedding DJ',
      'planner': 'wedding planner',
      'videographer': 'wedding videographer',
      'makeup': 'wedding makeup artist',
      'baker': 'wedding cake'
    };

    return this.searchVenues({
      location,
      type: 'venue', // Generic type
      keyword: typeMap[vendorType] || `wedding ${vendorType}`,
      minRating: 4.0
    });
  }
}

export const venueSearchService = new VenueSearchService();
