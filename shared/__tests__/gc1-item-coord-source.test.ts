/**
 * GC-1 (ledger `2026-10-17-gc1-google-coords`; migration 387): where an item's coordinate came from.
 *
 *   CS1  NULL, empty and both Google values are Google; any other stamped value is not.
 *   CS2  `everyLocatedPointNonGoogle` needs at least one located point, and every located point non-Google;
 *        an unlocated point is not counted.
 *   CS3  The item rails' admission takes only the Google values; a non-Google claim, junk or nothing is absent.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { admitItemCoordSource, everyLocatedPointNonGoogle, GOOGLE_COORD_SOURCES, isNonGoogleCoordSource } from "../item-coord-source";

test("CS1 · NULL and the Google values are Google", () => {
  assert.deepEqual([...GOOGLE_COORD_SOURCES], ["places", "geocode_google"]);
  for (const v of [null, undefined, "", "places", "geocode_google"]) assert.equal(isNonGoogleCoordSource(v), false, String(v));
  assert.equal(isNonGoogleCoordSource("osm"), true);
});

test("CS2 · every located point must be non-Google, and there must be one", () => {
  assert.equal(everyLocatedPointNonGoogle([]), false);
  assert.equal(everyLocatedPointNonGoogle([{ located: false, coordSource: "osm" }]), false);
  assert.equal(everyLocatedPointNonGoogle([{ located: true, coordSource: "osm" }, { located: false, coordSource: null }]), true);
  assert.equal(everyLocatedPointNonGoogle([{ located: true, coordSource: "osm" }, { located: true, coordSource: null }]), false);
  assert.equal(everyLocatedPointNonGoogle([{ located: true, coordSource: "places" }]), false);
});

test("CS3 · a body may mark its coordinate as Google and nothing else", () => {
  assert.equal(admitItemCoordSource({ coordSource: "places" }), "places");
  assert.equal(admitItemCoordSource({ coordSource: "geocode_google" }), "geocode_google");
  for (const body of [{ coordSource: "osm" }, { coordSource: 1 }, {}, null, undefined]) assert.equal(admitItemCoordSource(body), undefined);
});
