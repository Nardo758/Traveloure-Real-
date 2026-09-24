/**
 * The Discover cover photo and its credit are one decision — board task #437, ledger
 * `2026-09-23-phase2-honesty`. Pure.
 *
 *   C1  The top-scored gem photo wins. On Unsplash's CDN it is credited to Unsplash (#438, ledger
 *       `2026-09-24-gem-photo-credit`); anywhere else it carries NO credit rather than a guessed one.
 *   C2  A curated fallback photo is credited to Unsplash itself: no photographer name was
 *       recorded, so none is invented.
 *   C3  A city with neither has no photo and no credit.
 *   C4  The Unsplash test reads the HOST, so a look-alike address is not credited to Unsplash.
 *
 * Run: npx tsx --test client/src/lib/__tests__/cover-photo.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { CURATED_HERO_CREDIT, CURATED_HERO_IMAGES, gemPhotoCredit, resolveCoverPhoto } from "../cover-photo";

test("C1: the top gem photo wins; an Unsplash CDN photo is credited to Unsplash, any other to no one", () => {
  const top = "https://images.unsplash.com/photo-1528360983277-13d401cdc186?w=600";
  const gems = [
    { imageUrl: "https://img/low.jpg", gemScore: 1 },
    { imageUrl: top, gemScore: 9 },
    { imageUrl: null, gemScore: 99 },
  ];
  assert.deepEqual(resolveCoverPhoto(gems, "Kyoto"), { url: top, credit: CURATED_HERO_CREDIT });
  assert.deepEqual(resolveCoverPhoto([{ imageUrl: "https://img/x.jpg", gemScore: 5 }], "Kyoto"), {
    url: "https://img/x.jpg",
    credit: null,
  });
});

test("C2: a curated fallback is credited to Unsplash, never to an invented name", () => {
  const result = resolveCoverPhoto([], "Kyoto");
  assert.equal(result.url, CURATED_HERO_IMAGES.kyoto);
  assert.deepEqual(result.credit, CURATED_HERO_CREDIT);
  assert.match(result.credit!.name, /Unsplash/);
  for (const url of Object.values(CURATED_HERO_IMAGES)) {
    assert.match(url, /^https:\/\/images\.unsplash\.com\//, "every curated photo is an Unsplash photo");
  }
});

test("C3: no gem photo and no curated photo ⇒ nothing", () => {
  assert.deepEqual(resolveCoverPhoto([], "Nowhere"), { url: null, credit: null });
});

test("C4: the Unsplash test reads the host, not the text", () => {
  assert.deepEqual(gemPhotoCredit("https://images.unsplash.com/photo-1?w=600"), CURATED_HERO_CREDIT);
  assert.equal(gemPhotoCredit("https://images.unsplash.com.evil.test/photo-1"), null);
  assert.equal(gemPhotoCredit("https://cdn.test/images.unsplash.com/photo-1"), null);
  assert.equal(gemPhotoCredit("not a url"), null);
  assert.equal(gemPhotoCredit(null), null);
});
