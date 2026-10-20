/**
 * LG-2 Asks 2 and 3 (ledger `2026-10-19-lg2-matcher-planner`): the matcher accepts only a feature whose OSM class fits a
 * visitable place, and the Wikidata planner searches the place phrase from the title. Pure, with fake fetches.
 *
 *   MP1 Nanzen-ji: a neighbourhood answer that names the item never resolves; the temple does
 *   MP2 Tenryu-ji: an administrative area that names the item never resolves (not_a_place)
 *   MP3 Nijō Castle: Horikawa Street segments never resolve the castle; the castle answer does
 *   MP4 Sannenzaka resolves to its own pedestrian street; two same-name segments are ambiguous, never resolved
 *   MP5 the class list: visitable classes are places; boundary/place/road classes are refused; no class reads the name
 *   MP6 "Kyoto Dawn Temple Private Tour" never searches "Kyoto, Japan" (since Ask 5 it is not looked up at all); the
 *       title's place phrase is searched, never the location fallback; a phrase naming nothing is skipped
 *   MP7 the location field is a Nominatim search only when it names a place of its own
 *
 * NEGATIVE SPACE (§18d): no request leaves the process; the class list cannot know every OSM tag (an unlisted class
 * is refused — an unlocated stop, never a guess).
 *
 * Run: npx tsx --test server/services/__tests__/lg2-matcher-planner.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { osmFeatureKind } from "@shared/osm-place-kind";
import {
  classifyRegeocodeHitsV2,
  locationNamesAPlace,
  normalisedNameTokens,
  v2QueryPlan,
  type RegeocodeItem,
} from "../item-osm-regeocode.service";
import { lookupItemWikidata } from "../item-wikidata-lookup.service";

const item = (title: string, locationName: string | null = null): RegeocodeItem => ({
  id: "i1",
  title,
  locationName,
  destination: "Kyoto, Japan",
  storedLat: null,
  storedLng: null,
});
const hit = (name: string, lat: number, lon: number, category: string | null, type: string | null, osmId: number, en?: string) => ({
  name,
  lat: String(lat),
  lon: String(lon),
  category,
  type,
  osm_type: "way",
  osm_id: osmId,
  namedetails: en ? { name, "name:en": en } : { name },
});
const tokensOf = (i: RegeocodeItem) => {
  const plan = v2QueryPlan(i);
  assert.equal(plan.skip, null);
  return plan.skip === null ? plan.itemTokens : new Set<string>();
};

test("MP1 Nanzen-ji: a neighbourhood that names the item never resolves; the temple does", () => {
  const i = item("Nanzen-ji Temple");
  const quarter = hit("南禅寺福地町", 35.0105, 135.7905, "place", "quarter", 1, "Nanzen-ji");
  const onlyQuarter = classifyRegeocodeHitsV2(i, tokensOf(i), [quarter]);
  assert.deepEqual(onlyQuarter, { kind: "unresolved", reason: "not_a_place" });
  const withTemple = classifyRegeocodeHitsV2(i, tokensOf(i), [quarter, hit("南禅寺", 35.0113, 135.7937, "amenity", "place_of_worship", 2, "Nanzen-ji")]);
  assert.equal(withTemple.kind, "resolved");
  if (withTemple.kind === "resolved") assert.equal(withTemple.osmId, 2);
});

test("MP2 Tenryu-ji: an administrative area that names the item never resolves", () => {
  const i = item("Tenryu-ji");
  const area = hit("嵯峨天龍寺", 35.016, 135.672, "boundary", "administrative", 3, "Tenryu-ji");
  const ward = hit("Tenryu-ji", 35.016, 135.672, "place", "neighbourhood", 4);
  assert.deepEqual(classifyRegeocodeHitsV2(i, tokensOf(i), [area, ward]), { kind: "unresolved", reason: "not_a_place" });
  const temple = classifyRegeocodeHitsV2(i, tokensOf(i), [area, hit("天龍寺", 35.0158, 135.6737, "amenity", "place_of_worship", 5, "Tenryū-ji")]);
  assert.equal(temple.kind, "resolved");
});

test("MP3 Nijō Castle: Horikawa Street segments never resolve the castle", () => {
  const i = item("Nijo Castle", "Horikawa Street");
  const segments = [0, 1, 2, 3, 4].map((k) => hit("Horikawa Street", 35.01 + k * 0.004, 135.751, "highway", "secondary", 10 + k));
  assert.deepEqual(classifyRegeocodeHitsV2(i, tokensOf(i), segments), { kind: "unresolved", reason: "not_a_place" });
  // a pedestrian way named Horikawa is still not the castle: the item names more than the street
  const walkway = hit("Horikawa Street", 35.012, 135.751, "highway", "pedestrian", 20);
  assert.deepEqual(classifyRegeocodeHitsV2(i, tokensOf(i), [walkway]), { kind: "unresolved", reason: "not_a_place" });
  const castle = classifyRegeocodeHitsV2(i, tokensOf(i), [...segments, hit("二条城", 35.0142, 135.7481, "historic", "castle", 30, "Nijō Castle")]);
  assert.equal(castle.kind, "resolved");
  if (castle.kind === "resolved") assert.equal(castle.osmId, 30);
});

test("MP4 Sannenzaka resolves to its street; two same-name segments are ambiguous", () => {
  const i = item("Sannenzaka");
  const one = classifyRegeocodeHitsV2(i, tokensOf(i), [hit("三年坂", 34.9965, 135.7808, "highway", "pedestrian", 40, "Sannenzaka")]);
  assert.equal(one.kind, "resolved");
  const two = classifyRegeocodeHitsV2(i, tokensOf(i), [
    hit("三年坂", 34.9965, 135.7808, "highway", "pedestrian", 40, "Sannenzaka"),
    hit("三年坂", 34.9968, 135.7811, "highway", "steps", 41, "Sannenzaka"),
  ]);
  assert.equal(two.kind, "ambiguous", "same-name segments within the cluster radius are still ambiguous");
  // a car road named for the item is refused: only a pedestrian way is a street candidate
  assert.deepEqual(classifyRegeocodeHitsV2(i, tokensOf(i), [hit("Sannenzaka", 34.9965, 135.7808, "highway", "tertiary", 42)]), {
    kind: "unresolved",
    reason: "not_a_place",
  });
});

test("MP5 the class list", () => {
  for (const [c, t] of [["tourism", "attraction"], ["amenity", "place_of_worship"], ["historic", "castle"], ["leisure", "park"], ["natural", "peak"], ["building", "temple"], ["landuse", "religious"], ["railway", "station"], ["public_transport", "station"], ["shop", "confectionery"]]) {
    assert.equal(osmFeatureKind(c, t), "place", `${c}=${t}`);
  }
  for (const [c, t] of [["boundary", "administrative"], ["place", "quarter"], ["place", "neighbourhood"], ["highway", "secondary"], ["highway", "residential"], ["shop", "clothes"], ["building", "yes"], ["office", "company"]]) {
    assert.equal(osmFeatureKind(c, t), null, `${c}=${t}`);
  }
  assert.equal(osmFeatureKind("highway", "pedestrian"), "street");
  assert.equal(osmFeatureKind(null, null), "unstated");
  // a class-less answer is read from its name: a ward suffix never resolves
  const i = item("Higashiyama");
  const r = classifyRegeocodeHitsV2(i, normalisedNameTokens("Higashiyama", "Kyoto"), [{ name: "Higashiyama-ku", lat: "35.0", lon: "135.78" }]);
  assert.notEqual(r.kind, "resolved");
});

test("MP6 Wikidata searches the title's place phrase, never the location fallback", async () => {
  const seen: string[] = [];
  const fetchImpl = (async (url: string) => {
    seen.push(decodeURIComponent(new URL(url).searchParams.get("query") ?? ""));
    return { ok: true, status: 200, json: async () => ({ results: { bindings: [] } }) };
  }) as any;
  // The pin title never searches "Kyoto, Japan". Since Ask 5 a private tour is not looked up at all (it routes from a
  // meeting point or the stay), so it searches nothing.
  const tour = await lookupItemWikidata(item("Kyoto Dawn Temple Private Tour", "Kyoto, Japan"), fetchImpl);
  assert.notEqual(tour.search, "Kyoto, Japan");
  assert.equal(tour.requested, false);
  // The same title without the tour: the title's place phrase, never the location fallback.
  const r = await lookupItemWikidata(item("Kyoto Dawn Temple", "Kyoto, Japan"), fetchImpl);
  assert.equal(r.requested, true);
  assert.notEqual(r.search, "Kyoto, Japan");
  assert.ok(!seen.some((q) => q.includes('mwapi:search "Kyoto, Japan"')), "the fallback city text is never the search");
  assert.match(r.search ?? "", /Dawn/);
  // a title whose phrase names nothing beyond the city is skipped with its reason, never searched
  let called = 0;
  const none = await lookupItemWikidata(item("Kyoto Private Tour", "Kyoto, Japan"), (async () => {
    called++;
    return { ok: true, status: 200, json: async () => ({}) };
  }) as any);
  assert.equal(none.requested, false);
  assert.equal(called, 0);
});

test("MP7 the location field is a Nominatim search only when it names a place", () => {
  assert.equal(locationNamesAPlace("Kyoto, Japan", "Kyoto, Japan"), false);
  assert.equal(locationNamesAPlace("Accommodation in Central Kyoto", "Kyoto, Japan"), false);
  assert.equal(locationNamesAPlace("Kinkaku-ji", "Kyoto, Japan"), true);
  const plan = v2QueryPlan(item("Kyoto Dawn Temple", "Kyoto, Japan"));
  assert.equal(plan.skip, null);
  if (plan.skip === null) {
    assert.equal(plan.place, "Kyoto Dawn Temple");
    assert.ok(!plan.itemTokens.has("japan"));
  }
  const named = v2QueryPlan(item("Golden Pavilion", "Kinkaku-ji"));
  if (named.skip === null) assert.equal(named.place, "Kinkaku-ji");
});
