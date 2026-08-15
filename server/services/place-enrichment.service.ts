// place-enrichment.service.ts — best-effort open-data enrichment for DMO extracted places
// (CLAUDE.md §20a extension, migration 188). Two independent, explicitly-licensed sources, each
// best-effort and separately time-boxed:
//
//   - WIKIDATA (CC0): wbsearchentities finds a candidate entity for the place name; the TOP hit is
//     used ONLY if its label/aliases plausibly match the input name (case-insensitive substring
//     either direction) — a search API returning "closest thing it has" is not the same as a
//     confirmed match, and a wrong match would be a fabricated fact (§13). wbgetclaims then reads:
//       P856 (official website)      -> officialUrl
//       P625 (coordinate location)   -> ONLY used to fill a geocode the pipeline's own geocoder
//                                        missed, never to overwrite one it already has; the fill
//                                        is stated, not laundered (coordsFrom: "wikidata")
//       P1435 (heritage designation) -> heritage (the designation's own label if cheaply
//                                        resolvable via one extra wbgetentities call, else the
//                                        bare QID string — still a real fact, just less pretty)
//
//   - OSM/OVERPASS (ODbL): an around-point search for a same-named node/way/relation within ~150m
//     of the resolved coordinate (the pipeline's own geocode, or Wikidata's P625 fill above) —
//     ONLY run when a coordinate exists, since Overpass has no name-only search. Reads
//     opening_hours and wheelchair tags, when present, into openingHours.
//
// Mirror-fallback / User-Agent discipline for Overpass mirrors this exact from-file's namesake in
// server/services/market-extract.service.ts's `fetchOverpass` — same three public gateways, same
// "identify yourself" UA convention that public Overpass gateways require. NOT imported directly:
// that function's AbortController timeout is fixed at 180s (a one-off admin bbox-extract budget),
// while this file needs an 8-SECOND per-source cap that must never stall the extraction pipeline —
// so the mirror loop is duplicated here, minimally, under its own short timeout. See that file for
// the canonical, longer-budget version of the same pattern.
//
// CONTRACT (matches the migration 188 column comment, plus one additive, documented extension):
//   { officialUrl?, openingHours?, heritage?, wikidataId?, osmId?, source, fetchedAt,
//     coordsFrom?, lat?, lng? }
// `coordsFrom`/`lat`/`lng` are present ONLY when this call filled a coordinate the caller's own
// geocode was missing — the pipeline copies `lat`/`lng` into its own geocode columns and the
// envelope keeps `coordsFrom` as the permanent, honest provenance record for that fill (§13: a
// coordinate's origin is stated, never silently merged in as if it were an ordinary geocode hit).
// Only keys with real values are ever present — no key is ever set to null/undefined/"".
//
// NEVER THROWS TO THE CALLER: every network call is individually wrapped, and total failure of a
// source (timeout, non-2xx, malformed JSON, no plausible match) means that source contributes
// nothing — never a thrown error, never a fabricated value. Total failure of BOTH sources resolves
// to `null`, meaning "honestly not enriched" (matches the column's NULL = not-enriched contract).

export type FetchImpl = typeof globalThis.fetch;

const WIKIDATA_UA = "Traveloure-place-enrichment/1.0 (+https://traveloure.com)";
const OSM_UA = "Traveloure-place-enrichment/1.0 (+https://traveloure.com)";
const WIKIDATA_TIMEOUT_MS = 8_000;
const OSM_TIMEOUT_MS = 8_000;

// Mirrors market-extract.service.ts's private OVERPASS_MIRRORS list — same three public gateways.
const OVERPASS_MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.osm.jp/api/interpreter",
];

export interface EnrichPlaceInput {
  name: string;
  /** Accepted for signature parity with the pipeline's own city-qualified geocode call and left
   *  available for a future disambiguation pass; not used to build the Wikidata query today —
   *  wbsearchentities free-text search on the bare venue name already carries the plausibility
   *  gate below, and appending a city tends to hurt recall more than it helps precision. */
  city?: string | null;
  lat?: number | null;
  lng?: number | null;
}

