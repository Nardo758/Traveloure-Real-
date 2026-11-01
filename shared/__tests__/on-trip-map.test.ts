/**
 * Row 185 J5 — the on-trip map projection.
 *
 *   M1  only today's confirmed stops
 *   M2  a stop without stored coordinates is omitted
 *   M3  a Google coordinate source is not read into the projection
 *   M4  the stay anchor is the chosen item
 *   M5  the current leg carries its leave-by
 *   M6  the day boundary follows the plan's zone
 *   M7  the module takes no Places fact, geocode result, leg coordinate, or device position
 *
 * Pure. No database, no clock of its own.
 * Run: npx tsx --test shared/__tests__/on-trip-map.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { projectOnTripMap, type OnTripMapItem, type OnTripMapLegRow } from "../on-trip-map";

const TOKYO_MORNING = new Date("2026-11-01T15:30:00.000Z"); // 2026-11-02 00:30 in Asia/Tokyo
const TOKYO_NOON = new Date("2026-11-02T03:00:00.000Z"); // 2026-11-02 12:00 in Asia/Tokyo

function item(partial: Partial<OnTripMapItem> & { id: string }): OnTripMapItem {
  return {
    status: "confirmed",
    itemType: "activity",
    dayNumber: 2,
    startTime: "10:00",
    durationMinutes: 60,
    sortOrder: 0,
    latitude: 35.11,
    longitude: 135.77,
    coordSource: "osm",
    ...partial,
  };
}

const stay = item({
  id: "stay",
  itemType: "accommodation",
  status: "planned",
  dayNumber: 1,
  latitude: 35.02,
  longitude: 135.76,
  startTime: null,
});
const stopA = item({ id: "a", startTime: "10:00", sortOrder: 1, latitude: 35.11, longitude: 135.77 });
const stopB = item({ id: "b", startTime: "14:00", sortOrder: 2, latitude: 35.12, longitude: 135.78 });

const legStay: OnTripMapLegRow = {
  id: "leg-stay",
  dayNumber: 2,
  fromActivityId: "stay",
  toActivityId: "a",
  estimatedDurationMinutes: 20,
  recommendedMode: "walk",
  routed: true,
};
const legAB: OnTripMapLegRow = {
  id: "leg-ab",
  dayNumber: 2,
  fromActivityId: "a",
  toActivityId: "b",
  estimatedDurationMinutes: 25,
  recommendedMode: "walk",
  routed: true,
};

function project(now: Date, extraItems: OnTripMapItem[] = [], extraLegs: OnTripMapLegRow[] = [], timezone = "Asia/Tokyo") {
  return projectOnTripMap({
    now,
    timezone,
    startDate: "2026-11-01",
    chosenStayItemId: "stay",
    items: [stay, stopA, stopB, ...extraItems],
    legs: [legStay, legAB, ...extraLegs],
  });
}

test("M1 only today's confirmed stops", () => {
  const map = project(TOKYO_NOON, [
    item({ id: "planned", status: "planned", latitude: 4.4444, longitude: 135.1 }),
    item({ id: "booked", status: "booked", latitude: 4.4445, longitude: 135.1 }),
    item({ id: "yesterday", dayNumber: 1, latitude: 3.3333, longitude: 135.1 }),
    item({ id: "lodge", itemType: "accommodation", latitude: 33.21, longitude: 135.1 }),
  ]);
  assert.deepEqual(map.stops.map((s) => s.id), ["a", "b"]);
  assert.equal(JSON.stringify(map).includes("4.444"), false);
  assert.equal(JSON.stringify(map).includes("3.333"), false);
  assert.equal(JSON.stringify(map).includes("33.21"), false);
});

test("M2 a stop without stored coordinates is omitted", () => {
  const map = project(TOKYO_NOON, [
    item({ id: "none", latitude: null, longitude: null }),
    item({ id: "half", latitude: 2.2222, longitude: null }),
    item({ id: "zero", latitude: 0, longitude: 0 }),
  ]);
  assert.deepEqual(map.stops.map((s) => s.id), ["a", "b"]);
  assert.equal(JSON.stringify(map).includes("2.222"), false);
});

test("M3 a Google coordinate source is not a pin", () => {
  const map = project(TOKYO_NOON, [
    item({ id: "places", coordSource: "places", latitude: 7.7777, longitude: 135.1 }),
    item({ id: "geocode", coordSource: "geocode_google", latitude: 7.7778, longitude: 135.1 }),
    item({ id: "google", coordSource: "google", latitude: 7.7779, longitude: 135.1 }),
    item({ id: "unset", coordSource: null, latitude: 6.6666, longitude: 135.1 }),
  ]);
  assert.deepEqual(map.stops.map((s) => s.id), ["a", "b"]);
  const blob = JSON.stringify(map);
  assert.equal(blob.includes("7.777"), false);
  assert.equal(blob.includes("6.666"), false);
});

test("M4 the stay anchor is the chosen item", () => {
  const other = item({ id: "other-stay", itemType: "accommodation", latitude: 33.31, longitude: 135.2, status: "planned" });
  const map = projectOnTripMap({
    now: TOKYO_NOON,
    timezone: "Asia/Tokyo",
    startDate: "2026-11-01",
    chosenStayItemId: "stay",
    items: [other, stay, stopA, stopB],
    legs: [legStay, legAB],
  });
  assert.deepEqual(map.stay, { itemId: "stay", lat: 35.02, lng: 135.76 });
  assert.equal(JSON.stringify(map).includes("33.31"), false);

  const googleStay = projectOnTripMap({
    now: TOKYO_NOON,
    timezone: "Asia/Tokyo",
    startDate: "2026-11-01",
    chosenStayItemId: "stay",
    items: [{ ...stay, coordSource: "places", latitude: 12.5, longitude: 135 }],
    legs: [],
  });
  assert.equal(googleStay.stay, null);
  assert.equal(JSON.stringify(googleStay).includes("12.5"), false);
});

test("M5 the current leg carries its leave-by", () => {
  const morning = project(TOKYO_MORNING);
  assert.deepEqual(morning.leg, { id: "leg-stay", fromItemId: "stay", toItemId: "a", leaveBy: "09:40" });

  const noon = project(TOKYO_NOON);
  assert.deepEqual(noon.leg, { id: "leg-ab", fromItemId: "a", toItemId: "b", leaveBy: "13:35" });

  const poisoned = project(TOKYO_NOON, [], [{ ...legAB, id: "leg-ab" }]);
  assert.equal(JSON.stringify(poisoned).includes("leave by"), false);
  assert.equal(poisoned.leg?.leaveBy, "13:35");
});

test("M6 the day boundary follows the plan zone", () => {
  const tokyo = project(TOKYO_MORNING);
  assert.equal(tokyo.day, "2026-11-02");
  assert.deepEqual(tokyo.stops.map((s) => s.id), ["a", "b"]);

  const utc = project(TOKYO_MORNING, [item({ id: "day1", dayNumber: 1, latitude: 3.3333, longitude: 135.4, startTime: "16:00" })], [], "UTC");
  assert.equal(utc.day, "2026-11-01");
  assert.deepEqual(utc.stops.map((s) => s.id), ["day1"]);
});

test("M7 no Places fact, geocode, leg coordinate, or device position is an input", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const src = fs.readFileSync(path.join(root, "shared/on-trip-map.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(src, /place_facts|factsForTrip|applyGooglePins|geocodeAddress|deviceLat|geolocation|fromLat|toLat|from_lat|to_lat/);
  const call = fs.readFileSync(path.join(root, "server/services/trip-plan.service.ts"), "utf8");
  const block = call.slice(call.indexOf("projectOnTripMap({"), call.indexOf("onTripMap ? { onTripMap }"));
  assert.ok(block.includes("chosenStayItemId"), "the projection uses the chosen-stay reader");
  assert.doesNotMatch(block, /fromLat|toLat|placeFacts|factsForTrip|geocode|latitude: leg|longitude: leg/);

  const map = projectOnTripMap({
    now: TOKYO_NOON,
    timezone: "Asia/Tokyo",
    startDate: "2026-11-01",
    chosenStayItemId: "stay",
    items: [stay, stopA],
    legs: [legStay],
    deviceLat: 1.2345678,
    deviceLng: 2.3456789,
  } as any);
  const blob = JSON.stringify(map);
  assert.equal(blob.includes("1.2345678"), false);
  assert.equal(blob.includes("2.3456789"), false);
});
