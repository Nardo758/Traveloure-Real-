import { db } from "../db";
import {
  hotelCache,
  hotelOfferCache,
  activityCache,
  destinationSeasons,
  destinationEvents,
  travelPulseCities,
  HotelCache,
  ActivityCache,
  DestinationSeason,
  DestinationEvent,
} from "@shared/schema";
import { eq, and, sql, gte, lte, desc, asc, or, ilike } from "drizzle-orm";

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

class AIRecommendationEngineService {
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
}

export const aiRecommendationEngineService = new AIRecommendationEngineService();
