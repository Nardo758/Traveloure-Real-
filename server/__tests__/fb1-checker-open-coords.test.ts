/**
 * FB-1 step 1 (ledger `2026-10-17-fb1-checker-open-coords`), the pure half.
 *   K1  a day is read by the path findings only when EVERY stop on it has an open coordinate; any other day is
 *       not checked, by name
 *   K2  "not checked" names both path findings, the reason and the days; nothing when every day was checked
 *   K3  an open zig-zag day still yields city_crossing and walking_saved_km through the unchanged pure rules
 *   G1  a Google geocode is cached 30 days (not 90); a miss keeps its 24 hours
 *   G2  a cache read refuses a row last written more than 30 days ago, so old 90-day rows stop at 30
 *
 * Run: npx tsx --test server/__tests__/fb1-checker-open-coords.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cityCrossings, openPathDays, pathNotChecked, walkingSavedKm, PATH_FINDING_KINDS } from "@shared/optimizer-lead";
import {
  GEOCODE_SUCCESS_TTL_DAYS,
  createOptimizerGeocodeBudget,
  geocodeCacheReadableSince,
  resolveOptimizerActivityCoordinates,
} from "../services/optimizer-activity-geocoder.service";

const ZIGZAG = [
  { lat: 35.0, lng: 135.76 },
  { lat: 35.05, lng: 135.76 },
  { lat: 35.001, lng: 135.761 },
  { lat: 35.051, lng: 135.761 },
];

test("K1 a day with any stop lacking an open coordinate is not checked", () => {
  const { days, notCheckedDays } = openPathDays([
    ...ZIGZAG.map((p) => ({ dayNumber: 1, open: p })),
    { dayNumber: 2, open: { lat: 35, lng: 135.7 } },
    { dayNumber: 2, open: null },
    { dayNumber: 3, open: null },
  ]);
  assert.deepEqual(days.map((d) => d.dayNumber), [1]);
  assert.equal(days[0].points.length, 4);
  assert.deepEqual(notCheckedDays, [2, 3]);
});

test("K2 not checked names both path findings, the reason and the days", () => {
  assert.deepEqual(pathNotChecked([3, 2]), [
    { kind: "city_crossing", reason: "no_open_coordinates", days: [2, 3] },
    { kind: "walking_saved_km", reason: "no_open_coordinates", days: [2, 3] },
  ]);
  assert.deepEqual(pathNotChecked([]), []);
  assert.deepEqual([...PATH_FINDING_KINDS], ["city_crossing", "walking_saved_km"]);
});

test("K3 an open zig-zag day still yields both path findings", () => {
  const { days } = openPathDays(ZIGZAG.map((p) => ({ dayNumber: 1, open: p })));
  assert.equal(cityCrossings(days)?.kind, "city_crossing");
  const w = walkingSavedKm(days);
  assert.equal(w?.kind, "walking_saved_km");
  assert.ok((w?.count ?? 0) >= 1);
  assert.equal(cityCrossings(openPathDays([{ dayNumber: 1, open: null }]).days), null, "nothing is computed on an unchecked day");
});

test("G1 a success is cached 30 days; a miss 24 hours", async () => {
  assert.equal(GEOCODE_SUCCESS_TTL_DAYS, 30);
  const puts: any[] = [];
  const cache = { async get() { return null; }, async put(e: any) { puts.push(e); } };
  const now = new Date("2026-10-18T00:00:00Z");
  const hit = async () => ({ lat: 35.0037, lng: 135.7788, formattedAddress: "Gion, Kyoto, Japan", locationType: "GEOMETRIC_CENTER", types: ["point_of_interest"] });
  const catalog = new Map([["svc-1", { latitude: null, longitude: null }]]);
  await resolveOptimizerActivityCoordinates([{ name: "Gion Night Walk", providerServiceId: "svc-1", location: "Gion" }], [], catalog, "Kyoto, Japan", createOptimizerGeocodeBudget(), { cache, geocode: hit, now: () => now } as any);
  await resolveOptimizerActivityCoordinates([{ name: "Nowhere Walk", providerServiceId: "svc-1", location: "Nowhere" }], [], catalog, "Kyoto, Japan", createOptimizerGeocodeBudget(), { cache, geocode: async () => null, now: () => now } as any);
  const day = 24 * 60 * 60 * 1000;
  const success = puts.find((p) => p.status === "success");
  const miss = puts.find((p) => p.status === "miss");
  assert.ok(success && miss, "both outcomes were cached");
  assert.equal(success.expiresAt.getTime() - now.getTime(), 30 * day);
  assert.equal(miss.expiresAt.getTime() - now.getTime(), day);
});

test("G2 a read refuses a row written more than 30 days ago", () => {
  const now = new Date("2026-10-18T00:00:00Z");
  assert.equal(geocodeCacheReadableSince(now).toISOString(), "2026-09-18T00:00:00.000Z");
  const src = readFileSync("server/services/optimizer-activity-geocoder.service.ts", "utf8");
  assert.match(src, /gt\(optimizerGeocodeCache\.updatedAt, geocodeCacheReadableSince\(new Date\(\)\)\)/);
  assert.doesNotMatch(src, /90 \* 24 \* 60 \* 60 \* 1000/);
});
