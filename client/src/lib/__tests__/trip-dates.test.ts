/**
 * Row 154: the destination page's compact trip-date range.
 *   TD1  same day: "Oct 26", not "Oct 26–26"   TD2  same month: "May 3–7"
 *   TD3  cross-month: "Oct 30 – Nov 2"         TD4  cross-year, same day or month numbers: both months named, never collapsed
 *   TD5  missing or bad dates
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { formatTripDates } from "../trip-dates";

test("TD1 — same day", () => {
  assert.equal(formatTripDates("2026-10-26", "2026-10-26"), "Oct 26");
});
test("TD2 — same month", () => {
  assert.equal(formatTripDates("2026-05-03", "2026-05-07"), "May 3–7");
});
test("TD3 — cross-month", () => {
  assert.equal(formatTripDates("2026-10-30", "2026-11-02"), "Oct 30 – Nov 2");
});
test("TD4 — cross-year", () => {
  assert.equal(formatTripDates("2026-12-30", "2027-01-02"), "Dec 30 – Jan 2");
  assert.equal(formatTripDates("2026-10-26", "2027-10-26"), "Oct 26 – Oct 26", "a year apart is not one day");
  assert.equal(formatTripDates("2026-10-03", "2027-10-07"), "Oct 3 – Oct 7", "a year apart is not one month");
});
test("TD5 — missing or bad dates", () => {
  assert.equal(formatTripDates(undefined, "2026-10-26"), null);
  assert.equal(formatTripDates("2026-10-26"), "Oct 26");
  assert.equal(formatTripDates("nope", "2026-10-26"), null);
  assert.equal(formatTripDates("2026-10-26", "nope"), "Oct 26");
});
test("the destination page reads this formatter", () => {
  const page = fs.readFileSync("client/src/pages/discover-location.tsx", "utf8");
  assert.match(page, /import \{ formatTripDates \} from "@\/lib\/trip-dates";/);
  assert.doesNotMatch(page, /function formatTripDates\(/);
});
