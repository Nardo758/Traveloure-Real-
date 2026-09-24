/**
 * The ONE city-match rule for location filters (board #1385). Pure.
 *   L1 a city matches exactly — case, accent and spacing aside — and a prefix never does.
 *   L2 "City, Country" never falls back to the country (a Tokyo expert does not answer "Kyoto, Japan").
 *   L3 a one-word query may name a country.
 *   L4 empty values never match anything.
 * Run: npx tsx --test shared/__tests__/location-match.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { citySegment, locationQueryMatches } from "../location-match";

test("L1: exact city, never a prefix or substring", () => {
  const kyoto = { destinations: ["Kyoto, Japan"], city: "Kyoto", country: "Japan" };
  assert.equal(locationQueryMatches("Kyoto", kyoto), true);
  assert.equal(locationQueryMatches("  kyoto , japan ", kyoto), true);
  assert.equal(locationQueryMatches("Kyo", kyoto), false);
  assert.equal(locationQueryMatches("Bogota", { city: "Bogotá" }), true);
  assert.equal(locationQueryMatches("Rome", { city: "Romeoville" }), false);
  assert.equal(citySegment("Kyoto, Japan"), "kyoto");
});

test("L2: a city query never widens to the country", () => {
  const tokyo = { destinations: ["Tokyo, Japan"], city: "Tokyo", country: "Japan" };
  assert.equal(locationQueryMatches("Kyoto, Japan", tokyo), false);
});

test("L3: a single-word query may be a country", () => {
  assert.equal(locationQueryMatches("Japan", { city: "Tokyo", country: "Japan" }), true);
});

test("L4: empty values never match", () => {
  assert.equal(locationQueryMatches("Kyoto", { city: "", country: "", destinations: ["", null] }), false);
  assert.equal(locationQueryMatches("", { city: "Kyoto" }), false);
});