export interface PlaceEnrichment {
  officialUrl?: string;
  openingHours?: string;
  heritage?: string;
  wikidataId?: string;
  osmId?: string;
  source: "wikidata" | "osm" | "wikidata+osm";
  fetchedAt: string; // ISO string
  // Present ONLY when this call supplied a coordinate the input didn't have (see file header).
  coordsFrom?: "wikidata";
  lat?: number;
  lng?: number;
}

function isPlausibleMatch(name: string, candidate: string | null | undefined): boolean {
  if (!candidate) return false;
  const a = name.toLowerCase().trim();
  const b = candidate.toLowerCase().trim();
  if (!a || !b) return false;
  return a.includes(b) || b.includes(a);
}

// ============================================================
// WIKIDATA
// ============================================================

interface WikidataFacts {
  wikidataId: string;
  officialUrl?: string;
  heritage?: string;
  coord?: { lat: number; lng: number };
}

function extractStringClaim(claims: any, prop: string): string | undefined {
  const arr = claims?.[prop];
  if (!Array.isArray(arr) || arr.length === 0) return undefined;
  const v = arr[0]?.mainsnak?.datavalue?.value;
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function extractCoordClaim(claims: any, prop: string): { lat: number; lng: number } | undefined {
  const arr = claims?.[prop];
  if (!Array.isArray(arr) || arr.length === 0) return undefined;
  const v = arr[0]?.mainsnak?.datavalue?.value;
  const lat = typeof v?.latitude === "number" ? v.latitude : undefined;
  const lng = typeof v?.longitude === "number" ? v.longitude : undefined;
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  return { lat, lng };
}

function extractEntityClaim(claims: any, prop: string): string | undefined {
  const arr = claims?.[prop];
  if (!Array.isArray(arr) || arr.length === 0) return undefined;
  const v = arr[0]?.mainsnak?.datavalue?.value;
  return typeof v?.id === "string" ? v.id : undefined;
}

async function resolveEntityLabel(qid: string, fetchImpl: FetchImpl, signal: AbortSignal): Promise<string | null> {
  const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${encodeURIComponent(qid)}&props=labels&languages=en&format=json&origin=*`;
  const res = await fetchImpl(url, { signal, headers: { "User-Agent": WIKIDATA_UA } });
  if (!res.ok) return null;
  const data: any = await res.json();
  const val = data?.entities?.[qid]?.labels?.en?.value;
  return typeof val === "string" && val.trim() ? val.trim() : null;
}

/** wbsearchentities → top hit, kept ONLY if its label/aliases plausibly match `name`, then
 *  wbgetclaims for P856/P625/P1435. One shared AbortSignal covers the whole chain (search +
 *  claims + the optional heritage-label lookup) so the source's total budget stays 8s regardless
 *  of how many of the up-to-3 requests it takes. Returns null on ANY failure or no plausible
 *  match — never throws. */
async function fetchWikidataFacts(name: string, fetchImpl: FetchImpl, signal: AbortSignal): Promise<WikidataFacts | null> {
  try {
    const searchUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(name)}&language=en&format=json&limit=5&origin=*`;
    const searchRes = await fetchImpl(searchUrl, { signal, headers: { "User-Agent": WIKIDATA_UA } });
    if (!searchRes.ok) return null;
    const searchData: any = await searchRes.json();
    const hits: any[] = Array.isArray(searchData?.search) ? searchData.search : [];
    if (hits.length === 0) return null;

    const top = hits[0];
    const label = typeof top?.label === "string" ? top.label : "";
    const matchText = typeof top?.match?.text === "string" ? top.match.text : "";
    const aliasCandidates: string[] = Array.isArray(top?.aliases)
      ? top.aliases.filter((a: unknown): a is string => typeof a === "string")
      : [];
    const plausible = [label, matchText, ...aliasCandidates].some((c) => isPlausibleMatch(name, c));
    if (!plausible) return null;

    const qid = typeof top?.id === "string" ? top.id : "";
    if (!qid) return null;

    const claimsUrl = `https://www.wikidata.org/w/api.php?action=wbgetclaims&entity=${encodeURIComponent(qid)}&format=json&origin=*`;
    const claimsRes = await fetchImpl(claimsUrl, { signal, headers: { "User-Agent": WIKIDATA_UA } });
    if (!claimsRes.ok) return { wikidataId: qid };
    const claimsData: any = await claimsRes.json();
    const claims = claimsData?.claims ?? {};

    const officialUrl = extractStringClaim(claims, "P856");
    const coord = extractCoordClaim(claims, "P625");
    const heritageQid = extractEntityClaim(claims, "P1435");

    let heritage: string | undefined;
    if (heritageQid) {
      const label = await resolveEntityLabel(heritageQid, fetchImpl, signal).catch(() => null);
      heritage = label ?? heritageQid; // cheap-resolve; fall back to the bare QID (still a real fact)
    }

    const facts: WikidataFacts = { wikidataId: qid };
    if (officialUrl) facts.officialUrl = officialUrl;
    if (heritage) facts.heritage = heritage;
    if (coord) facts.coord = coord;
    return facts;
  } catch {
    return null; // timeout/abort/network/parse — this source contributes nothing (§13)
  }
}

