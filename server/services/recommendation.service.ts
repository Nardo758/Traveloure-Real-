/**
 * UNIFIED RECOMMENDATION SERVICE
 *
 * Single authoritative service for all recommendation logic on the platform.
 * Merges two previously separate engines:
 *
 *  1. Destination Content Recommendations  (was: ai-recommendation-engine.service.ts)
 *     Scores and ranks cached travel content (hotels, activities) for individual
 *     travelers using seasonal data, destination events, city intelligence, budget,
 *     and personal preferences.
 *     Tables: hotelCache, activityCache, destinationSeasons, destinationEvents,
 *             travelPulseCities
 *
 *  2. Service Opportunity Recommendations  (was: service-recommendation-engine.service.ts)
 *     Authoritative owner of the demand-signal → service opportunity matching flow.
 *     Ingests TravelPulse trends, derives demand signals, identifies supply gaps,
 *     and surfaces actionable opportunities to experts, providers, and travelers.
 *     Tables: serviceDemandSignals, serviceRecommendations, recommendationConversions,
 *             serviceGapAnalysis, seasonalOpportunities, travelPulseTrending,
 *             providerServices (read-only supply queries)
 *
 * All callers import from this file. The retired source files have been deleted.
 */

import { db } from "../db";
import {
  hotelCache,
  activityCache,
  destinationSeasons,
  destinationEvents,
  travelPulseCities,
  serviceDemandSignals,
  serviceRecommendations,
  recommendationConversions,
  serviceGapAnalysis,
  seasonalOpportunities,
  travelPulseTrending,
  providerServices,
  expertSelectedServices,
  expertCustomServices,
  expertServiceOfferings,
  users,
  HotelCache,
  ActivityCache,
  DestinationEvent,
  ServiceDemandSignal,
  ServiceGapAnalysis,
  SeasonalOpportunity,
} from "@shared/schema";
import { eq, and, sql, gte, lte, desc, asc, or, ilike, inArray } from "drizzle-orm";

// ─────────────────────────────────────────────────────────────────────────────
// Section 1: Destination Content Recommendation types
// ─────────────────────────────────────────────────────────────────────────────

interface AIRecommendationContext {
  cityName: string;
  country: string;
  travelMonth?: number;
  checkInDate?: string;
  checkOutDate?: string;
  budget?: "budget" | "mid-range" | "luxury";
  preferences?: string[];
}

interface SeasonalInsight {
  rating: string;
  weatherDescription: string | null;
  crowdLevel: string | null;
  priceLevel: string | null;
  highlights: string[];
  events: DestinationEvent[];
}

interface EnhancedHotel extends HotelCache {
  aiScore: number;
  aiReasons: string[];
  seasonalMatch: boolean;
  eventNearby: boolean;
  budgetMatch: boolean;
  bestTimeMatch: boolean;
}

interface EnhancedActivity extends ActivityCache {
  aiScore: number;
  aiReasons: string[];
  seasonalMatch: boolean;
  eventRelated: boolean;
  preferenceMatch: boolean;
  bestTimeMatch: boolean;
}

interface AIRecommendations {
  hotels: EnhancedHotel[];
  activities: EnhancedActivity[];
  seasonalInsight: SeasonalInsight | null;
  bestTimeToVisit: string | null;
  totalHotels: number;
  totalActivities: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 2: Service Opportunity Recommendation types
// ─────────────────────────────────────────────────────────────────────────────

interface TrendAnalysis {
  serviceType: string;
  demandLevel: "low" | "moderate" | "high" | "very_high" | "trending";
  demandScore: number;
  trendDirection: "up" | "down" | "stable";
  seasonalPeak: number[];
  triggerEvents: string[];
  averagePrice?: number;
  supplyGap: number;
}

interface ExpertRecommendation {
  id: string;
  title: string;
  description: string;
  serviceType: string;
  city: string;
  country?: string;
  opportunityScore: number;
  potentialRevenue?: number;
  competitionLevel: "low" | "medium" | "high";
  actionItems: string[];
  supportingData: {
    trendScore?: number;
    demandLevel?: string;
    seasonalPeaks?: number[];
    relatedTrends?: string[];
  };
}

interface ProviderRecommendation {
  id: string;
  title: string;
  description: string;
  serviceType: string;
  city: string;
  country?: string;
  opportunityScore: number;
  gapScore: number;
  currentSupplyCount: number;
  priceRangeGap: { budget?: number; midrange?: number; luxury?: number };
  recommendedActions: string[];
}

interface UserRecommendation {
  id: string;
  title: string;
  description: string;
  serviceType: string;
  city: string;
  matchScore: number;
  reasons: string[];
  relatedServices: { id: string; name: string; price?: number }[];
}

const SERVICE_TYPE_MAPPINGS: Record<string, string[]> = {
  "food_tour": ["restaurant", "food", "culinary", "dining", "gastronomy"],
  "photography": ["photo", "photographer", "instagram", "photoshoot"],
  "airport_transfer": ["transfer", "airport", "transportation", "pickup"],
  "city_tour": ["tour", "sightseeing", "walking", "exploration"],
  "adventure": ["adventure", "outdoor", "hiking", "extreme"],
  "cultural": ["cultural", "museum", "history", "heritage", "art"],
  "wellness": ["spa", "wellness", "yoga", "meditation", "retreat"],
  "nightlife": ["nightlife", "bar", "club", "party", "entertainment"],
  "shopping": ["shopping", "market", "bazaar", "boutique"],
  "water_activities": ["beach", "diving", "snorkeling", "boat", "cruise"],
};

// ─────────────────────────────────────────────────────────────────────────────
// Unified Recommendation Service
// ─────────────────────────────────────────────────────────────────────────────

class RecommendationService {

