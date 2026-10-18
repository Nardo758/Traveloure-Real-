/**
 * LG-1 — open routing coordinates (ledger `2026-10-17-lg1-osm-place-coords`; migration 389). Pure: no database, no
 * request.
 *
 *   OC1  the value set: osm, admin, osm_node, iata are open; google and an untagged point are not
 *   OC2  an admin row wins over an OSM match for the same place id; an unusable pair is dropped
 *   OC3  the engine's point: an open coordinate for the place id wins over the stop's Google point; a ride's pin is
 *        its OSM node; anything else is tagged google
 *   OC4  through the OSRM adapter's acceptsPoint, a Google stop is no point at all (no routed leg); the stub takes it
 *   OC5  the admin body is a strict allowlist: https source, numeric lat/lng, nothing else
 *
 * Run: npx tsx --test server/__tests__/open-place-coords.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { OPEN_COORD_ORIGINS, OSM_COORD_ATTRIBUTION, isOpenCoordOrigin } from "@shared/open-coords";
import { acceptedPoint, mergeOpenCoords, routingPointFor, validCoord } from "../services/routing/open-routing-points";
import { OsrmRoutingAdapter } from "../services/routing/osrm-routing-adapter";
import { adminPlaceCoordBodySchema } from "@shared/open-coords";

test("OC1: osm, admin, osm_node and iata are open; google and untagged are not", () => {
  assert.deepEqual([...OPEN_COORD_ORIGINS], ["osm", "admin", "osm_node", "iata"]);
  for (const o of OPEN_COORD_ORIGINS) assert.equal(isOpenCoordOrigin(o), true);
  for (const o of ["google", null, undefined, "", "places", "geocode_google"]) assert.equal(isOpenCoordOrigin(o as any), false);
  assert.equal(OSM_COORD_ATTRIBUTION, "© OpenStreetMap contributors");
});

test("OC2: an admin row wins over an OSM match; an unusable pair is dropped", () => {
  const merged = mergeOpenCoords(
    [
      { placeId: "ChIJyasaka", lat: "35.0036500", lng: "135.7785100" },
      { placeId: "ChIJkiyomizu", lat: "34.9948", lng: "135.7850" },
      { placeId: "ChIJbad", lat: "abc", lng: "1" },
    ],
    [{ placeId: "ChIJkiyomizu", lat: 34.99486, lng: 135.78504 }],
  );
  assert.deepEqual(merged.get("ChIJyasaka"), { lat: 35.00365, lng: 135.77851, origin: "osm" });
  assert.deepEqual(merged.get("ChIJkiyomizu"), { lat: 34.99486, lng: 135.78504, origin: "admin" });
  assert.equal(merged.has("ChIJbad"), false);
  assert.equal(validCoord(0, 0), null);
  assert.equal(validCoord(91, 1), null);
});

const OPEN = new Map([["ChIJyasaka", { lat: 35.00365, lng: 135.77851, origin: "osm" as const }]]);

test("OC3: the engine's point — open coordinate first, a ride's OSM node, else google", () => {
  const google = { lat: 35.0037, lng: 135.7788 };
  assert.deepEqual(routingPointFor({ placeId: "ChIJyasaka", open: OPEN, ownPoint: google, factPoint: null, osmRide: false }), {
    lat: 35.00365,
    lng: 135.77851,
    placeId: "ChIJyasaka",
    coordOrigin: "osm",
  });
  assert.equal(routingPointFor({ placeId: "ChIJother", open: OPEN, ownPoint: google, factPoint: null, osmRide: false })?.coordOrigin, "google");
  assert.equal(routingPointFor({ placeId: null, open: OPEN, ownPoint: null, factPoint: google, osmRide: false })?.coordOrigin, "google");
  assert.equal(routingPointFor({ placeId: null, open: OPEN, ownPoint: google, factPoint: null, osmRide: true })?.coordOrigin, "osm_node");
  assert.equal(routingPointFor({ placeId: null, open: OPEN, ownPoint: null, factPoint: null, osmRide: false }), null);
});

test("OC4: through OSRM a Google stop is no point at all; the stub takes it", () => {
  const osrm = new OsrmRoutingAdapter();
  const accepts = (p: any) => osrm.acceptsPoint(p);
  const googleStop = routingPointFor({ placeId: "ChIJother", open: OPEN, ownPoint: { lat: 35, lng: 135.7 }, factPoint: null, osmRide: false });
  const osmStop = routingPointFor({ placeId: "ChIJyasaka", open: OPEN, ownPoint: { lat: 35, lng: 135.7 }, factPoint: null, osmRide: false });
  assert.equal(acceptedPoint(googleStop, accepts), null, "no routed leg in or out of a Google-only stop");
  assert.deepEqual(acceptedPoint(osmStop, accepts), osmStop);
  assert.deepEqual(acceptedPoint(googleStop, undefined), googleStop, "an adapter with no rule (the CI stub) takes every point");
});

test("OC5: the admin body is a strict allowlist", () => {
  assert.equal(adminPlaceCoordBodySchema.safeParse({ lat: 34.99, lng: 135.78, sourceUrl: "https://www.kiyomizudera.or.jp/en/" }).success, true);
  assert.equal(adminPlaceCoordBodySchema.safeParse({ lat: 34.99, lng: 135.78, sourceUrl: "http://example.jp/" }).success, false, "https only");
  assert.equal(adminPlaceCoordBodySchema.safeParse({ lat: "34.99", lng: 135.78, sourceUrl: "https://a.jp/" }).success, false);
  assert.equal(adminPlaceCoordBodySchema.safeParse({ lat: 34.99, lng: 135.78, sourceUrl: "https://a.jp/", enteredBy: "x" }).success, false, "no other key");
});
