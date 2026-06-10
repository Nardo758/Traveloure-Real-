/**
 * Unified Maps deep-link builder.
 * All Maps URL construction must go through buildMapsDeepLink() so the
 * {0,0} null-island fallback bug can never creep back in.
 */

// ── Apple route-stop limit ───────────────────────────────────────────────────

/**
 * Apple Maps deep links support only saddr→daddr (a single origin and
 * destination, no intermediate waypoints). A route with more stops than this
 * must escape to Google, which carries the full waypoint chain. Single source
 * for the escape-hatch rule — every caller asks this, none hard-codes ">2".
 */
export const APPLE_MAX_ROUTE_STOPS = 2;

export function exceedsAppleRouteLimit(stopCount: number): boolean {
  return stopCount > APPLE_MAX_ROUTE_STOPS;
}

// ── Coordinate guard ────────────────────────────────────────────────────────

/** Returns true only when lat/lng are real, finite, non-zero coordinates. */
export function hasValidCoords(lat?: number | null, lng?: number | null): boolean {
  return (
    lat != null &&
    lng != null &&
    isFinite(lat) &&
    isFinite(lng) &&
    !(lat === 0 && lng === 0)
  );
}

/**
 * Returns a safe location token for Maps URLs.
 * Uses "lat,lng" when coordinates are valid; falls back to the place name
 * so the URL triggers a name-based search instead of sending to null island.
 */
function safeLocToken(lat?: number | null, lng?: number | null, name?: string): string {
  if (hasValidCoords(lat, lng)) return `${lat},${lng}`;
  return name ?? "";
}

// ── Travel-mode tables ───────────────────────────────────────────────────────

export const GOOGLE_TRAVEL_MODES: Record<string, string> = {
  walk: "walking",
  bicycle: "bicycling",
  bike: "bicycling",
  transit: "transit",
  train: "transit",
  tram: "transit",
  bus: "transit",
  metro: "transit",
  subway: "transit",
  ferry: "transit",
  boat: "transit",
  taxi: "driving",
  rideshare: "driving",
  private_car: "driving",
  private_driver: "driving",
  rental_car: "driving",
  rickshaw: "driving",
  auto_rickshaw: "driving",
  tuk_tuk: "driving",
  cable_car: "driving",
};

export const APPLE_TRAVEL_FLAGS: Record<string, string> = {
  walk: "w",
  bicycle: "w",
  bike: "c",
  transit: "r",
  train: "r",
  tram: "r",
  bus: "r",
  metro: "r",
  subway: "r",
  ferry: "r",
  boat: "r",
  taxi: "d",
  rideshare: "d",
  private_car: "d",
  private_driver: "d",
  rental_car: "d",
  rickshaw: "d",
  auto_rickshaw: "d",
  tuk_tuk: "d",
  cable_car: "w",
};

// ── Types ───────────────────────────────────────────────────────────────────

export type TransportMode =
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

export interface Place {
  lat?: number | null;
  lng?: number | null;
  name: string;
  placeId?: string;
  /**
   * Explicit, provider-canonical Maps URL for this stop (e.g. a Google place
   * link derived from googlePlaceId). When present on a single-destination
   * navigation it takes precedence over a synthesized lat/lng URL.
   */
  mapsUrl?: string;
}

export interface MapsDeepLinkOptions {
  places: Place[];
  mode?: TransportMode;
  /** Force a specific platform; defaults to auto-detect from navigator.userAgent */
  platform?: "google" | "apple";
}

// ── Platform detection ──────────────────────────────────────────────────────

export function detectClientPlatform(): "apple" | "google" {
  if (typeof navigator === "undefined") return "google";
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod|Macintosh/.test(ua) && !ua.includes("Android")
    ? "apple"
    : "google";
}

// ── Per-platform URL builders ───────────────────────────────────────────────

/**
 * Build a Google Maps deep-link for one or more places.
 * Any place with missing or {0,0} coordinates falls back to a name search.
 */
export function buildGoogleMapsDeepLink(places: Place[], mode?: TransportMode): string {
  if (places.length === 0) return "";
  // stop.mapsUrl precedence: a single destination that carries an explicit,
  // provider-canonical link opens that exact place instead of a coordinate URL.
  if (places.length === 1 && places[0].mapsUrl) return places[0].mapsUrl!;
  const travelMode = GOOGLE_TRAVEL_MODES[mode ?? ""] || "driving";
  const base = "https://www.google.com/maps/dir/?api=1";
  const sp = new URLSearchParams();
  sp.set("travelmode", travelMode);

  if (places.length === 1) {
    const p = places[0];
    sp.set("destination", safeLocToken(p.lat, p.lng, p.name));
    if (p.placeId) sp.set("destination_place_id", p.placeId);
    return `${base}&${sp.toString()}`;
  }

  const stops = places.slice(0, 11);
  const first = stops[0];
  const last = stops[stops.length - 1];

  sp.set("origin", safeLocToken(first.lat, first.lng, first.name));
  sp.set("destination", safeLocToken(last.lat, last.lng, last.name));

  if (stops.length > 2) {
    sp.set(
      "waypoints",
      stops.slice(1, -1).map(p => safeLocToken(p.lat, p.lng, p.name)).join("|"),
    );
  }

  if (last.placeId) sp.set("destination_place_id", last.placeId);
  return `${base}&${sp.toString()}`;
}

/**
 * Build an Apple Maps deep-link for one or more places.
 * Falls back to a name-search query when coordinates are missing or {0,0}.
 */
export function buildAppleMapsDeepLink(places: Place[], mode?: TransportMode): string {
  if (places.length === 0) return "";
  const flag = APPLE_TRAVEL_FLAGS[mode ?? ""] || "d";
  const sp = new URLSearchParams();
  sp.set("dirflg", flag);
  sp.set("t", "m");

  if (places.length === 1) {
    const p = places[0];
    if (hasValidCoords(p.lat, p.lng)) {
      sp.set("daddr", `${p.lat},${p.lng}`);
    } else {
      sp.set("q", p.name);
    }
    return `https://maps.apple.com/?${sp.toString()}`;
  }

  const first = places[0];
  const last = places[places.length - 1];
  sp.set("saddr", safeLocToken(first.lat, first.lng, first.name));
  sp.set("daddr", safeLocToken(last.lat, last.lng, last.name));

  return `https://maps.apple.com/?${sp.toString()}`;
}

// ── Main entry point ────────────────────────────────────────────────────────

/**
 * Build a platform-appropriate Maps deep-link URL.
 *
 * Coordinates that are missing, non-finite, or exactly {0,0} are treated as
 * absent and the place name is used for a search query instead, preventing
 * users from being sent to null island.
 */
export function buildMapsDeepLink({ places, mode, platform }: MapsDeepLinkOptions): string {
  const resolved = platform ?? detectClientPlatform();
  // Google escape hatch (see exceedsAppleRouteLimit): a multi-stop route on
  // Apple would silently drop the middle stops, so route it through Google.
  if (resolved === "apple" && exceedsAppleRouteLimit(places.length)) {
    return buildGoogleMapsDeepLink(places, mode);
  }
  return resolved === "apple"
    ? buildAppleMapsDeepLink(places, mode)
    : buildGoogleMapsDeepLink(places, mode);
}

/**
 * Convenience: open a Maps deep-link in a new tab.
 */
export function openMapsDeepLink(options: MapsDeepLinkOptions): void {
  const url = buildMapsDeepLink(options);
  if (url) window.open(url, "_blank", "noopener,noreferrer");
}
