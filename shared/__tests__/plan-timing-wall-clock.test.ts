/**
 * PLAN TIMING — the WALL-CLOCK half (lane L9, ledger `2026-09-07-trip-card-one-page`).
 * CLAUDE.md Locked Decision 30, §13, §18 rule 1.
 *
 * TWO LANES WROTE `shared/plan-timing.ts` IN PARALLEL AND ONE MODULE SURVIVED. Lane L10
 * (`2026-09-07-home-time-axis`) owns the START-INSTANT half — the plan's day, the 48-hour window
 * and their NULL-zone posture — and `shared/__tests__/plan-timing.test.ts` is its proof, unchanged.
 * This file proves ONLY L9's additions: the TIME-OF-DAY primitives the Trip Card needs to decide
 * whether an item has passed and whether a countdown may be claimed at all. They are built on
 * L10's `isUsableTimeZone` / `calendarParts` / `zonedMidnight`, so a change to the zone engine
 * fails in both suites rather than in neither.
 *
 * What these hold:
 *   W1  "HH:MM" parses to minutes; anything else is NULL — never a coerced midnight
 *   W2  a wall clock resolves to the right instant, and the offset follows the DATE (DST)
 *   W3  a spring-forward day is corrected, not overshot by the offset change
 *   W4  NO ZONE ⇒ NO INSTANT (LD 30: never UTC, never the server's, never the device's)
 *   W5  an absent time is never treated as midnight (§13 — a claim the row did not make)
 *
 * Pure: no DB, no DOM, no network, no clock of its own.
 * Run: npx tsx --test shared/__tests__/plan-timing-wall-clock.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { isUsableTimeZone, parseWallClockMinutes, zonedWallClockToInstant } from "../plan-timing";

test("W1: 'HH:MM' → minutes since midnight; anything else is NULL", () => {
  assert.equal(parseWallClockMinutes("09:05"), 545);
  assert.equal(parseWallClockMinutes("00:00"), 0);
  assert.equal(parseWallClockMinutes("23:59"), 1439);
  assert.equal(parseWallClockMinutes("25:00"), null);
  assert.equal(parseWallClockMinutes("09:60"), null);
  assert.equal(parseWallClockMinutes("9:5"), null);
  assert.equal(parseWallClockMinutes(""), null);
  assert.equal(parseWallClockMinutes(null), null);
});

test("W2: a wall clock resolves in the plan's zone, and the offset follows the date", () => {
  // Tokyo has no DST: 16:00 on Oct 3 is 07:00Z the same day.
  assert.equal(
    zonedWallClockToInstant("2026-10-03", "16:00", "Asia/Tokyo")?.toISOString(),
    "2026-10-03T07:00:00.000Z",
  );
  // Paris is UTC+2 in July and UTC+1 in December — the same wall clock, two instants.
  assert.equal(
    zonedWallClockToInstant("2026-07-01", "12:00", "Europe/Paris")?.toISOString(),
    "2026-07-01T10:00:00.000Z",
  );
  assert.equal(
    zonedWallClockToInstant("2026-12-01", "12:00", "Europe/Paris")?.toISOString(),
    "2026-12-01T11:00:00.000Z",
  );
  // A longer ISO string contributes only its leading DATE — a wall-clock column is never re-zoned.
  assert.equal(
    zonedWallClockToInstant("2026-10-03T23:30:00.000Z", "16:00", "Asia/Tokyo")?.toISOString(),
    "2026-10-03T07:00:00.000Z",
  );
});

test("W3: a spring-forward day is corrected, not overshot (New York, 2026-03-08)", () => {
  // Midnight is EST (UTC−5) and 09:00 is EDT (UTC−4); midnight-plus-nine-hours would land at
  // 10:00 local, so the correction pass is what makes this 09:00.
  assert.equal(
    zonedWallClockToInstant("2026-03-08", "09:00", "America/New_York")?.toISOString(),
    "2026-03-08T13:00:00.000Z",
  );
  // Before the 02:00 jump the offset is still EST.
  assert.equal(
    zonedWallClockToInstant("2026-03-08", "01:00", "America/New_York")?.toISOString(),
    "2026-03-08T06:00:00.000Z",
  );
  // The day after the transition, the same wall clock is one hour earlier in UTC.
  assert.equal(
    zonedWallClockToInstant("2026-03-09", "09:00", "America/New_York")?.toISOString(),
    "2026-03-09T13:00:00.000Z",
  );
});

test("W4: NO usable zone ⇒ NO instant (Locked Decision 30)", () => {
  for (const zone of [null, undefined, "", "   ", "Mars/Olympus_Mons"]) {
    assert.equal(zonedWallClockToInstant("2026-10-03", "16:00", zone), null, `zone ${String(zone)}`);
    assert.equal(isUsableTimeZone(zone), false, `zone ${String(zone)}`);
  }
  assert.equal(isUsableTimeZone("Asia/Tokyo"), true);
});

test("W5: an absent time is NEVER midnight, and an unparseable day is NEVER 'now'", () => {
  assert.equal(zonedWallClockToInstant("2026-10-03", null, "Asia/Tokyo"), null);
  assert.equal(zonedWallClockToInstant("2026-10-03", "", "Asia/Tokyo"), null);
  assert.equal(zonedWallClockToInstant("2026-02-30", "16:00", "Asia/Tokyo"), null);
  assert.equal(zonedWallClockToInstant("not a date", "16:00", "Asia/Tokyo"), null);
  // A caller that really means midnight says so.
  assert.equal(
    zonedWallClockToInstant("2026-10-03", "00:00", "Asia/Tokyo")?.toISOString(),
    "2026-10-02T15:00:00.000Z",
  );
});
