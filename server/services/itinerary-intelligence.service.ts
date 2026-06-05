import { db } from "../db";
import {
  itineraryItems,
  type ItineraryItem,
  type InsertItineraryItem
} from "@shared/schema";
import { eq, and, asc, desc } from "drizzle-orm";
import OpenAI from "openai";
import {
  createCircuitBreaker,
  withCircuitBreaker,
  retryWithBackoff,
  aiLogger,
  aiRequestDuration,
  aiTokensUsed,
  databaseQueryDuration
} from "../infrastructure";
import type { ChatCompletion } from "openai/resources/chat/completions";

// Meal timing realism constants
export const MEAL_GAP_MINUTES = {
  breakfast_to_lunch: 240, // 4 hours minimum between breakfast and lunch
  lunch_to_dinner: 300, // 5 hours minimum between lunch and dinner
  dinner_to_breakfast: 720, // 12 hours minimum between dinner and next day breakfast
  snack_to_meal: 120, // 2 hours minimum from snack to main meal
};

export interface MealConflict {
  meal1Id: string;
  meal2Id: string;
  meal1Name: string;
  meal2Name: string;
  timeGapMinutes: number;
  minimumGapMinutes: number;
  severity: 'low' | 'medium' | 'high';
  appetiteConflict: boolean; // e.g., appetizer + dinner too close
}

// Peak hour heuristics by venue type and day of week
const PEAK_HOURS_BY_VENUE = {
  restaurant: {
    lunch: { start: 12, end: 14 }, // 12 PM - 2 PM
    dinner: { start: 19, end: 21 }, // 7 PM - 9 PM
  },
  museum: {
    peak: { start: 10, end: 16 }, // 10 AM - 4 PM
  },
  shopping: {
    peak: { start: 11, end: 18 }, // 11 AM - 6 PM (afternoon worst)
  },
  attraction: {
    peak: { start: 11, end: 16 }, // 11 AM - 4 PM
  },
};

export interface PeakTimeRecommendation {
  venueType: string;
  peakHours: { start: number; end: number };
  recommendedTimes: Array<{ start: number; end: number; reason: string }>;
  averageWaitTime: { peak: number; offPeak: number };
}

export interface TravelSegment {
  from: { name: string; lat: number; lng: number };
  to: { name: string; lat: number; lng: number };
  mode: "walking" | "driving" | "transit" | "cycling";
  durationMinutes: number;
  distanceKm: number;
  instructions?: string;
}

export interface OptimizationResult {
  score: number;
  issues: { type: string; severity: "low" | "medium" | "high"; message: string; itemId?: string }[];
  suggestions: { type: string; message: string; itemId?: string }[];
  optimizedOrder?: string[];
}

export interface DaySchedule {
  dayNumber: number;
  date?: string;
  items: ItineraryItem[];
  totalDurationMinutes: number;
  travelTimeMinutes: number;
  energyProfile: "relaxed" | "balanced" | "intense";
  hasWeatherRisk: boolean;
}

const ENERGY_WEIGHTS = {
  low: 1,
  medium: 2,
  high: 3,
  very_high: 4,
};


export class ItineraryIntelligenceService {
  private openai: OpenAI | null = null;
  private logger = aiLogger;
  private aiRecommend: ((prompt: string, maxTokens: number) => Promise<ChatCompletion>) | null = null;

  constructor() {
    if (process.env.XAI_API_KEY) {
      this.openai = new OpenAI({
        apiKey: process.env.XAI_API_KEY,
        baseURL: "https://api.x.ai/v1",
      });
      
      this.aiRecommend = withCircuitBreaker<[string, number], ChatCompletion>(
        "itinerary-ai",
        async (prompt: string, maxTokens: number) => {
          return this.openai!.chat.completions.create({
            model: "grok-3-mini",
            messages: [{ role: "user", content: prompt }],
            max_tokens: maxTokens,
          });
        },
        { choices: [], id: "", model: "", object: "chat.completion", created: 0 } as ChatCompletion,
        {
          timeout: 30000,
          errorThresholdPercentage: 50,
          resetTimeout: 60000,
        }
      );
      
      this.logger.info("Itinerary Intelligence AI initialized with xAI and circuit breaker");
    } else {
      this.logger.warn("XAI_API_KEY not set - AI recommendations will use fallback");
    }
  }

