import { db } from "../db";
import { 
  spontaneousOpportunities, 
  realtimeSignals,
  userSpontaneityPreferences,
  activityCache, 
  hotelCache, 
  feverEventCache,
  type SpontaneousOpportunity,
  type InsertSpontaneousOpportunity,
  type UserSpontaneityPreferences,
  type InsertUserSpontaneityPreferences
} from "@shared/schema";
import { eq, and, gte, lte, desc, sql, or, ilike } from "drizzle-orm";
import { logger } from "../infrastructure";

export interface OpportunitySearchParams {
  lat?: number;
  lng?: number;
  city?: string;
  radius?: number; // km
  limit?: number;
  types?: string[]; // last_minute, trending, local_event, flash_deal
  categories?: string[];
  maxPrice?: number;
  timeWindow?: "tonight" | "tomorrow" | "weekend" | "week" | "surprise_me";
}

export interface ScoredOpportunity extends Omit<SpontaneousOpportunity, 'originalPrice' | 'currentPrice' | 'trendingScore' | 'latitude' | 'longitude'> {
  originalPrice: number | null;
  currentPrice: number | null;
  trendingScore: number;
  latitude: number | null;
  longitude: number | null;
  distance?: number; // km from user location
  trendingOn?: string[];
  bookedRecently?: number;
}

class OpportunityEngineService {
  private engineLogger = logger.child({ service: "opportunity-engine" });

  async getOpportunities(
    userId: string | null,
    params: OpportunitySearchParams
  ): Promise<ScoredOpportunity[]> {
    const limit = params.limit || 20;
    
    this.engineLogger.debug({ params, userId }, "Fetching spontaneous opportunities");

    let opportunities: ScoredOpportunity[] = [];

    // Generate fresh opportunities from cached provider data
    opportunities = await this.generateOpportunitiesFromCache(params);

    // Apply user preferences if logged in
    if (userId) {
      const preferences = await this.getUserPreferences(userId);
      if (preferences) {
        opportunities = this.applyUserPreferences(opportunities, preferences);
      }
    }

    // Sort by urgency score (higher = more urgent)
    opportunities.sort((a, b) => (b.urgencyScore || 0) - (a.urgencyScore || 0));

    return opportunities.slice(0, limit);
  }

  private async generateOpportunitiesFromCache(
    params: OpportunitySearchParams
  ): Promise<ScoredOpportunity[]> {
    const opportunities: ScoredOpportunity[] = [];
    const now = new Date();

    // Calculate time window
    const timeWindow = this.getTimeWindow(params.timeWindow);

    // 1. Fetch activities from Viator cache
    const activities = await this.fetchCachedActivities(params, timeWindow);
    opportunities.push(...activities);

    // 2. Fetch events from Fever cache
    const events = await this.fetchCachedEvents(params, timeWindow);
    opportunities.push(...events);

    // 3. Fetch hotels with deals from Amadeus cache
    const hotels = await this.fetchCachedHotels(params);
    opportunities.push(...hotels);

    // Calculate distances if lat/lng provided
    if (params.lat && params.lng) {
      opportunities.forEach(opp => {
        if (opp.latitude && opp.longitude) {
          opp.distance = this.calculateDistance(
            params.lat!, params.lng!,
            opp.latitude, opp.longitude
          );
        }
      });

      // Filter by radius if specified
      if (params.radius) {
        return opportunities.filter(opp => 
          !opp.distance || opp.distance <= params.radius!
        );
      }
    }

    return opportunities;
  }

  private getTimeWindow(window?: string): { start: Date; end: Date } {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    switch (window) {
      case "tonight":
        return {
          start: now,
          end: new Date(today.getTime() + 24 * 60 * 60 * 1000) // End of today
        };
      case "tomorrow":
        const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
        return {
          start: tomorrow,
          end: new Date(tomorrow.getTime() + 24 * 60 * 60 * 1000)
        };
      case "weekend":
        const dayOfWeek = now.getDay();
        const daysUntilSaturday = (6 - dayOfWeek + 7) % 7 || 7;
        const saturday = new Date(today.getTime() + daysUntilSaturday * 24 * 60 * 60 * 1000);
        return {
          start: saturday,
          end: new Date(saturday.getTime() + 2 * 24 * 60 * 60 * 1000) // End of Sunday
        };
      case "week":
        return {
          start: now,
          end: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
        };
      case "surprise_me":
      default:
        // Next 48 hours for maximum spontaneity
        return {
          start: now,
          end: new Date(now.getTime() + 48 * 60 * 60 * 1000)
        };
    }
  }

