/**
 * The expert door's pure rules (ledger `2026-09-29-expert-door`).
 *   E1  levels map to tiers through the one key→tier map; AMA belongs to "question" only
 *   E2  the band is the real range of published prices; quote-only ⇒ "By quote"; none ⇒ no number
 *   E3  the picker keeps only experts who pass the gate AND list the level, with only those listings
 *   E4  the empty-state sentence names the city and never says "0"
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bandFor, bandLabel, levelTier, noExpertLine, offeringKeyMatchesLevel, selectPickerExperts } from "../expert-door";

test("E1: levels map to tiers; AMA is the question level only", () => {
  assert.equal(offeringKeyMatchesLevel("itinerary_2nd_opinion", "check"), true);
  assert.equal(offeringKeyMatchesLevel("ask_me_anything", "check"), false);
  assert.equal(offeringKeyMatchesLevel("ask_me_anything", "question"), true);
  assert.equal(offeringKeyMatchesLevel("full_itinerary", "plan"), true);
  assert.equal(offeringKeyMatchesLevel("full_itinerary", "check"), false);
  assert.equal(offeringKeyMatchesLevel("done_for_you_booking", "handle"), true);
  assert.equal(offeringKeyMatchesLevel(null, "check"), false, "a listing that never named its offering admits nothing");
  assert.equal(offeringKeyMatchesLevel("not_a_key", "plan"), false);
  assert.equal(levelTier("check"), "advisory");
  assert.equal(levelTier("question"), "ask_me_anything");
});

test("E2: the band is published prices only", () => {
  assert.deepEqual(bandFor([{ price: "80" }, { price: "240.00" }, { price: null }]), { kind: "range", min: 80, max: 240 });
  assert.equal(bandLabel(bandFor([{ price: "80" }, { price: "240" }])), "$80–$240");
  assert.equal(bandLabel(bandFor([{ price: "120" }])), "$120");
  assert.equal(bandLabel(bandFor([{ price: null }, { price: "90", showPrice: false }])), "By quote");
  assert.equal(bandLabel(bandFor([])), null, "no listing, no number");
  assert.equal(bandLabel(bandFor([{ price: "0" }])), "By quote", "a zero is not a price");
});

test("E3: the picker keeps gated experts who list the level, with only the matching listings", async () => {
  const candidates = [
    { expertId: "gated-advisory", listings: [{ id: "a1", offeringTypeKey: "reality_check" }, { id: "a2", offeringTypeKey: "full_itinerary" }] },
    { expertId: "ungated-advisory", listings: [{ id: "b1", offeringTypeKey: "reality_check" }] },
    { expertId: "gated-planning-only", listings: [{ id: "c1", offeringTypeKey: "full_itinerary" }] },
    { expertId: "gated-unnamed", listings: [{ id: "d1", offeringTypeKey: null }] },
  ];
  const gated = new Set(["gated-advisory", "gated-planning-only", "gated-unnamed"]);
  const asked: string[] = [];
  const out = await selectPickerExperts(candidates, "check", async (id) => {
    asked.push(id);
    return gated.has(id);
  });
  assert.deepEqual(out, [{ expertId: "gated-advisory", listings: [{ id: "a1", offeringTypeKey: "reality_check" }] }]);
  assert.deepEqual(asked, ["gated-advisory", "ungated-advisory"], "the gate is asked only for experts who list the level");
  assert.deepEqual(await selectPickerExperts(candidates, "question", async () => true), []);
});

test("E4: the empty state names the city", () => {
  assert.equal(noExpertLine("Kyoto"), "No local expert offers this in Kyoto yet");
  assert.doesNotMatch(noExpertLine("Kyoto"), /\d/);
});
