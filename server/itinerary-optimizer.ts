import OpenAI from "openai";
import { db } from "./db";
import {
  itineraryComparisons,
  itineraryVariants,
  itineraryVariantItems,
  itineraryVariantMetrics,
  providerServices,
  cartItems,
  userExperienceItems,
  InsertItineraryVariant,
  InsertItineraryVariantItem,
  InsertItineraryVariantMetric,
  ProviderService,
} from "@shared/schema";
import { eq, and, inArray } from "drizzle-orm";

// Use Grok for faster optimization (xAI API with OpenAI-compatible interface)
const GROK_MODEL = "grok-3";

function getGrokClient(): OpenAI {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    throw new Error("XAI_API_KEY is not configured");
  }
  return new OpenAI({
    baseURL: "https://api.x.ai/v1",
    apiKey,
  });
}

// Helper to extract JSON from markdown code blocks or raw text
function extractJSON(text: string): string {
  // Try to extract from markdown code blocks first
  const jsonBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonBlockMatch) {
    return jsonBlockMatch[1].trim();
  }
  
  // Try to find JSON object directly
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return jsonMatch[0];
  }
  
  return text.trim();
}

interface ItineraryItem {
  id: string;
  name: string;
  description?: string;
  serviceType?: string;
  price?: number;
  rating?: number;
  location?: string;
  duration?: number;
  dayNumber?: number;
  timeSlot?: string;
}

interface OptimizedVariant {
  name: string;
  description: string;
  reasoning: string;
  items: {
    dayNumber: number;
    timeSlot: string;
    startTime: string;
    endTime: string;
    name: string;
    description: string;
    serviceType: string;
    price: number;
    rating: number;
    location: string;
    duration: number;
    travelTimeFromPrevious: number;
    isReplacement: boolean;
    replacementReason?: string;
    originalServiceId?: string;
  }[];
  metrics: {
    totalCost: number;
    totalTravelTime: number;
    averageRating: number;
    freeTimeMinutes: number;
    optimizationScore: number;
  };
}

interface AIResponse {
  variants: OptimizedVariant[];
}

