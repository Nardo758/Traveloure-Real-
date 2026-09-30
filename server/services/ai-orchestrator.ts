import { aiGenerationService } from "./ai-generation.service";
import { claudeService } from "./claude.service";
import { db } from "../db";
import { aiInteractions } from "../../shared/schema";

// AI Orchestrator Service
// Routes requests to the appropriate AI provider based on task type
// Logs all interactions for cost tracking and analytics

export type AIProvider = "claude" | "auto";
export type AITaskType = 
  | "expert_matching"
  | "content_generation"
  | "real_time_intelligence"
  | "autonomous_itinerary"
  | "itinerary_optimization"
  | "transportation_analysis"
  | "travel_recommendations"
  | "chat";

export interface AIInteractionLog {
  taskType: AITaskType;
  provider: AIProvider;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost: number;
  durationMs: number;
  success: boolean;
  errorMessage?: string;
  userId?: string;
  tripId?: string;
  metadata?: Record<string, any>;
}

// Provider routing rules - which AI is best for each task
const PROVIDER_ROUTING: Record<AITaskType, AIProvider> = {
  // Every task runs on Anthropic since the xAI retirement (ledger `2026-09-30-retire-xai`).
  expert_matching: "claude",
  real_time_intelligence: "claude",
  autonomous_itinerary: "claude",
  content_generation: "claude",
  itinerary_optimization: "claude",
  transportation_analysis: "claude",
  travel_recommendations: "claude",
  chat: "claude",
};

class AIOrchestrator {
  private async logInteraction(log: AIInteractionLog): Promise<void> {
    try {
      await db.insert(aiInteractions).values({
        taskType: log.taskType,
        provider: log.provider,
        promptTokens: log.promptTokens,
        completionTokens: log.completionTokens,
        totalTokens: log.totalTokens,
        estimatedCost: log.estimatedCost.toString(),
        durationMs: log.durationMs,
        success: log.success,
        errorMessage: log.errorMessage,
        userId: log.userId,
        tripId: log.tripId,
        metadata: log.metadata,
      });
    } catch (error) {
      console.error("Failed to log AI interaction:", error);
      // Don't throw - logging failures shouldn't break the main operation
    }
  }

  private getProvider(taskType: AITaskType, preferredProvider?: AIProvider): AIProvider {
    if (preferredProvider && preferredProvider !== "auto") {
      return preferredProvider;
    }
    return PROVIDER_ROUTING[taskType] || "claude";
  }

  // Expert Matching
  async matchExpert(
    travelerProfile: Parameters<typeof aiGenerationService.matchExpertToTraveler>[0]["travelerProfile"],
    expertProfile: Parameters<typeof aiGenerationService.matchExpertToTraveler>[0]["expertProfile"],
    options?: { userId?: string; tripId?: string }
  ) {
    const startTime = Date.now();
    const provider = "claude";
    
    try {
      const { result, usage } = await aiGenerationService.matchExpertToTraveler({
        travelerProfile,
        expertProfile,
        userId: options?.userId ?? null,
      });

      await this.logInteraction({
        taskType: "expert_matching",
        provider,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        totalTokens: usage.totalTokens,
        estimatedCost: usage.estimatedCost,
        durationMs: Date.now() - startTime,
        success: true,
        userId: options?.userId,
        tripId: options?.tripId,
        metadata: { expertId: expertProfile.id },
      });

      return result;
    } catch (error: any) {
      await this.logInteraction({
        taskType: "expert_matching",
        provider,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        estimatedCost: 0,
        durationMs: Date.now() - startTime,
        success: false,
        errorMessage: error.message,
        userId: options?.userId,
        tripId: options?.tripId,
      });
      throw error;
    }
  }

  // Match multiple experts and return sorted by score
  async matchExperts(
    travelerProfile: Parameters<typeof aiGenerationService.matchExpertToTraveler>[0]["travelerProfile"],
    expertProfiles: Array<Parameters<typeof aiGenerationService.matchExpertToTraveler>[0]["expertProfile"]>,
    options?: { userId?: string; tripId?: string; limit?: number }
  ) {
    const results = await Promise.all(
      expertProfiles.map(expert =>
        this.matchExpert(travelerProfile, expert, options).catch(error => {
          console.error(`Failed to match expert ${expert.id}:`, error);
          return null;
        })
      )
    );

    const validResults = results.filter(r => r !== null);
    const sorted = validResults.sort((a, b) => b.overallScore - a.overallScore);
    
    return options?.limit ? sorted.slice(0, options.limit) : sorted;
  }

  // Autonomous Itinerary
  async generateAutonomousItinerary(
    request: Parameters<typeof aiGenerationService.generateAutonomousItinerary>[0],
    options?: { userId?: string; tripId?: string }
  ) {
    const startTime = Date.now();
    const provider = "claude";
    
    try {
      const { result, usage } = await aiGenerationService.generateAutonomousItinerary(request, {
        sourceType: "ai_itinerary",
        userId: options?.userId ?? null,
      });

      await this.logInteraction({
        taskType: "autonomous_itinerary",
        provider,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        totalTokens: usage.totalTokens,
        estimatedCost: usage.estimatedCost,
        durationMs: Date.now() - startTime,
        success: true,
        userId: options?.userId,
        tripId: options?.tripId,
        metadata: { destination: request.destination },
      });

      return result;
    } catch (error: any) {
      await this.logInteraction({
        taskType: "autonomous_itinerary",
        provider,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        estimatedCost: 0,
        durationMs: Date.now() - startTime,
        success: false,
        errorMessage: error.message,
        userId: options?.userId,
        tripId: options?.tripId,
      });
      throw error;
    }
  }

