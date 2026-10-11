/**
 * venue-geocode.service.ts — a city event's venue coordinate, from OpenStreetMap (ledger
 * `2026-10-01-city-events-nine-seed`; decision-maker, Oct 1, 2026: "Attribute '© OpenStreetMap
 * contributors' wherever the coordinate renders; one request per venue with the app's user agent, per
 * Nominatim's usage policy; no match → null and flagged, never a guess.").
 *
 * WHY NOT GOOGLE PLACES: a Places coordinate is display-inside-a-plan data with a 30-day cache (LD 57);
 * `city_events.venue_lat/lng` keeps the coordinate indefinitely. OSM data is ODbL and may be stored with
 * attribution.
 *
 * ONE request per venue, honest user agent, and the seeder spaces requests at least
 * `NOMINATIM_MIN_INTERVAL_MS` apart (Nominatim's 1 req/s policy). A result is accepted only when the
 * names match BOTH ways under `matchNamesItem` (the Places gate's rule): the result's words are the
 * venue's, AND the venue's words are the result's — so "Mahalaxmi Temple" never stands in for
 * "Mahalaxmi Racecourse". A generic venue ("Old Town") has no distinctive words and is never looked
 * up. A mismatch is `null` (the caller inserts the row unlocated and flags it); a failure or timeout
 * is `"unreachable"` (the caller defers the row to the next run). Never throws.
 */
import { distinctiveTokens, matchNamesItem } from "@shared/place-name-gate";

export const OSM_ATTRIBUTION = "© OpenStreetMap contributors";
export const NOMINATIM_MIN_INTERVAL_MS = 1100;
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const NOMINATIM_USER_AGENT = "Traveloure-city-events/1.0 (+https://traveloure.com; one request per venue at seed)";

export interface VenueQuery {
  venue: string;
  /** Where the venue is (a town or area) — may differ from the operating city. */
  locality: string | null;
  country: string | null;
}

export interface VenueCoordinate {
  lat: number;
  lng: number;
  matchedName: string;
  attribution: typeof OSM_ATTRIBUTION;
}

type FetchLike = (url: string, init: { headers: Record<string, string>; signal?: AbortSignal }) => Promise<{
  ok: boolean;
  json(): Promise<any>;
}>;

/** Pure: the venue and the result name each other (both directions of `matchNamesItem`). */
export function namesMatchBothWays(venue: string, resultName: string): boolean {
  return (
    matchNamesItem(resultName, distinctiveTokens(venue, null), null) &&
    matchNamesItem(venue, distinctiveTokens(resultName, null), null)
  );
}

/** Pure: does this venue name anything a lookup could match? */
export function venueIsLookupable(venue: string): boolean {
  return distinctiveTokens(venue, null).size > 0;
}

/**
 * `null` = OSM answered and nothing matches (a definitive no-match). `"unreachable"` = no answer at all
 * (network, timeout, non-OK status) — the caller DEFERS rather than recording "not found", because a
 * seeded row is never looked up again.
 */
export async function resolveVenueFromOsm(
  q: VenueQuery,
  fetchImpl: FetchLike = (url, init) => fetch(url, init) as any,
): Promise<VenueCoordinate | null | "unreachable"> {
  const tokens = distinctiveTokens(q.venue, null);
  if (tokens.size === 0) return null;
  const text = [q.venue, q.locality, q.country].filter(Boolean).join(", ");
  const url = `${NOMINATIM_URL}?${new URLSearchParams({ q: text, format: "jsonv2", limit: "1", namedetails: "1" })}`;
  try {
    const res = await fetchImpl(url, {
      headers: { "User-Agent": NOMINATIM_USER_AGENT, "Accept-Language": "en" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return "unreachable";
    const [hit] = (await res.json()) as any[];
    if (!hit) return null;
    const names = [hit.namedetails?.["name:en"], hit.name, hit.namedetails?.name].filter((n): n is string => typeof n === "string" && n.length > 0);
    const matchedName = names.find((n) => namesMatchBothWays(q.venue, n));
    const lat = Number(hit.lat);
    const lng = Number(hit.lon);
    if (!matchedName || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng, matchedName, attribution: OSM_ATTRIBUTION };
  } catch {
    return "unreachable";
  }
}

const NOMINATIM_LOOKUP_URL = "https://nominatim.openstreetmap.org/lookup";

/**
 * SS-1b (decision-maker, Oct 10, 2026; ledger `2026-10-10-ss1b-official-refresh`): a station's point, from
 * the OpenStreetMap node the targets config names — the same Nominatim path, user agent, attribution and
 * two-way name rule as a venue, never Google Places. The node id is given, so this is a LOOKUP of that one
 * node, not a search; the station slug's words must still name the node (a mistyped node id never stands in
 * for another station). Same answers as `resolveVenueFromOsm`: a point, `null` (OSM answered, no such node
 * or it does not name this station) or `"unreachable"`. Never throws.
 */
export async function resolveOsmNode(
  q: { osmNodeId: number; name: string },
  fetchImpl: FetchLike = (url, init) => fetch(url, init) as any,
): Promise<VenueCoordinate | null | "unreachable"> {
  if (!Number.isSafeInteger(q.osmNodeId) || q.osmNodeId <= 0 || !venueIsLookupable(q.name)) return null;
  const url = `${NOMINATIM_LOOKUP_URL}?${new URLSearchParams({ osm_ids: `N${q.osmNodeId}`, format: "jsonv2", namedetails: "1" })}`;
  try {
    const res = await fetchImpl(url, {
      headers: { "User-Agent": NOMINATIM_USER_AGENT, "Accept-Language": "en" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return "unreachable";
    const [hit] = (await res.json()) as any[];
    if (!hit || String(hit.osm_type ?? "").toLowerCase() !== "node" || Number(hit.osm_id) !== q.osmNodeId) return null;
    const names = [hit.namedetails?.["name:en"], hit.name, hit.namedetails?.name].filter((n): n is string => typeof n === "string" && n.length > 0);
    const matchedName = names.find((n) => namesMatchBothWays(q.name, n));
    const lat = Number(hit.lat);
    const lng = Number(hit.lon);
    if (!matchedName || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng, matchedName, attribution: OSM_ATTRIBUTION };
  } catch {
    return "unreachable";
  }
}
