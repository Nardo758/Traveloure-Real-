/**
 * THE ONE RULE FOR PLACING A LISTING IN A NEIGHBOURHOOD (§18 rule 1). Pure — no DB — so the server
 * (market insights, lane B2) and the client (the property builder's pin pre-fill, PB-1; ledger
 * `2026-10-10-pb1-property-category-city`) run the same code.
 *
 * Priority: (a) the listing's own `neighborhood` slug matched to a neighbourhood; else (b) the nearest
 * neighbourhood centroid WITHIN that neighbourhood's own `radiusKm`, for a listing carrying a confirmed
 * pin. No slug match and no pin, or a pin outside every radius ⇒ null (§13 — never guessed onto a
 * neighbourhood it isn't in). This is deliberately NOT `nearestNeighborhoodSlug`
 * (where-to-stay.service.ts), which has no radius limit.
 */

/** A neighbourhood row: `city_neighborhoods`' centroid is real (notNull); radius defaults to 1.5 km. */
export interface NeighborhoodRow {
  id: string;
  city: string;
  name: string;
  slug: string;
  centroidLat: string | number | null;
  centroidLng: string | number | null;
  radiusKm: string | number | null;
}

/** What placement reads from a listing: its own slug and its confirmed pin, either possibly absent. */
export interface PlaceableListing {
  neighborhood: string | null;
  latitude: string | number | null;
  longitude: string | number | null;
}

/** Tolerant decimal parse (rows store lat/lng as strings). Range-checked; null on anything unreal. */
export function parseCoord(
  lat: string | number | null | undefined,
  lng: string | number | null | undefined,
): { lat: number; lng: number } | null {
  if (lat === null || lat === undefined || lat === "" || lng === null || lng === undefined || lng === "") return null;
  const nLat = Number(lat);
  const nLng = Number(lng);
  if (!Number.isFinite(nLat) || !Number.isFinite(nLng)) return null;
  if (Math.abs(nLat) > 90 || Math.abs(nLng) > 180) return null;
  return { lat: nLat, lng: nLng };
}

/** Great-circle (haversine) distance in km — STRAIGHT-LINE, the SAME formula the map uses. */
export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371; // km
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

const norm = (s: string | null | undefined): string => (s ?? "").trim().toLowerCase();

/**
 * Place ONE listing into a neighbourhood id, or return null if UNPLACED (§13 — excluded, never guessed).
 * (a) slug match — stable across renames, the soft-FK design on `provider_services.neighborhood`;
 * (b) nearest centroid within that neighbourhood's radius — only for a genuinely LOCATED listing.
 */
export function placeServiceInNeighborhood(service: PlaceableListing, neighborhoods: readonly NeighborhoodRow[]): string | null {
  const slug = norm(service.neighborhood);
  if (slug) {
    const bySlug = neighborhoods.find((n) => norm(n.slug) === slug);
    if (bySlug) return bySlug.id;
  }
  const pin = parseCoord(service.latitude, service.longitude);
  if (!pin) return null;
  let bestId: string | null = null;
  let bestDist = Infinity;
  for (const n of neighborhoods) {
    const c = parseCoord(n.centroidLat, n.centroidLng);
    if (!c) continue;
    const radius = Number(n.radiusKm ?? "1.5");
    const d = haversineKm(pin, c);
    if (d <= radius && d < bestDist) {
      bestDist = d;
      bestId = n.id;
    }
  }
  return bestId;
}