  // ───── Section 1: Destination Content Recommendations ─────────────────────

  async getSeasonalInsight(
    cityName: string,
    country: string,
    month: number
  ): Promise<SeasonalInsight | null> {
    const [seasonData, eventData] = await Promise.all([
      db
        .select()
        .from(destinationSeasons)
        .where(
          and(
            eq(destinationSeasons.city, cityName),
            eq(destinationSeasons.country, country),
            eq(destinationSeasons.month, month)
          )
        )
        .limit(1),
      db
        .select()
        .from(destinationEvents)
        .where(
          and(
            eq(destinationEvents.city, cityName),
            eq(destinationEvents.country, country),
            eq(destinationEvents.status, "approved"),
            or(
              eq(destinationEvents.startMonth, month),
              and(
                lte(destinationEvents.startMonth, month),
                gte(destinationEvents.endMonth, month)
              )
            )
          )
        ),
    ]);

    if (seasonData.length === 0) {
      return null;
    }

    const season = seasonData[0];
    return {
      rating: season.rating,
      weatherDescription: season.weatherDescription,
      crowdLevel: season.crowdLevel,
      priceLevel: season.priceLevel,
      highlights: (season.highlights as string[]) || [],
      events: eventData,
    };
  }

  async getCityIntelligence(cityName: string, country: string) {
    const city = await db
      .select()
      .from(travelPulseCities)
      .where(
        and(
          eq(travelPulseCities.cityName, cityName),
          eq(travelPulseCities.country, country)
        )
      )
      .limit(1);

    return city[0] || null;
  }

  private scoreHotel(
    hotel: HotelCache,
    context: AIRecommendationContext,
    seasonalInsight: SeasonalInsight | null,
    cityIntelligence: any
  ): EnhancedHotel {
    let aiScore = 50;
    const aiReasons: string[] = [];
    let seasonalMatch = false;
    let eventNearby = false;
    let budgetMatch = false;
    let bestTimeMatch = false;

    const preferenceTags = (hotel.preferenceTags as string[]) || [];

    if (seasonalInsight) {
      if (seasonalInsight.rating === "excellent") {
        aiScore += 15;
        aiReasons.push("Perfect timing - excellent season to visit");
        seasonalMatch = true;
        bestTimeMatch = true;
      } else if (seasonalInsight.rating === "good") {
        aiScore += 10;
        aiReasons.push("Good timing - favorable season");
        seasonalMatch = true;
      } else if (seasonalInsight.rating === "poor") {
        aiScore -= 10;
        aiReasons.push("Off-season - consider alternative dates");
      }

      if (seasonalInsight.events.length > 0) {
        aiScore += 10;
        eventNearby = true;
        const eventNames = seasonalInsight.events.slice(0, 2).map((e) => e.title);
        aiReasons.push(`Near upcoming events: ${eventNames.join(", ")}`);
      }

      if (seasonalInsight.crowdLevel === "low" || seasonalInsight.crowdLevel === "moderate") {
        aiScore += 5;
        aiReasons.push("Lower crowds - better experience");
      }

      if (seasonalInsight.priceLevel === "low" || seasonalInsight.priceLevel === "moderate") {
        aiScore += 5;
        aiReasons.push("Good value period");
        budgetMatch = true;
      }
    }

    if (context.budget) {
      if (context.budget === "budget" && preferenceTags.includes("budget")) {
        aiScore += 10;
        budgetMatch = true;
        aiReasons.push("Matches your budget preference");
      } else if (context.budget === "luxury" && preferenceTags.includes("luxury")) {
        aiScore += 10;
        budgetMatch = true;
        aiReasons.push("Premium luxury property");
      } else if (context.budget === "mid-range" && !preferenceTags.includes("budget") && !preferenceTags.includes("luxury")) {
        aiScore += 5;
        budgetMatch = true;
      }
    }

    if (context.preferences && context.preferences.length > 0) {
      const matchingTags = context.preferences.filter((pref) =>
        preferenceTags.includes(pref)
      );
      if (matchingTags.length > 0) {
        aiScore += matchingTags.length * 5;
        aiReasons.push(`Matches preferences: ${matchingTags.join(", ")}`);
      }
    }

    if (hotel.starRating) {
      aiScore += hotel.starRating * 2;
    }
    if (hotel.reviewCount && hotel.reviewCount > 100) {
      aiScore += 5;
      aiReasons.push("Highly reviewed property");
    }

    if (cityIntelligence?.aiBudgetEstimate) {
      const budgetStr = JSON.stringify(cityIntelligence.aiBudgetEstimate).toLowerCase();
      if (budgetStr.includes("affordable") || budgetStr.includes("budget")) {
        if (preferenceTags.includes("budget")) {
          aiScore += 5;
          aiReasons.push("Aligns with destination budget profile");
        }
      }
    }

    aiScore = Math.max(0, Math.min(100, aiScore));

    return {
      ...hotel,
      aiScore,
      aiReasons,
      seasonalMatch,
      eventNearby,
      budgetMatch,
      bestTimeMatch,
    };
  }

