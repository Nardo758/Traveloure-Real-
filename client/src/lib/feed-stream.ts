import { filterFeedActivity, sanitizePartnerCardCopy } from "@shared/banned-copy";

/**
 * Feed stream composition algorithm.
 *
 * Builds a single, interleaved FeedItem[] from neighborhoods, gems, experts,
 * and events so that:
 * - Gems with a `neighborhood` field are grouped inside their NeighborhoodContainer
 * - Gems with no neighborhood appear as loose cards
 * - No two stocked neighbourhood sections are adjacent. An unstocked
 *   neighbourhood (no gems, services, local expert or ready-made) stays in
 *   neighbourhood order and does not take a filler slot, so it can sit
 *   directly against the next stocked section. When real filler is
 *   insufficient, synthetic `"city-separator"` items (always rendered, no
 *   photo required) are inserted between stocked neighbourhoods.
 * - Loose gems / expert cards / events are woven between stocked containers
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
  | "lead-expert"
  // Injected by the discover page AFTER composition (insert, never replace —
  // rec cadence and wanted-slot spacing stay meaning-bearing):
  | "earn-card"
  | "package"
  // Trailhead T4.3: published scraped/DMO stub — external inventory, rendered
  // with a DISTINCT non-bookable card so it can't be mistaken for a listing.
  | "external-stub";

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
        matchText: "private car from city center · ¥9,000",
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

/** Body copy for an unstocked neighbourhood's one Wanted tile. Marketing, exact. */
export function neighbourhoodWantedBody(name: string): string {
  return `Know ${name} well? We're looking for local experts and providers here.`;
}

export const NEIGHBOURHOOD_WANTED_HREF = "/earn";

function positiveCount(value: unknown): boolean {
  const n = Number(value);
  return Number.isFinite(n) && n > 0;
}

