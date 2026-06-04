/**
 * Feed stream composition algorithm.
 *
 * Builds a single, interleaved FeedItem[] from neighborhoods, gems, experts,
 * and events so that:
 * - Gems with a `neighborhood` field are grouped inside their NeighborhoodContainer
 * - Gems with no neighborhood appear as loose cards
 * - No two NeighborhoodContainers are ever adjacent
 * - Loose gems / expert cards / events are woven between containers
 */

export type FeedItemKind =
  | "neighborhood"
  | "loose-gem"
  | "event"
  | "expert"
  | "supply-hotel"
  | "supply-activity";

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
 * @param neighborhoods - array from `data.neighborhoods.data` (with gemCount)
 * @param allGems       - array from `data.gems.data`
 * @param events        - array from `data.events.data.events`
 * @param supplyHotels  - array from `data.recommendations.data.hotels`
 * @param supplyActivities - array from `data.recommendations.data.activities`
 */
export function buildFeedStream(
  neighborhoods: any[],
  allGems: any[],
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

  // ── 2. Build neighborhood FeedItems (only if they have gems) ────────────
  const neighborhoodItems: FeedItem[] = neighborhoods
    .filter((n) => (gemsByNeighborhood.get(n.slug)?.length ?? 0) > 0)
    .map((n) => ({
      kind: "neighborhood" as FeedItemKind,
      id: `neighborhood-${n.id}`,
      data: { ...n, gems: gemsByNeighborhood.get(n.slug) ?? [] },
    }));

  // ── 3. Build loose-gem FeedItems ─────────────────────────────────────────
  const looseGemItems: FeedItem[] = looseGems.map((g) => ({
    kind: "loose-gem" as FeedItemKind,
    id: `gem-${g.id}`,
    data: g,
  }));

  // ── 4. Build event FeedItems ─────────────────────────────────────────────
  const eventItems: FeedItem[] = (events ?? []).slice(0, 4).map((e) => ({
    kind: "event" as FeedItemKind,
    id: `event-${e.id ?? e.eventId ?? Math.random()}`,
    data: e,
  }));

  // ── 5. Build supply FeedItems ────────────────────────────────────────────
  const hotelItems: FeedItem[] = (supplyHotels ?? []).slice(0, 3).map((h) => ({
    kind: "supply-hotel" as FeedItemKind,
    id: `hotel-${h.id}`,
    data: h,
  }));

  const activityItems: FeedItem[] = (supplyActivities ?? []).slice(0, 3).map((a) => ({
    kind: "supply-activity" as FeedItemKind,
    id: `activity-${a.id}`,
    data: a,
  }));

  // ── 6. Interleave so no two neighborhoods are adjacent ───────────────────
  // Pattern: [neighborhood, loose×N, loose-event?, neighborhood, loose×N, ...]
  const result: FeedItem[] = [];
  const filler = [...looseGemItems, ...eventItems, ...hotelItems, ...activityItems];

  let fillerIdx = 0;
  const fillerBetween = Math.max(1, Math.floor(filler.length / Math.max(neighborhoodItems.length, 1)));

  for (let ni = 0; ni < neighborhoodItems.length; ni++) {
    result.push(neighborhoodItems[ni]);
    // Insert some loose items after each neighborhood container
    const count = ni < neighborhoodItems.length - 1 ? fillerBetween : filler.length - fillerIdx;
    for (let fi = 0; fi < count && fillerIdx < filler.length; fi++, fillerIdx++) {
      result.push(filler[fillerIdx]);
    }
  }

  // Flush any remaining filler if no neighborhoods
  while (fillerIdx < filler.length) {
    result.push(filler[fillerIdx++]);
  }

  return result;
}

/**
 * Filter a FeedItem[] by spine chip type.
 * When a type is active, NeighborhoodContainers are dissolved and their gems
 * rendered as flat items matching the filter.
 */
export function filterFeedStream(
  items: FeedItem[],
  activeFilter: string,
): FeedItem[] {
  if (activeFilter === "all") return items;

  const result: FeedItem[] = [];

  for (const item of items) {
    if (item.kind === "neighborhood") {
      // Dissolve neighborhood containers — emit matching gems as loose items
      const gems: any[] = item.data.gems ?? [];
      for (const gem of gems) {
        if (matchesFilter(gem, null, activeFilter)) {
          result.push({ kind: "loose-gem", id: `gem-${gem.id}`, data: gem });
        }
      }
    } else if (matchesFilter(item.data, item.kind, activeFilter)) {
      result.push(item);
    }
  }

  return result;
}

function matchesFilter(data: any, kind: FeedItemKind | null, filter: string): boolean {
  switch (filter) {
    case "eat":
      return gemCategory(data.placeType) === "eat";
    case "do":
      return (
        kind === "supply-activity" ||
        (kind === "loose-gem" || kind === null) && gemCategory(data.placeType) === "do"
      );
    case "stay":
      return kind === "supply-hotel" || gemCategory(data.placeType) === "stay";
    case "events":
      return kind === "event";
    case "photo_spots":
      return gemCategory(data.placeType) === "photo_spots";
    case "experts":
      return kind === "expert";
    default:
      return true;
  }
}
