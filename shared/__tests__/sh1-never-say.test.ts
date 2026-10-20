/**
 * SH-1 item 1 and 3 (ledger `2026-10-19-sh1-banned-copy`).
 *
 *   NS1 the site never-say list (`SITE_NEVER_SAY`, the third export) catches every ruled phrase
 *   NS2 the two existing exports are unchanged: bare "geisha" is NOT a draft-rule hit, and the expert-hook list still
 *       catches what it caught
 *   NS3 the phrases the draft list already carries are taken from it, never retyped (same pattern source)
 *   LM1 `liveRailCities`: fewer than two live cities ⇒ nothing; otherwise only live cities, in the rows' own order
 *   LM2 a missing answer or unknown keys ⇒ nothing; a city that is not an operating market never counts
 *
 * Run: npx tsx --test shared/__tests__/sh1-never-say.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { SITE_NEVER_SAY, siteNeverSayHits, containsSiteNeverSay, containsBannedCopy, containsNeverSayCopy } from "../banned-copy";
import { liveRailCities, marketKeyForCityName, RAIL_MIN_LIVE_CITIES } from "../live-markets";

test("NS1 the site list catches every ruled phrase", () => {
  const cases: Array<[string, string]> = [
    ["A vetted guide", "vetted"],
    ["Verified reviews", "verified"],
    ["A certified master", "certified"],
    ["A licensed venue", "licensed"],
    ["Authenticated professionals", "authenticated"],
    ["Our hidden gems", "hidden gem(s)"],
    ["The secret garden", "secret"],
    ["Insider tips", "insider"],
    ["No hidden fees", "no hidden fees"],
    ["No markup", "no markup"],
    ["Trending now", "trending"],
    ["DESTINATION · JAPAN · TREND 100", "TREND <n>"],
    ["Geisha spotting in Gion", "geisha spotting"],
    ["Tea houses and geisha sightings", "geisha sightings"],
    ["Coming soon", "coming soon"],
    ["A geisha district", "geisha"],
    ["Meet a maiko", "maiko"],
  ];
  for (const [text, words] of cases) assert.ok(siteNeverSayHits(text).includes(words), `${text} ⇒ ${words}`);
  assert.equal(containsSiteNeverSay("A quiet lane near the river"), false);
  assert.equal(SITE_NEVER_SAY.length, 17);
});

test("NS2 the draft rule and the expert-hook list are unchanged", () => {
  assert.equal(containsBannedCopy("Evening show at a geisha district"), false, "bare geisha is not a draft-rule hit");
  assert.equal(containsBannedCopy("Geisha spotting in Gion"), true);
  assert.equal(containsBannedCopy("Coming soon"), false, "the draft rule never had coming soon");
  assert.equal(containsNeverSayCopy("Coming soon"), true, "the expert-hook list still has it");
  assert.equal(containsNeverSayCopy("A maiko"), false, "the expert-hook list never had maiko");
});

test("NS3 overlapping phrases come from the draft list", () => {
  const verified = SITE_NEVER_SAY.find((e) => e.words === "verified")!;
  assert.equal(verified.re.source, "\\bverified\\b");
  const gems = SITE_NEVER_SAY.find((e) => e.words === "hidden gem(s)")!;
  assert.equal(gems.re.source, "\\bhidden\\s+gems?\\b");
});

const rows = ["Kyoto", "Tokyo", "Porto", "Atlantis"].map((cityName) => ({ cityName }));

test("LM1 the rail needs two live cities, and keeps only live ones", () => {
  assert.equal(RAIL_MIN_LIVE_CITIES, 2);
  assert.deepEqual(liveRailCities(rows, ["kyoto"]), [], "one live city ⇒ nothing");
  assert.deepEqual(liveRailCities(rows, ["kyoto", "porto"]).map((r) => r.cityName), ["Kyoto", "Porto"]);
  assert.deepEqual(liveRailCities(rows, ["PORTO", " kyoto "]).map((r) => r.cityName), ["Kyoto", "Porto"], "the rows' own order");
});

test("LM2 no answer or unknown keys ⇒ nothing", () => {
  assert.deepEqual(liveRailCities(rows, null), []);
  assert.deepEqual(liveRailCities(rows, []), []);
  assert.deepEqual(liveRailCities(rows, ["atlantis", "narnia"]), []);
  assert.equal(marketKeyForCityName("Atlantis"), null);
  assert.equal(marketKeyForCityName(" kyoto "), "kyoto");
});
