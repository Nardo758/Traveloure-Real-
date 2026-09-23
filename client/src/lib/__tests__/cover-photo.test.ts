/**
 * The Discover cover photo and its credit are one decision — board task #437, ledger
 * `2026-09-23-phase2-honesty`. Pure.
 *
 *   C1  The top-scored gem photo wins, credited with its own attribution when it has one — and
 *       with NO credit (never someone else's) when it has none.
 *   C2  A curated fallback photo is credited to Unsplash itself: no photographer name was
 *       recorded, so none is invented.
 *   C3  A city with neither has no photo and no credit.
 *
 * Run: npx tsx --test client/src/lib/__tests__/cover-photo.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { CURATED_HERO_CREDIT, CURATED_HERO_IMAGES, resolveCoverPhoto } from "../cover-photo";

test("C1: the top gem photo wins, with its own credit or none", () => {
  const gems = [
    { imageUrl: "https://img/low.jpg", gemScore: 1, imageAttribution: "Low Scorer" },
    { imageUrl: "https://img/top.jpg", gemScore: 9, imageAttribution: "Aiko Tanaka" },
    { imageUrl: null, gemScore: 99 },
  ];
  assert.deepEqual(resolveCoverPhoto(gems, "Kyoto"), {
    url: "https://img/top.jpg",
    credit: { name: "Aiko Tanaka", url: "https://img/top.jpg" },
  });
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
