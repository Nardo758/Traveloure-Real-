/**
 * Slice A1 (ledger `2026-10-05-leg-live-hop-path`): the leg review's live route path. Pure apart from
 * the injected Routes call, so the rule is pinned without a network or a database.
 *
 * Reads the leg's OWN coordinates and its effective mode (author's pick, else recommendation); asks
 * Routes once for that mode's shape; returns it to draw. Nothing is persisted (Google's caching terms
 * for route geometry — the shape lives only in the response). Every "no" carries its reason (§13).
 */
import {
  effectiveLegMode,
  legPathTravelMode,
  decodePolyline,
  type LegPathTravelMode,
  type LegRoutePathResponse,
} from "@shared/leg-route-path";

type LatLng = { lat: number; lng: number };
export type RoutePathFetcher = (origin: LatLng, destination: LatLng, mode: LegPathTravelMode) => Promise<string | null>;

interface LegForPath {
  id: string;
  fromLat: number | null;
  fromLng: number | null;
  toLat: number | null;
  toLng: number | null;
  userSelectedMode?: string | null;
  recommendedMode?: string | null;
}

function point(lat: number | null, lng: number | null): LatLng | null {
  if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat === 0 && lng === 0) return null;
  return { lat, lng };
}

export async function resolveLegRoutePath(leg: LegForPath, fetchPath: RoutePathFetcher): Promise<LegRoutePathResponse> {
  const from = point(leg.fromLat, leg.fromLng);
  const to = point(leg.toLat, leg.toLng);
  if (!from || !to) return { available: false, legId: leg.id, reason: "missing_coordinates" };
  const travelMode = legPathTravelMode(effectiveLegMode(leg));
  if (!travelMode) return { available: false, legId: leg.id, reason: "no_road_mode" };
  const encoded = await fetchPath(from, to, travelMode);
  if (!encoded || !decodePolyline(encoded)) return { available: false, legId: leg.id, reason: "routes_unavailable" };
  return { available: true, legId: leg.id, travelMode, encodedPolyline: encoded, provider: "google_routes" };
}
