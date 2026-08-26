import type { UpsellSurface } from "@/components/UpsellSlot";

export interface CityFeedRecommendationContext {
  city: string;
  neighborhoodId?: string;
}

interface RecommendationTarget {
  categoryKey: string;
}

/**
 * Keeps a city-feed recommendation inside the market and neighbourhood where it
 * was presented. The services surface owns the `location` filter; the
 * neighbourhood remains addressable for the handoff and return journey.
 */
export function buildCityFeedRecommendationBookingUrl(
  candidate: RecommendationTarget,
  surface: UpsellSurface,
  context: CityFeedRecommendationContext,
): string {
  const params = new URLSearchParams({
    categoryKey: candidate.categoryKey,
    upsellSource: surface,
    location: context.city,
  });

  if (context.neighborhoodId) {
    params.set("neighborhood", context.neighborhoodId);
  }

  return `/services?${params.toString()}`;
}