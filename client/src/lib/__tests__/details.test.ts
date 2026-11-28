/**
 * V31 - the Details view's rules, once.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DETAILS_ACTION_ORDER,
  authoredByLine,
  descriptionState,
  isPhotoUsable,
  orderedActions,
  photoCounter,
  photoCreditLine,
  splitPinnedActions,
  usablePhotos,
  parseStoredCredit,
  paragraphs,
  detailsPlaceLine,
  galleryTiles,
} from "../details";

test("[v31-actions] the board order, filtered to what the item offers", () => {
  const out = orderedActions(["share", "add", "officialSite", "save"]);
  console.log(`[v31-actions] ${out.join(",")}`);
  assert.deepEqual(out, ["add", "save", "share", "officialSite"]);
  assert.deepEqual(DETAILS_ACTION_ORDER, ["add", "ask", "book", "save", "share", "officialSite"]);
});

test("[v31-photos] an uncredited photo is not shown; ours needs no credit", () => {
  assert.equal(isPhotoUsable({ url: "https://x/1.jpg" }), false);
  assert.equal(isPhotoUsable({ url: "https://x/1.jpg", author: "A", source: "Wikimedia Commons", licence: "CC BY 4.0" }), true);
  assert.equal(isPhotoUsable({ url: "https://x/1.jpg", creditRequired: false }), true);
  assert.equal(isPhotoUsable({ url: "" }), false);
  const gallery = usablePhotos([
    { url: "u1", author: "A", licence: "CC BY-SA 4.0" },
    { url: "u2" },
    { url: "u3", author: "B", licence: "CC BY 4.0" },
  ]);
  console.log(`[v31-photos] usable=${gallery.length}`);
  assert.deepEqual(gallery.map((p) => p.url), ["u1", "u3"]);
});

test("[v31-photos] at most eight, cover first", () => {
  const photos = Array.from({ length: 12 }, (_, i) => ({ url: `u${i}`, author: "A", licence: "CC BY-SA 4.0" }));
  const gallery = usablePhotos(photos);
  console.log(`[v31-photos] capped=${gallery.length} first=${gallery[0].url}`);
  assert.equal(gallery.length, 8);
  assert.equal(gallery[0].url, "u0");
});

test("[v31-text] D1 bands: 240 full, 120 short, below none", () => {
  assert.equal(descriptionState("x".repeat(240)), "full");
  assert.equal(descriptionState("x".repeat(120)), "short");
  assert.equal(descriptionState("x".repeat(119)), "none");
  assert.equal(descriptionState(null), "none");
  console.log("[v31-text] bands ok");
});

test("[v31-counter] n of m, and two pinned actions on the phone", () => {
  assert.equal(photoCounter(0, 5), "1 of 5");
  assert.equal(photoCounter(4, 5), "5 of 5");
  const split = splitPinnedActions(orderedActions(["add", "ask", "save", "share"]));
  console.log(`[v31-counter] pinned=${split.pinned.join(",")} more=${split.more.join(",")}`);
  assert.deepEqual(split.pinned, ["add", "ask"]);
  assert.deepEqual(split.more, ["save", "share"]);
});

test("[v31-credit] the credit line carries only what the record has", () => {
  assert.equal(
    photoCreditLine({ url: "u", source: "Wikimedia Commons", licence: "CC BY-SA 4.0", checkedAt: "2026-11-12T00:00:00Z" }),
    "Photo: Wikimedia Commons \u00b7 CC BY-SA 4.0 \u00b7 checked 12 Nov",
  );
  assert.equal(photoCreditLine({ url: "u", source: "Official site" }), "Photo: Official site");
  assert.equal(photoCreditLine(null), "");
});

test("[v31-byline] the expert line, or nothing at all", () => {
  assert.equal(
    authoredByLine({ name: "Aiko", city: "Kyoto" }, "2026-11-12T00:00:00Z"),
    "Written by Aiko, Kyoto local expert \u00b7 reviewed 12 Nov",
  );
  assert.equal(authoredByLine({ name: "Aiko", city: null }), "Written by Aiko");
  assert.equal(authoredByLine(null), "");
});

test("[v31-credit] a credit needs an author AND a licence", () => {
  console.log(`[v31-credit] author_only=${isPhotoUsable({ url: "u", author: "Wikimedia Commons" })}`);
  assert.equal(isPhotoUsable({ url: "u", author: "Wikimedia Commons" }), false);
  assert.equal(isPhotoUsable({ url: "u", licence: "CC BY-SA 4.0" }), false);
  assert.equal(isPhotoUsable({ url: "u", author: "A", licence: "CC BY-SA 4.0" }), true);
  assert.equal(isPhotoUsable({ url: "u", author: "https://x/y", licence: "CC BY-SA 4.0" }), false);
});

test("[v31-credit] parseStoredCredit returns labels, never a URL", () => {
  const parsed = parseStoredCredit(
    "Aiko Tanaka. Source: https://commons.wikimedia.org/wiki/File:x.jpg License: https://creativecommons.org/licenses/by-sa/4.0/",
  );
  console.log(`[v31-credit] parsed=${JSON.stringify(parsed)}`);
  assert.deepEqual(parsed, { author: "Aiko Tanaka", source: "Wikimedia Commons", licence: "CC BY-SA 4.0" });
  assert.equal(parseStoredCredit("Source: https://commons.wikimedia.org/wiki/File:x.jpg"), null);
  assert.equal(parseStoredCredit(null), null);
});

test("[v31-text] paragraphs: one block per paragraph", () => {
  const blocks = paragraphs("First line.\n\nSecond paragraph here.\n\n\nThird.");
  console.log(`[v31-text] blocks=${blocks.length}`);
  assert.deepEqual(blocks, ["First line.", "Second paragraph here.", "Third."]);
});

test("[v31-place] TYPE · NEIGHBOURHOOD, CITY with missing parts dropped", () => {
  assert.equal(detailsPlaceLine("Temple", "Higashiyama", "Kyoto"), "Temple · Higashiyama, Kyoto");
  assert.equal(detailsPlaceLine("Temple", null, "Kyoto"), "Temple · Kyoto");
  assert.equal(detailsPlaceLine(null, "Higashiyama", "Kyoto"), "Higashiyama, Kyoto");
  assert.equal(detailsPlaceLine(null, null, null), "");
  console.log("[v31-place] separators never dangle");
});

test("[v31-gallery] one large, two thumbnails, the rest counted", () => {
  const five = galleryTiles(Array.from({ length: 5 }, (_, i) => ({ url: `u${i}`, creditRequired: false })));
  const eight = galleryTiles(Array.from({ length: 8 }, (_, i) => ({ url: `u${i}`, creditRequired: false })));
  console.log(`[v31-gallery] five=+${five.more} eight=+${eight.more}`);
  assert.equal(five.thumbs.length, 2);
  assert.equal(five.more, 2);
  assert.equal(eight.more, 5);
});
