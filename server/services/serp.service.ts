/**
 * SERP API Service
 * Searches for restaurants, attractions, venues using SerpApi
 * Used to enrich AI-generated recommendations with actionable booking data
 * Extended with caching, quality filtering, and partnership tracking
 */

import { db } from "../db";
import { 
  serpCache, 
  serpProviderTracking, 
  serpInquiries,
  type SerpProviderTracking as SerpProviderTrackingType,
  type SerpInquiry
} from "@shared/schema";
import { eq, and, gte, desc, sql } from "drizzle-orm";
import { logger } from "../infrastructure";

const CACHE_DURATION_HOURS = 24;
const MIN_RATING_FILTER = 3.5;
const MIN_REVIEWS_FILTER = 5;

interface SerpSearchResult {
  title: string;
  link?: string;
  snippet?: string;
  rating?: number;
  reviews?: number;
  price?: string;
  address?: string;
  phone?: string;
  hours?: string;
  thumbnail?: string;
  type?: string;
  placeId?: string;
}

interface SerpLocalResult {
  position: number;
  title: string;
  place_id?: string;
  data_id?: string;
  data_cid?: string;
  reviews_link?: string;
  photos_link?: string;
  gps_coordinates?: { latitude: number; longitude: number };
  place_id_search?: string;
  provider_id?: string;
  rating?: number;
  reviews?: number;
  price?: string;
  type?: string;
  types?: string[];
  address?: string;
  open_state?: string;
  hours?: string;
  operating_hours?: Record<string, string>;
  phone?: string;
  website?: string;
  thumbnail?: string;
  service_options?: Record<string, boolean>;
}

interface SerpApiResponse {
  search_metadata?: {
    status: string;
    id: string;
  };
  local_results?: SerpLocalResult[];
  organic_results?: Array<{
    position: number;
    title: string;
    link: string;
    snippet?: string;
    thumbnail?: string;
  }>;
  error?: string;
}

export interface EnrichedVenue {
  id: string;
  name: string;
  type: 'restaurant' | 'attraction' | 'nightlife' | 'hotel' | 'activity';
  rating?: number;
  reviewCount?: number;
  priceLevel?: string;
  address?: string;
  phone?: string;
  website?: string;
  hours?: string;
  thumbnail?: string;
  bookingUrl?: string;
  description?: string;
  coordinates?: { lat: number; lng: number };
  source: 'serp' | 'viator' | 'amadeus' | 'opentable';
}

class SerpService {
  private apiKey: string | undefined;
  private baseUrl = 'https://serpapi.com/search.json';
  private serpLogger = logger.child({ service: "serp" });

  constructor() {
    this.apiKey = process.env.SERP_API_KEY;
  }

  private generateCacheKey(query: string, location: string, category?: string): string {
    return `${query}-${location}-${category || ""}`.toLowerCase().replace(/\s+/g, "-");
  }

