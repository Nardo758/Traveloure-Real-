/**
 * 9b-e — the item re-geocode lookup and classification (ledger `2026-10-17-9b-e-regeocode-dry-run`). Pure, with a
 * fake fetch: no request leaves the process.
 *
 *   RG1  one matching answer ⇒ resolved, with the distance from the stored point
 *   RG2  matching answers further than 150 m apart ⇒ ambiguous; within 150 m ⇒ resolved
 *   RG3  answers that do not name the item ⇒ unresolved (no_match); no answers ⇒ unresolved (no_results)
 *   RG4  an item that names no place is never requested
 *   RG5  a failed call ⇒ unreachable; the request sends the Traveloure user agent and never the stored point
 *   v2 (step 1b):
 *   RG6  normalisation: macrons, hyphens, joined forms and -ji/-dera/Temple variants read as one name
 *   RG7  an answer may match through display_name's first segment or any namedetails name
 *   RG8  a skipped activity title is looked up by its place phrase after at/in/to, matched on that phrase
 *   RG9  the viewbox hint comes from the spine by NAME (else the city's extent), bounded=0, never the stored point
 *   RG10 v2 sends accept-language=en and reports why an item stayed unresolved
 *
 * Run: npx tsx --test server/services/__tests__/item-osm-regeocode.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  ITEM_REGEOCODE_USER_AGENT,
  classifyRegeocodeHits,
  metresBetween,
  regeocodeItem,
  regeocodeQueryText,
  regeocodeItemV2,
  matchNormalisedName,
  normalisedNameTokens,
  placePhraseOf,
  spineViewbox,
  classifyRegeocodeHitsV2,
  type RegeocodeItem,
  type SpineNeighbourhood,
} from "../item-osm-regeocode.service";

const FUSHIMI: RegeocodeItem = {
  id: "item-1",
  title: "Visit Fushimi Inari Taisha",
  locationName: null,
  destination: "Kyoto",
  storedLat: 34.9671,
  storedLng: 135.7727,
};

const hit = (name: string, lat: number, lon: number) => ({ name, lat: String(lat), lon: String(lon), namedetails: { name } });

test("RG1: one matching answer is resolved, with metres from the stored point", () => {
  const out = classifyRegeocodeHits(FUSHIMI, [hit("Fushimi Inari Taisha", 34.9677, 135.7792)]);
  assert.equal(out.kind, "resolved");
  if (out.kind !== "resolved") return;
  assert.equal(out.matchedName, "Fushimi Inari Taisha");
  assert.equal(out.matches, 1);
  assert.equal(out.metresFromStored, metresBetween(34.9671, 135.7727, 34.9677, 135.7792));
});

test("RG2: far-apart matches are ambiguous; close matches are one place", () => {
  const far = classifyRegeocodeHits(FUSHIMI, [hit("Fushimi Inari Taisha", 34.9677, 135.7792), hit("Fushimi Inari Taisha", 35.1, 135.9)]);
  assert.equal(far.kind, "ambiguous");
  const near = classifyRegeocodeHits(FUSHIMI, [hit("Fushimi Inari Taisha", 34.9677, 135.7792), hit("Fushimi Inari Taisha", 34.9680, 135.7795)]);
  assert.equal(near.kind, "resolved");
  if (near.kind === "resolved") assert.equal(near.matches, 2);
});

test("RG3: answers that do not name the item, or no answers, are unresolved", () => {
  assert.deepEqual(classifyRegeocodeHits(FUSHIMI, [hit("Kiyomizu-dera", 34.9949, 135.785)]), { kind: "unresolved", reason: "no_match" });
  assert.deepEqual(classifyRegeocodeHits(FUSHIMI, []), { kind: "unresolved", reason: "no_results" });
});

test("RG4: an item that names no place is never requested", async () => {
  let calls = 0;
  const out = await regeocodeItem({ ...FUSHIMI, title: "Free time", locationName: null }, (async () => {
    calls += 1;
    return { ok: true, json: async () => [] };
  }) as any);
  assert.equal(out.requested, false);
  assert.equal(out.outcome.kind, "unresolved");
  assert.equal(calls, 0);
});

test("RG5: a failed call is unreachable; the request names Traveloure and never sends the stored point", async () => {
  const seen: Array<{ url: string; ua: string }> = [];
  const failing = await regeocodeItem(FUSHIMI, (async (url: string, init: any) => {
    seen.push({ url, ua: init.headers["User-Agent"] });
    return { ok: false, json: async () => [] };
  }) as any);
  assert.deepEqual(failing.outcome, { kind: "unreachable" });
  const thrown = await regeocodeItem(FUSHIMI, (async () => {
    throw new Error("ECONNRESET");
  }) as any);
  assert.deepEqual(thrown.outcome, { kind: "unreachable" });
  assert.equal(seen[0].ua, ITEM_REGEOCODE_USER_AGENT);
  assert.match(seen[0].ua, /Traveloure/);
  const q = new URL(seen[0].url).searchParams;
  assert.equal(q.get("q"), regeocodeQueryText(FUSHIMI));
  assert.ok(!seen[0].url.includes("34.9671") && !seen[0].url.includes("135.7727"), "the stored point is not a search input");
  assert.equal(q.get("limit"), "5");
});

const SPINE: SpineNeighbourhood[] = [
  { name: "Fushimi Inari", city: "Kyoto", centroidLat: 34.9671, centroidLng: 135.7727, radiusKm: 1.5 },
  { name: "Gion", city: "Kyoto", centroidLat: 35.0036, centroidLng: 135.7748, radiusKm: 1 },
  { name: "Arashiyama", city: "Kyoto", centroidLat: 35.0094, centroidLng: 135.668, radiusKm: 2 },
];

test("RG6: macrons, hyphens, joined forms and suffix variants read as one name", () => {
  const item = normalisedNameTokens("Kiyomizu-dera Temple", "Kyoto");
  assert.ok(matchNormalisedName("Kiyomizudera", item, "Kyoto"));
  assert.ok(matchNormalisedName("Kiyomizu-dera", item, "Kyoto"));
  const kinkaku = normalisedNameTokens("Kinkaku-ji (Golden Pavilion)", "Kyoto");
  assert.ok(matchNormalisedName("Kinkakuji", kinkaku, "Kyoto"));
  const nijo = normalisedNameTokens("Nijo Castle", "Kyoto");
  assert.ok(matchNormalisedName("Nijō Castle", nijo, "Kyoto"));
  const fushimi = normalisedNameTokens("Fushimi Inari Taisha", "Kyoto");
  assert.ok(matchNormalisedName("Fushimi Inari-taisha", fushimi, "Kyoto"));
  assert.ok(matchNormalisedName("Fushimiinari", fushimi, "Kyoto"));
  assert.ok(!matchNormalisedName("Kiyomizu-dera", fushimi, "Kyoto"), "a different place never matches");
  assert.deepEqual(Array.from(normalisedNameTokens("Mount Fuji", null)), ["mount", "fuji"], "a short word keeps its -ji");
});

test("RG7: display_name and other namedetails names count as the answer's name", () => {
  const item: RegeocodeItem = { ...FUSHIMI, title: "Visit Ginkaku-ji" };
  const tokens = normalisedNameTokens(item.title, "Kyoto");
  const viaDisplay = classifyRegeocodeHitsV2(item, tokens, [
    { name: "慈照寺", lat: "35.027", lon: "135.798", display_name: "Ginkakuji, Ginkakuji-cho, Sakyo Ward, Kyoto, Japan", namedetails: { name: "慈照寺" } },
  ]);
  assert.equal(viaDisplay.kind, "resolved");
  const viaAlt = classifyRegeocodeHitsV2(item, tokens, [
    { name: "慈照寺", lat: "35.027", lon: "135.798", namedetails: { name: "慈照寺", alt_name: "Ginkaku-ji" } },
  ]);
  assert.equal(viaAlt.kind, "resolved");
});

test("RG8: a skipped activity title is looked up by its place phrase", async () => {
  assert.equal(placePhraseOf("Morning walk at Fushimi Inari"), "Fushimi Inari");
  assert.equal(placePhraseOf("Evening stroll in Gion"), "Gion");
  assert.equal(placePhraseOf("Free time"), null);
  const seen: string[] = [];
  const item: RegeocodeItem = { ...FUSHIMI, title: "Morning walk at Fushimi Inari" };
  const r = await regeocodeItemV2(item, SPINE, (async (url: string) => {
    seen.push(url);
    return { ok: true, json: async () => [{ name: "Fushimi Inari-taisha", lat: "34.9677", lon: "135.7792", namedetails: {} }] };
  }) as any);
  assert.equal(r.v1Skip, "area_title");
  assert.equal(r.queryBasis, "place_phrase");
  assert.equal(new URL(seen[0]).searchParams.get("q"), "Fushimi Inari, Kyoto");
  assert.equal(r.outcome.kind, "resolved");
  const none = await regeocodeItemV2({ ...FUSHIMI, title: "Free time" }, SPINE, (async () => {
    throw new Error("must not be called");
  }) as any);
  assert.equal(none.requested, false);
  assert.deepEqual(none.outcome, { kind: "unresolved", reason: "no_place_phrase" });
});

test("RG9: the viewbox comes from the spine by name, else the city's extent, never the stored point", async () => {
  const named = spineViewbox(normalisedNameTokens("Fushimi Inari Taisha", "Kyoto"), "Kyoto", SPINE);
  assert.equal(named?.source, "neighbourhood");
  if (named) assert.ok(named.viewbox[0] < 135.7727 && named.viewbox[2] > 135.7727 && named.viewbox[1] > 34.9671 && named.viewbox[3] < 34.9671);
  const city = spineViewbox(normalisedNameTokens("Nishiki Market", "Kyoto"), "Kyoto, Japan", SPINE);
  assert.equal(city?.source, "city");
  if (city) assert.ok(city.viewbox[0] < 135.668 && city.viewbox[2] > 135.7748);
  assert.equal(spineViewbox(normalisedNameTokens("Nishiki Market", "Lisbon"), "Lisbon", SPINE), null);
  const seen: string[] = [];
  const offPoint: RegeocodeItem = { ...FUSHIMI, title: "Visit Nishiki Market", storedLat: 35.123456, storedLng: 135.654321 };
  await regeocodeItemV2(offPoint, SPINE, (async (url: string) => {
    seen.push(url);
    return { ok: true, json: async () => [] };
  }) as any);
  const q = new URL(seen[0]).searchParams;
  assert.equal(q.get("bounded"), "0");
  assert.ok(q.get("viewbox"));
  assert.ok(!seen[0].includes("35.12345") && !seen[0].includes("135.65432"), "the stored point is not a search input");
});

test("RG10: v2 sends accept-language=en and says why an item stayed unresolved", async () => {
  const seen: string[] = [];
  const r = await regeocodeItemV2(FUSHIMI, SPINE, (async (url: string, init: any) => {
    seen.push(url);
    assert.equal(init.headers["User-Agent"], ITEM_REGEOCODE_USER_AGENT);
    return { ok: true, json: async () => [{ name: "Kiyomizu-dera", lat: "34.99", lon: "135.78", namedetails: {} }] };
  }) as any);
  assert.equal(new URL(seen[0]).searchParams.get("accept-language"), "en");
  assert.deepEqual(r.outcome, { kind: "unresolved", reason: "no_match" });
  assert.equal(r.viewboxSource, "neighbourhood");
});
