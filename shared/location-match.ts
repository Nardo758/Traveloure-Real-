/**
 * ONE city-match rule for the location filters (board #1385).
 *
 * The /experts filters matched in BOTH directions by substring — `d.includes(loc) || loc.includes(d)`
 * over destinations, city AND country — so "Kyo" matched Kyoto, "Kyoto, Japan" matched every
 * expert whose country is Japan (a Tokyo expert counted, because "japan" is inside the query), and
 * an expert with an empty city matched everything (`loc.includes("")` is always true).
 *
 * The rule now: a query names a CITY by its first comma segment ("Kyoto, Japan" → "kyoto"), and a
 * place matches only when its own city segment is EQUAL to it — case-, accent- and space-
 * insensitively. A single-word query may also name a COUNTRY ("Japan"), matched equally against the
 * place's country. Empty values never match. No substring matching of any kind. Pure.
 */

/** Lowercase, strip accents, collapse whitespace. */
export function normalizePlace(value: string | null | undefined): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** The city segment of "City, Country" (or of a bare "City"). */
export function citySegment(value: string | null | undefined): string {
  return normalizePlace(String(value ?? "").split(",")[0]);
}

export interface PlaceFields {
  destinations?: readonly (string | null | undefined)[] | null;
  city?: string | null;
  country?: string | null;
}

/** Does a location query ("Kyoto" / "Kyoto, Japan" / "Japan") name this place? */
export function locationQueryMatches(query: string | null | undefined, place: PlaceFields): boolean {
  const qCity = citySegment(query);
  if (!qCity) return false;
  const cities = [...(place.destinations ?? []), place.city].map(citySegment).filter(Boolean);
  if (cities.includes(qCity)) return true;
  // A one-segment query may be a country ("Japan"); a "City, Country" query never falls back to
  // the country — that is how a Tokyo expert used to answer a Kyoto search.
  const isSingleSegment = !String(query ?? "").includes(",");
  const country = normalizePlace(place.country);
  return isSingleSegment && country !== "" && country === qCity;
}
