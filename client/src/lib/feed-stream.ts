/**
 * Feed stream composition algorithm.
 *
 * Builds a single, interleaved FeedItem[] from neighborhoods, gems, experts,
 * and events so that:
 * - Gems with a `neighborhood` field are grouped inside their NeighborhoodContainer
 * - Gems with no neighborhood appear as loose cards
 * - No two NeighborhoodContainers are ever visually adjacent — this is a HARD
 *   guarantee, not best-effort. When real filler is insufficient, synthetic
 *   `"city-separator"` items (always rendered, no photo required) are inserted.
 * - Loose gems / expert cards / events are woven between containers
 */

export type FeedItemKind =
  | "neighborhood"
  | "loose-gem"
  | "event"
  | "expert"
  | "supply-hotel"
  | "supply-activity"
  | "vendor-service"
  | "city-separator"
  // Injected by the feed-composition layer (feed-composition.ts) — never
  // produced by buildFeedStream itself:
  | "recommendation"
  | "wanted-slot"
  | "lead-expert";

export interface FeedItem {
  kind: FeedItemKind;
  id: string;
  data: any;
}

/**
 * Map a gem's placeType to one of the spine filter categories.
 */
export function gemCategory(placeType: string | null | undefined): string {
  if (!placeType) return "do";
  const t = placeType.toLowerCase();
  if (["restaurant", "cafe", "bar", "food", "bakery", "street_food", "izakaya", "sushi", "ramen"].some((k) => t.includes(k))) return "eat";
  if (["hotel", "ryokan", "hostel", "accommodation", "inn", "stay"].some((k) => t.includes(k))) return "stay";
  if (["photography", "viewpoint", "lookout", "photo", "panorama", "scenic"].some((k) => t.includes(k))) return "photo_spots";
  return "do";
}

export interface MatchSuggestion {
  icon: string;
  matchText: string;
  actionLabel: string;
  actionVariant: "platform" | "affiliate";
  href: string;
  isRequest?: boolean;
  offeringTypeKey?: string;
  /** Display name needed so the demand loop can write the row. */
  displayName?: string;
}

/**
 * Map a placeType to a matched-service suggestion (spec: photo spot→photographer,
 * stay→transport, attraction→guide, eat→reservation).
 * Returns enriched data including price range, action label, and badge variant.
 */
export function matchedServiceSuggestion(placeType: string | null | undefined): MatchSuggestion | null {
  const cat = gemCategory(placeType);
  switch (cat) {
    case "photo_spots":
      return {
        icon: "📷",
        matchText: "photographer here · ¥14,000",
        actionLabel: "Book shoot",
        actionVariant: "platform",
        href: "/experiences/photo",
      };
    case "stay":
      return {
        icon: "🚗",
        matchText: "private car from city centre · ¥9,000",
        actionLabel: "Book both",
        actionVariant: "platform",
        href: "/experiences/transport",
      };
    case "eat":
      return {
        icon: "🍽",
        matchText: "reservation via OpenTable",
        actionLabel: "Reserve",
        actionVariant: "affiliate",
        href: "/experiences/dining",
      };
    case "do":
      return {
        icon: "🧭",
        matchText: "local guide · ¥6,000",
        actionLabel: "Book guide",
        actionVariant: "platform",
        href: "/local-experts",
      };
    default:
      return null;
  }
}

/**
 * Build the ordered FeedItem[] stream from raw data sections.
 *
 * Non-adjacency contract: ALL neighborhoods are emitted, and no two are ever
 * adjacent. When the filler pool is exhausted, a `city-separator` synthetic item
 * (always visible, no photo) is inserted as a guaranteed separator.
 */
