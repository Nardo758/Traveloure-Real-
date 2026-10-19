/**
 * LG-1 step 1c (decision-maker, Oct 18, 2026): a Wikidata label search for the plan items Nominatim could not place
 * (`no_results`, `no_match`). Wikidata is CC0, so a coordinate found here needs credit ("Wikidata") but carries no
 * share-alike. READ-ONLY in this step: nothing here writes, and the write — a new source value in the open-coordinates
 * table — waits until the resolved count and samples have been reported.
 *
 * One request per item to the Wikidata Query Service: an English label search (the MediaWiki EntitySearch API through
 * WDQS's `mwapi` service), kept only for items located (P131, transitively) in the configured region — Kyoto
 * Prefecture — that carry coordinates (P625). Requests are serial, at least `WIKIDATA_MIN_INTERVAL_MS` apart, with a
 * User-Agent naming Traveloure and a contact, and a 429/503 `Retry-After` is honoured — never a parallel burst.
 *
 * Matching is the v2 rule, unchanged (§18 rule 1): the item's own place plan (`v2QueryPlan`) and its normalised name
 * tokens; a label must match them (`matchNormalisedName`); matching answers within `RESOLVED_CLUSTER_M` are one place,
 * further apart is ambiguous (nothing would be written). The region's id is VERIFIED at the start of a run against its
 * English label, so a wrong id stops the run instead of searching the wrong prefecture.
 */
import { matchNormalisedName, metresBetween, normalisedNameTokens, RESOLVED_CLUSTER_M, v2QueryPlan, type RegeocodeItem } from "./item-osm-regeocode.service";

export const WIKIDATA_SPARQL_URL = "https://query.wikidata.org/sparql";
export const WIKIDATA_API_URL = "https://www.wikidata.org/w/api.php";
export const WIKIDATA_USER_AGENT = "Traveloure-item-place-lookup/1.0 (+https://traveloure.com; one request per plan item)";
/** Serial, one at a time; at least this far apart. */
export const WIKIDATA_MIN_INTERVAL_MS = 1100;
/** How many label-search answers to consider per item. */
export const WIKIDATA_SEARCH_LIMIT = 10;
/** The region an answer must be located in (P131, transitively): Kyoto Prefecture, checked against its label per run. */
export const WIKIDATA_REGION = { qid: "Q120730", enLabel: "Kyoto Prefecture" } as const;
/** The credit a Wikidata coordinate carries wherever it is stored or shown. */
export const WIKIDATA_ATTRIBUTION = "Wikidata";

export interface WikidataCandidate {
  qid: string;
  label: string;
  lat: number;
  lng: number;
}

export type WikidataOutcome =
  | { kind: "resolved"; qid: string; label: string; lat: number; lng: number; matches: number }
  | { kind: "ambiguous"; spreadM: number; candidates: WikidataCandidate[] }
  | { kind: "unresolved"; reason: "no_place_phrase" | "no_named_tokens" | "area_title" | "meeting_or_stay" | "no_results" | "no_match" }
  | { kind: "unreachable" };

