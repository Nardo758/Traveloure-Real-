/**
 * Smoke test 4 (production build 71e01ec, plan d3a29ec0) — the draft's facts and copy
 * (ledger `2026-10-02-smoke4-draft-fixes`).
 *
 *   P2a the named-place matcher resolves "Fushimi Inari Taisha Alternative: Kiyomizu-dera Temple"
 *       against the place AFTER "Alternative:" — Fushimi Inari's answer is refused, Kiyomizu-dera's
 *       attaches, and the lookup searches for Kiyomizu-dera only
 *   P2b a title with no alternative clause is unchanged
 *   H1  a "Draft without a hotel" prompt says there is no hotel
 *   H2  "Check-in & Hotel Orientation" (day 1) becomes the arrival and "Return to Hotel & Checkout"
 *       (last day) the departure, with no hotel wording; other items are untouched
 *   H3  a hotel item on a middle day is dropped; a repeated arrival is not duplicated
 *   H4  the open-set and held-slot prompts are unchanged
 *
 * Run: npx tsx --test shared/__tests__/smoke4-draft-facts.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hasAlternativeClause,
  matchNamesItem,
  namedPlaceTokens,
  placeLookupText,
  visitedPlaceTitle,
} from "../place-name-gate";
import {
  NO_HOTEL_PROMPT_LINE,
  draftBasisPromptBlock,
  isHotelItemTitle,
  withoutHotelWording,
} from "../draft-basis";

const SMOKE_TITLE = "Fushimi Inari Taisha Alternative: Kiyomizu-dera Temple";

test("P2a the item resolves against the place after 'Alternative:'", () => {
  assert.equal(hasAlternativeClause(SMOKE_TITLE), true);
  assert.equal(visitedPlaceTitle(SMOKE_TITLE), "Kiyomizu-dera Temple");
  assert.equal(placeLookupText(SMOKE_TITLE), "Kiyomizu-dera Temple");
  // A location field naming the other place is not read for a two-place title.
  const tokens = namedPlaceTokens({ title: SMOKE_TITLE, locationName: "Fushimi Inari Taisha" }, "Kyoto");
  assert.deepEqual([...tokens].sort(), ["dera", "kiyomizu"]);
  assert.equal(matchNamesItem("Fushimi Inari Taisha", tokens, "Kyoto"), false, "Fushimi Inari's facts never attach");
  assert.equal(matchNamesItem("Kiyomizu-dera", tokens, "Kyoto"), true, "Kiyomizu-dera's facts attach");
});

test("P2b a title without an alternative clause is unchanged", () => {
  assert.equal(visitedPlaceTitle("Fushimi Inari Taisha"), "Fushimi Inari Taisha");
  assert.equal(hasAlternativeClause("Alternatively, a walk"), false);
  assert.equal(visitedPlaceTitle("Gion Alternative:"), "Gion Alternative:", "nothing after the marker ⇒ the whole title (§13)");
  const tokens = namedPlaceTokens({ title: "Fushimi Inari Taisha", locationName: "Fushimi" }, "Kyoto");
  assert.equal(matchNamesItem("Fushimi Inari Taisha", tokens, "Kyoto"), true);
});

test("H1 a draft without a hotel is told so", () => {
  const block = draftBasisPromptBlock({ kind: "none_asked" }, []);
  assert.match(block, /PLANNING CONSTRAINTS/);
  assert.ok(block.includes(NO_HOTEL_PROMPT_LINE));
});

test("H2 day 1's hotel item is the arrival and the last day's the departure, with no hotel wording", () => {
  const items = [
    { dayNumber: 1, title: "Check-in & Hotel Orientation", description: "Settle into your hotel", location: "Hotel" },
    { dayNumber: 1, title: "Nishiki Market", description: "Lunch", location: "Nishiki" },
    { dayNumber: 5, title: "Kinkaku-ji", description: null, location: null },
    { dayNumber: 5, title: "Return to Hotel & Checkout", description: "Pack and check out", location: "Hotel" },
  ];
  const out = withoutHotelWording(items, 5, "Kyoto");
  assert.deepEqual(out.map((i) => i.title), ["Arrival in Kyoto", "Nishiki Market", "Kinkaku-ji", "Departure from Kyoto"]);
  for (const i of out) {
    assert.doesNotMatch(`${i.title} ${i.description ?? ""} ${i.location ?? ""}`, /hotel|check-?in|check-?out/i);
  }
  assert.equal(out[1], items[1], "an item with no hotel wording is passed through untouched");
});

test("H3 a middle-day hotel item is dropped; arrivals are not repeated", () => {
  const out = withoutHotelWording(
    [
      { dayNumber: 1, title: "Hotel check-in" },
      { dayNumber: 1, title: "Check in and freshen up" },
      { dayNumber: 3, title: "Rest at the hotel" },
      { dayNumber: 3, title: "Philosopher's Path" },
    ],
    5,
    "Kyoto",
  );
  assert.deepEqual(out.map((i) => i.title), ["Arrival in Kyoto", "Philosopher's Path"]);
  assert.equal(isHotelItemTitle("Dinner at Hotel Granvia"), false, "a named venue in a hotel is not a hotel item");
});

test("H4 the other prompts are unchanged", () => {
  assert.equal(draftBasisPromptBlock({ kind: "not_anchored" }, []), "");
  assert.doesNotMatch(draftBasisPromptBlock({ kind: "open_anchor_set", setId: "s", builtAround: [], ranked: false }, []), /not chosen a place/);
});