export async function generateOptimizedItineraries(
  comparisonId: string,
  userId: string,
  baselineItems: ItineraryItem[],
  availableServices: ProviderService[],
  destination: string,
  startDate: string,
  endDate: string,
  budget?: number,
  travelers?: number
): Promise<{ success: boolean; error?: string }> {
  try {
    await db
      .update(itineraryComparisons)
      .set({ status: "generating" })
      .where(eq(itineraryComparisons.id, comparisonId));

    const baselineVariant = await db
      .insert(itineraryVariants)
      .values({
        comparisonId,
        name: "Your Plan",
        description: "Your original itinerary selection",
        source: "user",
        status: "generated",
        sortOrder: 0,
      })
      .returning();

    const baselineTotal = baselineItems.reduce((sum, item) => sum + (item.price || 0), 0);
    const baselineAvgRating = baselineItems.length > 0
      ? baselineItems.reduce((sum, item) => sum + (item.rating || 0), 0) / baselineItems.length
      : 0;

    for (let i = 0; i < baselineItems.length; i++) {
      const item = baselineItems[i];
      await db.insert(itineraryVariantItems).values({
        variantId: baselineVariant[0].id,
        dayNumber: item.dayNumber || 1,
        timeSlot: item.timeSlot || "morning",
        name: item.name,
        description: item.description,
        serviceType: item.serviceType,
        price: item.price?.toString(),
        rating: item.rating?.toString(),
        location: item.location,
        duration: item.duration,
        sortOrder: i,
      });
    }

    await db
      .update(itineraryVariants)
      .set({
        totalCost: baselineTotal.toString(),
        averageRating: baselineAvgRating.toFixed(2),
      })
      .where(eq(itineraryVariants.id, baselineVariant[0].id));

    const servicesList = availableServices.map((s) => ({
      id: s.id,
      name: s.serviceName,
      type: s.serviceType,
      price: parseFloat(s.price || "0"),
      rating: parseFloat(s.averageRating || "0"),
      location: s.location,
      description: s.shortDescription,
    }));

    const prompt = `You are a travel optimization AI. Analyze the user's current itinerary and generate 2 optimized alternative versions.

DESTINATION: ${destination}
DATES: ${startDate} to ${endDate}
TRAVELERS: ${travelers || 1}
BUDGET: ${budget ? `$${budget}` : "Not specified"}

USER'S CURRENT ITINERARY:
${JSON.stringify(baselineItems, null, 2)}

AVAILABLE SERVICES TO CHOOSE FROM:
${JSON.stringify(servicesList.slice(0, 50), null, 2)}

Generate 2 alternative itineraries that improve upon the user's plan. Each alternative should:
1. Optimize for different goals (e.g., one for cost savings, one for better experiences)
2. Include metrics showing WHY it's better
3. Use services from the available list when possible
4. Provide clear reasoning for each change

Respond with valid JSON in this exact format:
{
  "variants": [
    {
      "name": "Budget Optimizer",
      "description": "A more cost-effective version while maintaining quality",
      "reasoning": "This alternative saves 20% on costs by...",
      "items": [
        {
          "dayNumber": 1,
          "timeSlot": "morning",
          "startTime": "09:00",
          "endTime": "12:00",
          "name": "Activity Name",
          "description": "Brief description",
          "serviceType": "activities",
          "price": 150,
          "rating": 4.5,
          "location": "Paris, France",
          "duration": 180,
          "travelTimeFromPrevious": 15,
          "isReplacement": true,
          "replacementReason": "Similar experience at 30% lower cost",
          "originalServiceId": "service-id-if-applicable"
        }
      ],
      "metrics": {
        "totalCost": 1500,
        "totalTravelTime": 120,
        "averageRating": 4.6,
        "freeTimeMinutes": 240,
        "optimizationScore": 85
      }
    }
  ]
}`;

    const grok = getGrokClient();
    const response = await grok.chat.completions.create({
      model: GROK_MODEL,
      messages: [
        { 
          role: "system", 
          content: "You are a travel optimization expert. Always respond with valid JSON only, no markdown or explanation outside the JSON." 
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 4096,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No response from AI");
    }

    let aiResponse: AIResponse;
    try {
      const jsonContent = extractJSON(content);
      aiResponse = JSON.parse(jsonContent);
    } catch (parseError) {
      console.error("Failed to parse AI response:", content);
      throw new Error("Failed to parse AI response");
    }

    for (let v = 0; v < aiResponse.variants.length; v++) {
      const variant = aiResponse.variants[v];

      const [newVariant] = await db
        .insert(itineraryVariants)
        .values({
          comparisonId,
          name: variant.name,
          description: variant.description,
          source: "ai_optimized",
          status: "generated",
          totalCost: variant.metrics.totalCost.toString(),
          totalTravelTime: variant.metrics.totalTravelTime,
          averageRating: variant.metrics.averageRating.toString(),
          freeTimeMinutes: variant.metrics.freeTimeMinutes,
          optimizationScore: variant.metrics.optimizationScore,
          aiReasoning: variant.reasoning,
          sortOrder: v + 1,
        })
        .returning();

      for (let i = 0; i < variant.items.length; i++) {
        const item = variant.items[i];
        await db.insert(itineraryVariantItems).values({
          variantId: newVariant.id,
          dayNumber: item.dayNumber,
          timeSlot: item.timeSlot,
          startTime: item.startTime,
          endTime: item.endTime,
          name: item.name,
          description: item.description,
          serviceType: item.serviceType,
          price: item.price.toString(),
          rating: item.rating.toString(),
          location: item.location,
          duration: item.duration,
          travelTimeFromPrevious: item.travelTimeFromPrevious,
          isReplacement: item.isReplacement,
          replacementReason: item.replacementReason,
          sortOrder: i,
        });
      }

      const costSavings = baselineTotal - variant.metrics.totalCost;
      const costSavingsPercent = baselineTotal > 0 
        ? ((costSavings / baselineTotal) * 100).toFixed(1) 
        : "0";

      const ratingImprovement = variant.metrics.averageRating - baselineAvgRating;

      const metricsToInsert: InsertItineraryVariantMetric[] = [
        {
          variantId: newVariant.id,
          metricKey: "total_cost",
          metricLabel: "Total Cost",
          value: variant.metrics.totalCost.toString(),
          unit: "USD",
          betterIsLower: true,
          comparison: costSavings > 0 ? "saves" : costSavings < 0 ? "costs more" : "same",
          improvementPercentage: costSavingsPercent,
          description: costSavings > 0 
            ? `Saves $${costSavings.toFixed(0)} (${costSavingsPercent}% less)` 
            : costSavings < 0 
            ? `Costs $${Math.abs(costSavings).toFixed(0)} more for better experiences`
            : "Same total cost",
        },
        {
          variantId: newVariant.id,
          metricKey: "average_rating",
          metricLabel: "Average Rating",
          value: variant.metrics.averageRating.toString(),
          unit: "stars",
          betterIsLower: false,
          comparison: ratingImprovement > 0 ? "better" : ratingImprovement < 0 ? "lower" : "same",
          improvementPercentage: ratingImprovement.toFixed(1),
          description: ratingImprovement > 0 
            ? `+${ratingImprovement.toFixed(1)} stars higher rated` 
            : ratingImprovement < 0
            ? `${ratingImprovement.toFixed(1)} stars lower but better value`
            : "Same rating quality",
        },
        {
          variantId: newVariant.id,
          metricKey: "travel_time",
          metricLabel: "Travel Time",
          value: variant.metrics.totalTravelTime.toString(),
          unit: "minutes",
          betterIsLower: true,
          description: `${variant.metrics.totalTravelTime} minutes between locations`,
        },
        {
          variantId: newVariant.id,
          metricKey: "free_time",
          metricLabel: "Free Time",
          value: variant.metrics.freeTimeMinutes.toString(),
          unit: "minutes",
          betterIsLower: false,
          description: `${variant.metrics.freeTimeMinutes} minutes of relaxation time`,
        },
        {
          variantId: newVariant.id,
          metricKey: "optimization_score",
          metricLabel: "Optimization Score",
          value: variant.metrics.optimizationScore.toString(),
          unit: "points",
          betterIsLower: false,
          description: `Overall score: ${variant.metrics.optimizationScore}/100`,
        },
      ];

      for (const metric of metricsToInsert) {
        await db.insert(itineraryVariantMetrics).values(metric);
      }
    }

    await db
      .update(itineraryComparisons)
      .set({ status: "generated", updatedAt: new Date() })
      .where(eq(itineraryComparisons.id, comparisonId));

    return { success: true };
  } catch (error) {
    console.error("Error generating optimized itineraries:", error);

    await db
      .update(itineraryComparisons)
      .set({ status: "failed", updatedAt: new Date() })
      .where(eq(itineraryComparisons.id, comparisonId));

    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function getComparisonWithVariants(comparisonId: string) {
  const comparison = await db.query.itineraryComparisons.findFirst({
    where: eq(itineraryComparisons.id, comparisonId),
  });

  if (!comparison) return null;

  const variants = await db
    .select()
    .from(itineraryVariants)
    .where(eq(itineraryVariants.comparisonId, comparisonId))
    .orderBy(itineraryVariants.sortOrder);

  const variantsWithDetails = await Promise.all(
    variants.map(async (variant) => {
      const items = await db
        .select()
        .from(itineraryVariantItems)
        .where(eq(itineraryVariantItems.variantId, variant.id))
        .orderBy(itineraryVariantItems.dayNumber, itineraryVariantItems.sortOrder);

      const metrics = await db
        .select()
        .from(itineraryVariantMetrics)
        .where(eq(itineraryVariantMetrics.variantId, variant.id));

      return { ...variant, items, metrics };
    })
  );

  return { comparison, variants: variantsWithDetails };
}

export async function selectVariant(comparisonId: string, variantId: string) {
  const variant = await db.query.itineraryVariants.findFirst({
    where: and(
      eq(itineraryVariants.id, variantId),
      eq(itineraryVariants.comparisonId, comparisonId)
    ),
  });

  if (!variant) {
    return { success: false, error: "Variant not found" };
  }

  await db
    .update(itineraryVariants)
    .set({ status: "pending" })
    .where(eq(itineraryVariants.comparisonId, comparisonId));

  await db
    .update(itineraryVariants)
    .set({ status: "selected" })
    .where(eq(itineraryVariants.id, variantId));

  await db
    .update(itineraryComparisons)
    .set({ selectedVariantId: variantId, updatedAt: new Date() })
    .where(eq(itineraryComparisons.id, comparisonId));

  return { success: true, variant };
}
