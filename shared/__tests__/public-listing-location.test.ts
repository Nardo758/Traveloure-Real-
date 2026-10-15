/**
 * CP-1 — the coarse public pin (ledger `2026-10-15-cp1-public-payloads`). Pure.
 * The routes that apply it are proven signed-out in `server/__tests__/cp1-public-payloads.http.test.ts`.
 *
 * Run solo: npx tsx --test shared/__tests__/public-listing-location.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { coarsenPoint, COARSE_LAT_STEP_DEG, LISTING_EXACT_LOCATION_FIELDS } from "../public-listing-location";

test("L1: a pin snaps to a cell about 500 m wide, deterministically", () => {
  const a = coarsenPoint("35.0116340", "135.7681490");
  assert.ok(a.latitude && a.longitude);
  assert.ok(Math.abs(Number(a.latitude) - 35.011634) <= COARSE_LAT_STEP_DEG / 2 + 1e-9);
  assert.ok(Math.abs(Number(a.longitude) - 135.768149) <= COARSE_LAT_STEP_DEG / Math.cos((35 * Math.PI) / 180) / 2 + 1e-9);
  assert.deepEqual(coarsenPoint(35.011634, 135.768149), a, "same pin, same cell");
  // Two pins ~60 m apart inside one cell land on the same point.
  assert.deepEqual(coarsenPoint(35.0112, 135.7680), coarsenPoint(35.0117, 135.7683));
});

test("L2: no pin, an unreadable pin or an out-of-range pin stays NULL — never guessed", () => {
  assert.deepEqual(coarsenPoint(null, null), { latitude: null, longitude: null });
  assert.deepEqual(coarsenPoint("", "135"), { latitude: null, longitude: null });
  assert.deepEqual(coarsenPoint("abc", "135"), { latitude: null, longitude: null });
  assert.deepEqual(coarsenPoint(95, 10), { latitude: null, longitude: null });
});

test("L3: the address-like fields are named once", () => {
  assert.deepEqual([...LISTING_EXACT_LOCATION_FIELDS], ["meetingPoint", "pickupAddress", "dropOffPoint", "accessNotes", "whatToBring"]);
});