  // Itinerary Optimization - Claude (existing)
  async optimizeItinerary(
    request: Parameters<typeof claudeService.optimizeItinerary>[0],
    options?: { userId?: string; tripId?: string }
  ) {
    const startTime = Date.now();
    const provider = "claude";
    
    try {
      const result = await claudeService.optimizeItinerary(request);

      await this.logInteraction({
        taskType: "itinerary_optimization",
        provider,
        promptTokens: 0, // Claude service doesn't expose token counts yet
        completionTokens: 0,
        totalTokens: 0,
        estimatedCost: 0.05, // Estimated average cost
        durationMs: Date.now() - startTime,
        success: true,
        userId: options?.userId,
        tripId: options?.tripId,
        metadata: { destination: request.destination },
      });

      return result;
    } catch (error: any) {
      await this.logInteraction({
        taskType: "itinerary_optimization",
        provider,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        estimatedCost: 0,
        durationMs: Date.now() - startTime,
        success: false,
        errorMessage: error.message,
        userId: options?.userId,
        tripId: options?.tripId,
      });
      throw error;
    }
  }

  // Transportation Analysis - Claude (existing)
  async analyzeTransportation(
    hotelLocation: Parameters<typeof claudeService.analyzeTransportationNeeds>[0],
    activityLocations: Parameters<typeof claudeService.analyzeTransportationNeeds>[1],
    options?: { userId?: string; tripId?: string }
  ) {
    const startTime = Date.now();
    const provider = "claude";
    
    try {
      const result = await claudeService.analyzeTransportationNeeds(hotelLocation, activityLocations);

      await this.logInteraction({
        taskType: "transportation_analysis",
        provider,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        estimatedCost: 0.02,
        durationMs: Date.now() - startTime,
        success: true,
        userId: options?.userId,
        tripId: options?.tripId,
      });

      return result;
    } catch (error: any) {
      await this.logInteraction({
        taskType: "transportation_analysis",
        provider,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        estimatedCost: 0,
        durationMs: Date.now() - startTime,
        success: false,
        errorMessage: error.message,
        userId: options?.userId,
        tripId: options?.tripId,
      });
      throw error;
    }
  }

  // Full itinerary graph analysis - Claude
  async analyzeFullItineraryGraph(
    flightInfo: Parameters<typeof claudeService.analyzeFullItineraryGraph>[0],
    hotelLocation: Parameters<typeof claudeService.analyzeFullItineraryGraph>[1],
    activityLocations: Parameters<typeof claudeService.analyzeFullItineraryGraph>[2],
    options?: { userId?: string; tripId?: string }
  ) {
    const startTime = Date.now();
    const provider = "claude";
    
    try {
      const result = await claudeService.analyzeFullItineraryGraph(flightInfo, hotelLocation, activityLocations);

      await this.logInteraction({
        taskType: "transportation_analysis",
        provider,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        estimatedCost: 0.03,
        durationMs: Date.now() - startTime,
        success: true,
        userId: options?.userId,
        tripId: options?.tripId,
      });

      return result;
    } catch (error: any) {
      await this.logInteraction({
        taskType: "transportation_analysis",
        provider,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        estimatedCost: 0,
        durationMs: Date.now() - startTime,
        success: false,
        errorMessage: error.message,
        userId: options?.userId,
        tripId: options?.tripId,
      });
      throw error;
    }
  }

  // Travel Recommendations - Claude
  async generateTravelRecommendations(
    destination: string,
    dates: { start: string; end: string },
    interests: string[],
    options?: { userId?: string; tripId?: string }
  ) {
    const startTime = Date.now();
    const provider = "claude";
    
    try {
      const result = await claudeService.generateTravelRecommendations(destination, dates, interests);

      await this.logInteraction({
        taskType: "travel_recommendations",
        provider,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        estimatedCost: 0.02,
        durationMs: Date.now() - startTime,
        success: true,
        userId: options?.userId,
        tripId: options?.tripId,
        metadata: { destination },
      });

      return result;
    } catch (error: any) {
      await this.logInteraction({
        taskType: "travel_recommendations",
        provider,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        estimatedCost: 0,
        durationMs: Date.now() - startTime,
        success: false,
        errorMessage: error.message,
        userId: options?.userId,
        tripId: options?.tripId,
      });
      throw error;
    }
  }

  // Get aggregated usage statistics
  async getUsageStats(options?: { userId?: string; startDate?: Date; endDate?: Date }) {
    // This would query the aiInteractions table for aggregated stats
    // For now, return a placeholder
    return {
      totalInteractions: 0,
      totalTokens: 0,
      totalCost: 0,
      byProvider: {} as Record<string, number>,
      byTaskType: {} as Record<string, number>,
    };
  }
}

export const aiOrchestrator = new AIOrchestrator();
