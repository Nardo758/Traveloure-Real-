import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateIcsContent } from "../utils/ics-calendar";

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