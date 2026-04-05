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

function locStr(lat?: number, lng?: number, name?: string): string {
  if (lat != null && lng != null && isFinite(lat) && isFinite(lng) && !(lat === 0 && lng === 0)) {
    return `${lat},${lng}`;
  }
  return name ?? "";
}

function buildGoogleUrl(params: NavigateParams): string {
  const base = "https://www.google.com/maps/dir/?api=1";
  const sp = new URLSearchParams();
  sp.set("travelmode", normalizeMode(params.mode));

  if (params.waypoints && params.waypoints.length === 1) {
    sp.set("destination", locStr(params.waypoints[0].lat, params.waypoints[0].lng, params.waypoints[0].name));
  } else if (params.waypoints && params.waypoints.length > 1) {
    const stops = params.waypoints.slice(0, 10);
    sp.set("origin", locStr(stops[0].lat, stops[0].lng, stops[0].name));
    sp.set("destination", locStr(stops[stops.length - 1].lat, stops[stops.length - 1].lng, stops[stops.length - 1].name));
    if (stops.length > 2) {
      sp.set("waypoints", stops.slice(1, -1).map(s => locStr(s.lat, s.lng, s.name)).join("|"));
    }
  } else if (params.origin && params.destination) {
    sp.set("origin", locStr(params.origin.lat, params.origin.lng, params.origin.name));
    sp.set("destination", locStr(params.destination.lat, params.destination.lng, params.destination.name));
    if (params.destination.placeId) sp.set("destination_place_id", params.destination.placeId);
  } else if (params.destination) {
    sp.set("destination", locStr(params.destination.lat, params.destination.lng, params.destination.name));
    if (params.destination.placeId) sp.set("destination_place_id", params.destination.placeId);
  }

  return `${base}&${sp.toString()}`;
}

function buildAppleUrl(params: NavigateParams): string {
  const sp = new URLSearchParams();
  const dirflgMap: Record<NormalizedMode, string> = {
    walking: "w",
    driving: "d",
    transit: "r",
    bicycling: "w",
  };
  sp.set("dirflg", dirflgMap[normalizeMode(params.mode)] ?? "d");
  sp.set("t", "m");

  if (params.origin && params.destination) {
    sp.set("saddr", locStr(params.origin.lat, params.origin.lng, params.origin.name));
    sp.set("daddr", locStr(params.destination.lat, params.destination.lng, params.destination.name));
  } else if (params.destination) {
    sp.set("daddr", locStr(params.destination.lat, params.destination.lng, params.destination.name));
  } else if (params.waypoints && params.waypoints.length > 0) {
    const last = params.waypoints[params.waypoints.length - 1];
    sp.set("daddr", locStr(last.lat, last.lng, last.name));
  }

  return `https://maps.apple.com/?${sp.toString()}`;
}

function buildWazeUrl(params: NavigateParams): string {
  const dest =
    params.destination ??
    (params.waypoints && params.waypoints.length > 0
      ? params.waypoints[params.waypoints.length - 1]
      : undefined);
  if (!dest || dest.lat == null || dest.lng == null || !isFinite(dest.lat) || !isFinite(dest.lng)) return "";
  return `https://waze.com/ul?ll=${dest.lat},${dest.lng}&navigate=yes`;
}

export function openInMaps(params: NavigateParams): void {
  let app: MapsApp = params.app ?? getMapsPref();
  const normalized = normalizeMode(params.mode);

  if (app === "waze" && normalized !== "driving") {
    app = PLATFORM === "ios" ? "apple" : "google";
  }

  if (app === "apple" && params.waypoints && params.waypoints.length > 2) {
    app = "google";
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

export { PLATFORM as detectedPlatform };