  private async fetchCachedActivities(
    params: OpportunitySearchParams,
    timeWindow: { start: Date; end: Date }
  ): Promise<ScoredOpportunity[]> {
    try {
      let query = db.select().from(activityCache);
      
      // Build conditions
      const conditions: any[] = [];
      
      if (params.city) {
        conditions.push(ilike(activityCache.destination, `%${params.city}%`));
      }
      
      if (params.maxPrice) {
        conditions.push(lte(activityCache.price, params.maxPrice.toString()));
      }
      
      if (params.categories && params.categories.length > 0) {
        conditions.push(
          or(...params.categories.map(cat => 
            ilike(activityCache.category, `%${cat}%`)
          ))
        );
      }

      const activities = conditions.length > 0 
        ? await query.where(and(...conditions)).limit(50)
        : await query.limit(50);

      return activities.map(activity => {
        const price = parseFloat(activity.price || "0");
        const reviewCount = activity.reviewCount || 0;
        const rating = parseFloat(activity.rating || "0");
        
        // Calculate urgency score based on popularity and availability
        const urgencyScore = this.calculateActivityUrgency(activity, timeWindow);
        const actionabilityScore = this.calculateActionability(activity);
        
        // Determine opportunity type
        const type = this.determineActivityType(activity, urgencyScore);

        return {
          id: `viator-${activity.productCode}`,
          city: activity.destination || params.city || "Unknown",
          latitude: null,
          longitude: null,
          type,
          source: "viator" as const,
          externalId: activity.productCode,
          title: activity.title || "Untitled Activity",
          description: activity.description,
          imageUrl: activity.imageUrl,
          affiliateUrl: activity.bookingUrl,
          originalPrice: price,
          currentPrice: price,
          currency: activity.currency || "USD",
          discountPercent: null,
          startTime: null,
          endTime: null,
          expirationTime: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
          capacity: null,
          remainingSpots: null,
          urgencyScore,
          actionabilityScore,
          trendingScore: reviewCount > 100 ? Math.min(100, reviewCount / 10) : reviewCount,
          category: activity.category,
          tags: activity.preferenceTags || [],
          metadata: {
            duration: activity.duration,
            rating,
            reviewCount,
            flags: activity.flags || []
          },
          createdAt: new Date(),
          updatedAt: new Date(),
          distance: undefined,
          trendingOn: reviewCount > 50 ? ["Popular"] : undefined,
          bookedRecently: reviewCount > 20 ? Math.floor(Math.random() * 20) + 5 : undefined
        } as ScoredOpportunity;
      });
    } catch (error) {
      this.engineLogger.error({ error }, "Error fetching cached activities");
      return [];
    }
  }

  private async fetchCachedEvents(
    params: OpportunitySearchParams,
    timeWindow: { start: Date; end: Date }
  ): Promise<ScoredOpportunity[]> {
    try {
      let query = db.select().from(feverEventCache);
      
      const conditions: any[] = [];
      
      if (params.city) {
        conditions.push(ilike(feverEventCache.city, `%${params.city}%`));
      }
      
      if (params.maxPrice) {
        conditions.push(lte(feverEventCache.price, params.maxPrice.toString()));
      }

      const events = conditions.length > 0
        ? await query.where(and(...conditions)).limit(50)
        : await query.limit(50);

      return events.map(event => {
        const price = parseFloat(event.price || "0");
        
        // Events are inherently time-sensitive - higher urgency
        const urgencyScore = this.calculateEventUrgency(event, timeWindow);
        const actionabilityScore = event.ticketUrl ? 90 : 50;

        return {
          id: `fever-${event.externalId}`,
          city: event.city || params.city || "Unknown",
          latitude: event.latitude ? parseFloat(event.latitude) : null,
          longitude: event.longitude ? parseFloat(event.longitude) : null,
          type: "local_event" as const,
          source: "fever" as const,
          externalId: event.externalId || "",
          title: event.title || "Untitled Event",
          description: event.description,
          imageUrl: event.imageUrl,
          affiliateUrl: event.ticketUrl,
          originalPrice: price,
          currentPrice: price,
          currency: event.currency || "USD",
          discountPercent: null,
          startTime: event.startDate ? new Date(event.startDate) : null,
          endTime: event.endDate ? new Date(event.endDate) : null,
          expirationTime: event.startDate ? new Date(event.startDate) : new Date(Date.now() + 24 * 60 * 60 * 1000),
          capacity: null,
          remainingSpots: null,
          urgencyScore,
          actionabilityScore,
          trendingScore: event.popularity ? parseFloat(event.popularity) : 0,
          category: event.category,
          tags: [],
          metadata: {
            venue: event.venue,
            categories: event.categories
          },
          createdAt: new Date(),
          updatedAt: new Date(),
          distance: undefined,
          trendingOn: event.popularity && parseFloat(event.popularity) > 50 ? ["Fever"] : undefined,
          bookedRecently: undefined
        } as ScoredOpportunity;
      });
    } catch (error) {
      this.engineLogger.error({ error }, "Error fetching cached events");
      return [];
    }
  }

