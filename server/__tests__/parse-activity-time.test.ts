/**
 * parse-activity-time.test.ts
 *
 * Pure unit test for CC-3's fix: server/utils/itinerary-time.ts's parseActivityTimeToMinutes,
 * used by getTripByShareToken (server/services/booking-actions.service.ts) to sort a shared
 * trip's day activities CHRONOLOGICALLY instead of lexically by the stored "h:mm AM/PM" string.
 *
 * No DB required — this module has zero dependencies, so it is safe to `tsx --test` in any
 * environment (unlike importing booking-actions.service.ts directly, which pulls in server/db.ts
 * and throws at import time when DATABASE_URL is unset).
 *
 * Run with: npx tsx --test server/__tests__/parse-activity-time.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseActivityTimeToMinutes } from "../utils/itinerary-time";

describe("parseActivityTimeToMinutes", () => {
  it("parses 12-hour AM/PM strings to minutes-since-midnight", () => {
    assert.equal(parseActivityTimeToMinutes("9:00 AM"), 9 * 60);
    assert.equal(parseActivityTimeToMinutes("09:00 AM"), 9 * 60);
    assert.equal(parseActivityTimeToMinutes("05:30 PM"), 17 * 60 + 30);
    assert.equal(parseActivityTimeToMinutes("12:00 AM"), 0); // midnight
    assert.equal(parseActivityTimeToMinutes("12:00 PM"), 12 * 60); // noon
    assert.equal(parseActivityTimeToMinutes("12:30 AM"), 30);
    assert.equal(parseActivityTimeToMinutes("12:30 PM"), 12 * 60 + 30);
  });

  it("is case-insensitive and tolerates extra whitespace", () => {
    assert.equal(parseActivityTimeToMinutes("9:00 am"), 9 * 60);
    assert.equal(parseActivityTimeToMinutes("9:00am"), 9 * 60);
    assert.equal(parseActivityTimeToMinutes("  5:30 pm  "), 17 * 60 + 30);
  });

  it("CC-3 regression: PM times sort AFTER earlier-in-day AM times", () => {
    const times = ["05:30 PM", "09:00 AM", "07:15 AM", "11:45 PM"];
    const sorted = [...times].sort(
      (a, b) => parseActivityTimeToMinutes(a) - parseActivityTimeToMinutes(b),
    );
    assert.deepEqual(sorted, ["07:15 AM", "09:00 AM", "05:30 PM", "11:45 PM"]);

    // The OLD lexical-string sort this replaces gets it wrong — documented here so the
    // regression is unmistakable if someone reintroduces `.sort()` on the raw strings.
    const lexicallySorted = [...times].sort((a, b) => a.localeCompare(b));
    assert.deepEqual(lexicallySorted, ["05:30 PM", "07:15 AM", "09:00 AM", "11:45 PM"]);
    assert.notDeepEqual(lexicallySorted, sorted);
  });

  it("falls back to a bare 24-hour HH:MM parse for legacy rows", () => {
    assert.equal(parseActivityTimeToMinutes("09:00"), 9 * 60);
    assert.equal(parseActivityTimeToMinutes("17:30"), 17 * 60 + 30);
    assert.equal(parseActivityTimeToMinutes("00:00"), 0);
    assert.equal(parseActivityTimeToMinutes("23:59"), 23 * 60 + 59);
  });

  it("sends null/absent/unparseable values to +Infinity (sort last, stably)", () => {
    assert.equal(parseActivityTimeToMinutes(null), Number.POSITIVE_INFINITY);
    assert.equal(parseActivityTimeToMinutes(undefined), Number.POSITIVE_INFINITY);
    assert.equal(parseActivityTimeToMinutes(""), Number.POSITIVE_INFINITY);
    assert.equal(parseActivityTimeToMinutes("TBD"), Number.POSITIVE_INFINITY);
    assert.equal(parseActivityTimeToMinutes("13:00 PM"), Number.POSITIVE_INFINITY); // invalid 12h hour
    assert.equal(parseActivityTimeToMinutes("25:00"), Number.POSITIVE_INFINITY); // invalid 24h hour
  });

  it("stable sort keeps absent-time activities in their original relative order", () => {
    const activities = [
      { title: "no-time-1", time: undefined as string | undefined },
      { title: "09:00", time: "09:00 AM" },
      { title: "no-time-2", time: undefined as string | undefined },
      { title: "05:30", time: "05:30 PM" },
    ];
    const sorted = [...activities].sort(
      (a, b) => parseActivityTimeToMinutes(a.time) - parseActivityTimeToMinutes(b.time),
    );
    assert.deepEqual(
      sorted.map((a) => a.title),
      ["09:00", "05:30", "no-time-1", "no-time-2"],
    );
  });
});