  private scoreActivity(
    activity: ActivityCache,
    context: AIRecommendationContext,
    seasonalInsight: SeasonalInsight | null,
    cityIntelligence: any
  ): EnhancedActivity {
    let aiScore = 50;
    const aiReasons: string[] = [];
    let seasonalMatch = false;
    let eventRelated = false;
    let preferenceMatch = false;
    let bestTimeMatch = false;

    const preferenceTags = (activity.preferenceTags as string[]) || [];
    const title = activity.title.toLowerCase();
    const description = (activity.description || "").toLowerCase();

    if (seasonalInsight) {
      if (seasonalInsight.rating === "excellent") {
        aiScore += 15;
        aiReasons.push("Perfect season for this activity");
        seasonalMatch = true;
        bestTimeMatch = true;
      } else if (seasonalInsight.rating === "good") {
        aiScore += 10;
        seasonalMatch = true;
      }

      for (const event of seasonalInsight.events) {
        const eventTitle = event.title.toLowerCase();
        const eventType = (event.eventType || "").toLowerCase();
        if (
          title.includes(eventTitle) ||
          description.includes(eventTitle) ||
          title.includes(eventType) ||
          preferenceTags.includes(eventType)
        ) {
          aiScore += 15;
          eventRelated = true;
          aiReasons.push(`Related to ${event.title}`);
          break;
        }
      }

      for (const highlight of seasonalInsight.highlights) {
        const highlightLower = highlight.toLowerCase();
        if (title.includes(highlightLower) || description.includes(highlightLower)) {
          aiScore += 10;
          aiReasons.push(`Featured seasonal highlight: ${highlight}`);
          break;
        }
      }

      const weatherDesc = (seasonalInsight.weatherDescription || "").toLowerCase();
      if (preferenceTags.includes("nature_outdoors") || preferenceTags.includes("adventure")) {
        if (weatherDesc.includes("sunny") || weatherDesc.includes("clear") || weatherDesc.includes("warm")) {
          aiScore += 10;
          aiReasons.push("Great weather for outdoor activity");
        } else if (weatherDesc.includes("rain") || weatherDesc.includes("cold")) {
          aiScore -= 5;
        }
      }
    }

    if (context.preferences && context.preferences.length > 0) {
      const matchingTags = context.preferences.filter((pref) =>
        preferenceTags.includes(pref)
      );
      if (matchingTags.length > 0) {
        aiScore += matchingTags.length * 8;
        preferenceMatch = true;
        aiReasons.push(`Matches your interests: ${matchingTags.join(", ")}`);
      }
    }

    if (cityIntelligence?.aiMustSeeAttractions) {
      const mustSee = cityIntelligence.aiMustSeeAttractions as string[];
      for (const attraction of mustSee) {
        if (title.includes(attraction.toLowerCase()) || description.includes(attraction.toLowerCase())) {
          aiScore += 15;
          aiReasons.push(`AI-recommended must-see attraction`);
          break;
        }
      }
    }

    if (activity.rating) {
      const ratingNum = parseFloat(activity.rating);
      if (ratingNum >= 4.5) {
        aiScore += 10;
        aiReasons.push("Highly rated experience");
      } else if (ratingNum >= 4.0) {
        aiScore += 5;
      }
    }

    if (activity.reviewCount && activity.reviewCount > 500) {
      aiScore += 5;
    }

    aiScore = Math.max(0, Math.min(100, aiScore));

    return {
      ...activity,
      aiScore,
      aiReasons,
      seasonalMatch,
      eventRelated,
      preferenceMatch,
      bestTimeMatch,
    };
  }

