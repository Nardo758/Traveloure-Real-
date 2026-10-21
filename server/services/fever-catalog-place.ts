/**
 * Place fields on an Impact catalog item (ledger `2026-10-21-event-card-partner-area`).
 *
 * A street is read only when the string looks like one: a digit, and a comma or a street word,
 * and it is short enough to be an address rather than a description. The city name alone is not
 * an address. A half coordinate is ignored. The street is for the area match; it is not a public field.
 */

const STREET_WORD = /\b(?:street|st|avenue|ave|road|rd|boulevard|blvd|lane|ln|drive|dr|way|place|pl|plaza)\b/i;

/** A short address-shaped string, or null. */
export function streetAddress(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim().replace(/\s+/g, " ");
  if (text.length < 8 || text.length > 120) return null;
  if (text.split(" ").length > 12) return null;
  if (!/\d/.test(text)) return null;
  if (!(text.includes(",") || STREET_WORD.test(text))) return null;
  return text;
}

function finiteCoord(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

export interface CatalogPlaceInput {
  Address?: unknown;
  VenueAddress?: unknown;
  Location?: unknown;
  Latitude?: unknown;
  Longitude?: unknown;
  Text1?: unknown;
  Text2?: unknown;
  Text3?: unknown;
  Venue?: unknown;
}

export interface CatalogPlace {
  name?: string;
  address?: string;
  coordinates?: { lat: number; lng: number };
}

/** Venue name, street, and a complete coordinate pair. Absent when the item states none of them. */
export function catalogPlace(item: CatalogPlaceInput): CatalogPlace | undefined {
  const lat = finiteCoord(item.Latitude);
  const lng = finiteCoord(item.Longitude);
  const coordinates = lat != null && lng != null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0)
    ? { lat, lng }
    : undefined;
  const address = streetAddress(item.Address)
    ?? streetAddress(item.VenueAddress)
    ?? streetAddress(item.Location)
    ?? streetAddress(item.Text1)
    ?? streetAddress(item.Text2)
    ?? streetAddress(item.Text3)
    ?? undefined;
  const venue = typeof item.Venue === "string" ? item.Venue.trim() : "";
  const name = venue && !streetAddress(venue) && !/^unknown$/i.test(venue) ? venue : undefined;
  const out: CatalogPlace = {};
  if (name) out.name = name;
  if (address) out.address = address;
  if (coordinates) out.coordinates = coordinates;
  if (!out.name && !out.address && !out.coordinates) return undefined;
  return out;
}
