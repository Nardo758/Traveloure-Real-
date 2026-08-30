import assert from "node:assert/strict";
import test from "node:test";
import { buildSameDayActivityPairs, computeTransportLeg } from "../transport-leg-calculator";

const prefs = {
  prioritize: "time" as const,
  avoidModes: [],
  maxWalkMinutes: 15,
  accessibility: false,
  budgetTier: "moderate" as const,
};

function mockGoogleRoute(distanceMeters: number, durationSeconds: number) {
  process.env.GOOGLE_MAPS_API_KEY = "test-key";
  global.fetch = async () => new Response(JSON.stringify({
    routes: [{ distanceMeters, duration: `${durationSeconds}s`, polyline: { encodedPolyline: "abc" } }],
  }), { status: 200, headers: { "content-type": "application/json" } });
}

test("uses Google traffic-aware driving distance and duration", async () => {
  mockGoogleRoute(481_000, 21_600);
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
  assert.equal(leg.distanceMeters, 481_000);
  assert.equal(leg.estimatedDurationMinutes, 360);
  assert.equal(leg.routeProvider, "google_routes");
});

test("returns honest absence when Google routing is unavailable", async () => {
  process.env.GOOGLE_MAPS_API_KEY = "test-key";
  global.fetch = async () => new Response("unavailable", { status: 503 });
  const leg = await computeTransportLeg(
    { id: "a", name: "A", lat: 35.0, lng: 135.0, scheduledTime: "09:00", dayNumber: 1, order: 0 },
    { id: "b", name: "B", lat: 35.02, lng: 135.0, scheduledTime: "10:00", dayNumber: 1, order: 1 },
    1,
    1,
    "default",
    prefs,
  );
  assert.equal(leg, null);
});

test("activity pairs stay within a day and never imply an overnight transfer", () => {
  const pairs = buildSameDayActivityPairs([
    { id: "d1a", name: "Day 1 A", lat: 35, lng: 135, scheduledTime: "09:00", dayNumber: 1, order: 0 },
    { id: "d1b", name: "Day 1 B", lat: 35.1, lng: 135.1, scheduledTime: "12:00", dayNumber: 1, order: 1 },
    { id: "d2a", name: "Day 2 A", lat: 36, lng: 136, scheduledTime: "09:00", dayNumber: 2, order: 0 },
  ]);
  assert.deepEqual(pairs.map((pair) => [pair.from.id, pair.to.id]), [["d1a", "d1b"]]);
});