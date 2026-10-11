// PB-1 / R2 (ledger `2026-10-10-pb1-property-category-city`): the property builder's neighbourhood
// pre-fill and its required answer. The pre-fill is the ONE radius-limited placement rule shared
// with market insights — never the radius-free `nearestNeighborhoodSlug`.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  neighborhoodAnswered,
  suggestNeighborhoodFromPin,
  NOT_IN_STAYS_NOTICE,
} from "../property-neighborhood";
import { placeServiceInNeighborhood } from "@shared/neighborhood-placement";

const GION = { id: "nb-gion", city: "Kyoto", name: "Gion", slug: "gion", centroidLat: "35.0037", centroidLng: "135.7788", radiusKm: "1.0" };
const ARASHI = { id: "nb-arashi", city: "Kyoto", name: "Arashiyama", slug: "arashiyama", centroidLat: 35.0094, centroidLng: 135.6668, radiusKm: null };
const ROWS = [GION, ARASHI];

test("PN1: a pin inside a neighbourhood's radius pre-fills that neighbourhood's SLUG", () => {
  assert.equal(suggestNeighborhoodFromPin({ lat: 35.004, lng: 135.779 }, ROWS), "gion");
});

test("PN2: a pin outside every radius suggests NOTHING — never the merely nearest", () => {
  // ~5 km east of Gion: nearer Gion than Arashiyama, but outside Gion's 1 km radius.
  assert.equal(suggestNeighborhoodFromPin({ lat: 35.0037, lng: 135.834 }, ROWS), null);
});

test("PN3: a missing radius reads as the 1.5 km default; no pin or a bad pin suggests nothing", () => {
  assert.equal(suggestNeighborhoodFromPin({ lat: 35.0094 + 0.009, lng: 135.6668 }, ROWS), "arashiyama"); // ~1 km
  assert.equal(suggestNeighborhoodFromPin({ lat: 35.0094 + 0.018, lng: 135.6668 }, ROWS), null); // ~2 km
  assert.equal(suggestNeighborhoodFromPin(null, ROWS), null);
  assert.equal(suggestNeighborhoodFromPin({ lat: Number.NaN, lng: 135.7 }, ROWS), null);
});

test("PN4: a row without a centroid is never matched by a pin", () => {
  const noCentroid = [{ id: "nb-x", city: "Kyoto", name: "X", slug: "x" }];
  assert.equal(suggestNeighborhoodFromPin({ lat: 35.0, lng: 135.7 }, noCentroid), null);
});

test("PN5: the pre-fill agrees with the shared placement rule it delegates to", () => {
  const id = placeServiceInNeighborhood({ neighborhood: null, latitude: 35.004, longitude: 135.779 }, ROWS);
  assert.equal(id, "nb-gion");
});

test("PN6: the neighbourhood is required — a pick, the honest 'not listed', or an empty catalog", () => {
  assert.equal(neighborhoodAnswered("", false, 120), false);
  assert.equal(neighborhoodAnswered("gion", false, 120), true);
  assert.equal(neighborhoodAnswered("", true, 120), true);
  assert.equal(neighborhoodAnswered("", false, 0), true);
  // Still loading (-1) is not an answer.
  assert.equal(neighborhoodAnswered("", false, -1), false);
});

test("PN7: the notice says what the absence costs, and promises nothing", () => {
  assert.equal(NOT_IN_STAYS_NOTICE, "This property won't appear in stays until a neighborhood is set.");
});
