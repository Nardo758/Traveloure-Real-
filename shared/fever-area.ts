/**
 * Fever area match (ledger `2026-10-21-blog-checks-fever-area`). PURE.
 *
 * A Fever point is placed in a Kyoto neighbourhood by that neighbourhood's own centre and radius
 * (`placeServiceInNeighborhood` — the one radius rule). Outside every radius is unplaced: no area
 * name, never a nearest-neighbourhood guess and never the street address.
 */
import { placeServiceInNeighborhood, type NeighborhoodRow } from "./neighborhood-placement";

/** Shown wherever a Fever card used an OpenStreetMap point or a neighbourhood centre. */
export const FEVER_OSM_CREDIT = "© OpenStreetMap contributors";

export function feverAddressKey(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, " ");
}

/** The Nominatim query: the address, plus city and country when the address does not already say them. */
export function nominatimSearchQuery(address: string, city: string | null | undefined, country: string | null | undefined): string {
  const head = address.trim();
  const blob = head.toLowerCase();
  const parts = [head];
  const cityName = (city ?? "").trim();
  const countryName = (country ?? "").trim();
  if (cityName && !blob.includes(cityName.toLowerCase())) parts.push(cityName);
  if (countryName && !blob.includes(countryName.toLowerCase())) parts.push(countryName);
  return parts.filter(Boolean).join(", ");
}

/** The first Nominatim hit's point, or null when the body is not a hit. */
export function parseNominatimPoint(body: unknown): { lat: number; lng: number } | null {
  const hit = Array.isArray(body) ? body[0] : null;
  if (!hit || typeof hit !== "object") return null;
  const lat = Number((hit as { lat?: unknown }).lat);
  const lng = Number((hit as { lon?: unknown }).lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

/** The Kyoto neighbourhood name whose centre+radius contains the point, or null. */
export function kyotoAreaName(
  lat: number,
  lng: number,
  neighborhoods: readonly NeighborhoodRow[],
): string | null {
  const kyoto = neighborhoods.filter((n) => n.city.trim().toLowerCase() === "kyoto");
  const id = placeServiceInNeighborhood({ neighborhood: null, latitude: lat, longitude: lng }, kyoto);
  if (!id) return null;
  return kyoto.find((n) => n.id === id)?.name ?? null;
}
