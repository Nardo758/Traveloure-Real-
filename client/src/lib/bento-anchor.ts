import type { FeedItem } from "./feed-stream";

export type BentoAnchorPriority = "neighborhood-local" | "city-local" | "planner";

type TaggedBentoItem = { item: FeedItem; order: number; isAnchor: boolean };

// Mirrors normalizeNeighborhoodKey (server/services/location-view.service.ts)
// exactly: real seeded neighbourhood display names carry arbitrary punctuation
// ("Fort / Kala Ghoda"), so a lone hyphen/underscore/whitespace normalizer can
// leave stray punctuation in one of the two compared tokens. Collapsing every
// non-alphanumeric run to a single "_" on both sides removes that gap. This
// changes no outcome for today's real data (both sides already normalized the
// same raw string the same way), it only removes the coincidental dependency
// on that symmetry — see 2026-08-27-neighbourhood-slug-match in DECISIONS.md.
function normalizeToken(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
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
  if (role === "event_planner" || role === "eventplanner") return null;

  // The stored `expert` role has no neighbourhood-blind meaning of its own —
  // real accounts using it (e.g. Raj Patel, Mumbai) carry a real
  // expertForm.neighborhoods list, so it is evaluated as a local-expert
  // candidate here exactly like local_expert; it only falls through to the
  // planner bucket below when it has no local-expert match.
  const localRole = role === "local_expert" || role === "expert" || role === "";
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

  if (role === "travel_expert" || role === "trip_planner" || role === "planner") {
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

  tagged.forEach((entry, index) => {
    const candidatePriority = bentoAnchorPriority(entry.item, neighbourhood, city);
    if (candidatePriority !== null && priority[candidatePriority] < selectedPriority) {
      selectedIndex = index;
      selectedPriority = priority[candidatePriority];
    }
  });

  return selectedIndex;
}