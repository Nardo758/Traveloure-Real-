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
import {
  distinctiveTokens,
  hasAlternativeClause,
  matchNamesItem,
  namedPlaceTokens,
  placeLookupText,
  unnamedPlaceReason,
  visitedPlaceTitle,
} from "@shared/place-name-gate";
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

/* ───────────────────────── 9b-e step 1b — the v2 lookup (still a dry run) ─────────────────────────
 * Four changes over v1, nothing written by either:
 *   1. names are NORMALISED before matching — macrons and accents folded, hyphenated and joined forms made
 *      equal, and the Japanese suffixes (-ji, -dera, -jinja, -jingu, -taisha) and their English stand-ins
 *      ("Temple", "Shrine") dropped from both sides — and an answer may match through name:en, any other
 *      namedetails name, or the first segment of display_name. `accept-language=en` is sent as a parameter.
 *   2. an item v1 skipped as an activity ("Morning walk at Fushimi Inari") is looked up by the place phrase
 *      after its last "at" / "in" / "to", and matched against that phrase alone.
 *   3. the search carries a viewbox HINT from the neighbourhood spine (`city_neighborhoods`), bounded=0 so it
 *      biases and never filters: the neighbourhood the item names, found BY NAME (the GC-1 teaser rule), else
 *      the extent of the plan city's neighbourhoods. Never the item's stored (Google) point.
 *   4. every unresolved outcome carries its reason, for the per-reason counts.
 */

/** Suffix words that say "temple" / "shrine" in either language. Dropped as words and stripped from joined forms. */
const PLACE_SUFFIX_WORDS = new Set(["ji", "dera", "tera", "jinja", "jingu", "taisha", "gu", "in", "temple", "shrine", "castle"]);
const JOINED_SUFFIXES = ["jinja", "jingu", "taisha", "dera", "ji"];
/** Joined forms are stripped only when this much of the word is left ("kinkakuji" → "kinkaku", never "fuji" → "fu"). */
const MIN_STEM_LENGTH = 4;

