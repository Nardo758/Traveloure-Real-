/**
 * Fever area match, pure half (ledger `2026-10-21-blog-checks-fever-area`).
 * Centre + radius, Kyoto only. No network.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { NeighborhoodRow } from "../neighborhood-placement";
import { feverAddressKey, kyotoAreaName, namedArea, nominatimSearchQuery, parseNominatimPoint } from "../fever-area";

const GION: NeighborhoodRow = {
  id: "gion", city: "Kyoto", name: "Gion", slug: "gion",
  centroidLat: "35.0036", centroidLng: "135.7750", radiusKm: "1.5",
};
const ARASHIYAMA: NeighborhoodRow = {
  id: "arashiyama", city: "Kyoto", name: "Arashiyama", slug: "arashiyama",
  centroidLat: "35.0094", centroidLng: "135.6668", radiusKm: "1.5",
};
const NAMBA: NeighborhoodRow = {
  id: "namba", city: "Osaka", name: "Namba", slug: "namba",
  centroidLat: "35.0036", centroidLng: "135.7750", radiusKm: "5",
};

test("FA: a point inside a Kyoto radius takes that name; outside takes none; another city is ignored", () => {
  const rows = [GION, ARASHIYAMA, NAMBA];
  assert.equal(kyotoAreaName(35.0036, 135.775, rows), "Gion");
  assert.equal(kyotoAreaName(35.0094, 135.6668, rows), "Arashiyama");
  assert.equal(kyotoAreaName(35.0236, 135.775, rows), null, "about 2 km north of Gion, outside the 1.5 km radius");
  assert.equal(kyotoAreaName(35.0036, 135.775, [NAMBA]), null, "an Osaka row is not a Kyoto area");
});

test("FA: a missing area is omitted, including the word Unknown", () => {
  assert.equal(namedArea(" Gion "), "Gion");
  assert.equal(namedArea(""), null);
  assert.equal(namedArea("   "), null);
  assert.equal(namedArea("Unknown"), null);
  assert.equal(namedArea(" unknown "), null);
  assert.equal(namedArea(null), null);
});

test("FA: the Nominatim query and the cache key", () => {
  assert.equal(nominatimSearchQuery("1 Test Street", "Kyoto", "Japan"), "1 Test Street, Kyoto, Japan");
  assert.equal(nominatimSearchQuery("1 Test Street, Kyoto, Japan", "Kyoto", "Japan"), "1 Test Street, Kyoto, Japan");
  assert.equal(feverAddressKey("  1   Test   Street, Kyoto "), "1 test street, kyoto");
  assert.deepEqual(parseNominatimPoint([{ lat: "35.0036", lon: "135.7750" }]), { lat: 35.0036, lng: 135.775 });
  assert.equal(parseNominatimPoint([]), null);
  assert.equal(parseNominatimPoint([{ lat: "nope", lon: "135" }]), null);
  assert.equal(parseNominatimPoint([{ lat: "91", lon: "0" }]), null);
});
