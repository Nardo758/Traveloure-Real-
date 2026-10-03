/**
 * The slip's fact line (ledger `2026-09-29-a5-draft-open-set`).
 *   L1  hours for the plan day's own weekday, with the server's provenance line and source link
 *   L2  no date ⇒ no hours line (a weekday is never guessed); price and dining basics still show
 *   L3  no facts ⇒ nothing
 *   A1  address: the stored formattedAddress first, with the Maps attribution beside it
 *   A2  address: shortFormattedAddress when no formatted one was stored
 *   A3  address: no stored address ⇒ the draft's own text, with NO attribution
 *   A4  address: nothing at all ⇒ null
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { itemAddressLine, itemFactLine, pinLocationText } from "../place-facts";

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

const address = (value: Record<string, unknown>) => ({ ...base, factType: "address", value } as any);

test("A1: formatted first, attributed", () => {
  assert.deepEqual(itemAddressLine([hours, address({ formattedAddress: "1 Kinkakujicho, Kita Ward, Kyoto", shortFormattedAddress: "1 Kinkakujicho" })], "Kinkaku-ji"), {
    text: "1 Kinkakujicho, Kita Ward, Kyoto",
    provenance: "Google Maps · checked 29 Sept 2026",
    sourceUrl: "https://maps.google.com/?cid=1",
  });
});

test("A2: short when no formatted", () => {
  assert.equal(itemAddressLine([address({ shortFormattedAddress: "1 Kinkakujicho" })], "Kinkaku-ji")!.text, "1 Kinkakujicho");
});

test("A3: the draft's own text carries no attribution", () => {
  assert.deepEqual(itemAddressLine([hours, address({ formattedAddress: " " })], " Kita Ward "), { text: "Kita Ward", provenance: null, sourceUrl: null });
  assert.deepEqual(itemAddressLine(undefined, "Gion"), { text: "Gion", provenance: null, sourceUrl: null });
});

test("A4: nothing ⇒ null", () => {
  assert.equal(itemAddressLine([hours], null), null);
  assert.equal(itemAddressLine(undefined, "  "), null);
});

test("A5 (smoke 5): an unverified street address renders its ward/area only", () => {
  // The AI drafted "Philosopher's Path Walk" at a street that is not the path.
  const drafted = "Imadegawa-dori, Sakyo Ward, Kyoto 606-8306, Japan";
  const line = itemAddressLine(undefined, drafted, "ai")!;
  assert.equal(line.text, "Sakyo Ward, Kyoto, Japan");
  assert.equal(line.provenance, null);
  assert.doesNotMatch(line.text, /Imadegawa|dori|606/);
  assert.deepEqual(itemAddressLine(undefined, "2 Shishigatani Honenin-cho, Sakyo-ku, Kyoto", "ai"), { text: "Sakyo-ku, Kyoto", provenance: null, sourceUrl: null });
  assert.equal(itemAddressLine(undefined, "Imadegawa-dori", "ai"), null, "a bare street names no area");
  assert.equal(itemAddressLine(undefined, "123 Main Street", "ai"), null);
  assert.equal(itemAddressLine(undefined, "Philosopher's Path Walk, Sakyo Ward, Kyoto", "ai")!.text, "Sakyo Ward, Kyoto", "a venue name is not an area");
});

test("A6 (smoke 5): a street-level address renders only from a Google-checked fact", () => {
  const google = address({ formattedAddress: "Tetsugaku-no-michi, Sakyo Ward, Kyoto 606-8406" });
  assert.equal(itemAddressLine([google], "Imadegawa-dori, Sakyo Ward, Kyoto", "ai")!.text, "Tetsugaku-no-michi, Sakyo Ward, Kyoto 606-8406");
  // An address fact from any other origin is not Google-checked: the street is cut as for the draft.
  const crawled = { ...address({ formattedAddress: "Imadegawa-dori 12, Sakyo Ward, Kyoto" }), origin: "crawled", provenance: "Web page" };
  assert.deepEqual(itemAddressLine([crawled], "Imadegawa-dori, Sakyo Ward, Kyoto", "ai"), { text: "Sakyo Ward, Kyoto", provenance: null, sourceUrl: null });
});

test("A7 (smoke 5): words a person typed are theirs; the map pin follows the row's rule", () => {
  assert.equal(itemAddressLine(undefined, "12 Imadegawa-dori, Kyoto", "traveler")!.text, "12 Imadegawa-dori, Kyoto");
  assert.equal(itemAddressLine(undefined, "12 Imadegawa-dori, Kyoto", "expert")!.text, "12 Imadegawa-dori, Kyoto");
  assert.equal(pinLocationText("Imadegawa-dori, Sakyo Ward, Kyoto", "ai"), "Sakyo Ward, Kyoto");
  assert.equal(pinLocationText("12 Imadegawa-dori, Kyoto", "traveler"), "12 Imadegawa-dori, Kyoto");
});
