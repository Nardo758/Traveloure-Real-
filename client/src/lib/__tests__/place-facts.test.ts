/**
 * The slip's fact line (ledger `2026-09-29-a5-draft-open-set`).
 *   L1  hours for the plan day's own weekday, with the server's provenance line and source link
 *   L2  no date ⇒ no hours line (a weekday is never guessed); price and dining basics still show
 *   L3  no facts ⇒ nothing
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { itemFactLine } from "../place-facts";

const base = { need: "stop.hours", origin: "places_api", sourceUrl: "https://maps.google.com/?cid=1", provenance: "Google Maps · checked 29 Sept 2026", stale: false, publishable: false } as const;
const hours = { ...base, factType: "hours", value: { weekdayDescriptions: ["Monday: 9:00 AM – 5:00 PM", "Tuesday: Closed"] } } as any;
const price = { ...base, factType: "price", value: { priceLevel: "PRICE_LEVEL_MODERATE" } } as any;
const dining = { ...base, need: "dining", factType: "dining_basics", value: { reservable: true, servesVegetarianFood: false } } as any;

test("L1: the day's weekday, with provenance", () => {
  // 2027-05-04 is a Tuesday.
  assert.deepEqual(itemFactLine([hours, price], "2027-05-04"), {
    text: "Tue: Closed · $$",
    provenance: "Google Maps · checked 29 Sept 2026",
    sourceUrl: "https://maps.google.com/?cid=1",
  });
});

test("L2: no date ⇒ no hours; other facts still show", () => {
  assert.equal(itemFactLine([hours, dining], null)!.text, "takes reservations");
  assert.equal(itemFactLine([hours], null), null);
});

test("L3: nothing", () => {
  assert.equal(itemFactLine(undefined, "2027-05-04"), null);
  assert.equal(itemFactLine([], "2027-05-04"), null);
});
