/**
 * F-1 regression pin — trip dates must not render one day early.
 *
 * Run under all three timezones (this is the whole point of the pin — the bug is invisible at
 * UTC and east of it):
 *
 *   TZ=America/New_York npx tsx --test client/src/lib/__tests__/trip-date-local-parse.test.ts
 *   TZ=Asia/Tokyo       npx tsx --test client/src/lib/__tests__/trip-date-local-parse.test.ts
 *   TZ=UTC              npx tsx --test client/src/lib/__tests__/trip-date-local-parse.test.ts
 *
 * The bug: `trips.start_date` / `end_date` are Postgres DATE columns and reach the client as
 * bare "YYYY-MM-DD" strings. `new Date("2026-11-10")` is specified to parse as UTC midnight, so
 * any viewer west of UTC renders the PREVIOUS calendar day — a tester entering Nov 10–14 saw the
 * slip render "Nov 9 – Nov 13".
 *
 * The pin, three halves:
 *   1. a date-only string is the day it says it is, in LOCAL time, in every timezone;
 *   2. a full ISO timestamp still parses as an instant (unchanged behaviour — the same helper is
 *      used for diary `createdAt` rows, which must keep their time of day);
 *   3. null / empty / unparseable → null, never an Invalid Date leaking into a formatter.
 *
 * Pure unit test: no DB, no browser, CI-safe.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

const { parseTripDate, parseTripDateOrInvalid } = await import("../calendar-date");

const TZ = process.env.TZ ?? "(unset)";

test(`date-only "2026-11-10" is local Nov 10, not Nov 9 [TZ=${TZ}]`, () => {
  const d = parseTripDate("2026-11-10");
  assert.ok(d, "should parse");
  assert.equal(d!.getFullYear(), 2026);
  assert.equal(d!.getMonth(), 10, "getMonth() must be 10 (November)");
  assert.equal(d!.getDate(), 10, "getDate() must be 10 — the day the traveller entered");
  assert.equal(d!.getHours(), 0, "date-only parses to LOCAL midnight");
});

test(`a whole date range keeps both ends [TZ=${TZ}]`, () => {
  const start = parseTripDate("2026-11-10")!;
  const end = parseTripDate("2026-11-14")!;
  assert.equal(start.getDate(), 10);
  assert.equal(end.getDate(), 14);
  assert.equal(end.getMonth(), 10);
});

test(`the naive parse is what we are pinning against [TZ=${TZ}]`, () => {
  // Demonstrates the defect rather than asserting a timezone-dependent value: whatever
  // `new Date()` does with a date-only string, parseTripDate must land on the stated day.
  const naive = new Date("2026-11-10");
  const fixed = parseTripDate("2026-11-10")!;
  assert.equal(fixed.getDate(), 10);
  if (naive.getDate() !== 10) {
    assert.notEqual(naive.getDate(), fixed.getDate(), "this TZ reproduces the original bug");
  }
});

test(`a full ISO timestamp keeps normal instant semantics [TZ=${TZ}]`, () => {
  const iso = "2026-11-10T23:30:00.000Z";
  const d = parseTripDate(iso);
  assert.ok(d);
  assert.equal(d!.toISOString(), iso, "an instant is unchanged — only date-only strings shift");
  const local = parseTripDate("2026-11-10T09:15:00");
  assert.ok(local);
  assert.equal(local!.getHours(), 9, "a local-time timestamp keeps its time of day");
  assert.equal(local!.getDate(), 10);
});

test(`null / empty / unparseable → null [TZ=${TZ}]`, () => {
  assert.equal(parseTripDate(null), null);
  assert.equal(parseTripDate(undefined), null);
  assert.equal(parseTripDate(""), null);
  assert.equal(parseTripDate("   "), null);
  assert.equal(parseTripDate("not a date"), null);
  assert.equal(parseTripDate(new Date("nonsense")), null);
});

test(`a Date instance passes through untouched [TZ=${TZ}]`, () => {
  const src = new Date(2026, 10, 10, 13, 45);
  const d = parseTripDate(src);
  assert.equal(d!.getTime(), src.getTime());
});

test(`parseTripDateOrInvalid: same day, and invalid input still yields an Invalid Date [TZ=${TZ}]`, () => {
  const d = parseTripDateOrInvalid("2026-11-10");
  assert.equal(d.getDate(), 10);
  assert.equal(d.getMonth(), 10);
  assert.ok(Number.isNaN(parseTripDateOrInvalid("not a date").getTime()));
  assert.ok(Number.isNaN(parseTripDateOrInvalid(undefined).getTime()));
});
