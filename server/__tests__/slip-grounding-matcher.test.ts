/**
 * Item 2 Phase 1 — the slip-grounding matcher is fail-closed (§13).
 *
 * Run with: npx tsx --test server/__tests__/slip-grounding-matcher.test.ts
 *
 * The one thing that must never happen: a free-text AI item grounding to the WRONG catalog service
 * or DMO place — a booking button that goes nowhere, or a pin the platform guessed. These pure
 * tests assert the matcher only clears MATCH_THRESHOLD on a real name correspondence, and stays
 * below it for unrelated names — so `groundAiItems` links only confident matches and leaves
 * everything else an honest suggestion.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

const { similarity, MATCH_THRESHOLD } = await import("../services/slip-grounding-match");

test("exact and contains matches clear the threshold", () => {
  assert.ok(similarity("Kiyomizu-dera", "Kiyomizu-dera") >= MATCH_THRESHOLD, "identical");
  // The AI's specific place name contained in the catalog/DMO name (and vice versa) is a confident hit.
  assert.ok(similarity("Kiyomizu-dera", "Kiyomizu-dera Temple") >= MATCH_THRESHOLD, "contains");
  assert.ok(similarity("Tea Ceremony with Naoko", "Tea Ceremony with Naoko (private)") >= MATCH_THRESHOLD, "contains-2");
});

test("unrelated names stay BELOW the threshold — no false link (fail-closed)", () => {
  assert.ok(similarity("Dinner in Gion", "Kiyomizu-dera Temple") < MATCH_THRESHOLD, "unrelated place");
  assert.ok(similarity("Morning temple visit", "Sushi Making Class") < MATCH_THRESHOLD, "unrelated activity");
  assert.ok(similarity("Explore the city", "Fushimi Inari Shrine") < MATCH_THRESHOLD, "generic vs specific");
});

test("generic-word-only overlap does NOT ground (the words we strip carry no identity)", () => {
  // "Morning temple visit" vs "Afternoon temple tour" share only 'temple' after stripping the
  // generic itinerary words — a single shared token must not clear a conservative bar.
  assert.ok(similarity("Morning temple visit", "Afternoon temple tour") < MATCH_THRESHOLD, "one shared noun");
});

test("empty / whitespace names never match", () => {
  assert.equal(similarity("", "Kiyomizu-dera"), 0);
  assert.equal(similarity("   ", "Anything"), 0);
  assert.equal(similarity("Activity", ""), 0);
});