// ============================================================
// OSM / OVERPASS
// ============================================================

interface OsmFacts {
  osmId: string;
  openingHours?: string;
}

function escapeOverpassRegex(name: string): string {
  return name.replace(/[.*+?^${}()|[\]\\"]/g, "\\$&");
}

function buildPlaceOverpassQuery(name: string, lat: number, lng: number): string {
  const escaped = escapeOverpassRegex(name);
  const near = `(around:150,${lat},${lng})`;
  return (
    `[out:json][timeout:8];` +
    `(node["name"~"${escaped}",i]${near};way["name"~"${escaped}",i]${near};relation["name"~"${escaped}",i]${near};);` +
    `out tags center 1;`
  );
}

/** POSTs to each Overpass mirror in turn under the SAME shared AbortSignal (see file header for
 *  why this isn't `market-extract.service.ts`'s fetchOverpass directly) — first 2xx JSON response
 *  wins, any failure tries the next mirror, and an already-expired signal stops the loop instead
 *  of burning the remaining budget on doomed requests. Returns null on total failure. */
async function fetchOverpassWithMirrors(query: string, fetchImpl: FetchImpl, signal: AbortSignal): Promise<any | null> {
  for (const endpoint of OVERPASS_MIRRORS) {
    if (signal.aborted) return null;
    try {
      const res = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Accept": "application/json",
          "User-Agent": OSM_UA,
        },
        body: `data=${encodeURIComponent(query)}`,
        signal,
      });
      if (!res.ok) continue;
      return await res.json();
    } catch {
      if (signal.aborted) return null;
      // else: try the next mirror
    }
  }
  return null;
}

/** Around-point Overpass search for a same-named element within ~150m of (lat, lng). Reads
 *  opening_hours / wheelchair tags off the first matching element, when present. Returns null on
 *  total failure or no matching element — never throws. */
async function fetchOsmFacts(name: string, lat: number, lng: number, fetchImpl: FetchImpl, signal: AbortSignal): Promise<OsmFacts | null> {
  try {
    const query = buildPlaceOverpassQuery(name, lat, lng);
    const data = await fetchOverpassWithMirrors(query, fetchImpl, signal);
    if (!data) return null;
    const elements: any[] = Array.isArray(data?.elements) ? data.elements : [];
    if (elements.length === 0) return null;

    const el = elements[0];
    const tags = el?.tags ?? {};
    const parts: string[] = [];
    if (typeof tags.opening_hours === "string" && tags.opening_hours.trim()) parts.push(tags.opening_hours.trim());
    if (typeof tags.wheelchair === "string" && tags.wheelchair.trim()) parts.push(`wheelchair: ${tags.wheelchair.trim()}`);

    if (typeof el?.type !== "string" || (typeof el?.id !== "number" && typeof el?.id !== "string")) return null;
    const facts: OsmFacts = { osmId: `${el.type}/${el.id}` };
    if (parts.length > 0) facts.openingHours = parts.join(" · ");
    return facts;
  } catch {
    return null;
  }
}

