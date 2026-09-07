import { test } from "node:test";
import assert from "node:assert/strict";
import { getDestinationPhoto } from "../plancard-types";

/**
 * L4 trip-card honesty (ledger `2026-09-07-trip-card-honesty`) — the hero returns NULL for an
 * unmatched destination, never the generic travel shot. A photo of nowhere is the §13 lie; the
 * header draws its typographic block instead. Pure: no DOM, no DB, no network.
 *
 * Run: npx tsx --test client/src/components/plancard/__tests__/hero-photo-honesty.test.ts
 */

test("a curated destination matches its photo", () => {
  const url = getDestinationPhoto("Kyoto, Japan");
  assert.ok(url && url.includes("photo-1545569341-9eb8b30979d9"));
});

test("matching is case-insensitive and substring-based (a country key still matches)", () => {
  assert.ok(getDestinationPhoto("Backpacking PERU") === null); // Peru is not curated — no photo of nowhere
  assert.ok(getDestinationPhoto("JAPAN highlights")?.includes("photo-1490806843957-31f4c9a91c65"));
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
