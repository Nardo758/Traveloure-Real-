import {
  buildGoogleMapsDeepLink,
  buildAppleMapsDeepLink,
  exceedsAppleRouteLimit,
  type Place,
  type TransportMode,
} from "@/lib/maps";

export { detectClientPlatform as detectMapsPlatform } from "@/lib/maps";

export function openInMaps(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

/**
 * Build both Google and Apple Maps URLs for a sequence of places and open the
 * appropriate one based on the detected platform.
 *
 * Coordinates that are missing or exactly {0,0} fall back to a name search,
 * so users are never sent to null island.
 */
export function openDayInMaps(googleUrl: string, appleUrl: string, appleWebUrl: string) {
  const ua = navigator.userAgent;
  const isApple = /iPad|iPhone|iPod|Macintosh/.test(ua) && !ua.includes("Android");
  if (isApple) {
    openInMaps(appleUrl || appleWebUrl || googleUrl);
  } else {
    openInMaps(googleUrl);
  }
}

/**
 * Build platform-appropriate Maps deep-link URLs from a list of places.
 * Use this instead of constructing raw URL strings inline.
 */
export function buildDayMapsUrls(places: Place[], mode?: TransportMode): {
  googleUrl: string;
  appleUrl: string;
  appleWebUrl: string;
} {
  const googleUrl = buildGoogleMapsDeepLink(places, mode);
  // Google escape hatch (see exceedsAppleRouteLimit): a multi-stop day's Apple
  // links fall through to the Google route rather than dropping middle stops.
  if (exceedsAppleRouteLimit(places.length)) {
    return { googleUrl, appleUrl: googleUrl, appleWebUrl: googleUrl };
  }
  const appleWebUrl = buildAppleMapsDeepLink(places, mode);
  return {
    googleUrl,
    appleUrl: appleWebUrl.replace("https://maps.apple.com", "maps://"),
    appleWebUrl,
  };
}

export const TRANSPORT_MODE_ICONS: Record<string, string> = {
  walk: "🚶",
  transit: "🚌",
  train: "🚃",
  tram: "🚋",
  bus: "🚌",
  taxi: "🚕",
  rideshare: "🚗",
  private_driver: "🚙",
  rental_car: "🚗",
  bike: "🚲",
  ferry: "⛴️",
  auto_rickshaw: "🛺",
  tuk_tuk: "🛵",
  cable_car: "🚡",
};

export const TRANSPORT_MODE_LABELS: Record<string, string> = {
  walk: "Walk",
  transit: "Transit",
  train: "Train",
  tram: "Tram",
  bus: "Bus",
  taxi: "Taxi",
  rideshare: "Rideshare",
  private_driver: "Private Driver",
  rental_car: "Rental Car",
  bike: "Bike",
  ferry: "Ferry",
  auto_rickshaw: "Auto-rickshaw",
  tuk_tuk: "Tuk-tuk",
  cable_car: "Cable Car",
};
