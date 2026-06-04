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
  | "date-highlights"
  | "city-separator";

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

/**
 * Map a placeType to a matched-service suggestion label (spec: photo spot→photographer,
 * stay→transport, attraction→guide, eat→reservation).
 */
export function matchedServiceSuggestion(placeType: string | null | undefined): {
  label: string;
  icon: string;
  href: string;
} | null {
  const cat = gemCategory(placeType);
  switch (cat) {
    case "photo_spots":
      return { label: "Book a photographer", icon: "📷", href: "/experiences/photo" };
    case "stay":
      return { label: "Book airport transfer", icon: "🚖", href: "/experiences/transport" };
    case "eat":
      return { label: "Reserve a table", icon: "🍽", href: "/experiences/dining" };
    case "do":
      return { label: "Get a local guide", icon: "🏅", href: "/local-experts" };
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
  const neighborhoodItems: FeedItem[] = neighborhoods
    .filter((n) => (n.gems?.length ?? 0) > 0 || (gemsByNeighborhood.get(n.slug)?.length ?? 0) > 0)
    .map((n) => ({
      kind: "neighborhood" as FeedItemKind,
      id: `neighborhood-${n.id}`,
      data: {
        ...n,
        gems: n.gems?.length ? n.gems : (gemsByNeighborhood.get(n.slug) ?? []),
      },
    }));

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
      id: `hotel-${h.id}`,
      data: h,
    })),
    ...(supplyActivities ?? []).slice(0, 3).map((a) => ({
      kind: "supply-activity" as FeedItemKind,
      id: `activity-${a.id}`,
      data: a,
    })),
    ...(platformServices ?? []).slice(0, 8).map((s) => ({
      kind: "vendor-service" as FeedItemKind,
      id: `vendor-svc-${s.id}`,
      data: s,
    })),
  ];

  // ── 4. Edge cases ────────────────────────────────────────────────────────
  if (neighborhoodItems.length === 0) return fillerPool;
  if (fillerPool.length === 0) {
    // No real filler — interleave with synthetic separators to guarantee non-adjacency
    return interleaveSynthetic(neighborhoodItems, cityName);
  }

  // ── 5. Distribute fillers evenly into N+1 slots ──────────────────────────
  // Slots: [before_n0, between_n0_n1, ..., after_nLast]
  const numSlots = neighborhoodItems.length + 1;
  const baseCount = Math.floor(fillerPool.length / numSlots);
  let remainder = fillerPool.length % numSlots;
  let fi = 0;

  const result: FeedItem[] = [];

  for (let slot = 0; slot < numSlots; slot++) {
    const count = baseCount + (remainder > 0 ? (remainder--, 1) : 0);
    for (let k = 0; k < count; k++) {
      result.push(fillerPool[fi++]);
    }
    if (slot < neighborhoodItems.length) {
      // Check: would last emitted item be a neighborhood? If so and we have NO
      // filler in this slot, insert a synthetic separator.
      const lastKind = result[result.length - 1]?.kind;
      if (lastKind === "neighborhood") {
        result.push(makeSeparator(slot, cityName));
      }
      result.push(neighborhoodItems[slot]);
    }
  }

  return result;
}

/** Build a stream by interleaving neighborhoods with synthetic separators. */
function interleaveSynthetic(neighborhoods: FeedItem[], cityName?: string): FeedItem[] {
  const result: FeedItem[] = [];
  for (let i = 0; i < neighborhoods.length; i++) {
    result.push(neighborhoods[i]);
    if (i < neighborhoods.length - 1) {
      result.push(makeSeparator(i, cityName));
    }
  }
  return result;
}

function makeSeparator(index: number, cityName?: string): FeedItem {
  return {
    kind: "city-separator",
    id: `city-separator-${index}`,
    data: { cityName: cityName ?? "this city" },
  };
}

/**
 * Filter a FeedItem[] by spine chip type.
 * When a type filter is active, NeighborhoodContainers are dissolved and their
 * gems rendered as flat matching items. date-highlights always passes through.
 */
export function filterFeedStream(items: FeedItem[], activeFilter: string): FeedItem[] {
  if (activeFilter === "all") return items;

  const result: FeedItem[] = [];

  for (const item of items) {
    if (item.kind === "date-highlights") {
      result.push(item);
      continue;
    }
    if (item.kind === "city-separator") continue; // hide separators in filtered view
    if (item.kind === "neighborhood") {
      // Dissolve — emit only matching gems as loose items
      for (const gem of item.data.gems ?? []) {
        if (matchesFilter(gem, "loose-gem", activeFilter)) {
          result.push({ kind: "loose-gem", id: `gem-${gem.id}`, data: gem });
        }
      }
    } else if (matchesFilter(item.data, item.kind, activeFilter)) {
      result.push(item);
    }
  }

  return result;
}

function matchesFilter(data: any, kind: FeedItemKind, filter: string): boolean {
  switch (filter) {
    case "eat":
      return gemCategory(data.placeType) === "eat";
    case "do":
      return (
        kind === "supply-activity" ||
        kind === "vendor-service" ||
        (kind === "loose-gem" && gemCategory(data.placeType) === "do")
      );
    case "stay":
      return kind === "supply-hotel" || gemCategory(data.placeType) === "stay";
    case "events":
      return kind === "event";
    case "photo_spots":
      return gemCategory(data.placeType) === "photo_spots";
    case "experts":
      return kind === "expert";
    case "services":
      return kind === "vendor-service";
    case "vibe":
      return kind === "event" || gemCategory(data.placeType) === "photo_spots";
    default:
      return true;
  }
}
