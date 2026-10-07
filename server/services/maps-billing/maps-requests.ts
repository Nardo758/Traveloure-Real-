/**
 * The Routes request shapes the Maps billing tier depends on (R299). Pure, so the tier test pins
 * them without a database. Compute Routes bills by request FEATURES (routing preference, modifiers,
 * waypoint count), never by response fields; these bodies carry no Pro feature.
 */
export const DRIVE_FIELD_MASK = ["routes.duration", "routes.distanceMeters", "routes.polyline.encodedPolyline"].join(",");
export const MODE_FIELD_MASK = "routes.duration,routes.distanceMeters";
/**
 * Slice A1 (leg review live hop path): the same Essentials request, asking for the route's shape.
 * A response field, so the SKU is unchanged; the shape is drawn live and never stored.
 */
export const MODE_PATH_FIELD_MASK = "routes.polyline.encodedPolyline";

type LatLng = { lat: number; lng: number };
const point = (p: LatLng) => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } });

/** DRIVE, TRAFFIC_UNAWARE, no departure — Compute Routes Essentials. */
export function drivingRouteBody(request: { origin: LatLng; destination: LatLng }) {
  return {
    origin: point(request.origin),
    destination: point(request.destination),
    travelMode: "DRIVE",
    routingPreference: "TRAFFIC_UNAWARE",
    computeAlternativeRoutes: false,
    languageCode: "en-US",
    units: "METRIC",
  };
}

/** WALK / BICYCLE / TRANSIT with no routing preference — Compute Routes Essentials. */
export function modeRouteBody(origin: LatLng, destination: LatLng, travelMode: "WALK" | "BICYCLE" | "TRANSIT") {
  return {
    origin: point(origin),
    destination: point(destination),
    travelMode,
    computeAlternativeRoutes: false,
    languageCode: "en-US",
    units: "METRIC",
  };
}

/**
 * Step 9a routing engine (ledger `2026-10-07-step9a-routing-engine`). The engine asks for the five
 * facts the route cache may hold and nothing else: duration, distance, the transit line name and the
 * fare. No polyline and no step instructions are requested, so none can be stored. Masks are response
 * fields; the SKU is set by the request body, which is the same Essentials body as above (R299).
 */
export const ROUTED_BASIC_FIELD_MASK = "routes.duration,routes.distanceMeters";
export const ROUTED_TRANSIT_FIELD_MASK = [
  "routes.duration",
  "routes.distanceMeters",
  "routes.legs.steps.transitDetails.transitLine.name",
  "routes.legs.steps.transitDetails.transitLine.nameShort",
  "routes.travelAdvisory.transitFare",
].join(",");

/** TRANSIT with a departure when one is known and not in the past — Compute Routes Essentials. */
export function transitRouteBody(origin: LatLng, destination: LatLng, departAt: Date | null, now: Date = new Date()) {
  return {
    origin: point(origin),
    destination: point(destination),
    travelMode: "TRANSIT",
    computeAlternativeRoutes: false,
    ...(departAt && departAt.getTime() > now.getTime() ? { departureTime: departAt.toISOString() } : {}),
    languageCode: "en-US",
    units: "METRIC",
  };
}
