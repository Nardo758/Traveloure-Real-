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

const {
  similarity,
  MATCH_THRESHOLD,
  findBestEligibleAffiliateProduct,
  isAffiliateGroundingBookingType,
} = await import("../services/slip-grounding-match");

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

test("only ratified affiliate booking classifications can ground", () => {
  assert.equal(isAffiliateGroundingBookingType("affiliate_bookable"), true);
  assert.equal(isAffiliateGroundingBookingType("in_platform_bookable"), true);
  assert.equal(isAffiliateGroundingBookingType("informational"), false);
  assert.equal(isAffiliateGroundingBookingType(null), false);
  assert.equal(isAffiliateGroundingBookingType(""), false);
});

test("an unclassified affiliate match falls through to an eligible candidate", () => {
  const best = findBestEligibleAffiliateProduct("Kyoto Bamboo Walking Tour", [
    {
      id: "unclassified",
      name: "Kyoto Bamboo Walking Tour",
      latitude: "35.017",
      longitude: "135.671",
      bookingType: null,
    },
    {
      id: "eligible",
      name: "Kyoto Bamboo Walking Tour (small group)",
      latitude: "35.018",
      longitude: "135.672",
      bookingType: "affiliate_bookable",
    },
  ]);
  assert.equal(best?.id, "eligible");
});

test("unclassified-only affiliate inventory does not ground", () => {
  assert.equal(
    findBestEligibleAffiliateProduct("Kyoto Bamboo Walking Tour", [
      {
        id: "unclassified",
        name: "Kyoto Bamboo Walking Tour",
        latitude: null,
        longitude: null,
        bookingType: "informational",
      },
    ]),
    null,
  );
});

test("in-platform affiliate inventory remains an eligible grounding match", () => {
  const best = findBestEligibleAffiliateProduct("Kyoto Tea Ceremony Experience", [
    {
      id: "platform",
      name: "Kyoto Tea Ceremony Experience",
      latitude: null,
      longitude: null,
      bookingType: "in_platform_bookable",
    },
  ]);
  assert.equal(best?.id, "platform");
});
