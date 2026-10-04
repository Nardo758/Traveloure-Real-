/**
 * The Routes request shapes the Maps billing tier depends on (R299). Pure, so the tier test pins
 * them without a database. Compute Routes bills by request FEATURES (routing preference, modifiers,
 * waypoint count), never by response fields; these bodies carry no Pro feature.
 */
export const DRIVE_FIELD_MASK = ["routes.duration", "routes.distanceMeters", "routes.polyline.encodedPolyline"].join(",");
export const MODE_FIELD_MASK = "routes.duration,routes.distanceMeters";

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