export function buildFeedStream(
  neighborhoods: any[],
  allGems: any[],
  experts: any[],
  events: any[],
  supplyHotels: any[],
  supplyActivities: any[],
  platformServices: any[] = [],
  cityName?: string,
): FeedItem[] {
  // ── 1. Group gems by neighborhood slug ──────────────────────────────────
  const gemsByNeighborhood = new Map<string, any[]>();
  const looseGems: any[] = [];

  for (const gem of allGems) {
    if (gem.neighborhood) {
      if (!gemsByNeighborhood.has(gem.neighborhood)) {
        gemsByNeighborhood.set(gem.neighborhood, []);
      }
      gemsByNeighborhood.get(gem.neighborhood)!.push(gem);
    } else {
      looseGems.push(gem);
    }
  }

  // ── 2. Build neighborhood FeedItems (only where gems exist) ─────────────
  //
  // Gems can arrive in two forms:
  //   a) Nested inside each neighborhood object (n.gems) — primary source
  //   b) At the top level in allGems, keyed by slug — fallback source
  //
  // We merge both: use n.gems when present, otherwise fall back to
  // gemsByNeighborhood. The merged gemCount is updated to match the actual
  // gems array so the header ("N things to do") is always accurate.
  const neighborhoodItems: FeedItem[] = neighborhoods
    .filter((n) => (n.gems?.length ?? 0) > 0 || (gemsByNeighborhood.get(n.slug)?.length ?? 0) > 0)
    .map((n) => {
      const mergedGems: any[] = (n.gems?.length ? n.gems : null)
        ?? gemsByNeighborhood.get(n.slug)
        ?? [];
      return {
        kind: "neighborhood" as FeedItemKind,
        id: `neighborhood-${n.id}`,
        data: {
          ...n,
          gems: mergedGems,
          gemCount: Math.max(n.gemCount ?? 0, mergedGems.length),
        },
      };
    });

  // ── 3. Build filler pool ─────────────────────────────────────────────────
  const fillerPool: FeedItem[] = [
    ...looseGems.map((g) => ({ kind: "loose-gem" as FeedItemKind, id: `gem-${g.id}`, data: g })),
    ...(experts ?? []).slice(0, 3).map((e) => ({
      kind: "expert" as FeedItemKind,
      id: `expert-${e.id}`,
      data: e,
    })),
    ...(events ?? []).slice(0, 4).map((e) => ({
      kind: "event" as FeedItemKind,
      id: `event-${e.id ?? e.eventId ?? Math.random()}`,
      data: e,
    })),
    ...(supplyHotels ?? []).slice(0, 3).map((h) => ({
      kind: "supply-hotel" as FeedItemKind,
      id: `hotel-${h.id ?? Math.random()}`,
      data: h,
    })),
    ...(supplyActivities ?? []).slice(0, 3).map((a) => ({
      kind: "supply-activity" as FeedItemKind,
      id: `activity-${a.id ?? Math.random()}`,
      data: a,
    })),
    ...(platformServices ?? []).slice(0, 4).map((s) => ({
      kind: "vendor-service" as FeedItemKind,
      id: `vsvc-${s.id}`,
      data: s,
    })),
  ];

  // ── 4. Interleave neighborhoods with filler ──────────────────────────────
  if (neighborhoodItems.length === 0) return fillerPool;

  const result: FeedItem[] = [];
  const filler = [...fillerPool];

  // Minimum filler items to place between each pair of neighborhoods
  const MIN_FILLER_BETWEEN = 1;

  for (let i = 0; i < neighborhoodItems.length; i++) {
    // Insert filler before this neighborhood (except before the very first if pool is small)
    if (i === 0 && filler.length > neighborhoodItems.length * MIN_FILLER_BETWEEN) {
      // Distribute some filler before the first neighborhood
      const pre = Math.min(2, filler.length - neighborhoodItems.length * MIN_FILLER_BETWEEN);
      result.push(...filler.splice(0, pre));
    }

    result.push(neighborhoodItems[i]);

    // Always place at least MIN_FILLER_BETWEEN items after this neighborhood
    if (i < neighborhoodItems.length - 1) {
      if (filler.length > 0) {
        result.push(...filler.splice(0, Math.max(MIN_FILLER_BETWEEN, Math.floor(filler.length / (neighborhoodItems.length - i)))));
      } else {
        // No real filler left — insert a city-separator as guaranteed spacer
        result.push({
          kind: "city-separator" as FeedItemKind,
          id: `sep-${i}`,
          data: { cityName: cityName ?? "this city" },
        });
      }
    }
  }

  // Remaining filler after the last neighborhood
  result.push(...filler);

  return result;
}

/**
 * Filter a feed stream by a spine chip category.
 * When filtering, neighborhood containers are dissolved — their gems are extracted
 * and filtered individually.
 */
export function filterFeedStream(items: FeedItem[], category: string): FeedItem[] {
  const dissolved: FeedItem[] = [];
  for (const item of items) {
    if (item.kind === "neighborhood") {
      const gems: any[] = item.data.gems ?? [];
      gems.forEach((g) =>
        dissolved.push({ kind: "loose-gem", id: `gem-${g.id}`, data: g }),
      );
    } else {
      dissolved.push(item);
    }
  }

  return dissolved.filter((item) => {
    switch (category) {
      case "eat":
        if (item.kind === "loose-gem") return gemCategory(item.data.placeType) === "eat";
        if (item.kind === "supply-activity") return false;
        if (item.kind === "supply-hotel") return false;
        return false;
      case "stay":
        if (item.kind === "loose-gem") return gemCategory(item.data.placeType) === "stay";
        if (item.kind === "supply-hotel") return true;
        return false;
      case "do":
        if (item.kind === "loose-gem") return gemCategory(item.data.placeType) === "do";
        if (item.kind === "supply-activity") return true;
        if (item.kind === "vendor-service") return true;
        return false;
      case "photo_spots":
        if (item.kind === "loose-gem") return gemCategory(item.data.placeType) === "photo_spots";
        return false;
      case "events":
        return item.kind === "event";
      case "experts":
        return item.kind === "expert";
      case "services":
        return item.kind === "vendor-service";
      case "vibe":
        if (item.kind === "loose-gem") return !!item.data.vibeTag || !!item.data.isSecret;
        return false;
      default:
        return true;
    }
  });
}
