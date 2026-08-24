import { grokService, RealTimeIntelligenceResult, AutonomousItineraryResult, TravelPulseContext } from "./grok.service";
import { travelPulseService } from "./travelpulse.service";

export interface CartItem {
  id: string;
  type: string;
  name: string;
  price: number;
  quantity: number;
  provider?: string;
  details?: string;
  scheduledDate?: string;
  scheduledTime?: string;
  duration?: number;
  meetingPoint?: string;
  coordinates?: { lat: number; lng: number };
}

export interface TripOptimizationRequest {
  destination: string;
  dates: { start: string; end: string };
  travelers: number;
  budget?: number;
  eventType?: string;
  interests: string[];
  pacePreference?: "relaxed" | "moderate" | "packed";
  cartItems?: CartItem[];
  mustSeeAttractions?: string[];
  dietaryRestrictions?: string[];
  mobilityConsiderations?: string[];
}

export interface OptimizedItinerary extends AutonomousItineraryResult {
  variationType: "user_plan" | "weather_optimized" | "best_value";
  variationLabel: string;
  variationDescription: string;
  optimizationInsights: string[];
  realTimeFactors: {
    weatherUsed: boolean;
    eventsIncluded: number;
    dealsApplied: number;
    safetyAlertsConsidered: number;
  };
}

export interface TripOptimizationResult {
  destination: string;
  dateRange: { start: string; end: string };
  realTimeIntelligence: RealTimeIntelligenceResult | null;
  variations: OptimizedItinerary[];
  generatedAt: string;
}