function presentList(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

/**
 * A neighbourhood has nothing of its own to show: no gems, no services, no
 * local expert and no ready-made. Those four are read off the neighbourhood
 * record (the location-view payload), not off filler that happens to sit in
 * the same bento window.
 */
export function neighbourhoodIsUnstocked(neighbourhood: any): boolean {
  if (!neighbourhood || typeof neighbourhood !== "object") return false;
  if (presentList(neighbourhood.gems) || positiveCount(neighbourhood.gemCount)) return false;
  if (
    positiveCount(neighbourhood.serviceCount) ||
    presentList(neighbourhood.services)
  ) {
    return false;
  }
  if (neighbourhood.localExpert || neighbourhood.local_expert || neighbourhood.expert) return false;
  if (
    neighbourhood.readyMade ||
    neighbourhood.ready_made ||
    neighbourhood.readyMadeTrip ||
    neighbourhood.ready_made_trip ||
    presentList(neighbourhood.packages)
  ) {
    return false;
  }
  return true;
}

const SECTION_INVENTORY_KINDS = new Set([
  "loose-gem",
  "vendor-service",
  "expert",
  "lead-expert",
  "package",
]);

/**
 * The section renders as a heading plus one Wanted tile when the neighbourhood
 * itself is unstocked and the run did not already place a gem, service, expert
 * or ready-made. A partner recommendation is not one of those and does not
 * become the section anchor.
 */
export function neighbourhoodSectionNeedsWantedTile(
  neighbourhood: any | null,
  run: { kind: string }[],
): boolean {
  if (!neighbourhood || !neighbourhoodIsUnstocked(neighbourhood)) return false;
  return !run.some((item) => SECTION_INVENTORY_KINDS.has(item.kind));
}

/**
 * Put unstocked neighbourhood markers back into neighbourhood order without
 * taking a filler slot. Each one lands immediately before the next stocked
 * neighbourhood (after that previous section's trailing filler), or at the
 * end when nothing stocked follows. Stocked items keep their relative order.
 */
export function placeUnstockedNeighbourhoods(
  stream: FeedItem[],
  orderedNeighbourhoods: FeedItem[],
): FeedItem[] {
  const markers = orderedNeighbourhoods.filter((item) => item.kind === "neighborhood");
  const already = new Set(
    stream.filter((item) => item.kind === "neighborhood").map((item) => item.id),
  );
  const pendingBefore = new Map<string, FeedItem[]>();
  const trailing: FeedItem[] = [];
  let pending: FeedItem[] = [];
  for (const marker of markers) {
    if (!neighbourhoodIsUnstocked(marker.data)) {
      if (pending.length > 0) {
        pendingBefore.set(marker.id, pending);
        pending = [];
      }
      continue;
    }
    if (already.has(marker.id)) continue;
    pending.push(marker);
  }
  trailing.push(...pending);
  if (pendingBefore.size === 0 && trailing.length === 0) return stream;

  const out: FeedItem[] = [];
  const consumed = new Set<string>();
  for (const item of stream) {
    const before = item.kind === "neighborhood" ? pendingBefore.get(item.id) : undefined;
    if (before) {
      out.push(...before);
      consumed.add(item.id);
    }
    out.push(item);
  }
  for (const marker of markers) {
    if (!consumed.has(marker.id)) {
      const before = pendingBefore.get(marker.id);
      if (before) out.push(...before);
    }
  }
  out.push(...trailing);
  return out;
}

/** Drop unstocked neighbourhood markers so composition sees the stocked stream. */
export function withoutUnstockedNeighbourhoods(stream: FeedItem[]): FeedItem[] {
  return stream.filter(
    (item) => item.kind !== "neighborhood" || !neighbourhoodIsUnstocked(item.data),
  );
}

/**
 * Build the ordered FeedItem[] stream from raw data sections.
 *
 * Non-adjacency contract: ALL neighborhoods are emitted, and no two stocked
 * ones are ever adjacent. An unstocked neighbourhood (no gems, services,
 * expert or ready-made) stays in neighbourhood order and does not consume a
 * filler slot, so the stocked sections keep the stream they had when empty
 * neighbourhoods were omitted. When the filler pool is exhausted, a
 * `city-separator` synthetic item (always visible, no photo) is inserted as
 * a guaranteed separator between stocked neighbourhoods.
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
  // FP-1 / B4 (docs/testing/PROVIDER_BATCH_EXERCISE.md, P1): how many platform services may enter
  // the filler pool. The MIXED "all" feed keeps its balance cap of 4 — that cap is composition, and
  // it is unchanged. But a spine chip is a DELIBERATE SEARCH ("show me Services", "show me Stay"),
  // and answering it with a sample of four is what made a Kyoto provider's whole approved catalog
  // invisible on Kyoto's own market page while sitting in the payload. Callers pass Infinity for a
  // filtered view. Default preserves the previous behavior exactly.
  serviceLimit: number = 4,
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

  // ── 2. Build neighborhood FeedItems (every neighbourhood, including empty) ─
  //
  // Gems can arrive in two forms:
  //   a) Nested inside each neighborhood object (n.gems) — primary source
  //   b) At the top level in allGems, keyed by slug — fallback source
  //
  // We merge both: use n.gems when present, otherwise fall back to
  // gemsByNeighborhood. The merged gemCount is updated to match the actual
  // gems array so the header ("N things to do") is always accurate.
  // A neighbourhood with no gems is kept. Services, localExpert and a
  // ready-made on the record stock it; with none of those it stays in order
  // and the bento draws one Wanted tile. It does not take a filler slot.
  const neighborhoodItems: FeedItem[] = neighborhoods
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
    ...(supplyActivities ?? [])
      .map((a) => {
        const titled = filterFeedActivity(a);
        return titled == null ? null : sanitizePartnerCardCopy(titled);
      })
      .filter((a): a is NonNullable<typeof a> => a != null)
      .slice(0, 3)
      .map((a) => ({
        kind: "supply-activity" as FeedItemKind,
        id: `activity-${a.id ?? Math.random()}`,
        data: a,
      })),
    ...(platformServices ?? []).slice(0, serviceLimit).map((s) => ({
      kind: "vendor-service" as FeedItemKind,
      id: `vsvc-${s.id}`,
      data: s,
    })),
  ];

  // ── 4. Interleave stocked neighborhoods with filler ─────────────────────
  // Unstocked neighbourhoods are not part of this count: they must not move
  // filler that already belongs to a section with gems, services, an expert
  // or a ready-made.
  const stockedItems = neighborhoodItems.filter((item) => !neighbourhoodIsUnstocked(item.data));
  if (stockedItems.length === 0) {
    return placeUnstockedNeighbourhoods(fillerPool, neighborhoodItems);
  }

  const result: FeedItem[] = [];
  const filler = [...fillerPool];

  // Minimum filler items to place between each pair of neighborhoods
  const MIN_FILLER_BETWEEN = 1;

  for (let i = 0; i < stockedItems.length; i++) {
    // Insert filler before this neighborhood (except before the very first if pool is small)
    if (i === 0 && filler.length > stockedItems.length * MIN_FILLER_BETWEEN) {
      // Distribute some filler before the first neighborhood
      const pre = Math.min(2, filler.length - stockedItems.length * MIN_FILLER_BETWEEN);
      result.push(...filler.splice(0, pre));
    }

    result.push(stockedItems[i]);

    // Always place at least MIN_FILLER_BETWEEN items after this neighborhood
    if (i < stockedItems.length - 1) {
      if (filler.length > 0) {
        result.push(...filler.splice(0, Math.max(MIN_FILLER_BETWEEN, Math.floor(filler.length / (stockedItems.length - i)))));
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

  return placeUnstockedNeighbourhoods(result, neighborhoodItems);
}

/**
 * FP-1 / B4b: is this platform service an accommodation listing? `product_shape` is the structured
 * answer (migration 153: 'property' is the storefront listing, 'property_room' each bookable room
 * type). A row without the field is NOT assumed to be one — absence stays absence (§13).
 */
function isAccommodationShape(service: any): boolean {
  const shape = service?.productShape ?? service?.product_shape ?? null;
  return shape === "property" || shape === "property_room";
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
        // FP-1 / B4b: an approved guesthouse (product_shape 'property') and its room types ARE
        // accommodation. They are ordinary provider_services rows, so they arrived here as
        // vendor-service items and the Stay chip dropped every one of them — a city with a live
        // 2-room machiya and 60 published nights reported "No stay found". Routed by the row's own
        // structured shape, never by parsing its name.
        if (item.kind === "vendor-service") return isAccommodationShape(item.data);
        return false;
      case "do":
        if (item.kind === "loose-gem") return gemCategory(item.data.placeType) === "do";
        if (item.kind === "supply-activity") return true;
        // FP-1 / B4b: a place to sleep is not a thing to do — accommodation belongs under Stay.
        if (item.kind === "vendor-service") return !isAccommodationShape(item.data);
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
