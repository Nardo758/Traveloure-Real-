import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
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
  temporalAnchors,
  dayBoundaries,
  transportLegs,
  experienceTypes,
  ExperienceType,
} from "@shared/schema";
import { eq, and, inArray } from "drizzle-orm";
import {
  reorderItinerary,
  calculateItineraryMetrics,
  SequencedActivity,
  MethodologyNote,
  parseAnchorConstraints,
  applyAnchorConstraints,
  applyEnergyBalancing,
  AnchorConstraint,
  DayBoundaryConstraint,
} from "./services/smart-sequencing.service";
import { calculateTransportLegs, type UserTransportPrefs } from "./services/transport-leg-calculator";

const GROK_MODEL = "grok-2-1212";
const CLAUDE_MODEL = "claude-sonnet-4-20250514";

function getGrokClient(): OpenAI | null {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({
    baseURL: "https://api.x.ai/v1",
    apiKey,
  });
}

function getAnthropicClient(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  return new Anthropic({ apiKey });
}

async function callAI(systemPrompt: string, userPrompt: string): Promise<string> {
  const grok = getGrokClient();
  if (grok) {
    try {
      const response = await grok.chat.completions.create({
        model: GROK_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 5120,
      });
      const content = response.choices[0]?.message?.content;
      if (content) return content;
    } catch (grokError: any) {
      console.warn("Grok API failed, falling back to Anthropic:", grokError.message);
    }
  }

  const anthropic = getAnthropicClient();
  if (anthropic) {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 5120,
      system: systemPrompt,
      messages: [
        { role: "user", content: userPrompt },
      ],
    });
    const textBlock = response.content.find((b: any) => b.type === "text");
    if (textBlock && textBlock.type === "text") return textBlock.text;
  }

  throw new Error("No AI provider available. Configure XAI_API_KEY or ANTHROPIC_API_KEY.");
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