class TripOptimizationService {
  async generateOptimizedItineraries(
    request: TripOptimizationRequest
  ): Promise<TripOptimizationResult> {
    let realTimeData: RealTimeIntelligenceResult | null = null;
    let travelPulseContext: TravelPulseContext | undefined = undefined;
    
    // Fetch real-time intelligence from Grok
    try {
      const intelligenceResult = await grokService.getRealTimeIntelligence({
        destination: request.destination,
        dates: request.dates,
        topics: ["events", "weather", "safety", "trending", "deals"],
      });
      realTimeData = intelligenceResult.result;
    } catch (error) {
      console.error("Failed to fetch real-time intelligence:", error);
    }

    // Fetch TravelPulse city intelligence for AI context
    try {
      const cityIntelligence = await travelPulseService.getCityIntelligence(request.destination);
      if (cityIntelligence?.city) {
        const city = cityIntelligence.city;
        travelPulseContext = {
          pulseScore: typeof city.pulseScore === 'number' ? city.pulseScore : undefined,
          trendingScore: typeof city.trendingScore === 'number' ? city.trendingScore : undefined,
          crowdLevel: typeof city.crowdLevel === 'string' ? city.crowdLevel : undefined,
          aiBudgetEstimate: typeof city.aiBudgetEstimate === 'string' ? city.aiBudgetEstimate : undefined,
          aiTravelTips: typeof city.aiTravelTips === 'string' ? city.aiTravelTips : undefined,
          aiLocalInsights: typeof city.aiLocalInsights === 'string' ? city.aiLocalInsights : undefined,
          aiMustSeeAttractions: typeof city.aiMustSeeAttractions === 'string' ? city.aiMustSeeAttractions : undefined,
          aiSeasonalHighlights: typeof city.aiSeasonalHighlights === 'string' ? city.aiSeasonalHighlights : undefined,
          aiUpcomingEvents: typeof city.aiUpcomingEvents === 'string' ? city.aiUpcomingEvents : undefined,
          hiddenGems: cityIntelligence.hiddenGems?.slice(0, 5).map(g => ({
            name: g.placeName,
            description: g.description ?? "",
            gemScore: g.gemScore ?? 0,
          })),
          happeningNow: cityIntelligence.happeningNow?.slice(0, 5).map(e => ({
            name: e.title,
            type: e.eventType ?? "event",
          })),
        };
        console.log(`[TripOptimization] TravelPulse context loaded for ${request.destination}`);
      }
    } catch (error) {
      console.error("Failed to fetch TravelPulse intelligence:", error);
    }

    const variations: OptimizedItinerary[] = [];

    // Extract cart item names to include as must-see attractions
    const cartItemNames = request.cartItems?.map(item => item.name) || [];
    const combinedAttractions = [
      ...(request.mustSeeAttractions || []),
      ...cartItemNames,
    ].slice(0, 15); // Limit to prevent prompt overload

    // Include cart items context and TravelPulse intelligence in the base request
    const baseItineraryResult = await grokService.generateAutonomousItinerary({
      destination: request.destination,
      dates: request.dates,
      travelers: request.travelers,
      budget: request.budget,
      eventType: request.eventType,
      interests: request.interests,
      pacePreference: request.pacePreference,
      mustSeeAttractions: combinedAttractions,
      dietaryRestrictions: request.dietaryRestrictions,
      mobilityConsiderations: request.mobilityConsiderations,
      travelPulseContext,
    });

    const cartItemsInsight = cartItemNames.length > 0 
      ? `Includes ${cartItemNames.length} selected ${cartItemNames.length === 1 ? 'activity' : 'activities'}`
      : null;

    variations.push({
      ...baseItineraryResult.result,
      variationType: "user_plan",
      variationLabel: "Your Custom Plan",
      variationDescription: "Based on your preferences and selected activities",
      optimizationInsights: [
        `Tailored for ${request.travelers} traveler${request.travelers > 1 ? 's' : ''}`,
        `Pace: ${request.pacePreference || 'moderate'}`,
        ...(cartItemsInsight ? [cartItemsInsight] : []),
        `Interests: ${request.interests.slice(0, 3).join(', ') || 'General exploration'}`,
        ...(travelPulseContext ? ["Enhanced with TravelPulse AI destination insights"] : []),
      ],
      realTimeFactors: {
        weatherUsed: false,
        eventsIncluded: 0,
        dealsApplied: 0,
        safetyAlertsConsidered: 0,
      },
    });

    if (realTimeData) {
      const weatherOptimizedResult = await this.generateWeatherOptimizedItinerary(
        request,
        realTimeData,
        travelPulseContext
      );
      variations.push(weatherOptimizedResult);

      const bestValueResult = await this.generateBestValueItinerary(
        request,
        realTimeData,
        travelPulseContext
      );
      variations.push(bestValueResult);
    } else {
      const alternativeResult = await grokService.generateAutonomousItinerary({
        ...request,
        pacePreference: request.pacePreference === "packed" ? "moderate" : "packed",
        travelPulseContext,
      });
      
      variations.push({
        ...alternativeResult.result,
        variationType: "weather_optimized",
        variationLabel: "Adventure Focus",
        variationDescription: "More activities and experiences packed in",
        optimizationInsights: [
          "Maximized activities per day",
          "Efficient route planning",
          "Early starts for popular attractions",
          ...(travelPulseContext ? ["Enhanced with TravelPulse AI insights"] : []),
        ],
        realTimeFactors: {
          weatherUsed: false,
          eventsIncluded: 0,
          dealsApplied: 0,
          safetyAlertsConsidered: 0,
        },
      });

      const relaxedResult = await grokService.generateAutonomousItinerary({
        ...request,
        pacePreference: "relaxed",
        travelPulseContext,
      });
      
      variations.push({
        ...relaxedResult.result,
        variationType: "best_value",
        variationLabel: "Relaxed Experience",
        variationDescription: "More downtime and flexibility",
        optimizationInsights: [
          "Extended time at each location",
          "Built-in rest periods",
          "Flexible dining options",
          ...(travelPulseContext ? ["Enhanced with TravelPulse AI insights"] : []),
        ],
        realTimeFactors: {
          weatherUsed: false,
          eventsIncluded: 0,
          dealsApplied: 0,
          safetyAlertsConsidered: 0,
        },
      });
    }

    return {
      destination: request.destination,
      dateRange: request.dates,
      realTimeIntelligence: realTimeData,
      variations,
      generatedAt: new Date().toISOString(),
    };
  }