// ============================================================
// PUBLIC ENTRY POINT
// ============================================================

/**
 * Best-effort open-data enrichment for one extracted place. Runs Wikidata first (it can supply a
 * fallback coordinate for Overpass to search around), then Overpass IF a coordinate exists (the
 * caller's own geocode, or Wikidata's P625 fill). Composes whatever each source contributed;
 * returns null only when NEITHER source contributed anything. Never throws.
 */
export async function enrichPlace(
  input: EnrichPlaceInput,
  fetchImpl: FetchImpl = globalThis.fetch,
): Promise<PlaceEnrichment | null> {
  try {
    const name = input?.name?.trim();
    if (!name) return null;

    const wikidataController = new AbortController();
    const wikidataTimer = setTimeout(() => wikidataController.abort(), WIKIDATA_TIMEOUT_MS);
    let wikidata: WikidataFacts | null;
    try {
      wikidata = await fetchWikidataFacts(name, fetchImpl, wikidataController.signal);
    } finally {
      clearTimeout(wikidataTimer);
    }

    // Resolve the coordinate to search Overpass around: the caller's own geocode wins when
    // present; Wikidata's P625 fills a gap it left. The fill's provenance rides into the
    // returned envelope below rather than silently posing as an ordinary geocode hit (§13).
    const hasInputCoords =
      input.lat != null && input.lng != null && Number.isFinite(input.lat) && Number.isFinite(input.lng);
    let osmLat = hasInputCoords ? (input.lat as number) : null;
    let osmLng = hasInputCoords ? (input.lng as number) : null;
    let coordsFrom: "wikidata" | undefined;
    if (!hasInputCoords && wikidata?.coord) {
      osmLat = wikidata.coord.lat;
      osmLng = wikidata.coord.lng;
      coordsFrom = "wikidata";
    }

    let osm: OsmFacts | null = null;
    if (osmLat != null && osmLng != null) {
      const osmController = new AbortController();
      const osmTimer = setTimeout(() => osmController.abort(), OSM_TIMEOUT_MS);
      try {
        osm = await fetchOsmFacts(name, osmLat, osmLng, fetchImpl, osmController.signal);
      } finally {
        clearTimeout(osmTimer);
      }
    }

    if (!wikidata && !osm) return null;

    const sources: ("wikidata" | "osm")[] = [];
    if (wikidata) sources.push("wikidata");
    if (osm) sources.push("osm");

    const enrichment: PlaceEnrichment = {
      source: sources.length === 2 ? "wikidata+osm" : sources[0],
      fetchedAt: new Date().toISOString(),
    };
    if (wikidata?.officialUrl) enrichment.officialUrl = wikidata.officialUrl;
    if (wikidata?.heritage) enrichment.heritage = wikidata.heritage;
    if (wikidata?.wikidataId) enrichment.wikidataId = wikidata.wikidataId;
    if (osm?.openingHours) enrichment.openingHours = osm.openingHours;
    if (osm?.osmId) enrichment.osmId = osm.osmId;
    if (coordsFrom && wikidata?.coord) {
      enrichment.coordsFrom = coordsFrom;
      enrichment.lat = wikidata.coord.lat;
      enrichment.lng = wikidata.coord.lng;
    }
    return enrichment;
  } catch {
    // Programmer-error backstop — every expected failure path above already returns null on its
    // own; this exists only so a truly unexpected throw still honors "never throws to the caller".
    return null;
  }
}
