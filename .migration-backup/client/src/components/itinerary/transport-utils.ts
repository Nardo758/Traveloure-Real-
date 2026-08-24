import {
  buildGoogleMapsDeepLink,
  buildAppleMapsDeepLink,
  hasValidCoords,
} from "@/lib/maps";

/**
 * Build a Google Maps navigation URL between two points.
 * If either coordinate pair is {0,0} or missing, a name-search fallback is
 * used so the user lands on the right place instead of null island.
 */
export function buildGoogleNavUrl(
  fromLat: number, fromLng: number, fromName: string,
  toLat: number, toLng: number, toName: string,
  mode: string
): string {
  return buildGoogleMapsDeepLink(
    [
      { lat: fromLat, lng: fromLng, name: fromName },
      { lat: toLat, lng: toLng, name: toName },
    ],
    mode,
  );
}

/**
 * Build an Apple Maps navigation URL between two points.
 * Falls back to name-based search when coordinates are {0,0} or absent.
 */
export function buildAppleNavUrl(
  fromLat: number, fromLng: number, fromName: string,
  toLat: number, toLng: number, toName: string,
  mode: string
): string {
  const url = buildAppleMapsDeepLink(
    [
      { lat: fromLat, lng: fromLng, name: fromName },
      { lat: toLat, lng: toLng, name: toName },
    ],
    mode,
  );
  // Return a maps:// deep-link for native iOS/macOS, web URL otherwise
  return url.replace("https://maps.apple.com", "maps://");
}

export { hasValidCoords };