  async getAIEnhancedRecommendations(
    context: AIRecommendationContext,
    limit: number = 20
  ): Promise<AIRecommendations> {
    const travelMonth = context.travelMonth || new Date().getMonth() + 1;

    const [seasonalInsight, cityIntelligence, hotels, activities] = await Promise.all([
      this.getSeasonalInsight(context.cityName, context.country, travelMonth),
      this.getCityIntelligence(context.cityName, context.country),
      db
        .select()
        .from(hotelCache)
        .where(
          or(
            ilike(hotelCache.city, `%${context.cityName}%`),
            ilike(hotelCache.address, `%${context.cityName}%`)
          )
        )
        .limit(limit * 2),
      db
        .select()
        .from(activityCache)
        .where(
          or(
            ilike(activityCache.destination, `%${context.cityName}%`),
            ilike(activityCache.city, `%${context.cityName}%`)
          )
        )
        .limit(limit * 2),
    ]);

    const enhancedHotels = hotels
      .map((hotel) => this.scoreHotel(hotel, context, seasonalInsight, cityIntelligence))
      .sort((a, b) => b.aiScore - a.aiScore)
      .slice(0, limit);

    const enhancedActivities = activities
      .map((activity) => this.scoreActivity(activity, context, seasonalInsight, cityIntelligence))
      .sort((a, b) => b.aiScore - a.aiScore)
      .slice(0, limit);

    return {
      hotels: enhancedHotels,
      activities: enhancedActivities,
      seasonalInsight,
      bestTimeToVisit: cityIntelligence?.aiBestTimeToVisit || null,
      totalHotels: hotels.length,
      totalActivities: activities.length,
    };
  }

  async getEventAlignedRecommendations(
    cityName: string,
    country: string,
    eventId: string
  ): Promise<{ hotels: EnhancedHotel[]; activities: EnhancedActivity[] } | null> {
    const event = await db
      .select()
      .from(destinationEvents)
      .where(eq(destinationEvents.id, eventId))
      .limit(1);

    if (event.length === 0) {
      return null;
    }

    const targetEvent = event[0];
    const travelMonth = targetEvent.startMonth || new Date().getMonth() + 1;

    const recommendations = await this.getAIEnhancedRecommendations(
      {
        cityName,
        country,
        travelMonth,
        preferences: targetEvent.eventType ? [targetEvent.eventType] : undefined,
      },
      10
    );

    const eventRelatedActivities = recommendations.activities.filter((a) => a.eventRelated);
    const otherActivities = recommendations.activities.filter((a) => !a.eventRelated);

    return {
      hotels: recommendations.hotels,
      activities: [...eventRelatedActivities, ...otherActivities].slice(0, 10),
    };
  }

  async getBestTimeRecommendations(
    cityName: string,
    country: string
  ): Promise<{
    bestMonths: { month: number; rating: string; reasons: string[] }[];
    worstMonths: { month: number; rating: string; reasons: string[] }[];
  }> {
    const seasons = await db
      .select()
      .from(destinationSeasons)
      .where(
        and(
          eq(destinationSeasons.city, cityName),
          eq(destinationSeasons.country, country)
        )
      )
      .orderBy(destinationSeasons.month);

    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ];

    const bestMonths = seasons
      .filter((s) => s.rating === "excellent" || s.rating === "good")
      .map((s) => ({
        month: s.month,
        rating: s.rating,
        reasons: [
          s.weatherDescription || `Great weather in ${monthNames[s.month - 1]}`,
          ...(s.highlights as string[] || []),
        ],
      }));

    const worstMonths = seasons
      .filter((s) => s.rating === "poor")
      .map((s) => ({
        month: s.month,
        rating: s.rating,
        reasons: [
          s.weatherDescription || `Challenging conditions in ${monthNames[s.month - 1]}`,
        ],
      }));

    return { bestMonths, worstMonths };
  }

  // ───── Section 2: Service Opportunity Recommendations ─────────────────────

  async analyzeTravelPulseTrends(city: string): Promise<TrendAnalysis[]> {
    const trends = await db
      .select()
      .from(travelPulseTrending)
      .where(
        and(
          eq(travelPulseTrending.city, city.toLowerCase()),
          gte(travelPulseTrending.expiresAt, new Date())
        )
      )
      .orderBy(desc(travelPulseTrending.trendScore))
      .limit(20);

    const analysisMap = new Map<string, TrendAnalysis>();

    for (const trend of trends) {
      const serviceType = this.mapDestinationTypeToServiceType(trend.destinationType || "");

      if (!analysisMap.has(serviceType)) {
        analysisMap.set(serviceType, {
          serviceType,
          demandLevel: this.scoreToDemandLevel(trend.trendScore || 0),
          demandScore: trend.trendScore || 0,
          trendDirection: (trend.trendStatus === "emerging" || trend.trendStatus === "viral") ? "up" :
                         trend.trendStatus === "declining" ? "down" : "stable",
          seasonalPeak: [],
          triggerEvents: trend.triggerEvent ? [trend.triggerEvent] : [],
          supplyGap: 0,
        });
      } else {
        const existing = analysisMap.get(serviceType)!;
        existing.demandScore = Math.max(existing.demandScore, trend.trendScore || 0);
        existing.demandLevel = this.scoreToDemandLevel(existing.demandScore);
        if (trend.triggerEvent && !existing.triggerEvents.includes(trend.triggerEvent)) {
          existing.triggerEvents.push(trend.triggerEvent);
        }
      }
    }

    return Array.from(analysisMap.values());
  }

