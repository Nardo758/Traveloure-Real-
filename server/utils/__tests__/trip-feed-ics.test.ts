/**
 * §8 phone delivery — the calendar feed's builder, `generateTripFeedIcs` (ledger `2026-10-17-phone-delivery-calendar`).
 *   F1 no usable zone ⇒ floating local times: no TZID, no Z, no VTIMEZONE.
 *   F2 a zone with no change inside the window carries one observance and TZID'd times.
 *   F3 text is escaped (\ ; , and line breaks) and long lines fold at 75 octets.
 *   F4 an unreadable start time is an all-day event, never a guessed hour; no duration ⇒ no end claimed.
 *   F5 UID and SEQUENCE are emitted as given; DTSTAMP is the copy's own time.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateTripFeedIcs, parseFeedStartMinutes } from "../ics-calendar";

const madeAt = new Date("2026-10-16T19:15:00Z");
const ev = { uid: "i1@traveloure.com", sequence: 3, date: "2026-11-04", startTime: "15:00", durationMinutes: 45, summary: "Tea" };
const unfold = (s: string) => s.replace(/\r\n /g, "");

test("F1: no usable zone ⇒ floating times", () => {
  for (const tz of [null, "Not/AZone"]) {
    const ics = generateTripFeedIcs({ calendarName: "Trip", timezone: tz, madeAt, events: [ev] });
    assert.match(ics, /\r\nDTSTART:20261104T150000\r\n/);
    assert.doesNotMatch(ics, /TZID|VTIMEZONE|X-WR-TIMEZONE/);
  }
});

test("F2: Asia/Tokyo — one observance, TZID'd local time", () => {
  const ics = generateTripFeedIcs({ calendarName: "Trip", timezone: "Asia/Tokyo", madeAt, events: [ev] });
  assert.match(ics, /DTSTART;TZID=Asia\/Tokyo:20261104T150000/);
  assert.equal((ics.match(/TZOFFSETTO:\+0900/g) ?? []).length, 1);
  assert.match(ics, /DURATION:PT45M/);
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
});

test("F3: escaping and folding", () => {
  const long = "Line one; with, commas\\and a backslash\nsecond line " + "é".repeat(60);
  const ics = generateTripFeedIcs({ calendarName: "Trip", timezone: "Asia/Tokyo", madeAt, events: [{ ...ev, description: long }] });
  for (const line of ics.split("\r\n")) assert.ok(Buffer.byteLength(line, "utf8") <= 75, `line too long: ${line}`);
  assert.match(unfold(ics), /DESCRIPTION:Line one\\; with\\, commas\\\\and a backslash\\nsecond line é/);
});

test("F4: an unreadable time is all-day; no duration ⇒ no end", () => {
  assert.equal(parseFeedStartMinutes("morning"), null);
  assert.equal(parseFeedStartMinutes("25:00"), null);
  assert.equal(parseFeedStartMinutes("12:30 AM"), 30);
  assert.equal(parseFeedStartMinutes("1:05 PM"), 13 * 60 + 5);
  const ics = generateTripFeedIcs({
    calendarName: "Trip",
    timezone: "Asia/Tokyo",
    madeAt,
    events: [{ ...ev, startTime: "morning" }, { ...ev, uid: "i2@traveloure.com", durationMinutes: null }],
  });
  assert.match(ics, /DTSTART;VALUE=DATE:20261104\r\nDTEND;VALUE=DATE:20261105/);
  const second = ics.split("UID:i2@traveloure.com")[1].split("END:VEVENT")[0];
  assert.doesNotMatch(second, /DURATION|DTEND/);
});

test("F5: UID, SEQUENCE, DTSTAMP", () => {
  const ics = generateTripFeedIcs({ calendarName: "Trip", timezone: "Asia/Tokyo", madeAt, events: [ev] });
  assert.match(ics, /UID:i1@traveloure\.com\r\nSEQUENCE:3\r\nDTSTAMP:20261016T191500Z/);
});