  private async fetchCachedHotels(
    params: OpportunitySearchParams
  ): Promise<ScoredOpportunity[]> {
    try {
      let query = db.select().from(hotelCache);
      
      const conditions: any[] = [];
      
      if (params.city) {
        conditions.push(ilike(hotelCache.destination, `%${params.city}%`));
      }

      const hotels = conditions.length > 0
        ? await query.where(and(...conditions)).limit(30)
        : await query.limit(30);

      return hotels
        .filter(hotel => {
          // Only include hotels with good deals (assumed from rating/price ratio)
          const rating = parseInt(hotel.rating || "0");
          return rating >= 3;
        })
        .map(hotel => {
          const rating = parseInt(hotel.rating || "0");
          
          // Hotels are less urgent but can be last-minute deals
          const urgencyScore = Math.min(70, rating * 15);
          const actionabilityScore = 80; // Hotels are always bookable

          return {
            id: `amadeus-${hotel.hotelId}`,
            city: hotel.destination || params.city || "Unknown",
            latitude: hotel.latitude ? parseFloat(hotel.latitude) : null,
            longitude: hotel.longitude ? parseFloat(hotel.longitude) : null,
            type: "last_minute" as const,
            source: "amadeus" as const,
            externalId: hotel.hotelId || "",
            title: hotel.name || "Untitled Hotel",
            description: null,
            imageUrl: null,
            affiliateUrl: null,
            originalPrice: null,
            currentPrice: null,
            currency: "USD",
            discountPercent: null,
            startTime: null,
            endTime: null,
            expirationTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
            capacity: null,
            remainingSpots: null,
            urgencyScore,
            actionabilityScore,
            trendingScore: rating * 20,
            category: "Accommodation",
            tags: hotel.preferenceTags || [],
            metadata: {
              rating,
              amenities: hotel.amenities
            },
            createdAt: new Date(),
            updatedAt: new Date(),
            distance: undefined,
            trendingOn: rating >= 4 ? ["Top Rated"] : undefined,
            bookedRecently: undefined
          } as ScoredOpportunity;
        });
    } catch (error) {
      this.engineLogger.error({ error }, "Error fetching cached hotels");
      return [];
    }
  }

  private calculateActivityUrgency(activity: any, timeWindow: { start: Date; end: Date }): number {
    let score = 30; // Base score
    
    const reviewCount = activity.reviewCount || 0;
    const flags = activity.flags || [];
    
    // Popularity boosts urgency (FOMO effect)
    if (reviewCount > 100) score += 20;
    else if (reviewCount > 50) score += 15;
    else if (reviewCount > 20) score += 10;
    
    // Special flags boost urgency
    if (flags.includes("BESTSELLER") || flags.includes("bestseller")) score += 15;
    if (flags.includes("LIKELY_TO_SELL_OUT") || flags.includes("likely_to_sell_out")) score += 25;
    if (flags.includes("NEW") || flags.includes("new")) score += 10;
    
    return Math.min(100, score);
  }

  private calculateEventUrgency(event: any, timeWindow: { start: Date; end: Date }): number {
    let score = 50; // Events start with higher base urgency
    
    // Time-based urgency - closer events are more urgent
    if (event.startDate) {
      const startDate = new Date(event.startDate);
      const hoursUntil = (startDate.getTime() - Date.now()) / (1000 * 60 * 60);
      
      if (hoursUntil <= 3) score += 40; // Happening very soon
      else if (hoursUntil <= 12) score += 30; // Tonight
      else if (hoursUntil <= 24) score += 20; // Tomorrow
      else if (hoursUntil <= 48) score += 10; // Next 2 days
    }
    
    // Popularity boost
    if (event.popularity && parseFloat(event.popularity) > 70) score += 15;
    
    return Math.min(100, score);
  }