  private mapDestinationTypeToServiceType(destType: string): string {
    const mappings: Record<string, string> = {
      "restaurant": "food_tour",
      "attraction": "city_tour",
      "hotel": "accommodation",
      "tour": "city_tour",
      "neighborhood": "cultural",
      "activity": "adventure",
    };
    return mappings[destType.toLowerCase()] || "city_tour";
  }

  private scoreToDemandLevel(score: number): "low" | "moderate" | "high" | "very_high" | "trending" {
    if (score >= 800) return "trending";
    if (score >= 600) return "very_high";
    if (score >= 400) return "high";
    if (score >= 200) return "moderate";
    return "low";
  }

  async generateDemandSignals(city: string, country?: string): Promise<ServiceDemandSignal[]> {
    const trends = await this.analyzeTravelPulseTrends(city);
    const existingSupply = await this.getExistingSupplyByLocation(city);

    const signals: ServiceDemandSignal[] = [];
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    for (const trend of trends) {
      const supplyCount = existingSupply.get(trend.serviceType) || 0;
      const supplyGap = Math.max(0, Math.min(100, trend.demandScore / 10 - supplyCount * 5));

      try {
        const [inserted] = await db
          .insert(serviceDemandSignals)
          .values({
            city: city.toLowerCase(),
            country: country || null,
            serviceType: trend.serviceType,
            demandLevel: trend.demandLevel,
            demandScore: trend.demandScore,
            trendDirection: trend.trendDirection,
            supplyGap: Math.round(supplyGap),
            seasonalPeak: trend.seasonalPeak,
            triggerEvents: trend.triggerEvents,
            relatedTrends: [],
            confidenceScore: 80,
            expiresAt,
          })
          .onConflictDoNothing()
          .returning();

        if (inserted) {
          signals.push(inserted);
        }
      } catch (error) {
        console.error("Error inserting demand signal:", error);
      }
    }

    return signals;
  }

  private async getExistingSupplyByLocation(location: string): Promise<Map<string, number>> {
    const supplyMap = new Map<string, number>();

    const services = await db
      .select({
        serviceType: providerServices.serviceType,
        count: sql<number>`count(*)`,
      })
      .from(providerServices)
      .where(
        and(
          eq(providerServices.formStatus, "approved"),
          ilike(providerServices.location, `%${location}%`)
        )
      )
      .groupBy(providerServices.serviceType);

    for (const service of services) {
      if (service.serviceType) {
        supplyMap.set(service.serviceType.toLowerCase(), Number(service.count));
      }
    }

    return supplyMap;
  }

  async getExpertRecommendations(
    expertId: string,
    cities: string[] = [],
    limit: number = 10
  ): Promise<ExpertRecommendation[]> {
    if (cities.length === 0) {
      return [];
    }

    const existingServices = await this.getExpertExistingServices(expertId);
    const recommendations: ExpertRecommendation[] = [];

    for (const city of cities.slice(0, 5)) {
      const signals = await db
        .select()
        .from(serviceDemandSignals)
        .where(
          and(
            ilike(serviceDemandSignals.city, `%${city}%`),
            gte(serviceDemandSignals.demandScore, 300),
            gte(serviceDemandSignals.expiresAt!, new Date())
          )
        )
        .orderBy(desc(serviceDemandSignals.demandScore))
        .limit(10);

      for (const signal of signals) {
        if (existingServices.has(signal.serviceType)) {
          continue;
        }

        const opportunityScore = this.calculateExpertOpportunityScore(signal, existingServices);

        if (opportunityScore < 40) continue;

        recommendations.push({
          id: signal.id,
          title: `Add ${this.formatServiceType(signal.serviceType)} in ${this.capitalizeCity(city)}`,
          description: this.generateExpertDescription(signal),
          serviceType: signal.serviceType,
          city: city,
          country: signal.country || undefined,
          opportunityScore,
          potentialRevenue: signal.averagePrice ? Number(signal.averagePrice) * 20 : undefined,
          competitionLevel: (signal.supplyGap || 0) > 60 ? "low" : (signal.supplyGap || 0) > 30 ? "medium" : "high",
          actionItems: this.generateExpertActionItems(signal),
          supportingData: {
            trendScore: signal.demandScore,
            demandLevel: signal.demandLevel,
            seasonalPeaks: signal.seasonalPeak as number[],
            relatedTrends: signal.triggerEvents as string[],
          },
        });
      }
    }

    return recommendations
      .sort((a, b) => b.opportunityScore - a.opportunityScore)
      .slice(0, limit);
  }

