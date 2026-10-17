import assert from "node:assert/strict";
import test from "node:test";
import { buildSameDayActivityPairs, calculateTransportLegs, computeTransportLeg } from "../transport-leg-calculator";
import { straightLineMinutes } from "@shared/travel-speeds";

const prefs = {
  prioritize: "time" as const,
  avoidModes: [],
  maxWalkMinutes: 15,
  accessibility: false,
  budgetTier: "moderate" as const,
};

function mockGoogleRoute(distanceMeters: number, durationSeconds: number) {
  process.env.GOOGLE_MAPS_API_KEY = "test-key";
  process.env.MAPS_ROUTES_DRIVE_ENABLED = "1"; // R299: the drive call runs behind the Maps billing gate
  global.fetch = async () => new Response(JSON.stringify({
    routes: [{ distanceMeters, duration: `${durationSeconds}s`, polyline: { encodedPolyline: "abc" } }],
  }), { status: 200, headers: { "content-type": "application/json" } });
}

// 9b-b, sanctioned edit (Phase 0 ruling 2): this writer stores its answer, so it no longer calls Google Routes —
// it returns the labelled straight-line estimate for a drive, and never makes a request.
test("returns the straight-line drive estimate, labelled, and makes no Google request (9b-b)", async () => {
  mockGoogleRoute(481_000, 21_600);
  let calls = 0;
  global.fetch = async () => {
    calls++;
    return new Response("{}", { status: 200 });
  };
  const leg = await computeTransportLeg(
    { id: "a", name: "A", lat: 36.2704233, lng: -121.8080556, scheduledTime: "09:00", dayNumber: 2, order: 0 },
    { id: "b", name: "B", lat: 34.0549076, lng: -118.242643, scheduledTime: "12:00", dayNumber: 2, order: 1 },
    2,
    1,
    "California",
    prefs,
  );
  assert.ok(leg);
  assert.equal(leg.recommendedMode, "driving");
  assert.equal(leg.routeProvider, "straight_line_est");
  assert.ok(leg.distanceMeters > 350_000 && leg.distanceMeters < 450_000, "the straight line, not a road distance");
  assert.equal(leg.estimatedDurationMinutes, straightLineMinutes(leg.distanceMeters, "drive"));
  assert.equal(calls, 0);
});

test("an unavailable Google route no longer matters: the estimate is returned (9b-b)", async () => {
  process.env.GOOGLE_MAPS_API_KEY = "test-key";
  process.env.MAPS_ROUTES_DRIVE_ENABLED = "1";
  global.fetch = async () => new Response("unavailable", { status: 503 });
  const leg = await computeTransportLeg(
    { id: "a", name: "A", lat: 35.0, lng: 135.0, scheduledTime: "09:00", dayNumber: 1, order: 0 },
    { id: "b", name: "B", lat: 35.02, lng: 135.0, scheduledTime: "10:00", dayNumber: 1, order: 1 },
    1,
    1,
    "default",
    prefs,
  );
  assert.ok(leg);
  assert.equal(leg.routeProvider, "straight_line_est");
});

test("activity pairs stay within a day and never imply an overnight transfer", () => {
  const pairs = buildSameDayActivityPairs([
    { id: "d1a", name: "Day 1 A", lat: 35, lng: 135, scheduledTime: "09:00", dayNumber: 1, order: 0 },
    { id: "d1b", name: "Day 1 B", lat: 35.1, lng: 135.1, scheduledTime: "12:00", dayNumber: 1, order: 1 },
    { id: "d2a", name: "Day 2 A", lat: 36, lng: 136, scheduledTime: "09:00", dayNumber: 2, order: 0 },
  ]);
  assert.deepEqual(pairs.map((pair) => [pair.from.id, pair.to.id]), [["d1a", "d1b"]]);
});

test("R299 as amended by 9b-b: with the drive switch off no request is made and the leg is the estimate", async () => {
  process.env.GOOGLE_MAPS_API_KEY = "test-key";
  delete process.env.MAPS_ROUTES_DRIVE_ENABLED;
  let calls = 0;
  global.fetch = async () => {
    calls++;
    return new Response("{}", { status: 200 });
  };
  const leg = await computeTransportLeg(
    { id: "a", name: "A", lat: 35.0, lng: 135.0, scheduledTime: "09:00", dayNumber: 1, order: 0 },
    { id: "b", name: "B", lat: 35.02, lng: 135.0, scheduledTime: "10:00", dayNumber: 1, order: 1 },
    1,
    1,
    "default",
    prefs,
  );
  assert.equal(leg?.routeProvider, "straight_line_est");
  assert.equal(calls, 0);
});

test("P0-b item 7: with no routing context the variant writer writes nothing and asks nothing", async () => {
  process.env.GOOGLE_MAPS_API_KEY = "test-key";
  process.env.MAPS_ROUTES_DRIVE_ENABLED = "1";
  let calls = 0;
  global.fetch = async () => {
    calls++;
    return new Response("{}", { status: 200 });
  };
  const legs = await calculateTransportLegs(
    "variant-without-engine",
    [
      { id: "a", name: "A", lat: 35.0, lng: 135.0, scheduledTime: "09:00", dayNumber: 1, order: 0 },
      { id: "b", name: "B", lat: 35.05, lng: 135.0, scheduledTime: "10:00", dayNumber: 1, order: 1 },
    ],
    "Kyoto",
    {},
    null,
  );
  assert.deepEqual(legs, []);
  assert.equal(calls, 0, "the retired drive fallback makes no request");
});
