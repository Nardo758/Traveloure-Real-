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

const THIRD_PARTY_PROVIDERS = new Set([
  "fever",
  "liteapi",
  "lite-api",
  "tiqets",
  "viator",
  "getyourguide",
  "amadeus",
  "booking-com",
  "booking.com",
]);

function itemRecords(item: FeedItem): any[] {
  const data = item.data ?? {};
  return [data, data.candidate].filter((record) => record && typeof record === "object");
}

function providerToken(record: any): string {
  return normalizeToken(record?.provider ?? record?.vendor ?? record?.partner ?? record?.source);
}

/**
 * A partner, affiliate, or third-party card. Fever, LiteAPI, Tiqets and the
 * same class never occupy the section's hero span. A platform listing and a
 * ready-made trip are ours.
 */
export function isPartnerOrThirdPartyFeedItem(item: FeedItem): boolean {
  if (
    item.kind === "external-stub" ||
    item.kind === "supply-hotel" ||
    item.kind === "supply-activity"
  ) {
    return true;
  }
  for (const record of itemRecords(item)) {
    const source = normalizeToken(record.sourceType ?? record.source_type);
    if (source === "affiliate" || source === "partner" || source === "external") return true;
    if (THIRD_PARTY_PROVIDERS.has(providerToken(record))) return true;
    if (record.priceSource === "partner") return true;
    if (record.resolutionClass === "external" || record.inventoryClass === "external") return true;
  }
  return false;
}

/** Desktop column span before row packing. A third-party tile stays 1 wide. */
export function bentoBaseColSpan(item: FeedItem, isAnchor: boolean): number {
  if (isPartnerOrThirdPartyFeedItem(item)) return 1;
  if (isAnchor || item.kind === "package") return 2;
  return 1;
}

export type BentoHeroSelection =
  | { kind: "expert"; index: number }
  | { kind: "ready-made"; index: number }
  | { kind: "wanted"; index: number | null };

/**
 * The one hero for a neighbourhood section or the city-feed intro.
 * Order: an eligible expert (neighbourhood local, city local, then trip
 * planner), else the first ready-made, else a Wanted tile. Index null means
 * the section has no Wanted card yet and the renderer supplies one. A partner
 * card is never returned.
 */
export function selectBentoHero(
  tagged: TaggedBentoItem[],
  neighbourhood: any | null,
  city: string,
): BentoHeroSelection {
  const expertIndex = selectBentoAnchorIndex(tagged, neighbourhood, city);
  if (expertIndex >= 0 && !isPartnerOrThirdPartyFeedItem(tagged[expertIndex].item)) {
    return { kind: "expert", index: expertIndex };
  }
  const readyMadeIndex = tagged.findIndex(
    (entry) => entry.item.kind === "package" && !isPartnerOrThirdPartyFeedItem(entry.item),
  );
  if (readyMadeIndex >= 0) return { kind: "ready-made", index: readyMadeIndex };
  const wantedIndex = tagged.findIndex(
    (entry) =>
      entry.item.kind === "wanted-slot" &&
      !entry.item.data?.neighbourhoodWantedHero &&
      !isPartnerOrThirdPartyFeedItem(entry.item),
  );
  if (wantedIndex >= 0) return { kind: "wanted", index: wantedIndex };
  return { kind: "wanted", index: null };
}

/**
 * Find the first eligible expert according to §2. A negative result means no
 * expert hero; `selectBentoHero` then uses a ready-made, else a Wanted tile.
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