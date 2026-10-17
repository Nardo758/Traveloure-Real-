/**
 * 9b-e — re-geocode a plan item's point from OpenStreetMap (decision-maker, Oct 17, 2026: re-geocode every located
 * item through the existing Nominatim service, name + area, polite rate; stamp `coord_source='osm'` on success;
 * failures keep their point stamped unknown). This module is the LOOKUP and the CLASSIFICATION only. It writes
 * nothing; the dry run reports what a write would do, and writes wait on production confirming migration 388.
 *
 * Inputs are the item's own words and its plan's destination — never the item's stored point, which is a Google
 * coordinate (GC-1) and is not a search input. The stored point is used afterwards only to report how far the OSM
 * answer is from it, so a reviewer can spot a wrong match.
 *
 * Same Nominatim rules as the city-event venues (`venue-geocode.service.ts`): one request per item, an honest user
 * agent naming Traveloure, at least `NOMINATIM_MIN_INTERVAL_MS` between requests (the caller spaces them), and an
 * answer accepted only when its name names the item (`matchNamesItem`, the Places gate's rule). An item that names
 * no place (`unnamedPlaceReason`) is never looked up.
 *
 *   resolved    — one place: every matching answer is within RESOLVED_CLUSTER_M of the first
 *   ambiguous   — two or more matching answers further apart than that; nothing would be written
 *   unresolved  — nothing to look up, or OSM answered and no answer names the item
 *   unreachable — no answer at all (network, timeout, non-200); asked again on the next run
 */
import { matchNamesItem, namedPlaceTokens, placeLookupText, unnamedPlaceReason } from "@shared/place-name-gate";
import { NOMINATIM_MIN_INTERVAL_MS, OSM_ATTRIBUTION } from "./venue-geocode.service";

export { NOMINATIM_MIN_INTERVAL_MS, OSM_ATTRIBUTION };

const NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search";
export const ITEM_REGEOCODE_USER_AGENT = "Traveloure-item-regeocode/1.0 (+https://traveloure.com; one request per plan item)";
/** How many answers to ask for, so two different places with the item's name show up as ambiguous. */
export const REGEOCODE_RESULT_LIMIT = 5;
/** Matching answers this close to each other are the same place (a station's entrances, a temple's gates). */
export const RESOLVED_CLUSTER_M = 150;

export interface RegeocodeItem {
  id: string;
  title: string;
  locationName: string | null;
  /** The plan's destination — the area half of "name + area". */
  destination: string | null;
  /** The stored (Google) point, for the distance report only. */
  storedLat: number | null;
  storedLng: number | null;
}

export type RegeocodeOutcome =
  | { kind: "resolved"; lat: number; lng: number; matchedName: string; matches: number; metresFromStored: number | null }
  | { kind: "ambiguous"; matches: number; names: string[]; spreadM: number }
  | { kind: "unresolved"; reason: "no_named_tokens" | "area_title" | "no_match" | "no_results" }
  | { kind: "unreachable" };

type FetchLike = (url: string, init: { headers: Record<string, string>; signal?: AbortSignal }) => Promise<{
  ok: boolean;
  json(): Promise<any>;
}>;

/** Pure: great-circle metres between two points. */
export function metresBetween(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

/** Pure: the text sent to Nominatim — the place the item names, then its plan's destination. */
export function regeocodeQueryText(item: Pick<RegeocodeItem, "title" | "locationName" | "destination">): string {
  const place = (item.locationName ?? "").trim() || placeLookupText(item.title);
  return [place, item.destination].filter((p) => (p ?? "").trim().length > 0).join(", ");
}

/** Pure: classify Nominatim's answers for one item. */
export function classifyRegeocodeHits(item: RegeocodeItem, hits: readonly any[]): RegeocodeOutcome {
  if (hits.length === 0) return { kind: "unresolved", reason: "no_results" };
  const tokens = namedPlaceTokens(item, item.destination);
  const matching: Array<{ lat: number; lng: number; name: string }> = [];
  for (const hit of hits) {
    const names = [hit?.namedetails?.["name:en"], hit?.name, hit?.namedetails?.name].filter(
      (n): n is string => typeof n === "string" && n.length > 0,
    );
    const name = names.find((n) => matchNamesItem(n, tokens, item.destination));
    const lat = Number(hit?.lat);
    const lng = Number(hit?.lon);
    if (name && Number.isFinite(lat) && Number.isFinite(lng)) matching.push({ lat, lng, name });
  }
  if (matching.length === 0) return { kind: "unresolved", reason: "no_match" };
  const first = matching[0];
  const spreadM = Math.max(...matching.map((m) => metresBetween(first.lat, first.lng, m.lat, m.lng)));
  if (spreadM > RESOLVED_CLUSTER_M) {
    return { kind: "ambiguous", matches: matching.length, names: Array.from(new Set(matching.map((m) => m.name))), spreadM };
  }
  const stored = item.storedLat != null && item.storedLng != null ? metresBetween(item.storedLat, item.storedLng, first.lat, first.lng) : null;
  return { kind: "resolved", lat: first.lat, lng: first.lng, matchedName: first.name, matches: matching.length, metresFromStored: stored };
}

/** One item: look it up (or not) and classify. Never throws. The caller spaces calls by `NOMINATIM_MIN_INTERVAL_MS`. */
export async function regeocodeItem(
  item: RegeocodeItem,
  fetchImpl: FetchLike = (url, init) => fetch(url, init) as any,
): Promise<{ outcome: RegeocodeOutcome; requested: boolean }> {
  const skip = unnamedPlaceReason(item, item.destination);
  if (skip) return { outcome: { kind: "unresolved", reason: skip }, requested: false };
  const url = `${NOMINATIM_SEARCH_URL}?${new URLSearchParams({
    q: regeocodeQueryText(item),
    format: "jsonv2",
    limit: String(REGEOCODE_RESULT_LIMIT),
    namedetails: "1",
  })}`;
  try {
    const res = await fetchImpl(url, {
      headers: { "User-Agent": ITEM_REGEOCODE_USER_AGENT, "Accept-Language": "en" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { outcome: { kind: "unreachable" }, requested: true };
    const hits = await res.json();
    return { outcome: classifyRegeocodeHits(item, Array.isArray(hits) ? hits : []), requested: true };
  } catch {
    return { outcome: { kind: "unreachable" }, requested: true };
  }
}
