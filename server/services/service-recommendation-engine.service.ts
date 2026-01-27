import { db } from "../db";
import {
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
  expertSpecializations,
  users,
  ServiceDemandSignal,
  ServiceGapAnalysis,
  SeasonalOpportunity,
} from "@shared/schema";
import { eq, and, gte, desc, asc, sql, ilike, inArray } from "drizzle-orm";

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

class ServiceRecommendationEngineService {
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
        count: sql<number>`count(*)` 
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
    // Get trending destinations from TravelPulse data
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

      // Use destinationType as category
      const category = trend.destinationType || "travel";
      reasons.push(`Category: ${category}`);
      if (experienceType && category.toLowerCase().includes(experienceType.toLowerCase())) {
        matchScore += 20;
        reasons.push(`Matches your interest: ${experienceType}`);
      }

      // Use city for location lookup
      const cityName = trend.city;
      
      // Get related services in that destination
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

export const serviceRecommendationEngine = new ServiceRecommendationEngineService();
