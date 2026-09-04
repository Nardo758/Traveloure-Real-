import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateIcsContent } from "../utils/ics-calendar";
import { resolveTripTimezone } from "../services/trip-timezone";

/**
 * The three blocks below are the two branches of ledger `2026-09-04-plan-mint` plus the derivation
 * that feeds them. Read them together: the FIRST block is the pre-existing behaviour, asserted
 * unchanged, which is the whole point of a NULL timezone — a plan that never captured a zone must
 * export exactly what it exported yesterday, not a newly-guessed instant.
 */
describe("ICS trip-local wall-clock export", () => {
  it("keeps a DST-boundary activity at its stored wall-clock time", () => {
    const ics = generateIcsContent(
      { startDate: "2034-03-12", destination: "New York" },
      [{ id: "dst", dayNumber: 1, startTime: "09:00", durationMinutes: 90, name: "Breakfast" }],
      new Date("2034-01-01T00:00:00Z"),
    );
    assert.match(ics, /DTSTART:20340312T090000/);
    assert.match(ics, /DTEND:20340312T103000/);
    assert.doesNotMatch(ics, /DTSTART:.*Z/);
    assert.match(ics, /DTSTAMP:20340101T000000Z/);
  });

  it("rolls midnight and year boundaries without using the server timezone", () => {
    const ics = generateIcsContent(
      { startDate: "2034-12-31", destination: "Adelaide" },
      [{ id: "new-year", dayNumber: 1, startTime: "11:30 PM", duration: 120, name: "Countdown" }],
    );
    assert.match(ics, /DTSTART:20341231T233000/);
    assert.match(ics, /DTEND:20350101T013000/);
  });

  it("preserves date-only day offsets", () => {
    const ics = generateIcsContent(
      { startDate: new Date("2034-11-03T00:00:00Z"), destination: "Los Angeles" },
      [{ id: "fall-back", dayNumber: 2, startTime: "12:00 AM", durationMinutes: 30, name: "Early start" }],
    );
    assert.match(ics, /DTSTART:20341104T000000/);
    assert.match(ics, /DTEND:20341104T003000/);
  });
});

describe("ICS export with the plan's timezone (ledger 2026-09-04-plan-mint)", () => {
  it("pins a Kyoto plan's wall clock to the real instant, not the reader's zone", () => {
    // 09:00 wall clock in Asia/Tokyo (UTC+9, no DST) is 00:00Z the same day. The FLOATING form of
    // this same event — asserted in the first block above — is `20340312T090000` with no Z, which
    // a calendar in Sydney would render as 09:00 AEDT: nine hours off. This is the bug closed.
    const ics = generateIcsContent(
      { startDate: "2034-03-12", destination: "Kyoto, Japan", timezone: "Asia/Tokyo" },
      [{ id: "tea", dayNumber: 1, startTime: "09:00", durationMinutes: 90, name: "Tea ceremony" }],
      new Date("2034-01-01T00:00:00Z"),
    );
    assert.match(ics, /DTSTART:20340312T000000Z/);
    assert.match(ics, /DTEND:20340312T013000Z/);
    // Not floating any more: every DTSTART/DTEND carries the UTC designator.
    assert.doesNotMatch(ics, /DTSTART:\d{8}T\d{6}\r/);
  });

  it("applies the zone's REAL DST rules, not a fixed offset", () => {
    // 2034-03-12 is the second Sunday in March — US DST begins at 02:00 local. A 09:00 activity is
    // therefore EDT (UTC-4) ⇒ 13:00Z, not EST's 14:00Z. The offset is read from the runtime's IANA
    // data, so nothing here is a hardcoded table that can go stale.
    const ics = generateIcsContent(
      { startDate: "2034-03-12", destination: "New York", timezone: "America/New_York" },
      [{ id: "dst", dayNumber: 1, startTime: "09:00", durationMinutes: 90, name: "Breakfast" }],
      new Date("2034-01-01T00:00:00Z"),
    );
    assert.match(ics, /DTSTART:20340312T130000Z/);
    assert.match(ics, /DTEND:20340312T143000Z/);
  });

  it("keeps EXACTLY today's floating output when the plan carries no timezone", () => {
    // §13: a plan that never captured a zone has nothing to pin to, so the export must not move.
    // Asserted as an equality against the same call with the field absent — a stricter statement
    // than matching a pattern, because it also catches a stray Z, a TZID or a reordered property.
    const args = [
      { startDate: "2034-03-12", destination: "Somewhere unmapped" },
      [{ id: "dst", dayNumber: 1, startTime: "09:00", durationMinutes: 90, name: "Breakfast" }],
      new Date("2034-01-01T00:00:00Z"),
    ] as const;
    const withNull = generateIcsContent({ ...args[0], timezone: null }, [...args[1]], args[2]);
    const withoutField = generateIcsContent(args[0], [...args[1]], args[2]);
    assert.equal(withNull, withoutField);
    assert.match(withNull, /DTSTART:20340312T090000\r/);
    assert.match(withNull, /DTEND:20340312T103000\r/);
    assert.doesNotMatch(withNull, /DTSTART:[^\r]*Z/);
    assert.doesNotMatch(withNull, /TZID/);
  });

  it("treats an unusable IANA id exactly like an absent one — never a substituted zone", () => {
    const bogus = generateIcsContent(
      { startDate: "2034-03-12", destination: "Nowhere", timezone: "Not/AZone" },
      [{ id: "x", dayNumber: 1, startTime: "09:00", durationMinutes: 90, name: "Breakfast" }],
      new Date("2034-01-01T00:00:00Z"),
    );
    const absent = generateIcsContent(
      { startDate: "2034-03-12", destination: "Nowhere" },
      [{ id: "x", dayNumber: 1, startTime: "09:00", durationMinutes: 90, name: "Breakfast" }],
      new Date("2034-01-01T00:00:00Z"),
    );
    assert.equal(bogus, absent);
    assert.doesNotMatch(bogus, /DTSTART:[^\r]*Z/);
  });
});

describe("resolveTripTimezone — a launch-market lookup, not a geocoder", () => {
  it("resolves the operating markets from free-text destinations", () => {
    assert.equal(resolveTripTimezone("Kyoto, Japan"), "Asia/Tokyo");
    assert.equal(resolveTripTimezone("kyoto"), "Asia/Tokyo");
    assert.equal(resolveTripTimezone("Edinburgh, Scotland"), "Europe/London");
    assert.equal(resolveTripTimezone("Bogota, Colombia"), "America/Bogota");
  });

  it("returns NULL — never UTC and never a nearest market — outside them", () => {
    // The contrast with `timezoneForMarket`, which answers "UTC" for an unmapped market: right for
    // the demand rollup's daily grain, a CLAIM if it were stored on a plan.
    for (const outside of ["Lisbon, Portugal", "Paris", "unknown", "", null, undefined]) {
      assert.equal(resolveTripTimezone(outside as any), null, `expected null for ${String(outside)}`);
    }
  });
});