type FetchLike = (url: string, init: { headers: Record<string, string>; signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  headers?: { get(name: string): string | null };
  json(): Promise<any>;
}>;

/** Pure. A SPARQL string literal: backslashes and quotes escaped, line breaks dropped. */
function sparqlString(text: string): string {
  return `"${text.replace(/[\r\n]+/g, " ").replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Pure. The one query: English label search, located in the region, with coordinates. */
export function wikidataQuery(search: string, regionQid: string = WIKIDATA_REGION.qid, limit: number = WIKIDATA_SEARCH_LIMIT): string {
  return [
    "SELECT ?item ?itemLabel ?coord WHERE {",
    "  SERVICE wikibase:mwapi {",
    '    bd:serviceParam wikibase:endpoint "www.wikidata.org"; wikibase:api "EntitySearch";',
    `      mwapi:search ${sparqlString(search)}; mwapi:language "en"; mwapi:limit "${limit}".`,
    "    ?item wikibase:apiOutputItem mwapi:item.",
    "  }",
    `  ?item wdt:P131+ wd:${regionQid} .`,
    "  ?item wdt:P625 ?coord .",
    '  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }',
    "}",
  ].join("\n");
}

/** Pure. WDQS JSON bindings → candidates; a binding without a usable point or id is dropped. */
export function parseWikidataBindings(json: any): WikidataCandidate[] {
  const out: WikidataCandidate[] = [];
  const seen = new Set<string>();
  for (const b of json?.results?.bindings ?? []) {
    const uri = String(b?.item?.value ?? "");
    const qid = /\/entity\/(Q\d+)$/.exec(uri)?.[1];
    const m = /^Point\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)$/.exec(String(b?.coord?.value ?? ""));
    if (!qid || !m) continue;
    const lng = Number(m[1]);
    const lat = Number(m[2]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    // An item with two coordinates appears twice; the first is kept (the spread check would otherwise see itself).
    if (seen.has(qid)) continue;
    seen.add(qid);
    out.push({ qid, label: String(b?.itemLabel?.value ?? qid), lat, lng });
  }
  return out;
}

/** Pure. The v2 rule over Wikidata answers: a matching label, one place within the cluster radius, else ambiguous. */
export function classifyWikidataCandidates(
  itemTokens: ReadonlySet<string>,
  destination: string | null | undefined,
  candidates: readonly WikidataCandidate[],
): WikidataOutcome {
  if (candidates.length === 0) return { kind: "unresolved", reason: "no_results" };
  const matching = candidates.filter((c) => matchNormalisedName(c.label, itemTokens, destination));
  if (matching.length === 0) return { kind: "unresolved", reason: "no_match" };
  const first = matching[0];
  const spreadM = Math.max(...matching.map((m) => metresBetween(first.lat, first.lng, m.lat, m.lng)));
  if (spreadM > RESOLVED_CLUSTER_M) return { kind: "ambiguous", spreadM, candidates: matching };
  return { kind: "resolved", qid: first.qid, label: first.label, lat: first.lat, lng: first.lng, matches: matching.length };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One request, honouring a 429/503 Retry-After once (capped at a minute). */
async function getJson(url: string, fetchImpl: FetchLike): Promise<any | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetchImpl(url, {
      headers: { "User-Agent": WIKIDATA_USER_AGENT, Accept: "application/sparql-results+json, application/json" },
      signal: AbortSignal.timeout(20_000),
    });
    if (res.ok) return res.json();
    if ((res.status === 429 || res.status === 503) && attempt === 0) {
      const wait = Math.min(60, Math.max(1, Number(res.headers?.get("retry-after") ?? 5)));
      await sleep(wait * 1000);
      continue;
    }
    return null;
  }
  return null;
}

/**
 * The run's pre-flight: the configured region id names the region it claims (its English label). Never throws;
 * false ⇒ the caller stops before any item is searched.
 */
export async function verifyWikidataRegion(fetchImpl: FetchLike = (u, i) => fetch(u, i) as any): Promise<{ ok: boolean; label: string | null }> {
  try {
    const params = new URLSearchParams({ action: "wbgetentities", ids: WIKIDATA_REGION.qid, props: "labels", languages: "en", format: "json" });
    const json = await getJson(`${WIKIDATA_API_URL}?${params}`, fetchImpl);
    const label = json?.entities?.[WIKIDATA_REGION.qid]?.labels?.en?.value ?? null;
    return { ok: label === WIKIDATA_REGION.enLabel, label };
  } catch {
    return { ok: false, label: null };
  }
}

/** One item. Never throws. The caller spaces calls by `WIKIDATA_MIN_INTERVAL_MS`. */
export async function lookupItemWikidata(
  item: RegeocodeItem,
  fetchImpl: FetchLike = (u, i) => fetch(u, i) as any,
): Promise<{ outcome: WikidataOutcome; requested: boolean; search: string | null }> {
  const plan = v2QueryPlan(item);
  if (plan.skip) return { outcome: { kind: "unresolved", reason: plan.skip }, requested: false, search: null };
  // LG-2 Ask 3: the place phrase from the TITLE, never the location fallback ("Kyoto, Japan"). A phrase with no word
  // beyond the city and the generic words is skipped with its reason, never searched.
  const search = plan.titlePhrase.trim();
  if (!search || normalisedNameTokens(search, item.destination).size === 0) {
    return { outcome: { kind: "unresolved", reason: "no_place_phrase" }, requested: false, search: null };
  }
  try {
    const json = await getJson(`${WIKIDATA_SPARQL_URL}?${new URLSearchParams({ query: wikidataQuery(search), format: "json" })}`, fetchImpl);
    if (!json) return { outcome: { kind: "unreachable" }, requested: true, search };
    return { outcome: classifyWikidataCandidates(plan.itemTokens, item.destination, parseWikidataBindings(json)), requested: true, search };
  } catch {
    return { outcome: { kind: "unreachable" }, requested: true, search };
  }
}
