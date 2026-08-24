/**
 * Pure geodesic helpers. ZERO imports on purpose — this file is safe to pull into a client
 * bundle, a server service, or a unit test without dragging in the DB or React (the same
 * pure-module discipline as `shared/slip-grounding-match.ts`).
 *
 * There was already a private `haversineDistance` inside
 * `server/services/transport-leg-calculator.ts`; this is the shared home it should converge on
 * (L6 — one implementation, many callers). Identical math (spherical earth, R = 6,371,000 m).
 */

const EARTH_RADIUS_METERS = 6_371_000;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Great-circle distance between two WGS-84 points, in metres. */
export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Walking-time ESTIMATE from a straight-line distance. Deliberately conservative and clearly an
 * estimate: it is a stated assumption (~4.8 km/h ⇒ 80 m/min), NOT a routed door-to-door time.
 * §13 — anything that displays this must present it as an estimate, never a measured figure.
 */
export const WALK_METERS_PER_MIN = 80;

export function estWalkMinutes(meters: number): number {
  return meters / WALK_METERS_PER_MIN;
}
