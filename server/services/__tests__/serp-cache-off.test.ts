/**
 * EV PR 0 (ledger `2026-10-18-serp-cache-off`): with `SERPAPI_GOOGLE_MAPS_ENABLED` unset, neither SerpAPI
 * service calls SerpAPI, reads `serp_cache` or writes it — even with a key configured. No database: the pool
 * is built against an unreachable address and the db methods are replaced with counters.
 */
process.env.DATABASE_URL ??= "postgres://serp-off@127.0.0.1:1/none";
process.env.SERP_API_KEY = "test-key-not-real";
delete process.env.SERPAPI_GOOGLE_MAPS_ENABLED;

import { test } from "node:test";
import assert from "node:assert/strict";

const { db } = await import("../../db");
const { serpService } = await import("../serp.service");
const { venueSearchService } = await import("../venue-search.service");
const { serpApiGoogleMapsEnabled } = await import("../../config/serpapi.config");

let fetches = 0;
let dbCalls = 0;
globalThis.fetch = (async () => {
  fetches++;
  throw new Error("fetch must not run while the gate is off");
}) as typeof fetch;
const counted = () => {
  dbCalls++;
  throw new Error("serp_cache must not be touched while the gate is off");
};
(db as any).select = counted;
(db as any).insert = counted;

test("SC1: the gate defaults off and turns on only for '1'", () => {
  assert.equal(serpApiGoogleMapsEnabled(), false);
  process.env.SERPAPI_GOOGLE_MAPS_ENABLED = "true";
  assert.equal(serpApiGoogleMapsEnabled(), false);
  process.env.SERPAPI_GOOGLE_MAPS_ENABLED = "1";
  assert.equal(serpApiGoogleMapsEnabled(), true);
  delete process.env.SERPAPI_GOOGLE_MAPS_ENABLED;
});

test("SC2: off ⇒ every SerpAPI search answers empty with no call and no cache read or write", async () => {
  assert.deepEqual(await serpService.searchRestaurants("Kyoto", "Japan"), []);
  assert.deepEqual(await serpService.searchAttractions("Kyoto", "Japan"), []);
  assert.deepEqual(await serpService.searchNightlife("Kyoto", "Japan"), []);
  assert.equal(await serpService.searchVenueByName("Kiyomizu-dera", "Kyoto", "Japan"), null);
  assert.deepEqual(await venueSearchService.searchVenues({ location: "Kyoto", type: "restaurant" }), []);
  assert.equal(await venueSearchService.getVenueDetails("ChIJ-not-real"), null);
  assert.equal(fetches, 0);
  assert.equal(dbCalls, 0);
});
