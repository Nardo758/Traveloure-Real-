import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { getDestinationPhoto } from "../plancard-types";

/**
 * L4 trip-card honesty (ledger `2026-09-07-trip-card-honesty`) — the hero returns NULL for an
 * unmatched destination, never the generic travel shot. A photo of nowhere is the §13 lie; the
 * header draws its typographic block instead. Pure: no DOM, no DB, no network.
 *
 * Run: npx tsx --test client/src/components/plancard/__tests__/hero-photo-honesty.test.ts
 */

test("G1: no curated destination gets a stock photo", () => {
  assert.equal(getDestinationPhoto("Tokyo, Japan"), null);
});

test("G1: destination matching never invents a photo", () => {
  assert.equal(getDestinationPhoto("Backpacking PERU"), null);
  assert.equal(getDestinationPhoto("JAPAN highlights"), null);
});

test("an unmatched destination returns NULL — never the generic travel shot", () => {
  assert.equal(getDestinationPhoto("Reykjavik-adjacent fishing village"), null);
  assert.equal(getDestinationPhoto("Tbilisi, Georgia"), null);
});

test("generic-keyword keys are never matched: a place NAMED beach/mountains/travel is not the stock mood", () => {
  assert.equal(getDestinationPhoto("Bondi Beach"), null);
  assert.equal(getDestinationPhoto("Blue Mountains Inn"), null);
  assert.equal(getDestinationPhoto("Travel Rest, Ohio"), null);
});

test("absence is honest: no destination ⇒ null, not a stock photo", () => {
  assert.equal(getDestinationPhoto(undefined), null);
  assert.equal(getDestinationPhoto(null), null);
  assert.equal(getDestinationPhoto(""), null);
});

test("G1: no Unsplash address survives in the city seed, deals page, or plan-card map", () => {
  const sources = [
    "server/data/cities.json",
    "client/src/pages/deals.tsx",
    "client/src/components/plancard/plancard-types.tsx",
  ];
  for (const file of sources) {
    const src = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(src, /images\.unsplash\.com|source\.unsplash\.com/, file);
  }
  const deals = fs.readFileSync("client/src/pages/deals.tsx", "utf8");
  assert.doesNotMatch(deals, /DESTINATION_PHOTOS|TYPE_FALLBACK_PHOTOS|const BASE = "https:\/\/images/);
});
