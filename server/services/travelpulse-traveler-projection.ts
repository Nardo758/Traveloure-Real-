/**
 * R-07 (ledger `2026-10-22-r07-drop-seasonal-highlights`): `currentHighlight` and
 * `aiSeasonalHighlights` stay on `travel_pulse_cities` and on the admin city read.
 * Every traveler-facing projection and every AI prompt input drops them, with no
 * age cutoff. Apply this helper wherever a city row is spread into a public payload
 * so a later column read cannot leak the pair again.
 */

export const TRAVELER_SEASONAL_FIELD_KEYS = [
  "currentHighlight",
  "aiSeasonalHighlights",
  "current_highlight",
  "ai_seasonal_highlights",
] as const;

export function omitTravelerSeasonalFields<T extends object>(
  row: T,
): Omit<T, "currentHighlight" | "aiSeasonalHighlights"> {
  const copy: Record<string, unknown> = { ...(row as Record<string, unknown>) };
  for (const key of TRAVELER_SEASONAL_FIELD_KEYS) delete copy[key];
  return copy as Omit<T, "currentHighlight" | "aiSeasonalHighlights">;
}

/** City columns the quick-start draft may copy. The seasonal pair is never among them. */
export function draftCityPromptFields(city: {
  trendingScore?: unknown;
  aiBudgetEstimate?: unknown;
  aiTravelTips?: unknown;
  aiLocalInsights?: unknown;
  aiMustSeeAttractions?: unknown;
  aiUpcomingEvents?: unknown;
  aiSeasonalHighlights?: unknown;
  currentHighlight?: unknown;
}): {
  trendingScore: unknown;
  aiBudgetEstimate: unknown;
  aiTravelTips: unknown;
  aiLocalInsights: unknown;
  aiMustSeeAttractions: unknown;
  aiUpcomingEvents: unknown;
} {
  return {
    trendingScore: city.trendingScore,
    aiBudgetEstimate: city.aiBudgetEstimate,
    aiTravelTips: city.aiTravelTips,
    aiLocalInsights: city.aiLocalInsights,
    aiMustSeeAttractions: city.aiMustSeeAttractions,
    aiUpcomingEvents: city.aiUpcomingEvents,
  };
}

/** City columns the optimizer may copy. Non-strings stay out, and the seasonal pair is never copied. */
export function optimizationCityPromptFields(city: {
  trendingScore?: unknown;
  aiBudgetEstimate?: unknown;
  aiTravelTips?: unknown;
  aiLocalInsights?: unknown;
  aiMustSeeAttractions?: unknown;
  aiUpcomingEvents?: unknown;
  aiSeasonalHighlights?: unknown;
  currentHighlight?: unknown;
}): {
  trendingScore?: number;
  aiBudgetEstimate?: string;
  aiTravelTips?: string;
  aiLocalInsights?: string;
  aiMustSeeAttractions?: string;
  aiUpcomingEvents?: string;
} {
  return {
    trendingScore: typeof city.trendingScore === "number" ? city.trendingScore : undefined,
    aiBudgetEstimate: typeof city.aiBudgetEstimate === "string" ? city.aiBudgetEstimate : undefined,
    aiTravelTips: typeof city.aiTravelTips === "string" ? city.aiTravelTips : undefined,
    aiLocalInsights: typeof city.aiLocalInsights === "string" ? city.aiLocalInsights : undefined,
    aiMustSeeAttractions: typeof city.aiMustSeeAttractions === "string" ? city.aiMustSeeAttractions : undefined,
    aiUpcomingEvents: typeof city.aiUpcomingEvents === "string" ? city.aiUpcomingEvents : undefined,
  };
}

export interface TravelPulsePromptInput {
  pulseScore?: number;
  trendingScore?: number;
  crowdLevel?: string;
  aiBudgetEstimate?: string;
  aiTravelTips?: string;
  aiLocalInsights?: string;
  aiMustSeeAttractions?: string;
  aiUpcomingEvents?: string;
  hiddenGems?: Array<{ name: string; description: string; gemScore: number }>;
  happeningNow?: Array<{ name: string; type: string }>;
}

/**
 * The TravelPulse block appended to an itinerary prompt. Seasonal highlight text is not a line
 * here: a caller that still carries the dropped fields does not get them into the prompt.
 */
export function formatTravelPulsePromptSection(
  tpCtx: (TravelPulsePromptInput & { aiSeasonalHighlights?: unknown; currentHighlight?: unknown }) | null | undefined,
): string {
  if (!tpCtx) return "";
  const tpParts: string[] = [];

  if (tpCtx.pulseScore) {
    tpParts.push(`- City Pulse Score: ${tpCtx.pulseScore}/100 (activity level)`);
  }
  if (tpCtx.aiBudgetEstimate) {
    tpParts.push(`- Local Budget Insight: ${tpCtx.aiBudgetEstimate}`);
  }
  if (tpCtx.aiMustSeeAttractions) {
    tpParts.push(`- Top Attractions (prioritize these): ${tpCtx.aiMustSeeAttractions}`);
  }
  if (tpCtx.aiLocalInsights) {
    tpParts.push(`- Local Insights: ${tpCtx.aiLocalInsights}`);
  }
  if (tpCtx.aiTravelTips) {
    tpParts.push(`- Travel Tips: ${tpCtx.aiTravelTips}`);
  }
  if (tpCtx.happeningNow && tpCtx.happeningNow.length > 0) {
    const eventNames = tpCtx.happeningNow.slice(0, 3).map((e) => `${e.name} (${e.type})`).join(", ");
    tpParts.push(`- Events Happening Now: ${eventNames}`);
  }
  if (tpCtx.aiUpcomingEvents) {
    tpParts.push(`- Upcoming Events: ${tpCtx.aiUpcomingEvents}`);
  }

  if (tpParts.length === 0) return "";
  return `

**Real-Time Destination Intelligence (TravelPulse AI):**
${tpParts.join("\n")}

IMPORTANT: Incorporate this real-time intelligence into your recommendations. Prioritize must-see attractions.`;
}
