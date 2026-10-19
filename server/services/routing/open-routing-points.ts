/**
 * LG-1 (ledger `2026-10-17-lg1-osm-place-coords`): the pure half of open routing coordinates — which point the engine
 * routes a stop from, and whether the adapter may be given it. No database, no request (the DB readers and writers are
 * `open-place-coords.service.ts`).
 */
import type { RoutePoint } from "@shared/routing-engine";

export interface OpenPlaceCoord {
  lat: number;
  lng: number;
  origin: "osm" | "admin";
  /** An item link's own source (`itinerary_item_open_coords.source`): 'admin' when a person attached it (LG-2 Ask 7). */
  linkSource?: string | null;
  /** LG-2 Ask 7: what a hand-picked point is ('entrance', 'centroid', 'station', 'path_start'); null for a batch match. */
  pointBasis?: string | null;
}

/**
 * Pure. Which open place an item routes from — the ONE order (§18 rule 1), read by `routingPointFor` and by the
 * Optimize versions: an admin row for the item's place id, then the open place the item is linked to, then a place-id
 * match (none for an item whose link is pulled for review, LG-2 Ask 1). LG-2 Ask 5: a meeting-or-stay item (a private
 * tour, an arrival, a check-in) takes ONLY a point a person chose — the admin row, or a link a person attached — never
 * an OSM match on its name, which would be a city or district centre.
 */
export function openPlaceForItem(input: {
  byPlace: OpenPlaceCoord | null | undefined;
  itemOpen: OpenPlaceCoord | null | undefined;
  itemPulled?: boolean;
  meetingOrStay?: string | null;
}): OpenPlaceCoord | null {
  const byPlace = input.byPlace ?? null;
  if (byPlace?.origin === "admin") return byPlace;
  if (input.meetingOrStay) return input.itemOpen?.linkSource === "admin" ? input.itemOpen : null;
  return input.itemOpen ?? (input.itemPulled ? null : byPlace);
}

/** Pure: a usable coordinate pair, or null. */
export function validCoord(lat: unknown, lng: unknown): { lat: number; lng: number } | null {
  const a = Number(lat);
  const b = Number(lng);
  if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a) > 90 || Math.abs(b) > 180) return null;
  if (a === 0 && b === 0) return null;
  return { lat: a, lng: b };
}

/** Pure: merge the two tables' rows — an admin row wins over an OSM match for the same place. */
export function mergeOpenCoords(
  osmRows: ReadonlyArray<{ placeId: string; lat: unknown; lng: unknown }>,
  adminRows: ReadonlyArray<{ placeId: string; lat: unknown; lng: unknown }>,
): Map<string, OpenPlaceCoord> {
  const out = new Map<string, OpenPlaceCoord>();
  for (const r of osmRows) {
    const p = validCoord(r.lat, r.lng);
    if (p) out.set(r.placeId, { ...p, origin: "osm" });
  }
  for (const r of adminRows) {
    const p = validCoord(r.lat, r.lng);
    if (p) out.set(r.placeId, { ...p, origin: "admin" });
  }
  return out;
}

/**
 * LG-1 (ledger `2026-10-17-lg1-osm-place-coords`; re-keyed by 390): the point the engine routes a stop from. An admin row
 * for its Google place id wins, then the open place the item is linked to, then an open place carrying its place id; a ride's own pin is its OSM node (TC-3, migration 369);
 * anything else is the stop's Google point (its row coordinate or a Places fact), tagged `google`. Pure.
 */
export function routingPointFor(input: {
  /** The id the leg KEY uses (the stop's unexpired place_id fact, step 9a) — unchanged by LG-1. */
  placeId: string | null;
  /** The id the open tables are keyed by: the item's own `google_place_id`, else the fact's. Defaults to `placeId`. */
  lookupPlaceId?: string | null;
  open: ReadonlyMap<string, OpenPlaceCoord>;
  /**
   * LG-1 re-key (migration 390): the open place this ITEM is linked to (`itinerary_item_open_coords`), which an item with
   * no Google place id reaches only this way. An admin row for its place id still wins; a place-id match comes after.
   */
  itemOpen?: OpenPlaceCoord | null;
  /**
   * LG-2 Ask 1 (migration 391): the item's link was pulled for review and not restored. It then does not fall back to an
   * OSM place through its Google place id (the same place would come straight back); an admin point still wins.
   */
  itemPulled?: boolean;
  ownPoint: { lat: number; lng: number } | null;
  factPoint: { lat: number; lng: number } | null;
  osmRide: boolean;
  /**
   * LG-2 Ask 5: the item is a private tour, an arrival or a check-in (`meetingOrStayItem`). It routes from an admin point
   * (or a link a person attached), else the traveler's chosen stay (`stayPoint`), else nowhere — never its own Google
   * point or an OSM match on its name.
   */
  meetingOrStay?: string | null;
  stayPoint?: RoutePoint | null;
}): RoutePoint | null {
  const placeId = input.placeId?.trim() || null;
  const lookup = (input.lookupPlaceId ?? input.placeId)?.trim() || null;
  const byPlace = lookup ? input.open.get(lookup) : undefined;
  const open = openPlaceForItem({ byPlace, itemOpen: input.itemOpen, itemPulled: input.itemPulled, meetingOrStay: input.meetingOrStay });
  if (open) return { lat: open.lat, lng: open.lng, placeId, coordOrigin: open.origin };
  if (input.meetingOrStay) return input.stayPoint ? { ...input.stayPoint, placeId } : null;
  if (input.osmRide && input.ownPoint) return { ...input.ownPoint, placeId, coordOrigin: "osm_node" };
  const p = input.ownPoint ?? input.factPoint;
  return p ? { ...p, placeId, coordOrigin: "google" } : null;
}

/** LG-1: a point the adapter refuses is no point at all for routing — the stop is unlocated for the engine. */
export function acceptedPoint<P extends RoutePoint>(p: P | null, acceptsPoint: ((p: RoutePoint) => boolean) | undefined): P | null {
  if (!p) return null;
  return !acceptsPoint || acceptsPoint(p) ? p : null;
}

