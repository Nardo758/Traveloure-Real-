import {
  buildGoogleMapsDeepLink,
  buildAppleMapsDeepLink,
  hasValidCoords,
  type Place,
  type TransportMode,
} from "@/lib/maps";

export type TraveloureMode =
  | "walk"
  | "taxi"
  | "rideshare"
  | "private_car"
  | "private_driver"
  | "rental_car"
  | "bus"
  | "metro"
  | "subway"
  | "transit"
  | "train"
  | "tram"
  | "bicycle"
  | "bike"
  | "ferry"
  | "boat"
  | "rickshaw"
  | "auto_rickshaw"
  | "tuk_tuk"
  | "cable_car"
  | (string & {});

export interface NavigateDestination {
  lat?: number;
  lng?: number;
  name: string;
  placeId?: string;
}

export interface NavigateOrigin {
  lat?: number;
  lng?: number;
  name: string;
}

export interface NavigateParams {
  destination?: NavigateDestination;
  origin?: NavigateOrigin;
  mode?: TraveloureMode;
  waypoints?: Array<{ lat?: number; lng?: number; name: string }>;
  app?: "google" | "apple" | "waze";
  /** Explicit deep-link stored on a transport leg. When present, takes precedence
   *  over the computed fallback URL (after applying the Apple→Google escape-hatch). */
  mapsUrl?: string | null;
}

type Platform = "ios" | "android" | "desktop";
type MapsApp = "apple" | "google" | "waze";
type NormalizedMode = "walking" | "driving" | "transit" | "bicycling";

const PLATFORM: Platform = detectPlatform();

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "desktop";
}

function getMapsPref(): MapsApp {
  return getMapsPreference();
}

export function getMapsPreference(): MapsApp {
  const pref = localStorage.getItem("traveloure_maps_pref") || "auto";
  if (pref === "auto") return PLATFORM === "ios" ? "apple" : "google";
  if (pref === "apple" || pref === "google" || pref === "waze") return pref;
  return PLATFORM === "ios" ? "apple" : "google";
}

export function normalizeMode(mode?: TraveloureMode): NormalizedMode {
  switch (mode) {
    case "walk":
      return "walking";
    case "taxi":
    case "rideshare":
    case "private_car":
    case "private_driver":
    case "rental_car":
    case "rickshaw":
    case "auto_rickshaw":
    case "tuk_tuk":
    case "cable_car":
      return "driving";
    case "bus":
    case "metro":
    case "subway":
    case "transit":
    case "train":
    case "tram":
    case "ferry":
    case "boat":
      return "transit";
    case "bicycle":
    case "bike":
      return "bicycling";
    default:
      return "driving";
  }
}

/** Convert NavigateParams into an ordered Place[] for the unified builder. */
function paramsToPlaces(params: NavigateParams): Place[] {
  if (params.waypoints && params.waypoints.length > 0) {
    return params.waypoints.map(w => ({ lat: w.lat, lng: w.lng, name: w.name }));
  }
  const places: Place[] = [];
  if (params.origin) places.push({ lat: params.origin.lat, lng: params.origin.lng, name: params.origin.name });
  if (params.destination) places.push({ lat: params.destination.lat, lng: params.destination.lng, name: params.destination.name, placeId: params.destination.placeId });
  return places;
}

function buildGoogleUrl(params: NavigateParams): string {
  return buildGoogleMapsDeepLink(paramsToPlaces(params), params.mode as TransportMode);
}

function buildAppleUrl(params: NavigateParams): string {
  return buildAppleMapsDeepLink(paramsToPlaces(params), params.mode as TransportMode);
}

function buildWazeUrl(params: NavigateParams): string {
  const dest =
    params.destination ??
    (params.waypoints && params.waypoints.length > 0
      ? params.waypoints[params.waypoints.length - 1]
      : undefined);
  if (!dest || !hasValidCoords(dest.lat, dest.lng)) return "";
  return `https://waze.com/ul?ll=${dest.lat},${dest.lng}&navigate=yes`;
}

export function openInMaps(params: NavigateParams): void {
  let app: MapsApp = params.app ?? getMapsPref();
  const normalized = normalizeMode(params.mode);

  if (app === "waze" && normalized !== "driving") {
    app = PLATFORM === "ios" ? "apple" : "google";
  }

  // Single-source escape-hatch: Apple Maps doesn't support more than 2 waypoints.
  // All callers rely on this instead of implementing their own fallback logic.
  if (app === "apple" && params.waypoints && params.waypoints.length > 2) {
    app = "google";
  }

  // Stored mapsUrl on a transport leg takes precedence over the computed fallback.
  // We still apply the escape-hatch above so a stored Apple URL can be redirected
  // to Google when the platform can't handle it.
  if (params.mapsUrl) {
    const targetUrl = app === "google" && params.mapsUrl.startsWith("maps://")
      ? buildGoogleUrl(params)
      : params.mapsUrl;
    if (targetUrl) window.open(targetUrl, "_blank", "noopener,noreferrer");
    return;
  }

  let url: string;
  switch (app) {
    case "apple":
      url = buildAppleUrl(params);
      break;
    case "waze":
      url = buildWazeUrl(params);
      break;
    default:
      url = buildGoogleUrl(params);
      break;
  }

  if (url) window.open(url, "_blank", "noopener,noreferrer");
}

export function openRawUrl(url: string): void {
  if (url) window.open(url, "_blank", "noopener,noreferrer");
}

export { PLATFORM as detectedPlatform };