  private async getExpertExistingServices(expertId: string): Promise<Set<string>> {
    const services = new Set<string>();

    const selectedServices = await db
      .select({
        name: expertServiceOfferings.name,
      })
      .from(expertSelectedServices)
      .innerJoin(expertServiceOfferings, eq(expertSelectedServices.serviceOfferingId, expertServiceOfferings.id))
      .where(eq(expertSelectedServices.expertId, expertId));

    for (const service of selectedServices) {
      const normalized = this.normalizeServiceType(service.name);
      services.add(normalized);
    }

    const customServices = await db
      .select({ title: expertCustomServices.title })
      .from(expertCustomServices)
      .where(
        and(
          eq(expertCustomServices.expertId, expertId),
          eq(expertCustomServices.status, "approved")
        )
      );

    for (const service of customServices) {
      const normalized = this.normalizeServiceType(service.title);
      services.add(normalized);
    }

    return services;
  }

  private normalizeServiceType(name: string): string {
    const nameLower = name.toLowerCase();
    for (const [type, keywords] of Object.entries(SERVICE_TYPE_MAPPINGS)) {
      if (keywords.some(kw => nameLower.includes(kw))) {
        return type;
      }
    }
    return nameLower.replace(/\s+/g, "_");
  }

  private calculateExpertOpportunityScore(
    signal: ServiceDemandSignal,
    existingServices: Set<string>
  ): number {
    let score = 0;

    score += Math.min(40, signal.demandScore / 25);

    const supplyGap = signal.supplyGap || 0;
    score += Math.min(30, supplyGap * 0.3);

    if (signal.trendDirection === "up") {
      score += 15;
    } else if (signal.trendDirection === "stable") {
      score += 5;
    }

    if (signal.confidenceScore) {
      score += (signal.confidenceScore / 100) * 15;
    }

    return Math.round(Math.min(100, score));
  }

  private formatServiceType(type: string): string {
    return type
      .split("_")
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }

  private capitalizeCity(city: string): string {
    return city
      .split(" ")
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");
  }

  private generateExpertDescription(signal: ServiceDemandSignal): string {
    const demandText = signal.demandLevel === "trending" ? "rapidly trending" :
                       signal.demandLevel === "very_high" ? "high demand" :
                       signal.demandLevel === "high" ? "growing demand" : "moderate demand";

    const triggerEvents = signal.triggerEvents as string[] || [];
    const triggerText = triggerEvents.length > 0
      ? ` driven by ${triggerEvents.slice(0, 2).join(", ")}`
      : "";

    return `${this.formatServiceType(signal.serviceType)} services show ${demandText} in ${this.capitalizeCity(signal.city)}${triggerText}. Supply gap analysis suggests low competition.`;
  }

  private generateExpertActionItems(signal: ServiceDemandSignal): string[] {
    const items: string[] = [];

    items.push(`Create a ${this.formatServiceType(signal.serviceType)} service listing`);

    const seasonalPeak = signal.seasonalPeak as number[] || [];
    if (seasonalPeak.length > 0) {
      const months = seasonalPeak.map(m => this.getMonthName(m)).join(", ");
      items.push(`Prepare for peak season: ${months}`);
    }

    const triggerEvents = signal.triggerEvents as string[] || [];
    if (triggerEvents.length > 0) {
      items.push(`Leverage trending topics: ${triggerEvents[0]}`);
    }

    items.push("Set competitive pricing based on market analysis");
    items.push("Add high-quality photos and detailed descriptions");

    return items;
  }

  private getMonthName(month: number): string {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return months[month - 1] || "Unknown";
  }

  async getProviderRecommendations(
    providerId: string,
    location: string,
    limit: number = 10
  ): Promise<ProviderRecommendation[]> {
    if (!location) {
      return [];
    }

    const existingServices = await this.getProviderExistingServices(providerId);

    const gapAnalysis = await db
      .select()
      .from(serviceGapAnalysis)
      .where(
        and(
          ilike(serviceGapAnalysis.city, `%${location}%`),
          gte(serviceGapAnalysis.gapScore, 30)
        )
      )
      .orderBy(desc(serviceGapAnalysis.gapScore))
      .limit(20);

    const recommendations: ProviderRecommendation[] = [];

    for (const gap of gapAnalysis) {
      if (existingServices.has(gap.serviceType)) {
        continue;
      }

      recommendations.push({
        id: gap.id,
        title: `Offer ${this.formatServiceType(gap.serviceType)} Services`,
        description: gap.opportunityDescription ||
          `Market analysis shows a gap in ${this.formatServiceType(gap.serviceType)} services in ${this.capitalizeCity(location)}.`,
        serviceType: gap.serviceType,
        city: location,
        country: gap.country || undefined,
        opportunityScore: Math.min(100, gap.gapScore + 20),
        gapScore: gap.gapScore,
        currentSupplyCount: gap.currentSupplyCount || 0,
        priceRangeGap: gap.priceRangeGap as { budget?: number; midrange?: number; luxury?: number } || {},
        recommendedActions: gap.recommendedActions as string[] || [],
      });
    }

    if (recommendations.length < limit) {
      const signals = await db
        .select()
        .from(serviceDemandSignals)
        .where(
          and(
            ilike(serviceDemandSignals.city, `%${location}%`),
            gte(serviceDemandSignals.supplyGap!, 40),
            gte(serviceDemandSignals.expiresAt!, new Date())
          )
        )
        .orderBy(desc(serviceDemandSignals.supplyGap))
        .limit(10);

      for (const signal of signals) {
        if (existingServices.has(signal.serviceType)) continue;
        if (recommendations.some(r => r.serviceType === signal.serviceType)) continue;

        recommendations.push({
          id: signal.id,
          title: `Add ${this.formatServiceType(signal.serviceType)} to Your Offerings`,
          description: `High demand with ${signal.demandLevel} interest and low supply in ${this.capitalizeCity(location)}.`,
          serviceType: signal.serviceType,
          city: location,
          country: signal.country || undefined,
          opportunityScore: Math.min(100, (signal.supplyGap || 0) + 30),
          gapScore: signal.supplyGap || 0,
          currentSupplyCount: 0,
          priceRangeGap: {},
          recommendedActions: [
            `Create ${this.formatServiceType(signal.serviceType)} service listing`,
            "Research competitor pricing in the area",
            "Highlight unique selling points",
          ],
        });
      }
    }

    return recommendations
      .sort((a, b) => b.opportunityScore - a.opportunityScore)
      .slice(0, limit);
  }

