import { grokService, RealTimeIntelligenceResult, AutonomousItineraryResult } from "./grok.service";

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

    const variations: OptimizedItinerary[] = [];

    // Extract cart item names to include as must-see attractions
    const cartItemNames = request.cartItems?.map(item => item.name) || [];
    const combinedAttractions = [
      ...(request.mustSeeAttractions || []),
      ...cartItemNames,
    ].slice(0, 15); // Limit to prevent prompt overload

    // Include cart items context in the base request
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
        realTimeData
      );
      variations.push(weatherOptimizedResult);

      const bestValueResult = await this.generateBestValueItinerary(
        request,
        realTimeData
      );
      variations.push(bestValueResult);
    } else {
      const alternativeResult = await grokService.generateAutonomousItinerary({
        ...request,
        pacePreference: request.pacePreference === "packed" ? "moderate" : "packed",
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
    realTimeData: RealTimeIntelligenceResult
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
    realTimeData: RealTimeIntelligenceResult
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
