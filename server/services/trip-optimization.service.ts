import { aiGenerationService, RealTimeIntelligenceResult, AutonomousItineraryResult, TravelPulseContext } from "./ai-generation.service";
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
    request: TripOptimizationRequest,
    // Every generation below writes its own `ai_cost_tracking` row, attributed to this user
    // (ledger `2026-09-30-ai-task-honest-numbers`).
    actorUserId: string | null,
  ): Promise<TripOptimizationResult> {
    const attribution = { sourceType: "ai_trip_optimization", userId: actorUserId };
    let travelPulseContext: TravelPulseContext | undefined = undefined;
    
    // Real-time intelligence (weather/events/safety/deals) came from a Grok "live search" call that
    // was retired with the xAI key (ledger `2026-09-30-retire-xai`). Nothing replaces it: the
    // weather/best-value variants built on it are not produced and `realTimeIntelligence` is null,
    // never fed a guess (§13).

    // Fetch TravelPulse city intelligence for AI context
    try {
      const cityIntelligence = await travelPulseService.getCityIntelligence(request.destination, { forDraft: true });
      if (cityIntelligence?.city) {
        const city = cityIntelligence.city;
        travelPulseContext = {
          trendingScore: typeof city.trendingScore === 'number' ? city.trendingScore : undefined,
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
    const baseItineraryResult = await aiGenerationService.generateAutonomousItinerary({
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
    }, attribution);

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

    const alternativeResult = await aiGenerationService.generateAutonomousItinerary({
      ...request,
      pacePreference: request.pacePreference === "packed" ? "moderate" : "packed",
      travelPulseContext,
    }, attribution);
    
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

    const relaxedResult = await aiGenerationService.generateAutonomousItinerary({
      ...request,
      pacePreference: "relaxed",
      travelPulseContext,
    }, attribution);
    
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

    return {
      destination: request.destination,
      dateRange: request.dates,
      realTimeIntelligence: null,
      variations,
      generatedAt: new Date().toISOString(),
    };
  }
}

export const tripOptimizationService = new TripOptimizationService();
