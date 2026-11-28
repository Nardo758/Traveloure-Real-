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
} from "../details";

test("[v31-actions] the board order, filtered to what the item offers", () => {
  const out = orderedActions(["share", "add", "officialSite", "save"]);
  console.log(`[v31-actions] ${out.join(",")}`);
  assert.deepEqual(out, ["add", "save", "share", "officialSite"]);
  assert.deepEqual(DETAILS_ACTION_ORDER, ["add", "ask", "book", "save", "share", "officialSite"]);
});

test("[v31-photos] an uncredited photo is not shown; ours needs no credit", () => {
  assert.equal(isPhotoUsable({ url: "https://x/1.jpg" }), false);
  assert.equal(isPhotoUsable({ url: "https://x/1.jpg", attribution: "A · CC BY 4.0 · Wikimedia Commons" }), true);
  assert.equal(isPhotoUsable({ url: "https://x/1.jpg", creditRequired: false }), true);
  assert.equal(isPhotoUsable({ url: "" }), false);
  const gallery = usablePhotos([
    { url: "u1", attribution: "credit" },
    { url: "u2" },
    { url: "u3", attribution: "credit" },
  ]);
  console.log(`[v31-photos] usable=${gallery.length}`);
  assert.deepEqual(gallery.map((p) => p.url), ["u1", "u3"]);
});

test("[v31-photos] at most eight, cover first", () => {
  const photos = Array.from({ length: 12 }, (_, i) => ({ url: `u${i}`, attribution: "credit" }));
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
