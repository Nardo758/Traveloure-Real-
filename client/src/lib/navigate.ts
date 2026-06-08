import {
  buildMapsDeepLink,
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
  /** Provider-canonical Maps URL; takes precedence for single-destination nav. */
  mapsUrl?: string;
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
  waypoints?: Array<{ lat?: number; lng?: number; name: string; mapsUrl?: string }>;
  app?: "google" | "apple" | "waze";
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
    return params.waypoints.map(w => ({ lat: w.lat, lng: w.lng, name: w.name, mapsUrl: w.mapsUrl }));
  }
  const places: Place[] = [];
  if (params.origin) places.push({ lat: params.origin.lat, lng: params.origin.lng, name: params.origin.name });
  if (params.destination) places.push({ lat: params.destination.lat, lng: params.destination.lng, name: params.destination.name, placeId: params.destination.placeId, mapsUrl: params.destination.mapsUrl });
  return places;
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

  // Waze is built here; apple/google (including the Apple→Google escape hatch for
  // multi-stop routes) are delegated to the single builder so the rule lives in
  // exactly one place.
  const url =
    app === "waze"
      ? buildWazeUrl(params)
      : buildMapsDeepLink({ places: paramsToPlaces(params), mode: params.mode as TransportMode, platform: app });

  if (url) window.open(url, "_blank", "noopener,noreferrer");
}

export function openRawUrl(url: string): void {
  if (url) window.open(url, "_blank", "noopener,noreferrer");
}

export { PLATFORM as detectedPlatform };
