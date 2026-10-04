/**
 * The slip's item lines (ledger `2026-09-29-a5-draft-open-set`; surface spec v1.2 §3, step 1 —
 * ledger `2026-10-03-surface-step1-item-row`).
 *   F1  the facts line, VERBATIM: "<Wkd> · <hours> · Google Maps · checked <d Mon>"
 *   F2  no plan date ⇒ no facts line (a weekday is never guessed); no hours fact ⇒ none
 *   F3  a stale fact says so; no checkedAt ⇒ the provenance line's own date, else no "checked" segment
 *   P1  place line: a Google-checked address shows its WARD/AREA with the Maps attribution
 *   P2  place line (R-ab): otherwise the location AS STORED, whoever wrote it — no client rewrite
 *   P3  place line: nothing stored and no Google fact ⇒ null
 *   (P4 retired by smoke 10 S10-8: day headers name no area at all.)
 *   U1  unverifiedAreaText (the ward/area cut the map pin and P1 share) keeps areas, drops streets
 *   M1  the map pin still cuts AI text to its ward/area
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { factCheckedLabel, itemFactsLine, itemPlaceLine, pinLocationText, unverifiedAreaText } from "../place-facts";

const base = { need: "stop.hours", origin: "places_api", sourceUrl: "https://maps.google.com/?cid=1", provenance: "Google Maps · checked 2 Oct 2026", stale: false, publishable: false, checkedAt: "2026-10-02T08:00:00.000Z" } as const;
const hours = { ...base, factType: "hours", value: { weekdayDescriptions: ["Monday: 9:00 AM – 5:00 PM", "Wednesday: Open 24 hours"] } } as any;
const address = (value: Record<string, unknown>, origin = "places_api") => ({ ...base, need: "stop.address", factType: "address", origin, value }) as any;

test("F1: the facts line verbatim", () => {
  assert.deepEqual(itemFactsLine([hours], "2026-11-11"), { text: "Wed · Open 24 hours · Google Maps · checked 2 Oct", sourceUrl: base.sourceUrl });
  assert.equal(itemFactsLine([hours], "2026-11-09")!.text, "Mon · 9:00 AM – 5:00 PM · Google Maps · checked 2 Oct");
  assert.equal(factCheckedLabel("2026-10-02T23:59:00.000Z"), "2 Oct");
});

test("F2: no date, no weekday; no hours fact, no line", () => {
  assert.equal(itemFactsLine([hours], null), null);
  assert.equal(itemFactsLine([hours], "2026-11-10"), null, "Tuesday is not in the stored hours — nothing guessed");
  assert.equal(itemFactsLine(undefined, "2026-11-11"), null);
  assert.equal(itemFactsLine([address({ formattedAddress: "x" })], "2026-11-11"), null);
});

test("F3: stale and unknown-checked facts", () => {
  assert.equal(itemFactsLine([{ ...hours, stale: true }], "2026-11-11")!.text, "Wed · Open 24 hours · Google Maps · checked 2 Oct (may have changed)");
  // No `checkedAt` on the wire (an older build's payload) ⇒ the date the server's provenance line states.
  assert.equal(itemFactsLine([{ ...hours, checkedAt: null }], "2026-11-11")!.text, "Wed · Open 24 hours · Google Maps · checked 2 Oct");
  assert.equal(itemFactsLine([{ ...hours, checkedAt: null, provenance: "Google Maps · checked 30 Sept 2026" }], "2026-11-11")!.text, "Wed · Open 24 hours · Google Maps · checked 30 Sep");
  assert.equal(itemFactsLine([{ ...hours, checkedAt: null, provenance: "Google Maps" }], "2026-11-11")!.text, "Wed · Open 24 hours · Google Maps");
  assert.equal(factCheckedLabel("not a date"), null);
});

test("P1: a Google-checked address shows its ward/area (from addressComponents), attributed", () => {
  const line = itemPlaceLine([address({ formattedAddress: "1 Kinkakujicho, Kita Ward, Kyoto", area: "Kita Ward, Kyoto" })], { location: "anything" });
  assert.deepEqual({ ...line, checked: undefined }, { text: "Kita Ward, Kyoto", provenance: "Google Maps", checked: undefined, sourceUrl: base.sourceUrl });
  assert.ok(line!.checked, "S10-9: the place line carries its checked day, like the facts line");
  // Smoke 8 item 2: never parsed from the formatted string — a fact with no component-derived area
  // falls through to the item's own location, even when the formatted address looks parseable.
  assert.deepEqual(itemPlaceLine([address({ formattedAddress: "1 Kinkakujicho, Kita Ward, Kyoto" })], { location: "Kinkaku-ji" }), {
    text: "Kinkaku-ji",
    provenance: null,
    checked: null,
    sourceUrl: null,
  });
  assert.equal(
    itemPlaceLine([address({ formattedAddress: "日本、〒616-8385 京都府京都市右京区嵯峨天龍寺芒ノ馬場町６８" })], { location: "" }),
    null,
  );
});

test("P2: otherwise the location as stored (R-ab — sanitising is a storage rule, R-w)", () => {
  assert.deepEqual(itemPlaceLine(undefined, { location: "Gion" }), { text: "Gion", provenance: null, checked: null, sourceUrl: null });
  assert.equal(itemPlaceLine([address({ formattedAddress: "x" }, "crawled")], { location: "12 Imadegawa-dori, Kyoto" })!.text, "12 Imadegawa-dori, Kyoto", "a non-Google address fact is not used");
});

test("P3: nothing ⇒ null (smoke 6 'Uji Green Tea Experience' — no location)", () => {
  assert.equal(itemPlaceLine(undefined, { location: "" }), null);
  assert.equal(itemPlaceLine([hours], { location: "  " }), null);
});

test("U1: unverifiedAreaText keeps areas, drops streets and venues", () => {
  assert.equal(unverifiedAreaText("2 Shishigatani Honenin-cho, Sakyo-ku, Kyoto"), "Sakyo-ku, Kyoto");
  assert.equal(unverifiedAreaText("Imadegawa-dori"), null);
  assert.equal(unverifiedAreaText("Philosopher's Path Walk, Sakyo Ward, Kyoto"), "Sakyo Ward, Kyoto");
});

test("M1: the map pin keeps its AI ward/area cut", () => {
  assert.equal(pinLocationText("Imadegawa-dori, Sakyo Ward, Kyoto", "ai"), "Sakyo Ward, Kyoto");
  assert.equal(pinLocationText("12 Imadegawa-dori, Kyoto", "traveler"), "12 Imadegawa-dori, Kyoto");
});