function foldText(text: string): string {
  return text.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Pure. One normalised token: suffix stripped from a joined form ("kiyomizudera" → "kiyomizu"). */
export function normaliseNameToken(token: string): string {
  const t = foldText(token);
  for (const s of JOINED_SUFFIXES) {
    if (t.length > s.length && t.endsWith(s) && t.length - s.length >= MIN_STEM_LENGTH) return t.slice(0, -s.length);
  }
  return t;
}

/** Pure. The normalised distinctive words of a name: the gate's words, suffix words dropped, joined suffixes stripped. */
export function normalisedNameTokens(text: string | null | undefined, city: string | null | undefined): Set<string> {
  const out = new Set<string>();
  // Split hyphens first so "Kiyomizu-dera" and "Kiyomizu dera" read the same; then the gate's own distinctive words.
  for (const raw of foldText(text ?? "").replace(/[-‐‑–—_]/g, " ").split(/\s+/)) {
    if (!raw || PLACE_SUFFIX_WORDS.has(raw)) continue;
    distinctiveTokens(raw, city).forEach((t) => {
      if (!PLACE_SUFFIX_WORDS.has(t)) out.add(normaliseNameToken(t));
    });
  }
  return out;
}

/**
 * Pure. Does an answer name the item, after normalisation? More than half of the answer's words must be in the
 * item (v1's rule), where a word is also counted when it is the item's words run together ("fushimiinari") or
 * when the item has it run together with another word.
 */
export function matchNormalisedName(answerName: string | null | undefined, itemTokens: ReadonlySet<string>, city: string | null | undefined): boolean {
  const own = Array.from(normalisedNameTokens(answerName, city));
  if (own.length === 0) return false;
  const items = Array.from(itemTokens);
  const covered = (t: string): boolean => {
    if (itemTokens.has(t)) return true;
    // the item has it joined with another word
    if (t.length >= MIN_STEM_LENGTH && items.some((u) => u.length > t.length && u.includes(t))) return true;
    // the answer has the item's words joined
    let rest = t;
    for (const u of items.filter((x) => x.length >= 3).sort((a, b) => b.length - a.length)) rest = rest.split(u).join("");
    return rest.length === 0;
  };
  const shared = own.filter(covered).length;
  return shared >= 1 && shared * 2 > own.length;
}

/** Pure. Every name an answer carries: name:en, the other namedetails names, name, and display_name's first segment. */
export function answerNames(hit: any): string[] {
  const details = hit?.namedetails && typeof hit.namedetails === "object" ? hit.namedetails : {};
  const ordered = [details["name:en"], hit?.name, details.name, ...Object.values(details)];
  const display = typeof hit?.display_name === "string" ? hit.display_name.split(",")[0] : null;
  ordered.push(display);
  return Array.from(new Set(ordered.filter((n): n is string => typeof n === "string" && n.trim().length > 0)));
}

const PLACE_PHRASE = /\b(?:at|in|to)\s+(.+)$/i;

/** Pure. The place phrase after the title's last "at" / "in" / "to", or null when there is none. */
export function placePhraseOf(title: string): string | null {
  const visited = visitedPlaceTitle(title);
  let last: string | null = null;
  // the LAST "at/in/to": "Walk to Gion in Higashiyama" looks up "Higashiyama"
  const words = visited.split(/\s+/);
  for (let i = words.length - 2; i >= 0; i--) {
    if (/^(at|in|to)$/i.test(words[i])) {
      last = words.slice(i + 1).join(" ");
      break;
    }
  }
  const phrase = (last ?? (PLACE_PHRASE.exec(visited)?.[1] ?? "")).replace(/^[\s,:;–—-]+|[\s,:;.!–—-]+$/g, "");
  return phrase.length > 0 ? phrase : null;
}

export interface SpineNeighbourhood {
  name: string;
  city: string;
  centroidLat: number;
  centroidLng: number;
  radiusKm: number | null;
}

/** lon1,lat1,lon2,lat2 — Nominatim's order. */
export type Viewbox = [number, number, number, number];

const DEFAULT_RADIUS_KM = 1.5;
/** The hint box is twice the neighbourhood's radius each way: a bias, never a filter (bounded=0). */
const VIEWBOX_RADIUS_FACTOR = 2;

function boxAround(n: SpineNeighbourhood): Viewbox {
  const km = (n.radiusKm && n.radiusKm > 0 ? n.radiusKm : DEFAULT_RADIUS_KM) * VIEWBOX_RADIUS_FACTOR;
  const dLat = km / 111.32;
  const dLng = km / (111.32 * Math.cos((n.centroidLat * Math.PI) / 180));
  return [n.centroidLng - dLng, n.centroidLat + dLat, n.centroidLng + dLng, n.centroidLat - dLat];
}

/**
 * Pure. The viewbox hint for an item: the neighbourhood its words name (all of the neighbourhood's own words in
 * the item; the most specific wins), else the extent of its plan city's neighbourhoods, else none. Reads names
 * only — never the item's stored point.
 */
export function spineViewbox(
  itemTokens: ReadonlySet<string>,
  destination: string | null,
  spine: readonly SpineNeighbourhood[],
): { viewbox: Viewbox; source: "neighbourhood" | "city" } | null {
  const city = (destination ?? "").split(",")[0].trim().toLowerCase();
  const inCity = spine.filter((n) => n.city.trim().toLowerCase() === city);
  if (inCity.length === 0) return null;
  let best: SpineNeighbourhood | null = null;
  let bestSize = 0;
  for (const n of inCity) {
    const own = normalisedNameTokens(n.name, destination);
    if (own.size > bestSize && Array.from(own).every((t) => itemTokens.has(t))) {
      best = n;
      bestSize = own.size;
    }
  }
  if (best) return { viewbox: boxAround(best), source: "neighbourhood" };
  const boxes = inCity.map(boxAround);
  return {
    viewbox: [
      Math.min(...boxes.map((b) => b[0])),
      Math.max(...boxes.map((b) => b[1])),
      Math.max(...boxes.map((b) => b[2])),
      Math.min(...boxes.map((b) => b[3])),
    ],
    source: "city",
  };
}

export type RegeocodeV2Outcome =
  | Exclude<RegeocodeOutcome, { kind: "unresolved" }>
  | { kind: "unresolved"; reason: "no_named_tokens" | "area_title" | "no_place_phrase" | "no_match" | "no_results" };

export interface RegeocodeV2Result {
  outcome: RegeocodeV2Outcome;
  requested: boolean;
  /** "item" = the item's own words (v1's query); "place_phrase" = the phrase after at/in/to of a skipped title. */
  queryBasis: "item" | "place_phrase" | null;
  query: string | null;
  viewboxSource: "neighbourhood" | "city" | null;
  /** What v1 would have skipped this item for, when it did. */
  v1Skip: "no_named_tokens" | "area_title" | null;
}

/** Pure. Classify answers against already-normalised item tokens. */
export function classifyRegeocodeHitsV2(item: RegeocodeItem, itemTokens: ReadonlySet<string>, hits: readonly any[]): RegeocodeV2Outcome {
  if (hits.length === 0) return { kind: "unresolved", reason: "no_results" };
  const matching: Array<{ lat: number; lng: number; name: string }> = [];
  for (const hit of hits) {
    const name = answerNames(hit).find((n) => matchNormalisedName(n, itemTokens, item.destination));
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

/** One item, v2. Never throws. The caller spaces calls by `NOMINATIM_MIN_INTERVAL_MS`. */
export async function regeocodeItemV2(
  item: RegeocodeItem,
  spine: readonly SpineNeighbourhood[],
  fetchImpl: FetchLike = (url, init) => fetch(url, init) as any,
): Promise<RegeocodeV2Result> {
  const v1Skip = unnamedPlaceReason(item, item.destination);
  let place: string;
  let queryBasis: "item" | "place_phrase";
  let itemTokens: Set<string>;
  if (v1Skip) {
    const phrase = placePhraseOf(item.title);
    const phraseTokens = phrase ? normalisedNameTokens(phrase, item.destination) : new Set<string>();
    if (!phrase || phraseTokens.size === 0) {
      return {
        outcome: { kind: "unresolved", reason: phrase ? v1Skip : "no_place_phrase" },
        requested: false,
        queryBasis: null,
        query: null,
        viewboxSource: null,
        v1Skip,
      };
    }
    place = phrase;
    queryBasis = "place_phrase";
    itemTokens = phraseTokens;
  } else {
    place = (item.locationName ?? "").trim() || placeLookupText(item.title);
    queryBasis = "item";
    itemTokens = normalisedNameTokens(item.title, item.destination);
    normalisedNameTokens(item.locationName, item.destination).forEach((t) => itemTokens.add(t));
    if (hasAlternativeClause(item.title)) itemTokens = normalisedNameTokens(visitedPlaceTitle(item.title), item.destination);
  }
  const query = [place, item.destination].filter((p) => (p ?? "").trim().length > 0).join(", ");
  const hint = spineViewbox(itemTokens, item.destination, spine);
  const params: Record<string, string> = {
    q: query,
    format: "jsonv2",
    limit: String(REGEOCODE_RESULT_LIMIT),
    namedetails: "1",
    "accept-language": "en",
  };
  if (hint) {
    params.viewbox = hint.viewbox.map((n) => n.toFixed(5)).join(",");
    params.bounded = "0";
  }
  const base = { requested: true, queryBasis, query, viewboxSource: hint?.source ?? null, v1Skip } as const;
  try {
    const res = await fetchImpl(`${NOMINATIM_SEARCH_URL}?${new URLSearchParams(params)}`, {
      headers: { "User-Agent": ITEM_REGEOCODE_USER_AGENT, "Accept-Language": "en" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { ...base, outcome: { kind: "unreachable" } };
    const hits = await res.json();
    return { ...base, outcome: classifyRegeocodeHitsV2(item, itemTokens, Array.isArray(hits) ? hits : []) };
  } catch {
    return { ...base, outcome: { kind: "unreachable" } };
  }
}
