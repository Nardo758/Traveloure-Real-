/**
 * THE LEG ROUTE PATH, PURE HALF (Slice A1 — the leg review's live hop path; ledger
 * `2026-10-05-leg-live-hop-path`).
 *
 * The leg review drew a dashed stop-order line because no route shape was stored (Lane 1 left
 * polylines out until Google's caching terms were settled). The path is now fetched LIVE from the
 * Routes API for the leg's own mode each time the drawer shows that leg, and is never written to a
 * row: no column, no cache table, no backfill. These are the two pure rules both halves share:
 *
 *   · `legPathTravelMode` — which Google travel mode draws a leg's path, from the leg's stored mode.
 *     It goes through `normalizeLegMode` (the ONE mode reading, §18 rule 1); a chauffeured pick
 *     (taxi, private driver, …) is a car on the road, so it draws as DRIVE. A mode with no road
 *     answer (a ferry, a flight, an unknown string) draws NO path — null, never a guessed mode (§13).
 *   · `decodePolyline` — Google's encoded polyline format (precision 5) to points. A malformed
 *     string yields null, never a partial path presented as the route.
 */
import { normalizeLegMode, type LegMode } from "./travel-speeds";
import { isChauffeuredMode } from "./trip-plan";

/** The four Google `travelMode`s a leg path can be drawn in. */
export type LegPathTravelMode = "WALK" | "BICYCLE" | "TRANSIT" | "DRIVE";

const TRAVEL_MODE_BY_LEG_MODE: Readonly<Record<LegMode, LegPathTravelMode>> = Object.freeze({
  walk: "WALK",
  cycle: "BICYCLE",
  transit: "TRANSIT",
  drive: "DRIVE",
});

/** The leg's effective mode: the author's pick, else the engine's recommendation. */
export function effectiveLegMode(leg: { userSelectedMode?: string | null; recommendedMode?: string | null }): string | null {
  const m = (leg.userSelectedMode || leg.recommendedMode || "").trim();
  return m || null;
}

/** The Google travel mode that draws this leg's path, or null when no road route answers it. */
export function legPathTravelMode(rawMode: string | null | undefined): LegPathTravelMode | null {
  const four = normalizeLegMode(rawMode);
  if (four) return TRAVEL_MODE_BY_LEG_MODE[four];
  if (isChauffeuredMode(rawMode)) return "DRIVE";
  return null;
}

export interface PathPoint { lat: number; lng: number }

/**
 * Decode a Google encoded polyline (precision 5). Null for an empty or malformed string — a path
 * that cannot be read is not drawn at all.
 */
export function decodePolyline(encoded: string | null | undefined): PathPoint[] | null {
  if (typeof encoded !== "string" || encoded.length === 0) return null;
  const points: PathPoint[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  const next = (): number | null => {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      if (index >= encoded.length) return null;
      byte = encoded.charCodeAt(index++) - 63;
      if (byte < 0 || byte > 63) return null;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (index < encoded.length) {
    const dLat = next();
    const dLng = next();
    if (dLat === null || dLng === null) return null;
    lat += dLat;
    lng += dLng;
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points.length >= 2 ? points : null;
}

/** What `GET /api/trips/:tripId/transport-legs/:legId/path` answers. */
export type LegRoutePathResponse =
  | { available: true; legId: string; travelMode: LegPathTravelMode; encodedPolyline: string; provider: "google_routes" }
  | { available: false; legId: string; reason: "missing_coordinates" | "no_road_mode" | "routes_unavailable" };
