/**
 * Feed stream composition algorithm.
 *
 * Builds a single, interleaved FeedItem[] from neighborhoods, gems, experts,
 * and events so that:
 * - Gems with a `neighborhood` field are grouped inside their NeighborhoodContainer
 * - Gems with no neighborhood appear as loose cards
 * - Neighborhood containers are separated by filler with best-effort non-adjacency
 *   (all neighborhoods are always shown — non-adjacency is best-effort when filler
 *    runs short, but NO neighborhood is ever dropped)
 * - Loose gems / expert cards / events are woven between containers
 */

export type FeedItemKind =
  | "neighborhood"
  | "loose-gem"
  | "event"
  | "expert"
  | "supply-hotel"
  | "supply-activity"
  | "date-highlights";

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
 * Build the ordered FeedItem[] stream from raw data sections.
 *
 * Non-adjacency guarantee: fillers are distributed as evenly as possible into
 * N+1 slots (before, between, after N neighborhoods). ALL neighborhoods are
 * always emitted. When filler is insufficient for full non-adjacency some
 * neighborhoods may end up adjacent — this is acceptable; dropping content is not.
 *
 * @param neighborhoods     - array from `data.neighborhoods.data`
 * @param allGems           - array from `data.gems.data`
 * @param experts           - array of expert objects (from /api/experts?location=…)
 * @param events            - array from `data.events.data.events`
 * @param supplyHotels      - array from `data.recommendations.data.hotels`
 * @param supplyActivities  - array from `data.recommendations.data.activities`
 */
export function buildFeedStream(
  neighborhoods: any[],
  allGems: any[],
  experts: any[],
  events: any[],
  supplyHotels: any[],
  supplyActivities: any[],
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
    .filter((n) => (gemsByNeighborhood.get(n.slug)?.length ?? 0) > 0 || (n.gems?.length ?? 0) > 0)
    .map((n) => ({
      kind: "neighborhood" as FeedItemKind,
      id: `neighborhood-${n.id}`,
      data: {
        ...n,
        // Prefer server-embedded gems; fall back to client-grouped gems
        gems: n.gems?.length ? n.gems : (gemsByNeighborhood.get(n.slug) ?? []),
      },
    }));

  // ── 3. Build filler pool (order: gems, experts, events, supply) ──────────
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
  ];

  // ── 4. Edge cases ────────────────────────────────────────────────────────
  if (neighborhoodItems.length === 0) return fillerPool;
  if (fillerPool.length === 0) return neighborhoodItems; // all neighborhoods, no filler

  // ── 5. Distribute fillers evenly into N+1 slots (best-effort non-adjacency)
  // Slots: [before_n0, between_n0_n1, ..., after_nLast]
  // Each slot gets baseCount; the first `remainder` slots get one extra.
  // When fillerPool.length < neighborhoodItems.length - 1, some slots get 0
  // and neighborhoods may be adjacent — that is acceptable, no content is dropped.
  const numSlots = neighborhoodItems.length + 1;
  const baseCount = Math.floor(fillerPool.length / numSlots);
  let remainder = fillerPool.length % numSlots;
  let fi = 0;

  const result: FeedItem[] = [];

  for (let slot = 0; slot < numSlots; slot++) {
    // Filler count for this slot
    const count = baseCount + (remainder > 0 ? (remainder--, 1) : 0);
    for (let k = 0; k < count; k++) {
      result.push(fillerPool[fi++]);
    }
    // Insert neighborhood after each filler slot (except after the last slot)
    if (slot < neighborhoodItems.length) {
      result.push(neighborhoodItems[slot]);
    }
  }

  return result;
}

/**
 * Filter a FeedItem[] by spine chip type.
 * When a type filter is active, NeighborhoodContainers are dissolved and their
 * gems rendered as flat matching items.
 */
export function filterFeedStream(items: FeedItem[], activeFilter: string): FeedItem[] {
  if (activeFilter === "all") return items;

  const result: FeedItem[] = [];

  for (const item of items) {
    if (item.kind === "date-highlights") {
      // Always show date-highlights regardless of filter
      result.push(item);
      continue;
    }
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
    case "vibe":
      // Vibe = events + photo spots (curated feel-of-the-city content)
      return kind === "event" || gemCategory(data.placeType) === "photo_spots";
    default:
      return true;
  }
}