  private async getProviderExistingServices(providerId: string): Promise<Set<string>> {
    const services = new Set<string>();

    const providerSvcs = await db
      .select({ serviceType: providerServices.serviceType, serviceName: providerServices.serviceName })
      .from(providerServices)
      .where(eq(providerServices.userId, providerId));

    for (const service of providerSvcs) {
      if (service.serviceType) {
        services.add(service.serviceType.toLowerCase());
      }
      if (service.serviceName) {
        services.add(this.normalizeServiceType(service.serviceName));
      }
    }

    return services;
  }

  async getUserRecommendations(
    userId: string,
    city: string,
    preferences?: string[],
    limit: number = 10
  ): Promise<UserRecommendation[]> {
    const signals = await db
      .select()
      .from(serviceDemandSignals)
      .where(
        and(
          ilike(serviceDemandSignals.city, `%${city}%`),
          gte(serviceDemandSignals.demandScore, 200),
          gte(serviceDemandSignals.expiresAt!, new Date())
        )
      )
      .orderBy(desc(serviceDemandSignals.demandScore))
      .limit(20);

    const recommendations: UserRecommendation[] = [];

    for (const signal of signals) {
      let matchScore = 50;
      const reasons: string[] = [];

      if (signal.demandLevel === "trending") {
        matchScore += 20;
        reasons.push("Trending in your destination");
      } else if (signal.demandLevel === "very_high") {
        matchScore += 15;
        reasons.push("Popular with travelers");
      }

      if (preferences?.length) {
        const serviceWords = signal.serviceType.split("_");
        const matchedPrefs = preferences.filter(pref =>
          serviceWords.some(word => pref.toLowerCase().includes(word))
        );
        if (matchedPrefs.length > 0) {
          matchScore += 20;
          reasons.push(`Matches your interest in ${matchedPrefs[0]}`);
        }
      }

      const triggerEvents = signal.triggerEvents as string[] || [];
      if (triggerEvents.length > 0) {
        reasons.push(`Featured: ${triggerEvents[0]}`);
      }

      const services = await db
        .select({ id: providerServices.id, serviceName: providerServices.serviceName, price: providerServices.price })
        .from(providerServices)
        .where(
          and(
            eq(providerServices.formStatus, "approved"),
            ilike(providerServices.location, `%${city}%`),
            ilike(providerServices.serviceType, `%${signal.serviceType}%`)
          )
        )
        .limit(3);

      recommendations.push({
        id: signal.id,
        title: `Explore ${this.formatServiceType(signal.serviceType)}`,
        description: `Discover ${signal.demandLevel === "trending" ? "trending" : "popular"} ${this.formatServiceType(signal.serviceType).toLowerCase()} experiences in ${this.capitalizeCity(city)}.`,
        serviceType: signal.serviceType,
        city: city,
        matchScore: Math.min(100, matchScore),
        reasons,
        relatedServices: services.map(s => ({
          id: s.id,
          name: s.serviceName,
          price: s.price ? Number(s.price) : undefined,
        })),
      });
    }

    return recommendations
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, limit);
  }

  async recordConversion(
    recommendationId: string,
    userId: string,
    conversionType: string,
    resultId?: string,
    revenueGenerated?: number
  ): Promise<void> {
    await db.insert(recommendationConversions).values({
      recommendationId,
      userId,
      conversionType,
      resultId: resultId || null,
      revenueGenerated: revenueGenerated?.toString() || null,
    });

    await db
      .update(serviceRecommendations)
      .set({
        status: "converted",
        convertedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(serviceRecommendations.id, recommendationId));
  }

  async dismissRecommendation(recommendationId: string): Promise<void> {
    await db
      .update(serviceRecommendations)
      .set({
        status: "dismissed",
        dismissedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(serviceRecommendations.id, recommendationId));
  }

  async getSeasonalOpportunities(
    city: string,
    month?: number
  ): Promise<SeasonalOpportunity[]> {
    const currentMonth = month || new Date().getMonth() + 1;
    const nextThreeMonths = [
      currentMonth,
      (currentMonth % 12) + 1,
      ((currentMonth + 1) % 12) + 1,
    ];

    return db
      .select()
      .from(seasonalOpportunities)
      .where(
        and(
          ilike(seasonalOpportunities.city, `%${city}%`),
          inArray(seasonalOpportunities.month, nextThreeMonths)
        )
      )
      .orderBy(asc(seasonalOpportunities.month));
  }

  async refreshDemandSignalsForCity(city: string): Promise<number> {
    const signals = await this.generateDemandSignals(city);
    return signals.length;
  }

  async getMarketIntelligence(city: string): Promise<{
    topDemandSignals: ServiceDemandSignal[];
    gapAnalysis: ServiceGapAnalysis[];
    seasonalOpportunities: SeasonalOpportunity[];
    trendingSummary: {
      totalTrending: number;
      topServiceTypes: string[];
      averageDemandScore: number;
    };
  }> {
    const [signals, gaps, seasonal] = await Promise.all([
      db
        .select()
        .from(serviceDemandSignals)
        .where(
          and(
            ilike(serviceDemandSignals.city, `%${city}%`),
            gte(serviceDemandSignals.expiresAt!, new Date())
          )
        )
        .orderBy(desc(serviceDemandSignals.demandScore))
        .limit(10),
      db
        .select()
        .from(serviceGapAnalysis)
        .where(ilike(serviceGapAnalysis.city, `%${city}%`))
        .orderBy(desc(serviceGapAnalysis.gapScore))
        .limit(10),
      this.getSeasonalOpportunities(city),
    ]);

    const trendingCount = signals.filter(s => s.demandLevel === "trending").length;
    const avgScore = signals.length > 0
      ? signals.reduce((sum, s) => sum + s.demandScore, 0) / signals.length
      : 0;

    const topTypesSet = new Set<string>();
    signals.slice(0, 5).forEach(s => topTypesSet.add(s.serviceType));
    const topTypes = Array.from(topTypesSet);

    return {
      topDemandSignals: signals,
      gapAnalysis: gaps,
      seasonalOpportunities: seasonal,
      trendingSummary: {
        totalTrending: trendingCount,
        topServiceTypes: topTypes,
        averageDemandScore: Math.round(avgScore),
      },
    };
  }

  async getTrendingRecommendations(
    experienceType?: string,
    limit: number = 10
  ): Promise<UserRecommendation[]> {
    const trendingData = await db
      .select()
      .from(travelPulseTrending)
      .where(gte(travelPulseTrending.trendScore, 60))
      .orderBy(desc(travelPulseTrending.trendScore))
      .limit(limit);

    const recommendations: UserRecommendation[] = [];

    for (const trend of trendingData) {
      const reasons: string[] = [];
      let matchScore = 50;

      if ((trend.trendScore || 0) >= 80) {
        matchScore += 25;
        reasons.push("Highly trending destination");
      } else if ((trend.trendScore || 0) >= 60) {
        matchScore += 15;
        reasons.push("Popular trending destination");
      }

      const category = trend.destinationType || "travel";
      reasons.push(`Category: ${category}`);
      if (experienceType && category.toLowerCase().includes(experienceType.toLowerCase())) {
        matchScore += 20;
        reasons.push(`Matches your interest: ${experienceType}`);
      }

      const cityName = trend.city;

      const services = await db
        .select({ id: providerServices.id, serviceName: providerServices.serviceName, price: providerServices.price })
        .from(providerServices)
        .where(
          and(
            eq(providerServices.formStatus, "approved"),
            ilike(providerServices.location, `%${cityName}%`)
          )
        )
        .limit(3);

      recommendations.push({
        id: trend.id.toString(),
        title: `Explore ${trend.destinationName}`,
        description: `Trending ${category} in ${cityName}${trend.country ? `, ${trend.country}` : ''}`,
        serviceType: category,
        city: cityName,
        matchScore: Math.min(100, matchScore),
        reasons,
        relatedServices: services.map(s => ({
          id: s.id,
          name: s.serviceName,
          price: s.price ? Number(s.price) : undefined,
        })),
      });
    }

    return recommendations
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, limit);
  }
}

export const recommendationService = new RecommendationService();

/** @deprecated Use recommendationService from recommendation.service */
export const aiRecommendationEngineService = recommendationService;

/** @deprecated Use recommendationService from recommendation.service */
export const serviceRecommendationEngine = recommendationService;