  private async getCachedResults(cacheKey: string): Promise<EnrichedVenue[] | null> {
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
        this.serpLogger.debug({ cacheKey }, "Returning cached SERP results");
        return cached[0].results as EnrichedVenue[];
      }
      return null;
    } catch (error) {
      this.serpLogger.error({ error, cacheKey }, "Error fetching cached SERP results");
      return null;
    }
  }

  private async cacheResults(
    cacheKey: string, 
    results: EnrichedVenue[], 
    query: string, 
    location: string, 
    category?: string
  ): Promise<void> {
    try {
      await db
        .insert(serpCache)
        .values({
          cacheKey,
          query,
          location,
          category,
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
    } catch (error) {
      this.serpLogger.error({ error, cacheKey }, "Error caching SERP results");
    }
  }

  private filterQualityResults(results: EnrichedVenue[]): EnrichedVenue[] {
    return results.filter(result => {
      if (result.rating !== undefined && result.rating !== null && result.rating < MIN_RATING_FILTER) {
        return false;
      }
      
      if (result.reviewCount !== undefined && result.reviewCount !== null && result.reviewCount < MIN_REVIEWS_FILTER) {
        if (result.rating !== undefined) return false;
      }
      
      if (!result.website && !result.phone) {
        return false;
      }
      
      const excludePatterns = [
        /viator/i, /getyourguide/i, /tripadvisor\.com/i, /booking\.com/i,
        /expedia/i, /hotels\.com/i, /airbnb/i
      ];
      
      if (result.website && excludePatterns.some(p => p.test(result.website!))) {
        return false;
      }

      return true;
    });
  }

  async trackClick(providerId: string, userId: string | null, metadata: any): Promise<void> {
    try {
      const existing = await db
        .select()
        .from(serpProviderTracking)
        .where(eq(serpProviderTracking.serpProviderId, providerId))
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(serpProviderTracking)
          .set({
            clickCount: sql`${serpProviderTracking.clickCount} + 1`,
            lastClickedAt: new Date(),
            updatedAt: new Date()
          })
          .where(eq(serpProviderTracking.serpProviderId, providerId));
      } else {
        await db
          .insert(serpProviderTracking)
          .values({
            serpProviderId: providerId,
            providerName: metadata.name || "Unknown",
            destination: metadata.location || "",
            category: metadata.category || "",
            template: metadata.template || "",
            clickCount: 1,
            inquiryCount: 0,
            priorityScore: "LOW",
            lastClickedAt: new Date(),
            metadata: metadata
          });
      }

      this.serpLogger.debug({ providerId, userId }, "Tracked SERP provider click");
    } catch (error) {
      this.serpLogger.error({ error, providerId }, "Error tracking SERP click");
    }
  }

  async createInquiry(data: {
    userId: string;
    serpProviderId: string;
    providerName: string;
    providerEmail?: string;
    providerPhone?: string;
    providerWebsite?: string;
    message: string;
    destination: string;
    category: string;
    template: string;
  }): Promise<SerpInquiry | null> {
    try {
      const [inquiry] = await db
        .insert(serpInquiries)
        .values({
          userId: data.userId,
          serpProviderId: data.serpProviderId,
          providerName: data.providerName,
          providerEmail: data.providerEmail,
          providerPhone: data.providerPhone,
          providerWebsite: data.providerWebsite,
          message: data.message,
          destination: data.destination,
          category: data.category,
          template: data.template,
          status: "pending"
        })
        .returning();

      await db
        .update(serpProviderTracking)
        .set({
          inquiryCount: sql`${serpProviderTracking.inquiryCount} + 1`,
          updatedAt: new Date()
        })
        .where(eq(serpProviderTracking.serpProviderId, data.serpProviderId));

      await this.updatePriorityScore(data.serpProviderId);

      this.serpLogger.info({ inquiryId: inquiry.id, providerId: data.serpProviderId }, "Created SERP inquiry");
      
      return inquiry;
    } catch (error) {
      this.serpLogger.error({ error }, "Error creating SERP inquiry");
      return null;
    }
  }

  private async updatePriorityScore(providerId: string): Promise<void> {
    try {
      const [tracking] = await db
        .select()
        .from(serpProviderTracking)
        .where(eq(serpProviderTracking.serpProviderId, providerId));

      if (!tracking) return;

      let score = "LOW";
      const clicks = tracking.clickCount || 0;
      const inquiries = tracking.inquiryCount || 0;

      if (clicks >= 50 || inquiries >= 10) {
        score = "HIGH";
      } else if (clicks >= 20 || inquiries >= 5) {
        score = "MEDIUM";
      }

      await db
        .update(serpProviderTracking)
        .set({ priorityScore: score, updatedAt: new Date() })
        .where(eq(serpProviderTracking.serpProviderId, providerId));
    } catch (error) {
      this.serpLogger.error({ error, providerId }, "Error updating priority score");
    }
  }

  async getTopPartnershipOpportunities(limit: number = 20): Promise<SerpProviderTrackingType[]> {
    try {
      const results = await db
        .select()
        .from(serpProviderTracking)
        .orderBy(desc(serpProviderTracking.clickCount))
        .limit(limit);

      return results;
    } catch (error) {
      this.serpLogger.error({ error }, "Error fetching partnership opportunities");
      return [];
    }
  }

  async getPartnershipReportByMarket(): Promise<Record<string, SerpProviderTrackingType[]>> {
    try {
      const results = await db
        .select()
        .from(serpProviderTracking)
        .where(eq(serpProviderTracking.priorityScore, "HIGH"))
        .orderBy(desc(serpProviderTracking.clickCount));

      const byMarket: Record<string, SerpProviderTrackingType[]> = {};
      
      for (const provider of results) {
        const market = provider.destination || "Unknown";
        if (!byMarket[market]) {
          byMarket[market] = [];
        }
        byMarket[market].push(provider);
      }

      return byMarket;
    } catch (error) {
      this.serpLogger.error({ error }, "Error generating partnership report");
      return {};
    }
  }

  buildQueryForTemplate(
    serviceType: string,
    destination: string,
    template: string,
    filters?: Record<string, any>
  ): { query: string; location: string; category: string; template: string } {
    const templateQueries: Record<string, (type: string, dest: string) => string> = {
      travel: (type, dest) => `${type} ${dest} tours reviews`,
      wedding: (type, dest) => `${type} weddings ${dest} portfolio`,
      "bachelor-bachelorette": (type, dest) => `${type} bachelor party ${dest} group bookings`,
      proposal: (type, dest) => `romantic ${type} ${dest} private`,
      "corporate-events": (type, dest) => `corporate ${type} ${dest} business events`,
      birthday: (type, dest) => `${type} birthday party ${dest}`,
      "baby-shower": (type, dest) => `${type} baby shower ${dest}`,
      "date-night": (type, dest) => `romantic ${type} ${dest} couples`,
      retreats: (type, dest) => `${type} retreat ${dest} wellness`,
      reunions: (type, dest) => `${type} reunion event ${dest} group`
    };

    const queryBuilder = templateQueries[template] || ((type, dest) => `${type} in ${dest} reviews ratings`);
    let query = queryBuilder(serviceType, destination);

    if (filters?.priceRange) {
      const priceModifiers: Record<string, string> = {
        "$": "budget",
        "$$": "",
        "$$$": "upscale",
        "$$$$": "luxury"
      };
      query = `${priceModifiers[filters.priceRange] || ""} ${query}`.trim();
    }

    if (filters?.style) {
      query = `${filters.style} ${query}`;
    }

    if (filters?.groupSize && filters.groupSize > 10) {
      query += " large groups";
    }

    return {
      query,
      location: destination,
      category: serviceType,
      template
    };
  }

  private async makeRequest(params: Record<string, string>): Promise<SerpApiResponse | null> {
    if (!this.apiKey) {
      console.warn('[SERP] API key not configured');
      return null;
    }

    const searchParams = new URLSearchParams({
      ...params,
      api_key: this.apiKey,
    });

    try {
      const response = await fetch(`${this.baseUrl}?${searchParams.toString()}`);
      
      if (!response.ok) {
        console.error(`[SERP] API error: ${response.status} ${response.statusText}`);
        return null;
      }

      const data = await response.json() as SerpApiResponse;
      
      if (data.error) {
        console.error(`[SERP] API returned error: ${data.error}`);
        return null;
      }

      return data;
    } catch (error) {
      console.error('[SERP] Request failed:', error);
      return null;
    }
  }

  async searchRestaurants(city: string, country: string, query?: string): Promise<EnrichedVenue[]> {
    const searchQuery = query 
      ? `${query} restaurant ${city} ${country}`
      : `best restaurants ${city} ${country}`;

    const data = await this.makeRequest({
      engine: 'google_maps',
      q: searchQuery,
      type: 'search',
      hl: 'en',
    });

    if (!data?.local_results) {
      return [];
    }

    return data.local_results.slice(0, 10).map((result, idx) => ({
      id: result.place_id || result.data_id || `serp-rest-${idx}`,
      name: result.title,
      type: 'restaurant' as const,
      rating: result.rating,
      reviewCount: result.reviews,
      priceLevel: result.price,
      address: result.address,
      phone: result.phone,
      website: result.website,
      hours: result.hours || result.open_state,
      thumbnail: result.thumbnail,
      coordinates: result.gps_coordinates 
        ? { lat: result.gps_coordinates.latitude, lng: result.gps_coordinates.longitude }
        : undefined,
      source: 'serp' as const,
    }));
  }

  async searchAttractions(city: string, country: string, query?: string): Promise<EnrichedVenue[]> {
    const searchQuery = query 
      ? `${query} ${city} ${country}`
      : `top attractions things to do ${city} ${country}`;

    const data = await this.makeRequest({
      engine: 'google_maps',
      q: searchQuery,
      type: 'search',
      hl: 'en',
    });

    if (!data?.local_results) {
      return [];
    }

    return data.local_results.slice(0, 10).map((result, idx) => ({
      id: result.place_id || result.data_id || `serp-attr-${idx}`,
      name: result.title,
      type: 'attraction' as const,
      rating: result.rating,
      reviewCount: result.reviews,
      priceLevel: result.price,
      address: result.address,
      phone: result.phone,
      website: result.website,
      hours: result.hours || result.open_state,
      thumbnail: result.thumbnail,
      coordinates: result.gps_coordinates 
        ? { lat: result.gps_coordinates.latitude, lng: result.gps_coordinates.longitude }
        : undefined,
      source: 'serp' as const,
    }));
  }

  async searchNightlife(city: string, country: string): Promise<EnrichedVenue[]> {
    const data = await this.makeRequest({
      engine: 'google_maps',
      q: `best bars nightclubs nightlife ${city} ${country}`,
      type: 'search',
      hl: 'en',
    });

    if (!data?.local_results) {
      return [];
    }

    return data.local_results.slice(0, 10).map((result, idx) => ({
      id: result.place_id || result.data_id || `serp-night-${idx}`,
      name: result.title,
      type: 'nightlife' as const,
      rating: result.rating,
      reviewCount: result.reviews,
      priceLevel: result.price,
      address: result.address,
      phone: result.phone,
      website: result.website,
      hours: result.hours || result.open_state,
      thumbnail: result.thumbnail,
      coordinates: result.gps_coordinates 
        ? { lat: result.gps_coordinates.latitude, lng: result.gps_coordinates.longitude }
        : undefined,
      source: 'serp' as const,
    }));
  }

  async searchVenueByName(name: string, city: string, country: string): Promise<EnrichedVenue | null> {
    const data = await this.makeRequest({
      engine: 'google_maps',
      q: `${name} ${city} ${country}`,
      type: 'search',
      hl: 'en',
    });

    if (!data?.local_results?.[0]) {
      return null;
    }

    const result = data.local_results[0];
    
    return {
      id: result.place_id || result.data_id || 'serp-venue-0',
      name: result.title,
      type: this.inferVenueType(result.types || []),
      rating: result.rating,
      reviewCount: result.reviews,
      priceLevel: result.price,
      address: result.address,
      phone: result.phone,
      website: result.website,
      hours: result.hours || result.open_state,
      thumbnail: result.thumbnail,
      coordinates: result.gps_coordinates 
        ? { lat: result.gps_coordinates.latitude, lng: result.gps_coordinates.longitude }
        : undefined,
      source: 'serp' as const,
    };
  }

  async enrichAIRecommendation(
    aiRecommendation: { name: string; type: string; reason?: string },
    city: string,
    country: string
  ): Promise<EnrichedVenue | null> {
    const venue = await this.searchVenueByName(aiRecommendation.name, city, country);
    
    if (venue) {
      venue.description = aiRecommendation.reason;
    }
    
    return venue;
  }

  async enrichMultipleRecommendations(
    recommendations: Array<{ name: string; type: string; reason?: string }>,
    city: string,
    country: string
  ): Promise<EnrichedVenue[]> {
    const enrichedVenues: EnrichedVenue[] = [];
    
    for (const rec of recommendations.slice(0, 5)) {
      const venue = await this.enrichAIRecommendation(rec, city, country);
      if (venue) {
        enrichedVenues.push(venue);
      }
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    return enrichedVenues;
  }

  private inferVenueType(types: string[]): 'restaurant' | 'attraction' | 'nightlife' | 'hotel' | 'activity' {
    const typeString = types.join(' ').toLowerCase();
    
    if (typeString.includes('restaurant') || typeString.includes('food') || typeString.includes('cafe')) {
      return 'restaurant';
    }
    if (typeString.includes('bar') || typeString.includes('club') || typeString.includes('nightlife')) {
      return 'nightlife';
    }
    if (typeString.includes('hotel') || typeString.includes('lodging')) {
      return 'hotel';
    }
    if (typeString.includes('museum') || typeString.includes('park') || typeString.includes('tourist')) {
      return 'attraction';
    }
    
    return 'activity';
  }
}

export const serpService = new SerpService();
