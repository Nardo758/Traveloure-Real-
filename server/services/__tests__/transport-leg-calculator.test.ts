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

test("regional legs use a plausible motorized estimate, never walking", () => {
  const leg = computeTransportLeg(
    { id: "a", name: "A", lat: 36.2704233, lng: -121.8080556, scheduledTime: "09:00", dayNumber: 2, order: 0 },
    { id: "b", name: "B", lat: 34.0549076, lng: -118.242643, scheduledTime: "12:00", dayNumber: 2, order: 1 },
    2,
    1,
    "California",
    prefs,
  );
  assert.ok(leg);
  assert.notEqual(leg.recommendedMode, "walk");
  assert.ok(leg.estimatedDurationMinutes >= 300);
  assert.ok(leg.estimatedDurationMinutes <= 600);
});

test("walking is excluded when it exceeds maxWalkMinutes", () => {
  const leg = computeTransportLeg(
    { id: "a", name: "A", lat: 35.0, lng: 135.0, scheduledTime: "09:00", dayNumber: 1, order: 0 },
    { id: "b", name: "B", lat: 35.02, lng: 135.0, scheduledTime: "10:00", dayNumber: 1, order: 1 },
    1,
    1,
    "default",
    prefs,
  );
  assert.ok(leg);
  assert.notEqual(leg.recommendedMode, "walk");
});

test("activity pairs stay within a day and never imply an overnight transfer", () => {
  const pairs = buildSameDayActivityPairs([
    { id: "d1a", name: "Day 1 A", lat: 35, lng: 135, scheduledTime: "09:00", dayNumber: 1, order: 0 },
    { id: "d1b", name: "Day 1 B", lat: 35.1, lng: 135.1, scheduledTime: "12:00", dayNumber: 1, order: 1 },
    { id: "d2a", name: "Day 2 A", lat: 36, lng: 136, scheduledTime: "09:00", dayNumber: 2, order: 0 },
  ]);
  assert.deepEqual(pairs.map((pair) => [pair.from.id, pair.to.id]), [["d1a", "d1b"]]);
});