function formatAnchorForPrompt(anchor: AnchorConstraint): string {
  const time = new Date(anchor.anchorDatetime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  const type = anchor.anchorType.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  let desc = `${type} at ${time}`;
  if (anchor.bufferBefore > 0) desc += `, ${anchor.bufferBefore}min buffer before`;
  if (anchor.bufferAfter > 0) desc += `, ${anchor.bufferAfter}min buffer after`;
  if (anchor.location) desc += ` (${anchor.location})`;
  return desc;
}

function buildLogisticsContext(expType: ExperienceType): string {
  const lines: string[] = [];

  lines.push(`EXPERIENCE TYPE: ${expType.name} (${expType.slug})`);

  if (expType.typicalGroupSizeMin != null && expType.typicalGroupSizeMax != null) {
    lines.push(`GROUP SIZE: ${expType.typicalGroupSizeMin}–${expType.typicalGroupSizeMax} people — size all venue/transport recommendations accordingly`);
  }

  if (expType.typicalDurationMinDays != null && expType.typicalDurationMaxDays != null) {
    const dMin = expType.typicalDurationMinDays;
    const dMax = expType.typicalDurationMaxDays;
    lines.push(`TYPICAL DURATION: ${dMin === dMax ? `${dMin} day${dMin > 1 ? 's' : ''}` : `${dMin}–${dMax} days`}`);
  }

  const timingGuide: Record<string, string> = {
    low: "Flexible timing — 15–20 min transitions are fine",
    medium: "Standard timing — allow 20–30 min transitions between activities",
    high: "Tight scheduling — include 30–45 min buffers between major activities",
    very_high: "Complex timing — build in 45+ min buffers; sequence activities to avoid conflicts",
    extreme: "Precision scheduling — every activity needs an exact time slot; zero slack tolerated",
  };
  if (expType.timingComplexity && timingGuide[expType.timingComplexity]) {
    lines.push(`TIMING: ${timingGuide[expType.timingComplexity]}`);
  }

  const contingencyGuide: Record<string, string> = {
    flexible: "Minor contingencies acceptable — no backup plans required",
    important: "Flag weather-sensitive activities and suggest indoor alternatives where relevant",
    critical: "Include a backup option for EVERY major activity or venue — failure is not an option",
  };
  if (expType.contingencyLevel && contingencyGuide[expType.contingencyLevel]) {
    lines.push(`CONTINGENCY: ${contingencyGuide[expType.contingencyLevel]}`);
  }

  const paymentGuide: Record<string, string> = {
    joint: "Costs shared between couple/partners — keep per-pair totals visible",
    group_split: "Costs split evenly across group — prioritize per-person cost clarity",
    single_payer: "One person pays everything — total cost transparency is key",
    multi_stakeholder: "Multiple parties paying (e.g., families, sponsors) — group line items by who pays",
    individual_with_discount: "Individual payments with group discounts — highlight group savings",
  };
  if (expType.paymentFlowType && paymentGuide[expType.paymentFlowType]) {
    lines.push(`PAYMENT: ${paymentGuide[expType.paymentFlowType]}`);
  }

  return `\n\nEXPERIENCE CONTEXT (use this to tailor the itinerary style and pacing):\n${lines.join('\n')}`;
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
  travelers?: number,
  tripId?: string,
  userTransportPrefs?: Partial<UserTransportPrefs>
): Promise<{ success: boolean; error?: string }> {
  try {
    let anchorConstraints: AnchorConstraint[] = [];
    let boundaryConstraints: DayBoundaryConstraint[] = [];
    let anchorPromptSection = '';

    if (tripId) {
      const [anchors, boundaries] = await Promise.all([
        db.select().from(temporalAnchors).where(eq(temporalAnchors.tripId, tripId)),
        db.select().from(dayBoundaries).where(eq(dayBoundaries.tripId, tripId)),
      ]);

      if (anchors.length > 0) {
        anchorConstraints = parseAnchorConstraints(anchors, startDate);
        anchorPromptSection = `\n\nTEMPORAL ANCHORS (IMMOVABLE CONSTRAINTS - DO NOT SCHEDULE ACTIVITIES DURING THESE TIMES):
${anchorConstraints.map(a => `- Day ${a.dayNumber}: ${formatAnchorForPrompt(a)}`).join('\n')}

IMPORTANT: These are fixed commitments (flights, reservations, ceremonies). You MUST NOT place activities during anchor times or their buffer zones. Plan around them.`;
      }

      if (boundaries.length > 0) {
        boundaryConstraints = boundaries.map(b => ({
          dayNumber: b.dayNumber,
          earliestActivityStart: b.earliestActivityStart || undefined,
          latestActivityEnd: b.latestActivityEnd || undefined,
          mustReturnToHotel: b.mustReturnToHotel ?? false,
        }));
        anchorPromptSection += `\n\nDAY BOUNDARIES:
${boundaryConstraints.map(b => `- Day ${b.dayNumber}: ${b.earliestActivityStart ? `starts at ${b.earliestActivityStart}` : 'normal start'}${b.latestActivityEnd ? `, must end by ${b.latestActivityEnd}` : ''}${b.mustReturnToHotel ? ' (must return to hotel)' : ''}`).join('\n')}`;
      }
    }

    // Look up logistics context from experience type
    let logisticsContextSection = '';
    const [compRecord] = await db
      .select({ experienceTypeSlug: itineraryComparisons.experienceTypeSlug })
      .from(itineraryComparisons)
      .where(eq(itineraryComparisons.id, comparisonId));
    if (compRecord?.experienceTypeSlug) {
      const [expType] = await db
        .select()
        .from(experienceTypes)
        .where(eq(experienceTypes.slug, compRecord.experienceTypeSlug));
      if (expType) {
        logisticsContextSection = buildLogisticsContext(expType);
      }
    }

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

    // Calculate baseline metrics without reordering (keep user's original order)
    const baselineForMetrics = baselineItems.map(item => ({
      serviceType: item.serviceType || 'sightseeing',
      price: item.price,
      duration: item.duration,
      dayNumber: item.dayNumber || 1
    }));
    const baselineEnhancedMetrics = calculateItineraryMetrics(baselineForMetrics, travelers || 1);

    if (baselineItems.length > 0) {
      await db.insert(itineraryVariantItems).values(
        baselineItems.map((item, i) => ({
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
        }))
      );
    }

    await db
      .update(itineraryVariants)
      .set({
        totalCost: baselineTotal.toString(),
        averageRating: baselineAvgRating.toFixed(2),
        optimizationScore: Math.round((baselineEnhancedMetrics.balanceScore + baselineEnhancedMetrics.wellnessScore + baselineEnhancedMetrics.paceScore) / 3),
      })
      .where(eq(itineraryVariants.id, baselineVariant[0].id));

    // Add baseline metrics for comparison
    const baselineMetrics: InsertItineraryVariantMetric[] = [
      {
        variantId: baselineVariant[0].id,
        metricKey: "total_cost",
        metricLabel: "Total Cost",
        value: baselineTotal.toString(),
        unit: "USD",
        betterIsLower: true,
        description: `Your planned spending: $${baselineTotal.toFixed(0)}`,
      },
      {
        variantId: baselineVariant[0].id,
        metricKey: "average_rating",
        metricLabel: "Average Rating",
        value: baselineAvgRating.toFixed(2),
        unit: "stars",
        betterIsLower: false,
        description: `Average rating: ${baselineAvgRating.toFixed(1)} stars`,
      },
      {
        variantId: baselineVariant[0].id,
        metricKey: "balance_score",
        metricLabel: "Balance Score",
        value: baselineEnhancedMetrics.balanceScore.toString(),
        unit: "points",
        betterIsLower: false,
        description: baselineEnhancedMetrics.balanceScore >= 80 
          ? "Excellent mix of activity types" 
          : baselineEnhancedMetrics.balanceScore >= 60
          ? "Good variety of experiences"
          : "Could benefit from more variety",
      },
      {
        variantId: baselineVariant[0].id,
        metricKey: "wellness_score",
        metricLabel: "Wellness Score",
        value: baselineEnhancedMetrics.wellnessScore.toString(),
        unit: "points",
        betterIsLower: false,
        description: baselineEnhancedMetrics.wellnessScore >= 80
          ? "Optimal balance of activity and relaxation"
          : baselineEnhancedMetrics.wellnessScore >= 60
          ? "Good recovery time included"
          : "Consider adding relaxation activities",
      },
      {
        variantId: baselineVariant[0].id,
        metricKey: "pace_score",
        metricLabel: "Pace Score",
        value: baselineEnhancedMetrics.paceScore.toString(),
        unit: "points",
        betterIsLower: false,
        description: baselineEnhancedMetrics.paceScore >= 80
          ? "Well-paced itinerary"
          : baselineEnhancedMetrics.paceScore >= 60
          ? "Comfortable daily pace"
          : "May feel rushed or sparse",
      },
      {
        variantId: baselineVariant[0].id,
        metricKey: "diversity_score",
        metricLabel: "Diversity Score",
        value: baselineEnhancedMetrics.diversityScore.toString(),
        unit: "points",
        betterIsLower: false,
        description: baselineEnhancedMetrics.diversityScore >= 80
          ? "Rich variety of experience types"
          : baselineEnhancedMetrics.diversityScore >= 60
          ? "Good range of activities"
          : "Consider diversifying activities",
      },
      {
        variantId: baselineVariant[0].id,
        metricKey: "relaxation_minutes",
        metricLabel: "Relaxation Time",
        value: baselineEnhancedMetrics.relaxationMinutes.toString(),
        unit: "minutes",
        betterIsLower: false,
        description: `${baselineEnhancedMetrics.relaxationMinutes} minutes of wellness activities`,
      },
    ];

    await db.insert(itineraryVariantMetrics).values(baselineMetrics);

    // Calculate transport legs for the baseline variant
    // Only compute if we have persisted variant items (which may have real coords from DB)
    try {
      const baselineVariantItems = await db
        .select()
        .from(itineraryVariantItems)
        .where(eq(itineraryVariantItems.variantId, baselineVariant[0].id))
        .orderBy(itineraryVariantItems.dayNumber, itineraryVariantItems.sortOrder);

      const baselineActivitiesWithCoords = baselineVariantItems
        .filter((item) => item.latitude != null && item.longitude != null)
        .map((item, idx) => ({
          id: item.id,
          name: item.name || `Stop ${idx + 1}`,
          lat: parseFloat(item.latitude as unknown as string),
          lng: parseFloat(item.longitude as unknown as string),
          scheduledTime: item.startTime || "09:00",
          dayNumber: item.dayNumber,
          order: item.sortOrder ?? idx,
        }));

      if (baselineActivitiesWithCoords.length > 0) {
        await calculateTransportLegs(baselineVariant[0].id, baselineActivitiesWithCoords, destination, userTransportPrefs || {});
      }
    } catch (legErr) {
      console.error("Baseline transport leg calculation error (non-critical):", legErr);
    }

    const servicesList = availableServices.map((s) => ({
      id: s.id,
      name: s.serviceName,
      type: s.serviceType,
      price: parseFloat(s.price || "0"),
      rating: parseFloat(s.averageRating || "0"),
      location: s.location,
      description: s.shortDescription,
    }));

    const compactServicesList = servicesList.slice(0, 20).map(s =>
      `${s.id}|${s.name}|${s.type}|$${s.price}|${s.rating}★|${s.location}`
    ).join('\n');

    const compactBaseline = baselineItems.map(item =>
      `Day${item.dayNumber || 1} ${item.timeSlot || 'morning'}: ${item.name} ($${item.price || 0}, ${item.duration || 120}min, ${item.location || 'TBD'})`
    ).join('\n');

    // ── Marquee / signature item detection ────────────────────────────────────
    const MARQUEE_KEYWORDS = [
      "helicopter", "private", "exclusive", "yacht", "charter",
      "hot air balloon", "skydiving", "bespoke", "luxury", "vip",
      "concierge", "villa", "penthouse", "seaplane", "submarine",
      "float plane", "paragliding", "paramotor", "jet ski",
    ];
    const MARQUEE_PRICE_THRESHOLD = 200;

    const marqueeItems = baselineItems.filter(item => {
      const nameLower = (item.name || '').toLowerCase();
      const isHighValue = (item.price || 0) >= MARQUEE_PRICE_THRESHOLD;
      const isKeyword = MARQUEE_KEYWORDS.some(kw => nameLower.includes(kw));
      return isHighValue || isKeyword;
    });

    let marqueeSection = '';
    if (marqueeItems.length > 0) {
      const marqueeList = marqueeItems
        .map(item => `- Day ${item.dayNumber || 1} ${item.timeSlot || ''} | ${item.name} | $${item.price || 0}`)
        .join('\n');
      marqueeSection = `\n\nPROTECTED ITEMS (must appear in EVERY variant — do NOT replace, remove, or substitute these):\n${marqueeList}\n\nBudget savings MUST come only from non-protected activities and accommodation. Never touch the protected items.`;
    }

    // ── Empty day detection ───────────────────────────────────────────────────
    let emptyDaySection = '';
    if (startDate && endDate) {
      const startMs = new Date(startDate).getTime();
      const endMs = new Date(endDate).getTime();
      if (!isNaN(startMs) && !isNaN(endMs) && endMs >= startMs) {
        const tripDurationDays = Math.round((endMs - startMs) / (1000 * 60 * 60 * 24)) + 1;
        if (tripDurationDays > 1) {
          const coveredDays = new Set(baselineItems.map(item => item.dayNumber || 1));
          const emptyDays: number[] = [];
          for (let d = 1; d <= tripDurationDays; d++) {
            if (!coveredDays.has(d)) emptyDays.push(d);
          }
          if (emptyDays.length > 0) {
            const coveredList = [...coveredDays].sort((a, b) => a - b).join(', ');
            emptyDaySection = `\n\nTRIP DURATION: ${tripDurationDays} days (Days 1–${tripDurationDays})
DAYS WITH USER ACTIVITIES: Days ${coveredList}
EMPTY DAYS TO FILL: Days ${emptyDays.join(', ')}

For each empty day, add activities that match the user's experience style (inferred from their existing selections), the destination, and their overall budget pace. Each empty day must include at least: a morning activity, a dining experience, an afternoon activity, and accommodation. These auto-filled days must feel cohesive with the user's existing selections. All variants must cover all ${tripDurationDays} days.`;
          }
        }
      }
    }

    const prompt = `You are a travel optimization AI. Analyze the user's itinerary and generate 2 optimized alternatives.

DESTINATION: ${destination} | DATES: ${startDate} to ${endDate} | TRAVELERS: ${travelers || 1} | BUDGET: ${budget ? `$${budget}` : "Open"}${logisticsContextSection}${anchorPromptSection}${marqueeSection}${emptyDaySection}

USER'S CURRENT ITINERARY:
${compactBaseline}

AVAILABLE SERVICES (id|name|type|price|rating|location):
${compactServicesList}

Generate 2 alternative itineraries that improve upon the user's plan. Each alternative should:
1. Optimize for different goals (e.g., one for cost savings, one for better experiences)
2. Include metrics showing WHY it's better
3. Use services from the available list when possible
4. Provide clear reasoning for each change
5. Preserve all PROTECTED ITEMS exactly as they appear — never replace, remove, or move them
6. Cover all trip days, including auto-filling any empty days with contextually appropriate activities

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

    const content = await callAI(
      "You are a travel optimization expert. Always respond with valid JSON only, no markdown or explanation outside the JSON. Keep descriptions and reasoning brief (under 50 words each) to fit within token limits.",
      prompt
    );
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

    await Promise.all(aiResponse.variants.map(async (variant, v) => {
      // Convert AI items to SequencedActivity format
      const activitiesForSequencing: SequencedActivity[] = variant.items.map(item => ({
        name: item.name,
        serviceType: item.serviceType,
        startTime: item.startTime,
        endTime: item.endTime,
        duration: item.duration,
        price: item.price,
        rating: item.rating,
        location: item.location,
        dayNumber: item.dayNumber,
        timeSlot: item.timeSlot,
        description: item.description,
        travelTimeFromPrevious: item.travelTimeFromPrevious,
        isReplacement: item.isReplacement,
        replacementReason: item.replacementReason
      }));

      // Apply smart sequencing to reorder activities
      const sequencingResult = reorderItinerary(activitiesForSequencing);
      let reorderedItems = sequencingResult.reorderedItems;
      const methodologyNotes = [...sequencingResult.allMethodologyNotes];
      const sequencingScore = sequencingResult.overallScore;

      if (anchorConstraints.length > 0 || boundaryConstraints.length > 0) {
        const dayGroups: Record<number, SequencedActivity[]> = {};
        for (const item of reorderedItems) {
          const day = item.dayNumber || 1;
          if (!dayGroups[day]) dayGroups[day] = [];
          dayGroups[day].push(item);
        }

        const anchorAdjusted: SequencedActivity[] = [];
        for (const [dayStr, dayItems] of Object.entries(dayGroups)) {
          const dayNum = parseInt(dayStr);
          const dayAnchors = anchorConstraints.filter(a => a.dayNumber === dayNum);
          const dayBoundary = boundaryConstraints.find(b => b.dayNumber === dayNum);

          let adjusted = dayItems;
          if (dayAnchors.length > 0) {
            const result = applyAnchorConstraints(adjusted, dayAnchors, dayBoundary);
            adjusted = result.activities;
            methodologyNotes.push(...result.anchorNotes);
          }
          {
            const result = applyEnergyBalancing(adjusted);
            adjusted = result.activities;
            methodologyNotes.push(...result.energyNotes);
          }
          anchorAdjusted.push(...adjusted);
        }
        reorderedItems = anchorAdjusted;
      }

      // Calculate enhanced metrics
      const enhancedMetrics = calculateItineraryMetrics(
        reorderedItems.map(item => ({
          serviceType: item.serviceType,
          price: item.price,
          duration: item.duration,
          dayNumber: item.dayNumber
        })),
        travelers || 1
      );

      // Combine AI optimization score with sequencing score
      const combinedOptimizationScore = Math.round(
        (variant.metrics.optimizationScore * 0.6) + (sequencingScore * 0.4)
      );

      // Create enhanced reasoning with sequencing insights
      const sequencingInsight = sequencingResult.appliedRulesCount > 0
        ? ` Activities intelligently sequenced with ${sequencingResult.appliedRulesCount} wellness rules applied for optimal pacing and recovery.`
        : '';
      const enhancedReasoning = variant.reasoning + sequencingInsight;

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
          optimizationScore: combinedOptimizationScore,
          aiReasoning: enhancedReasoning,
          sortOrder: v + 1,
        })
        .returning();

      // Batch-insert all variant items in one round-trip
      if (reorderedItems.length > 0) {
        await db.insert(itineraryVariantItems).values(
          reorderedItems.map((item, i) => {
            const activityNotes = methodologyNotes.filter(
              n => n.type === 'activity' && n.note.toLowerCase().includes(item.name.toLowerCase().slice(0, 10))
            );
            return {
              variantId: newVariant.id,
              dayNumber: item.dayNumber,
              timeSlot: item.timeSlot,
              startTime: item.startTime,
              endTime: item.endTime,
              name: item.name,
              description: item.description,
              serviceType: item.serviceType,
              price: typeof item.price === 'number' ? item.price.toString() : item.price?.toString(),
              rating: typeof item.rating === 'number' ? item.rating.toString() : item.rating?.toString(),
              location: item.location,
              duration: item.duration,
              travelTimeFromPrevious: item.travelTimeFromPrevious,
              isReplacement: item.isReplacement,
              replacementReason: item.replacementReason,
              metadata: activityNotes.length > 0 ? { methodologyNotes: activityNotes } : {},
              sortOrder: i,
            };
          })
        );
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
          value: combinedOptimizationScore.toString(),
          unit: "points",
          betterIsLower: false,
          description: `Overall score: ${combinedOptimizationScore}/100`,
        },
        {
          variantId: newVariant.id,
          metricKey: "balance_score",
          metricLabel: "Balance Score",
          value: enhancedMetrics.balanceScore.toString(),
          unit: "points",
          betterIsLower: false,
          description: enhancedMetrics.balanceScore >= 80 
            ? "Excellent mix of activity types" 
            : enhancedMetrics.balanceScore >= 60
            ? "Good variety of experiences"
            : "Could benefit from more variety",
        },
        {
          variantId: newVariant.id,
          metricKey: "wellness_score",
          metricLabel: "Wellness Score",
          value: enhancedMetrics.wellnessScore.toString(),
          unit: "points",
          betterIsLower: false,
          description: enhancedMetrics.wellnessScore >= 80
            ? "Optimal balance of activity and relaxation"
            : enhancedMetrics.wellnessScore >= 60
            ? "Good recovery time included"
            : "Consider adding relaxation activities",
        },
        {
          variantId: newVariant.id,
          metricKey: "pace_score",
          metricLabel: "Pace Score",
          value: enhancedMetrics.paceScore.toString(),
          unit: "points",
          betterIsLower: false,
          description: enhancedMetrics.paceScore >= 80
            ? "Well-paced itinerary"
            : enhancedMetrics.paceScore >= 60
            ? "Comfortable daily pace"
            : "May feel rushed or sparse",
        },
        {
          variantId: newVariant.id,
          metricKey: "diversity_score",
          metricLabel: "Diversity Score",
          value: enhancedMetrics.diversityScore.toString(),
          unit: "points",
          betterIsLower: false,
          description: enhancedMetrics.diversityScore >= 80
            ? "Rich variety of experience types"
            : enhancedMetrics.diversityScore >= 60
            ? "Good range of activities"
            : "Consider diversifying activities",
        },
        {
          variantId: newVariant.id,
          metricKey: "sequencing_score",
          metricLabel: "Sequencing Score",
          value: sequencingScore.toString(),
          unit: "points",
          betterIsLower: false,
          description: sequencingScore >= 80
            ? "Optimally ordered for energy and wellness"
            : sequencingScore >= 60
            ? "Well-organized activity flow"
            : "Standard activity ordering",
        },
        {
          variantId: newVariant.id,
          metricKey: "relaxation_minutes",
          metricLabel: "Relaxation Time",
          value: enhancedMetrics.relaxationMinutes.toString(),
          unit: "minutes",
          betterIsLower: false,
          description: `${enhancedMetrics.relaxationMinutes} minutes of wellness activities`,
        },
      ];

      // Add methodology summary metric if applicable
      const dayNotes = methodologyNotes.filter(n => n.type === 'day');
      const itineraryNotes = methodologyNotes.filter(n => n.type === 'itinerary');
      if (dayNotes.length > 0 || itineraryNotes.length > 0) {
        metricsToInsert.push({
          variantId: newVariant.id,
          metricKey: "methodology_summary",
          metricLabel: "Smart Sequencing Applied",
          value: sequencingResult.appliedRulesCount.toString(),
          unit: "rules",
          betterIsLower: false,
          description: dayNotes.length > 0 
            ? dayNotes[0].note 
            : (itineraryNotes.length > 0 ? itineraryNotes[0].note : "Activities sequenced for optimal flow"),
        });
      }

      // Batch-insert all metrics in one round-trip
      await db.insert(itineraryVariantMetrics).values(metricsToInsert);

      // Transport legs — only for items with real coordinates
      try {
        const variantItems = await db
          .select()
          .from(itineraryVariantItems)
          .where(eq(itineraryVariantItems.variantId, newVariant.id))
          .orderBy(itineraryVariantItems.dayNumber, itineraryVariantItems.sortOrder);

        const activitiesWithCoords = variantItems
          .filter((item) => item.latitude != null && item.longitude != null)
          .map((item, idx) => ({
            id: item.id,
            name: item.name || `Stop ${idx + 1}`,
            lat: parseFloat(item.latitude as unknown as string),
            lng: parseFloat(item.longitude as unknown as string),
            scheduledTime: item.startTime || "09:00",
            dayNumber: item.dayNumber,
            order: item.sortOrder ?? idx,
          }));

        if (activitiesWithCoords.length > 0) {
          await calculateTransportLegs(newVariant.id, activitiesWithCoords, destination, userTransportPrefs || {});
        }
      } catch (legErr) {
        console.error("Transport leg calculation error (non-critical):", legErr);
      }
    }));

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

      // Fetch transport legs for this variant
      const legs = await db
        .select()
        .from(transportLegs)
        .where(eq(transportLegs.variantId, variant.id))
        .orderBy(transportLegs.dayNumber, transportLegs.legOrder);

      // Organize items and legs by day for frontend consumption
      const dayNumbers = Array.from(new Set(items.map(i => i.dayNumber))).sort((a, b) => a - b);
      const days = dayNumbers.map(dayNum => {
        const dayItems = items.filter(i => i.dayNumber === dayNum);
        const dayLegs = legs.filter(l => l.dayNumber === dayNum);

        return {
          dayNumber: dayNum,
          activities: dayItems.map(item => ({
            id: item.id,
            dayNumber: item.dayNumber,
            timeSlot: item.timeSlot,
            startTime: item.startTime,
            endTime: item.endTime,
            name: item.name,
            description: item.description,
            serviceType: item.serviceType,
            price: item.price,
            rating: item.rating,
            location: item.location,
            duration: item.duration,
            travelTimeFromPrevious: item.travelTimeFromPrevious,
            isReplacement: item.isReplacement,
            replacementReason: item.replacementReason,
          })),
          transportLegs: dayLegs.map(leg => ({
            id: leg.id,
            legOrder: leg.legOrder,
            fromName: leg.fromName,
            toName: leg.toName,
            recommendedMode: leg.recommendedMode,
            userSelectedMode: leg.userSelectedMode,
            distanceDisplay: leg.distanceDisplay,
            distanceMeters: leg.distanceMeters,
            estimatedDurationMinutes: leg.estimatedDurationMinutes,
            estimatedCostUsd: leg.estimatedCostUsd,
            energyCost: leg.energyCost,
            alternativeModes: leg.alternativeModes,
            linkedProductUrl: leg.linkedProductUrl,
            fromLat: leg.fromLat,
            fromLng: leg.fromLng,
            toLat: leg.toLat,
            toLng: leg.toLng,
          })),
        };
      });

      return { ...variant, items, metrics, days };
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
