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
 * Eligibility is deliberately separate from prioritization: destination-feed
 * anchors can only be local experts or trip planners. Event planners remain
 * ordinary expert tiles, while provider items are never expert feed items.
 */
export function isBentoAnchorEligible(item: FeedItem): boolean {
  if (!isExpertItem(item)) return false;
  const role = expertRole(item.data ?? {});
  return (
    role === "" ||
    role === "local-expert" ||
    role === "expert" ||
    role === "travel-expert" ||
    role === "trip-planner" ||
    role === "planner"
  );
}

function cityMatches(data: any, city: string): boolean {
  const cityTokens = [
    ...fieldValues(data, ["city", "location", "destination"]),
    ...fieldValues(data?.expertForm, ["city", "location", "destination"]),
  ];
  return cityTokens.length === 0 || cityTokens.includes(normalizeToken(city));
}

function rankValue(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function anchorQuality(item: FeedItem): { rating: number; offerings: number } {
  const data = item.data ?? {};
  const selectedServices = Array.isArray(data.selectedServices)
    ? data.selectedServices.length
    : Array.isArray(data.expertForm?.selectedServices)
      ? data.expertForm.selectedServices.length
      : 0;
  return {
    rating: rankValue(data.averageRating ?? data.rating ?? data.expertForm?.averageRating),
    offerings: rankValue(data.offeringsCount ?? data.packagesCount ?? selectedServices),
  };
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
  if (!isBentoAnchorEligible(item)) return null;

  const data = item.data ?? {};
  const role = expertRole(data);

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

    if (cityMatches(data, city)) {
      return "city-local";
    }
    return null;
  }

  if (
    (role === "travel-expert" || role === "trip-planner" || role === "planner") &&
    cityMatches(data, city)
  ) {
    return "planner";
  }

  return null;
}

/**
 * Find the first eligible expert according to §2. A null result is deliberate:
 * the section has no anchor, and the bento may still pull its first ready-made
 * into the leading 2×1 slot.
 */
export function selectBentoAnchorIndex(
  tagged: TaggedBentoItem[],
  neighbourhood: any | null,
  city: string,
): number {
  let selectedIndex = -1;
  let selectedPriority = Number.POSITIVE_INFINITY;
  const priority: Record<BentoAnchorPriority, number> = {
    "neighborhood-local": 0,
    "city-local": 1,
    planner: 2,
  };

  let selectedQuality = { rating: Number.NEGATIVE_INFINITY, offerings: Number.NEGATIVE_INFINITY };

  tagged.forEach((entry, index) => {
    const candidatePriority = bentoAnchorPriority(entry.item, neighbourhood, city);
    if (candidatePriority === null) return;

    const candidateRank = priority[candidatePriority];
    const candidateQuality = anchorQuality(entry.item);
    const outranksSelection =
      candidateRank < selectedPriority ||
      (candidateRank === selectedPriority &&
        (candidateQuality.rating > selectedQuality.rating ||
          (candidateQuality.rating === selectedQuality.rating &&
            candidateQuality.offerings > selectedQuality.offerings)));
    if (outranksSelection) {
      selectedIndex = index;
      selectedPriority = candidateRank;
      selectedQuality = candidateQuality;
    }
  });

  return selectedIndex;
}