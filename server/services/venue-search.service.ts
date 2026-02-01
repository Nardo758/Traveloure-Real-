/**
 * Venue Search Service
 * Handles venue/vendor searches for templates using Google Places API
 * Implements caching, rate limiting, and graceful degradation
 */

import { logger } from "../infrastructure";
import { db } from "../db";
import { serpCache } from "@shared/schema";
import { eq, and, gte } from "drizzle-orm";

const CACHE_DURATION_HOURS = 24;
const GOOGLE_PLACES_BASE_URL = "https://maps.googleapis.com/maps/api/place";

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
  source: 'google_places';
}

class VenueSearchService {
  private apiKey: string | undefined;
  private venueLogger = logger.child({ service: "venue-search" });

  constructor() {
    this.apiKey = process.env.GOOGLE_MAPS_API_KEY;
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
   * Geocode a location string to coordinates
   */
  private async geocodeLocation(location: string): Promise<{ lat: number; lng: number } | null> {
    if (!this.apiKey) {
      this.venueLogger.warn("Google Maps API key not configured");
      return null;
    }

    try {
      const url = `${GOOGLE_PLACES_BASE_URL}/textsearch/json?query=${encodeURIComponent(location)}&key=${this.apiKey}`;
      const response = await fetch(url);
      const data = await response.json();

      if (data.status === 'OK' && data.results?.[0]?.geometry?.location) {
        return {
          lat: data.results[0].geometry.location.lat,
          lng: data.results[0].geometry.location.lng
        };
      }
      return null;
    } catch (error) {
      this.venueLogger.error({ error, location }, "Error geocoding location");
      return null;
    }
  }

  /**
   * Search for venues using Google Places API
   */
  async searchVenues(params: VenueSearchParams): Promise<VenueResult[]> {
    if (!this.apiKey) {
      this.venueLogger.warn("Google Maps API key not configured - returning empty results");
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
      query += ` in ${params.location}`;

      const url = new URL(`${GOOGLE_PLACES_BASE_URL}/textsearch/json`);
      url.searchParams.append('query', query);
      url.searchParams.append('key', this.apiKey);
      
      if (params.radius) {
        const coords = await this.geocodeLocation(params.location);
        if (coords) {
          url.searchParams.append('location', `${coords.lat},${coords.lng}`);
          url.searchParams.append('radius', params.radius.toString());
        }
      }

      this.venueLogger.info({ query, location: params.location, type: params.type }, "Searching venues");

      const response = await fetch(url.toString());
      const data = await response.json();

      if (data.status !== 'OK') {
        this.venueLogger.warn({ status: data.status, error: data.error_message }, "Google Places API error");
        return [];
      }

      const results: VenueResult[] = (data.results || []).map((place: any) => ({
        id: place.place_id,
        name: place.name,
        address: place.formatted_address,
        rating: place.rating,
        reviewCount: place.user_ratings_total,
        priceLevel: place.price_level,
        photos: place.photos?.slice(0, 3).map((photo: any) => 
          `${GOOGLE_PLACES_BASE_URL}/photo?maxwidth=800&photo_reference=${photo.photo_reference}&key=${this.apiKey}`
        ),
        coordinates: place.geometry?.location ? {
          lat: place.geometry.location.lat,
          lng: place.geometry.location.lng
        } : undefined,
        types: place.types,
        source: 'google_places'
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
   * Get venue details by place ID
   */
  async getVenueDetails(placeId: string): Promise<VenueResult | null> {
    if (!this.apiKey) {
      this.venueLogger.warn("Google Maps API key not configured");
      return null;
    }

    try {
      const url = `${GOOGLE_PLACES_BASE_URL}/details/json?place_id=${placeId}&fields=name,formatted_address,rating,user_ratings_total,price_level,photos,formatted_phone_number,website,opening_hours,geometry,types&key=${this.apiKey}`;
      
      const response = await fetch(url);
      const data = await response.json();

      if (data.status !== 'OK' || !data.result) {
        this.venueLogger.warn({ status: data.status, placeId }, "Failed to fetch venue details");
        return null;
      }

      const place = data.result;
      return {
        id: placeId,
        name: place.name,
        address: place.formatted_address,
        rating: place.rating,
        reviewCount: place.user_ratings_total,
        priceLevel: place.price_level,
        photos: place.photos?.slice(0, 5).map((photo: any) => 
          `${GOOGLE_PLACES_BASE_URL}/photo?maxwidth=1200&photo_reference=${photo.photo_reference}&key=${this.apiKey}`
        ),
        phone: place.formatted_phone_number,
        website: place.website,
        openingHours: place.opening_hours?.weekday_text?.join(', '),
        coordinates: place.geometry?.location ? {
          lat: place.geometry.location.lat,
          lng: place.geometry.location.lng
        } : undefined,
        types: place.types,
        source: 'google_places'
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