  private async generateWeatherOptimizedItinerary(
    request: TripOptimizationRequest,
    realTimeData: RealTimeIntelligenceResult,
    travelPulseContext?: TravelPulseContext
  ): Promise<OptimizedItinerary> {
    const weatherContext = realTimeData.weatherForecast
      ? `Weather forecast: ${realTimeData.weatherForecast.summary}, ${realTimeData.weatherForecast.conditions}, High: ${realTimeData.weatherForecast.temperature.high}°F, Low: ${realTimeData.weatherForecast.temperature.low}°F`
      : "";

    const eventsContext = realTimeData.events?.length
      ? `Local events during trip: ${realTimeData.events.map(e => `${e.name} (${e.date})`).join(", ")}`
      : "";

    const safetyContext = realTimeData.safetyAlerts?.length
      ? `Safety considerations: ${realTimeData.safetyAlerts.map(a => a.message).join("; ")}`
      : "";

    // Include cart items and high-relevance events in attractions
    const cartItemNames = request.cartItems?.map(item => item.name) || [];
    const enhancedAttractions = [
      ...(request.mustSeeAttractions || []),
      ...cartItemNames,
      ...(realTimeData.events?.filter(e => e.relevance === "high").map(e => e.name) || []),
    ];

    const result = await grokService.generateAutonomousItinerary({
      ...request,
      mustSeeAttractions: enhancedAttractions.slice(0, 12),
      travelPulseContext,
    });

    const insights: string[] = [];
    if (realTimeData.weatherForecast) {
      insights.push(`Weather-aware scheduling: ${realTimeData.weatherForecast.conditions}`);
    }
    if (realTimeData.events?.length) {
      insights.push(`${realTimeData.events.length} local events considered`);
    }
    if (realTimeData.safetyAlerts?.length) {
      insights.push(`${realTimeData.safetyAlerts.length} safety advisories reviewed`);
    }

    return {
      ...result.result,
      variationType: "weather_optimized",
      variationLabel: "Weather & Events Optimized",
      variationDescription: "Outdoor activities scheduled for best weather, local events included",
      optimizationInsights: insights.length ? insights : [
        "Schedule optimized for weather conditions",
        "Local events and festivals incorporated",
        "Indoor/outdoor activities balanced",
      ],
      realTimeFactors: {
        weatherUsed: !!realTimeData.weatherForecast,
        eventsIncluded: realTimeData.events?.filter(e => e.relevance === "high").length || 0,
        dealsApplied: 0,
        safetyAlertsConsidered: realTimeData.safetyAlerts?.length || 0,
      },
    };
  }

  private async generateBestValueItinerary(
    request: TripOptimizationRequest,
    realTimeData: RealTimeIntelligenceResult,
    travelPulseContext?: TravelPulseContext
  ): Promise<OptimizedItinerary> {
    const dealsContext = realTimeData.deals?.length
      ? realTimeData.deals.map(d => `${d.title}: ${d.discount}`).join(", ")
      : "";

    const trendingContext = realTimeData.trendingExperiences?.length
      ? realTimeData.trendingExperiences.map(t => t.name).join(", ")
      : "";

    const budgetAdjusted = request.budget 
      ? Math.floor(request.budget * 0.8)
      : undefined;

    // Include cart items and trending experiences
    const cartItemNames = request.cartItems?.map(item => item.name) || [];
    const result = await grokService.generateAutonomousItinerary({
      ...request,
      budget: budgetAdjusted,
      mustSeeAttractions: [
        ...(request.mustSeeAttractions || []),
        ...cartItemNames,
        ...(realTimeData.trendingExperiences?.slice(0, 3).map(t => t.name) || []),
      ].slice(0, 12),
      travelPulseContext,
    });

    const insights: string[] = [];
    if (realTimeData.deals?.length) {
      insights.push(`${realTimeData.deals.length} current deals applied`);
      const topDeal = realTimeData.deals[0];
      if (topDeal) {
        insights.push(`Featured: ${topDeal.title} - ${topDeal.discount}`);
      }
    }
    if (realTimeData.trendingExperiences?.length) {
      insights.push(`${realTimeData.trendingExperiences.length} trending experiences included`);
    }
    insights.push("Budget-conscious alternatives selected");

    return {
      ...result.result,
      variationType: "best_value",
      variationLabel: "Best Value",
      variationDescription: "Maximized experiences with current deals and smart savings",
      optimizationInsights: insights,
      realTimeFactors: {
        weatherUsed: false,
        eventsIncluded: 0,
        dealsApplied: realTimeData.deals?.length || 0,
        safetyAlertsConsidered: 0,
      },
    };
  }
}

export const tripOptimizationService = new TripOptimizationService();
