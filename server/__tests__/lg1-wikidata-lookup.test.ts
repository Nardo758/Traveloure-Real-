/**
 * LG-1 step 1c (ledger `2026-10-18-lg1-wikidata-readonly`): the READ-ONLY Wikidata label search for Kyoto items the
 * Nominatim batch could not place. Pure; every network call goes through an injected fetch.
 *
 *   WD1 the query: English label search, located (P131+) in the region, with coordinates (P625); the search is escaped
 *   WD2 parsing: a binding with no id or no point is dropped; an item with two points is kept once
 *   WD3 classifying: no answers / no matching label / one cluster / two places too far apart
 *   WD4 the pre-flight refuses unless the region id reads its own English label; a throw is a refusal
 *   WD5 one item: the request names Traveloure; an item naming no place is never requested; no answer is "unreachable"
 *
 * NEGATIVE SPACE (§18d): the live endpoints are never called here; the rate spacing is the caller's (the script).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyWikidataCandidates,
  lookupItemWikidata,
  parseWikidataBindings,
  verifyWikidataRegion,
  wikidataQuery,
  WIKIDATA_REGION,
  WIKIDATA_USER_AGENT,
} from "../services/item-wikidata-lookup.service";
import { normalisedNameTokens } from "../services/item-osm-regeocode.service";

const binding = (qid: string, label: string, lng: number, lat: number) => ({
  item: { value: `http://www.wikidata.org/entity/${qid}` },
  itemLabel: { value: label },
  coord: { value: `Point(${lng} ${lat})` },
});
const item = (title: string, locationName: string | null = null) => ({ id: "i1", title, locationName, destination: "Kyoto, Japan", storedLat: null, storedLng: null });
const okFetch = (json: unknown, seen: Array<{ url: string; headers: Record<string, string> }> = []) =>
  async (url: string, init: { headers: Record<string, string> }) => {
    seen.push({ url, headers: init.headers });
    return { ok: true, status: 200, json: async () => json };
  };

test("WD1 the query searches English labels inside the region, with coordinates, and escapes the search", () => {
  const q = wikidataQuery('Fushimi "Inari"\nTaisha');
  assert.match(q, /mwapi:search "Fushimi \\"Inari\\" Taisha"/);
  assert.match(q, /mwapi:language "en"/);
  assert.match(q, new RegExp(`wdt:P131\\+ wd:${WIKIDATA_REGION.qid}`));
  assert.match(q, /wdt:P625 \?coord/);
});

test("WD2 parsing drops a binding with no id or no point and keeps a two-point item once", () => {
  const out = parseWikidataBindings({ results: { bindings: [
    binding("Q1", "Kinkaku-ji", 135.7292, 35.0394),
    binding("Q1", "Kinkaku-ji", 135.73, 35.04),
    { item: { value: "not-an-entity" }, itemLabel: { value: "x" }, coord: { value: "Point(1 2)" } },
    { item: { value: "http://www.wikidata.org/entity/Q2" }, itemLabel: { value: "no point" }, coord: { value: "nonsense" } },
  ] } });
  assert.deepEqual(out, [{ qid: "Q1", label: "Kinkaku-ji", lat: 35.0394, lng: 135.7292 }]);
  assert.deepEqual(parseWikidataBindings(null), []);
});

test("WD3 classifying: no answers, no matching label, one cluster, two places too far apart", () => {
  const tokens = normalisedNameTokens("Kinkaku-ji", "Kyoto, Japan");
  assert.deepEqual(classifyWikidataCandidates(tokens, "Kyoto, Japan", []), { kind: "unresolved", reason: "no_results" });
  assert.deepEqual(classifyWikidataCandidates(tokens, "Kyoto, Japan", [{ qid: "Q9", label: "Ginkaku-ji", lat: 35.027, lng: 135.798 }]), { kind: "unresolved", reason: "no_match" });
  const resolved = classifyWikidataCandidates(tokens, "Kyoto, Japan", [{ qid: "Q1", label: "Kinkaku-ji", lat: 35.0394, lng: 135.7292 }]);
  assert.equal(resolved.kind, "resolved");
  const far = classifyWikidataCandidates(tokens, "Kyoto, Japan", [
    { qid: "Q1", label: "Kinkaku-ji", lat: 35.0394, lng: 135.7292 },
    { qid: "Q3", label: "Kinkaku-ji", lat: 34.9, lng: 135.9 },
  ]);
  assert.equal(far.kind, "ambiguous");
});

test("WD4 the pre-flight passes only when the region id reads its own English label", async () => {
  const entity = (label: string) => ({ entities: { [WIKIDATA_REGION.qid]: { labels: { en: { value: label } } } } });
  assert.deepEqual(await verifyWikidataRegion(okFetch(entity(WIKIDATA_REGION.enLabel)) as any), { ok: true, label: WIKIDATA_REGION.enLabel });
  assert.deepEqual(await verifyWikidataRegion(okFetch(entity("Kyoto")) as any), { ok: false, label: "Kyoto" });
  assert.deepEqual(await verifyWikidataRegion((async () => { throw new Error("down"); }) as any), { ok: false, label: null });
});

test("WD5 one item: the request names Traveloure; an item naming no place is not requested; no answer is unreachable", async () => {
  const seen: Array<{ url: string; headers: Record<string, string> }> = [];
  const r = await lookupItemWikidata(item("Kinkaku-ji", "Kinkaku-ji") as any, okFetch({ results: { bindings: [binding("Q1", "Kinkaku-ji", 135.7292, 35.0394)] } }, seen) as any);
  assert.equal(r.requested, true);
  assert.equal(r.outcome.kind, "resolved");
  assert.equal(seen.length, 1);
  assert.equal(seen[0].headers["User-Agent"], WIKIDATA_USER_AGENT);
  assert.match(WIKIDATA_USER_AGENT, /Traveloure/);

  let called = 0;
  const none = await lookupItemWikidata(item("Free time") as any, (async () => { called++; return { ok: true, status: 200, json: async () => ({}) }; }) as any);
  assert.equal(none.requested, false);
  assert.equal(called, 0);

  const down = await lookupItemWikidata(item("Kinkaku-ji", "Kinkaku-ji") as any, (async () => ({ ok: false, status: 500, json: async () => null })) as any);
  assert.deepEqual(down.outcome, { kind: "unreachable" });
});