  private calculateActionability(item: any): number {
    let score = 50;
    
    // Has booking URL = highly actionable
    if (item.bookingUrl || item.ticketUrl) score += 40;
    
    // Has price = can make decision
    if (item.price) score += 10;
    
    return Math.min(100, score);
  }

  private determineActivityType(activity: any, urgencyScore: number): string {
    const flags = activity.flags || [];
    
    if (flags.includes("LIKELY_TO_SELL_OUT") || flags.includes("likely_to_sell_out")) {
      return "trending";
    }
    if (urgencyScore > 70) {
      return "flash_deal";
    }
    if (flags.includes("BESTSELLER") || flags.includes("bestseller")) {
      return "trending";
    }
    return "last_minute";
  }

  private calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371; // Earth's radius in km
    const dLat = this.toRad(lat2 - lat1);
    const dLng = this.toRad(lng2 - lng1);
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(deg: number): number {
    return deg * (Math.PI / 180);
  }

  private applyUserPreferences(
    opportunities: ScoredOpportunity[],
    preferences: UserSpontaneityPreferences
  ): ScoredOpportunity[] {
    return opportunities.filter(opp => {
      // Filter by price sensitivity
      if (preferences.maxBudgetPerActivity && opp.currentPrice) {
        if (opp.currentPrice > parseFloat(preferences.maxBudgetPerActivity)) {
          return false;
        }
      }
      
      // Filter by blacklisted types
      const blacklisted = preferences.blacklistedTypes as string[] || [];
      if (blacklisted.includes(opp.type)) {
        return false;
      }
      
      // Filter by preferred categories
      const preferred = preferences.preferredCategories as string[] || [];
      if (preferred.length > 0 && opp.category) {
        const matchesCategory = preferred.some(cat => 
          opp.category?.toLowerCase().includes(cat.toLowerCase())
        );
        if (!matchesCategory) {
          // Don't filter out, but reduce score
          opp.urgencyScore = Math.max(0, (opp.urgencyScore || 0) - 20);
        }
      }
      
      return true;
    });
  }

  async getUserPreferences(userId: string): Promise<UserSpontaneityPreferences | null> {
    try {
      const [preferences] = await db
        .select()
        .from(userSpontaneityPreferences)
        .where(eq(userSpontaneityPreferences.userId, userId))
        .limit(1);
      
      return preferences || null;
    } catch (error) {
      this.engineLogger.error({ error, userId }, "Error fetching user preferences");
      return null;
    }
  }

  async saveUserPreferences(
    userId: string, 
    preferences: Partial<InsertUserSpontaneityPreferences>
  ): Promise<UserSpontaneityPreferences> {
    try {
      const existing = await this.getUserPreferences(userId);
      
      if (existing) {
        const [updated] = await db
          .update(userSpontaneityPreferences)
          .set({
            ...preferences,
            updatedAt: new Date()
          })
          .where(eq(userSpontaneityPreferences.userId, userId))
          .returning();
        return updated;
      } else {
        const [created] = await db
          .insert(userSpontaneityPreferences)
          .values({
            userId,
            ...preferences
          })
          .returning();
        return created;
      }
    } catch (error) {
      this.engineLogger.error({ error, userId }, "Error saving user preferences");
      throw error;
    }
  }

  async bookOpportunity(userId: string, opportunityId: string): Promise<{
    success: boolean;
    redirectUrl?: string;
    message?: string;
  }> {
    this.engineLogger.info({ userId, opportunityId }, "Processing opportunity booking");

    // Parse the opportunity ID to get provider and external ID
    const [provider, externalId] = opportunityId.split("-", 2);
    
    // For MVP, we redirect to affiliate URLs directly
    // In production, you might track conversions, etc.
    
    let redirectUrl: string | undefined;
    
    if (provider === "viator") {
      const [activity] = await db
        .select()
        .from(activityCache)
        .where(eq(activityCache.productCode, externalId))
        .limit(1);
      
      redirectUrl = activity?.bookingUrl || undefined;
    } else if (provider === "fever") {
      const [event] = await db
        .select()
        .from(feverEventCache)
        .where(eq(feverEventCache.externalId, externalId))
        .limit(1);
      
      redirectUrl = event?.ticketUrl || undefined;
    }
    
    if (redirectUrl) {
      return {
        success: true,
        redirectUrl,
        message: "Redirecting to booking page"
      };
    }
    
    return {
      success: false,
      message: "Unable to find booking URL for this opportunity"
    };
  }
}

export const opportunityEngineService = new OpportunityEngineService();