  async getItems(tripId: string): Promise<ItineraryItem[]> {
    return db.select().from(itineraryItems)
      .where(eq(itineraryItems.tripId, tripId))
      .orderBy(asc(itineraryItems.dayNumber), asc(itineraryItems.sortOrder));
  }

  async getItem(id: string): Promise<ItineraryItem | undefined> {
    const results = await db.select().from(itineraryItems).where(eq(itineraryItems.id, id));
    return results[0];
  }

  async createItem(data: InsertItineraryItem): Promise<ItineraryItem> {
    const results = await db.insert(itineraryItems).values(data).returning();
    return results[0];
  }

  async updateItem(id: string, updates: Partial<InsertItineraryItem>): Promise<ItineraryItem | undefined> {
    const results = await db.update(itineraryItems)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(itineraryItems.id, id))
      .returning();
    return results[0];
  }

  async deleteItem(id: string): Promise<void> {
    await db.delete(itineraryItems).where(eq(itineraryItems.id, id));
  }

  async getDaySchedules(tripId: string): Promise<DaySchedule[]> {
    const items = await this.getItems(tripId);
    const dayMap = new Map<number, ItineraryItem[]>();

    for (const item of items) {
      const day = item.dayNumber;
      if (!dayMap.has(day)) {
        dayMap.set(day, []);
      }
      dayMap.get(day)!.push(item);
    }

    const schedules: DaySchedule[] = [];
    
    for (const [dayNumber, dayItems] of Array.from(dayMap.entries())) {
      let totalDuration = 0;
      let travelTime = 0;
      let totalEnergy = 0;
      let hasWeatherRisk = false;

      for (const item of dayItems) {
        totalDuration += item.durationMinutes || 0;
        const travel = item.travelFromPrevious as { duration?: number } | null;
        if (travel?.duration) {
          travelTime += travel.duration;
        }
        if (item.energyLevel) {
          totalEnergy += ENERGY_WEIGHTS[item.energyLevel as keyof typeof ENERGY_WEIGHTS] || 2;
        }
        if (item.weatherDependent) {
          hasWeatherRisk = true;
        }
      }

      const avgEnergy = dayItems.length > 0 ? totalEnergy / dayItems.length : 2;
      let energyProfile: "relaxed" | "balanced" | "intense" = "balanced";
      if (avgEnergy < 1.5) energyProfile = "relaxed";
      else if (avgEnergy > 2.5) energyProfile = "intense";

      schedules.push({
        dayNumber,
        items: dayItems.sort((a: ItineraryItem, b: ItineraryItem) => (a.sortOrder || 0) - (b.sortOrder || 0)),
        totalDurationMinutes: totalDuration + travelTime,
        travelTimeMinutes: travelTime,
        energyProfile,
        hasWeatherRisk,
      });
    }

    return schedules.sort((a, b) => a.dayNumber - b.dayNumber);
  }

  async analyzeItinerary(tripId: string): Promise<OptimizationResult> {
    const items = await this.getItems(tripId);
    const schedules = await this.getDaySchedules(tripId);
    
    const issues: OptimizationResult["issues"] = [];
    const suggestions: OptimizationResult["suggestions"] = [];
    let score = 100;

    for (const schedule of schedules) {
      if (schedule.totalDurationMinutes > 12 * 60) {
        issues.push({
          type: "overloaded_day",
          severity: "high",
          message: `Day ${schedule.dayNumber} has ${Math.round(schedule.totalDurationMinutes / 60)} hours of activities - consider spreading them out`,
        });
        score -= 15;
      }

      if (schedule.travelTimeMinutes > 3 * 60) {
        issues.push({
          type: "excessive_travel",
          severity: "medium",
          message: `Day ${schedule.dayNumber} has ${Math.round(schedule.travelTimeMinutes / 60)} hours of travel time`,
        });
        score -= 10;
      }

      if (schedule.energyProfile === "intense") {
        suggestions.push({
          type: "energy_balance",
          message: `Day ${schedule.dayNumber} is very intense - consider adding rest breaks`,
        });
        score -= 5;
      }

      if (schedule.hasWeatherRisk) {
        const outdoorItems = schedule.items.filter(i => i.weatherDependent);
        const hasBackups = outdoorItems.every(i => i.backupPlanId);
        if (!hasBackups) {
          issues.push({
            type: "missing_backup",
            severity: "medium",
            message: `Day ${schedule.dayNumber} has weather-dependent activities without backup plans`,
          });
          score -= 8;
        }
      }
    }

    for (let i = 0; i < items.length - 1; i++) {
      const current = items[i];
      const next = items[i + 1];
      
      if (current.dayNumber === next.dayNumber) {
        const currentEnergy = ENERGY_WEIGHTS[current.energyLevel as keyof typeof ENERGY_WEIGHTS] || 2;
        const nextEnergy = ENERGY_WEIGHTS[next.energyLevel as keyof typeof ENERGY_WEIGHTS] || 2;
        
        if (currentEnergy === 4 && nextEnergy === 4) {
          suggestions.push({
            type: "energy_sequence",
            message: `Consider adding a break between "${current.title}" and "${next.title}"`,
            itemId: current.id,
          });
        }
      }
    }

    const hasLunch = items.some(i => 
      i.itemType === "meal" && 
      i.startTime && 
      parseInt(i.startTime.split(":")[0]) >= 11 && 
      parseInt(i.startTime.split(":")[0]) <= 14
    );
    
    if (items.length > 4 && !hasLunch) {
      suggestions.push({
        type: "meal_timing",
        message: "Consider adding a lunch break to your itinerary",
      });
    }

    score = Math.max(0, Math.min(100, score));

    return { score, issues, suggestions };
  }

  estimateTravelTime(
    fromLat: number, 
    fromLng: number, 
    toLat: number, 
    toLng: number, 
    mode: "walking" | "driving" | "transit" = "driving"
  ): TravelSegment {
    const R = 6371;
    const dLat = (toLat - fromLat) * Math.PI / 180;
    const dLon = (toLng - fromLng) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(fromLat * Math.PI / 180) * Math.cos(toLat * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distanceKm = R * c;

    const speeds = {
      walking: 5,
      cycling: 15,
      transit: 25,
      driving: 40,
    };

    const durationMinutes = Math.round((distanceKm / speeds[mode]) * 60);

    return {
      from: { name: "", lat: fromLat, lng: fromLng },
      to: { name: "", lat: toLat, lng: toLng },
      mode,
      durationMinutes,
      distanceKm: Math.round(distanceKm * 10) / 10,
    };
  }

  async optimizeOrder(tripId: string, dayNumber: number): Promise<string[]> {
    const items = await db.select().from(itineraryItems)
      .where(and(
        eq(itineraryItems.tripId, tripId),
        eq(itineraryItems.dayNumber, dayNumber)
      ));

    if (items.length <= 2) {
      return items.map(i => i.id);
    }

    const fixedItems = items.filter(i => !i.isFlexible);
    const flexibleItems = items.filter(i => i.isFlexible);

    const sorted = [...items].sort((a, b) => {
      if (a.itemType === "accommodation" && a.startTime?.includes("check-in")) return 1;
      if (b.itemType === "accommodation" && b.startTime?.includes("check-in")) return -1;
      
      if (a.itemType === "meal" && b.itemType !== "meal") {
        const aHour = parseInt(a.startTime?.split(":")[0] || "12");
        const bHour = parseInt(b.startTime?.split(":")[0] || "12");
        if (aHour >= 11 && aHour <= 14) return 0;
      }
      
      const aEnergy = ENERGY_WEIGHTS[a.energyLevel as keyof typeof ENERGY_WEIGHTS] || 2;
      const bEnergy = ENERGY_WEIGHTS[b.energyLevel as keyof typeof ENERGY_WEIGHTS] || 2;
      
      return bEnergy - aEnergy;
    });

    return sorted.map(i => i.id);
  }

  getOffPeakRecommendation(venueType: string): PeakTimeRecommendation {
    const typeKey = venueType.toLowerCase().split(',')[0].trim() as keyof typeof PEAK_HOURS_BY_VENUE;
    const peakHours = PEAK_HOURS_BY_VENUE[typeKey] || PEAK_HOURS_BY_VENUE.attraction;

    // Flatten peak hours into a single range
    let peakStart = 10;
    let peakEnd = 16;
    if ('peak' in peakHours) {
      peakStart = peakHours.peak.start;
      peakEnd = peakHours.peak.end;
    } else if ('lunch' in peakHours) {
      peakStart = peakHours.lunch.start;
      peakEnd = peakHours.dinner.end;
    }

    // Recommend off-peak times
    const recommendedTimes = [
      {
        start: 8,
        end: peakStart,
        reason: `Visit early morning (${8}-${peakStart} AM) before peak hours for shorter waits`,
      },
      {
        start: peakEnd,
        end: 20,
        reason: `Visit late afternoon/evening (${peakEnd} PM-8 PM) for fewer crowds`,
      },
      {
        start: 9,
        end: 11,
        reason: `Weekday mid-morning (9-11 AM) is generally off-peak for most attractions`,
      },
    ];

    return {
      venueType,
      peakHours: { start: peakStart, end: peakEnd },
      recommendedTimes,
      averageWaitTime: {
        peak: 30 + Math.random() * 60, // Simulated: 30-90 min during peak
        offPeak: 5 + Math.random() * 15, // Simulated: 5-20 min off-peak
      },
    };
  }

  async getPeakTimingForItinerary(tripId: string): Promise<Array<{ itemId?: string; recommendation: PeakTimeRecommendation }>> {
    const items = await this.getItems(tripId);
    const results: Array<{ itemId?: string; recommendation: PeakTimeRecommendation }> = [];

    for (const item of items) {
      if (item.serviceType && ['restaurant', 'museum', 'shopping', 'attraction'].some(t => item.serviceType!.toLowerCase().includes(t))) {
        results.push({
          itemId: item.id,
          recommendation: this.getOffPeakRecommendation(item.serviceType),
        });
      }
    }

    return results;
  }

  async detectMealConflicts(tripId: string): Promise<MealConflict[]> {
    const items = await this.getItems(tripId);
    const mealItems = items.filter(i => {
      const type = i.serviceType?.toLowerCase() || '';
      return ['meal', 'dining', 'breakfast', 'lunch', 'dinner', 'snack', 'appetizer'].some(m => type.includes(m));
    });

    const conflicts: MealConflict[] = [];

    // Check all pairs of meals
    for (let i = 0; i < mealItems.length - 1; i++) {
      for (let j = i + 1; j < mealItems.length; j++) {
        const meal1 = mealItems[i];
        const meal2 = mealItems[j];

        // Only check meals on the same day
        if (meal1.dayNumber !== meal2.dayNumber) continue;

        // Parse times
        const time1 = meal1.startTime ? this.parseTimeToMinutes(meal1.startTime) : undefined;
        const time2 = meal2.startTime ? this.parseTimeToMinutes(meal2.startTime) : undefined;

        if (time1 === undefined || time2 === undefined) continue;

        // Ensure meal1 is before meal2
        const [earlierTime, earlierMeal, laterTime, laterMeal] = time1 < time2
          ? [time1, meal1, time2, meal2]
          : [time2, meal2, time1, meal1];

        const timeGapMinutes = laterTime - earlierTime;
        const type1 = (earlierMeal.serviceType || '').toLowerCase();
        const type2 = (laterMeal.serviceType || '').toLowerCase();

        // Detect appetite conflicts
        let minimumGapMinutes = 300; // Default 5 hours
        let appetiteConflict = false;

        if (type1.includes('breakfast') && type2.includes('lunch')) {
          minimumGapMinutes = MEAL_GAP_MINUTES.breakfast_to_lunch;
        } else if (type1.includes('lunch') && type2.includes('dinner')) {
          minimumGapMinutes = MEAL_GAP_MINUTES.lunch_to_dinner;
        } else if (type1.includes('appetizer') || type1.includes('snack')) {
          minimumGapMinutes = MEAL_GAP_MINUTES.snack_to_meal;
          appetiteConflict = type2.includes('dinner') || type2.includes('lunch');
        }

        // Check if gap is insufficient
        if (timeGapMinutes < minimumGapMinutes) {
          const severity: 'low' | 'medium' | 'high' =
            timeGapMinutes < minimumGapMinutes * 0.5 ? 'high' : timeGapMinutes < minimumGapMinutes * 0.75 ? 'medium' : 'low';

          conflicts.push({
            meal1Id: earlierMeal.id,
            meal2Id: laterMeal.id,
            meal1Name: earlierMeal.title || 'Meal 1',
            meal2Name: laterMeal.title || 'Meal 2',
            timeGapMinutes,
            minimumGapMinutes,
            severity,
            appetiteConflict,
          });
        }
      }
    }

    return conflicts;
  }

  private parseTimeToMinutes(timeStr: string): number {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + (minutes || 0);
  }

  async getAIRecommendations(tripId: string, destination: string): Promise<string[]> {
    if (!this.openai) {
      this.logger.debug({ tripId, destination }, "Using fallback recommendations (no API key)");
      return [
        "Consider visiting local markets in the morning when they're freshest",
        "Plan outdoor activities for mid-morning before peak heat",
        "Reserve popular restaurants at least 24 hours in advance",
        "Leave buffer time between activities for unexpected discoveries",
      ];
    }

    const startTime = Date.now();
    
    try {
      const items = await this.getItems(tripId);
      const analysis = await this.analyzeItinerary(tripId);

      const prompt = `Analyze this travel itinerary for ${destination} and provide 3-5 specific recommendations to improve it.

Itinerary:
${items.map(i => `- Day ${i.dayNumber}: ${i.title} (${i.itemType}, ${i.startTime || "flexible"}, ${i.energyLevel || "medium"} energy)`).join("\n")}

Current Issues:
${analysis.issues.map(i => `- ${i.message}`).join("\n") || "None identified"}

Provide specific, actionable recommendations in a JSON array of strings.`;

      this.logger.debug({ tripId, destination, itemCount: items.length }, "Requesting AI recommendations");

      const response = await retryWithBackoff(
        async () => this.aiRecommend!(prompt, 500),
        2,
        1000
      );

      const duration = (Date.now() - startTime) / 1000;
      aiRequestDuration.labels("itinerary-recommendations", "grok").observe(duration);
      
      const tokensUsed = response.usage?.total_tokens || 0;
      if (tokensUsed > 0) {
        aiTokensUsed.labels("itinerary-recommendations", "grok").inc(tokensUsed);
      }

      const content = response.choices[0]?.message?.content || "[]";
      const match = content.match(/\[[\s\S]*\]/);
      
      this.logger.info({ 
        tripId, 
        destination, 
        duration,
        tokensUsed,
        recommendationCount: match ? JSON.parse(match[0]).length : 1
      }, "AI recommendations generated successfully");
      
      if (match) {
        return JSON.parse(match[0]);
      }
      return [content];
    } catch (error) {
      const duration = (Date.now() - startTime) / 1000;
      this.logger.error({ 
        err: error, 
        tripId, 
        destination, 
        duration 
      }, "AI recommendation error");
      
      return ["Unable to generate AI recommendations at this time"];
    }
  }

  async setBackupPlan(itemId: string, backupItemId: string): Promise<ItineraryItem | undefined> {
    return this.updateItem(itemId, { backupPlanId: backupItemId });
  }

  async reorderItems(tripId: string, dayNumber: number, itemIds: string[]): Promise<ItineraryItem[]> {
    const results: ItineraryItem[] = [];
    
    for (let i = 0; i < itemIds.length; i++) {
      const updated = await this.updateItem(itemIds[i], { sortOrder: i });
      if (updated) results.push(updated);
    }
    
    return results;
  }
}

export const itineraryIntelligenceService = new ItineraryIntelligenceService();
