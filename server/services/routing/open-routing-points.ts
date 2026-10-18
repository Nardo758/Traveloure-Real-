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
 * LG-1 (ledger `2026-10-17-lg1-osm-place-coords`): the point the engine routes a stop from. An open coordinate for its
 * Google place id (an admin row, else an OSM match) wins; a ride's own pin is its OSM node (TC-3, migration 369);
 * anything else is the stop's Google point (its row coordinate or a Places fact), tagged `google`. Pure.
 */
export function routingPointFor(input: {
  /** The id the leg KEY uses (the stop's unexpired place_id fact, step 9a) — unchanged by LG-1. */
  placeId: string | null;
  /** The id the open tables are keyed by: the item's own `google_place_id`, else the fact's. Defaults to `placeId`. */
  lookupPlaceId?: string | null;
  open: ReadonlyMap<string, OpenPlaceCoord>;
  ownPoint: { lat: number; lng: number } | null;
  factPoint: { lat: number; lng: number } | null;
  osmRide: boolean;
}): RoutePoint | null {
  const placeId = input.placeId?.trim() || null;
  const lookup = (input.lookupPlaceId ?? input.placeId)?.trim() || null;
  const open = lookup ? input.open.get(lookup) : undefined;
  if (open) return { lat: open.lat, lng: open.lng, placeId, coordOrigin: open.origin };
  if (input.osmRide && input.ownPoint) return { ...input.ownPoint, placeId, coordOrigin: "osm_node" };
  const p = input.ownPoint ?? input.factPoint;
  return p ? { ...p, placeId, coordOrigin: "google" } : null;
}

/** LG-1: a point the adapter refuses is no point at all for routing — the stop is unlocated for the engine. */
export function acceptedPoint<P extends RoutePoint>(p: P | null, acceptsPoint: ((p: RoutePoint) => boolean) | undefined): P | null {
  if (!p) return null;
  return !acceptsPoint || acceptsPoint(p) ? p : null;
}

