/**
 * LG-2 Ask 9 (ledger `2026-10-18-lg2-banned-phrases`): the banned-phrase rules, pinned on the two production Gion titles.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { containsBannedCopy, dropBannedSentences, rewordBannedTitle } from "../banned-copy";

test("BC1 the two Gion titles become Gion District Walk", () => {
  assert.equal(rewordBannedTitle("Gion District Walking & Geisha Spotting"), "Gion District Walk");
  assert.equal(rewordBannedTitle("Gion District Stroll & Geisha Spotting"), "Gion District Walk");
  assert.equal(rewordBannedTitle("Geisha Spotting in Gion"), "Gion District Walk");
  assert.equal(rewordBannedTitle("geisha-spotting", "Gion, Kyoto"), "Gion District Walk", "the place from the item's place name");
});

test("BC2 'geisha spotting' is the phrase; the word geisha alone is not banned", () => {
  assert.equal(containsBannedCopy("Geisha Spotting"), true);
  assert.equal(containsBannedCopy("Maiko and geisha performance at Gion Corner"), false);
  assert.equal(rewordBannedTitle("Gion Corner geisha dance"), "Gion Corner geisha dance");
});

test("BC3 the removed phrases come out and the title is tidied; Trending becomes In season", () => {
  assert.equal(rewordBannedTitle("Hidden Gems of Kyoto"), "Kyoto");
  assert.equal(rewordBannedTitle("Secret Garden Tour"), "Garden Tour");
  assert.equal(rewordBannedTitle("Insider's Guide to Nishiki Market"), "Guide to Nishiki Market");
  assert.equal(rewordBannedTitle("Tea Ceremony — No Hidden Fees"), "Tea Ceremony");
  assert.equal(rewordBannedTitle("Kimono Rental (No Markup)"), "Kimono Rental");
  for (const w of ["Vetted", "Verified", "Certified", "Licensed", "Authenticated"]) {
    assert.equal(rewordBannedTitle(`${w} Tea Ceremony`), "Tea Ceremony", w);
  }
  assert.equal(rewordBannedTitle("Trending Ramen Spots"), "In season Ramen Spots");
  assert.equal(rewordBannedTitle("Fushimi Inari Shrine"), "Fushimi Inari Shrine", "an untouched title is unchanged");
});

test("BC4 a title left with nothing: the place name alone, else null (regeneration) — never a placeholder", () => {
  assert.equal(rewordBannedTitle("Hidden Gem", "Arashiyama, Kyoto"), "Arashiyama");
  assert.equal(rewordBannedTitle("Hidden Gem", null), null);
  assert.equal(rewordBannedTitle("Geisha Spotting", ""), null);
});

test("BC5 a description sentence carrying a banned phrase is dropped", () => {
  assert.equal(
    dropBannedSentences("A lovely walk. A hidden gem locals love. No markup on tickets! Our verified guide meets you. Bring cash."),
    "A lovely walk. Bring cash.",
  );
  assert.equal(dropBannedSentences("Nothing to change here."), "Nothing to change here.");
});
