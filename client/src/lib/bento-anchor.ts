import type { FeedItem } from "./feed-stream";

export type BentoAnchorPriority = "neighborhood-local" | "city-local" | "planner";

type TaggedBentoItem = { item: FeedItem; order: number; isAnchor: boolean };

function normalizeToken(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");
}

function scopedTokens(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(scopedTokens);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return [record.slug, record.id, record.name, record.neighborhood, record.neighbourhood]
      .flatMap(scopedTokens);
  }
  if (typeof value !== "string") return [];
  return value
    .split(/[|,]/)
    .map(normalizeToken)
    .filter(Boolean);
}

function fieldValues(data: any, fields: string[]): string[] {
  return fields.flatMap((field) => scopedTokens(data?.[field]));
}

function expertRole(data: any): string {
  return normalizeToken(
    data?.role ??
      data?.expertRole ??
      data?.expert_role ??
      data?.expertForm?.role ??
      data?.expertForm?.expertRole ??
      data?.expertForm?.expert_role,
  );
}

function isExpertItem(item: FeedItem): boolean {
  return item.kind === "lead-expert" || item.kind === "expert";
}

/**
 * Resolve an expert's bento anchor priority without changing feed membership or
 * order. The expert endpoint is already city-scoped, so a local expert with no
 * explicit city field is still a city-local candidate.
 */
export function bentoAnchorPriority(
  item: FeedItem,
  neighbourhood: any | null,
  city: string,
): BentoAnchorPriority | null {
  if (!isExpertItem(item)) return null;

  const data = item.data ?? {};
  const role = expertRole(data);
  if (role === "event-planner" || role === "eventplanner") return null;

  const localRole = role === "local-expert" || role === "expert" || role === "";
  if (localRole) {
    const neighbourhoodTokens = [
      neighbourhood?.slug,
      neighbourhood?.id,
      neighbourhood?.name,
      neighbourhood?.neighborhood_name,
      neighbourhood?.neighborhoodName,
    ].flatMap(scopedTokens);
    const expertNeighbourhoodTokens = [
      ...fieldValues(data, ["neighborhoods", "neighbourhoods", "neighborhoodIds", "neighbourhoodIds"]),
      ...fieldValues(data?.expertForm, ["neighborhoods", "neighbourhoods", "neighborhoodIds", "neighbourhoodIds"]),
    ];
    if (
      neighbourhoodTokens.length > 0 &&
      expertNeighbourhoodTokens.some((token) => neighbourhoodTokens.includes(token))
    ) {
      return "neighborhood-local";
    }

    const cityTokens = [
      ...fieldValues(data, ["city", "location", "destination"]),
      ...fieldValues(data?.expertForm, ["city", "location", "destination"]),
    ];
    if (cityTokens.length === 0 || cityTokens.includes(normalizeToken(city))) {
      return "city-local";
    }
    return null;
  }

  if (role === "travel-expert" || role === "trip-planner" || role === "planner") {
    return "planner";
  }

  return null;
}

/**
 * §2 ranking stats for tie-breaking within a priority bucket: highest rating
 * wins, ties go to the expert with the most offerings. An expert with no
 * review-backed rating (§13 honesty — never a fabricated 0) ranks below every
 * rated expert, never above, so an unrated expert cannot out-rank a rated one.
 */
function expertRankingStats(data: any): { rating: number; offerings: number } {
  const reviewCount = Number(data?.reviewCount ?? 0);
  const averageRating = data?.averageRating;
  const rating = reviewCount > 0 && averageRating != null ? Number(averageRating) : -1;
  const servicesCount = Number(data?.servicesCount ?? 0);
  const packagesCount = Number(data?.packagesCount ?? 0);
  return { rating, offerings: servicesCount + packagesCount };
}

/**
 * Find the highest-priority, highest-ranked eligible expert according to §2:
 * priority bucket first (neighbourhood-local, then city-local, then planner),
 * then within a bucket the highest rating, ties → most offerings, ties →
 * earliest stream order. A null result is deliberate: the section has no
 * anchor, and the bento may still pull its first ready-made into the leading
 * 2×1 slot.
 */
export function selectBentoAnchorIndex(
  tagged: TaggedBentoItem[],
  neighbourhood: any | null,
  city: string,
): number {
  let selectedIndex = -1;
  let selectedPriority = Number.POSITIVE_INFINITY;
  let selectedRating = Number.NEGATIVE_INFINITY;
  let selectedOfferings = Number.NEGATIVE_INFINITY;
  const priority: Record<BentoAnchorPriority, number> = {
    "neighborhood-local": 0,
    "city-local": 1,
    planner: 2,
  };

  tagged.forEach((entry, index) => {
    const candidatePriority = bentoAnchorPriority(entry.item, neighbourhood, city);
    if (candidatePriority === null) return;
    const candidatePriorityRank = priority[candidatePriority];
    const { rating, offerings } = expertRankingStats(entry.item.data ?? {});

    const isBetter =
      candidatePriorityRank < selectedPriority ||
      (candidatePriorityRank === selectedPriority &&
        (rating > selectedRating || (rating === selectedRating && offerings > selectedOfferings)));

    if (isBetter) {
      selectedIndex = index;
      selectedPriority = candidatePriorityRank;
      selectedRating = rating;
      selectedOfferings = offerings;
    }
  });

  return selectedIndex;
}