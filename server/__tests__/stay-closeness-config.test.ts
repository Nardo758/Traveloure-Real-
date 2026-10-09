/**
 * FU-S1-3 — the closeness thresholds are config, read by name (decision-maker ruling, Oct 9, 2026).
 *
 *   SC1  unset ⇒ the ruled defaults: 20 routed minutes, 1.5 km straight line
 *   SC2  each is overridable by its own env name
 *   SC3  an unusable override (empty, non-numeric, zero, negative) reads the default
 *
 * This is the ONLY test that may state the ruled numbers; every other test reads them through the config.
 * Run: npx tsx --test server/__tests__/stay-closeness-config.test.ts
 */
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { stayCloseRoutedMinutes, stayCloseStraightKm } from "../config/stay-closeness.config";

const NAMES = ["STAY_CLOSE_ROUTED_MINUTES", "STAY_CLOSE_STRAIGHT_KM"] as const;
const saved = Object.fromEntries(NAMES.map((n) => [n, process.env[n]]));
afterEach(() => {
  for (const n of NAMES) {
    if (saved[n] === undefined) delete process.env[n];
    else process.env[n] = saved[n];
  }
});

test("SC1 the ruled defaults", () => {
  for (const n of NAMES) delete process.env[n];
  assert.equal(stayCloseRoutedMinutes(), 20);
  assert.equal(stayCloseStraightKm(), 1.5);
});

test("SC2 each threshold is overridable by name", () => {
  process.env.STAY_CLOSE_ROUTED_MINUTES = "25";
  process.env.STAY_CLOSE_STRAIGHT_KM = "2";
  assert.equal(stayCloseRoutedMinutes(), 25);
  assert.equal(stayCloseStraightKm(), 2);
});

test("SC3 an unusable override reads the default", () => {
  for (const bad of ["", "  ", "abc", "0", "-3"]) {
    process.env.STAY_CLOSE_ROUTED_MINUTES = bad;
    process.env.STAY_CLOSE_STRAIGHT_KM = bad;
    assert.equal(stayCloseRoutedMinutes(), 20, `routed ${JSON.stringify(bad)}`);
    assert.equal(stayCloseStraightKm(), 1.5, `straight ${JSON.stringify(bad)}`);
  }
});
