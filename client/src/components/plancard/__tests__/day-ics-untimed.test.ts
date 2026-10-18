import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDayIcs, dayIcsDate } from "../day-ics";
import type { PlanCardActivity, PlanCardDay } from "../plancard-types";

const act = (over: Partial<PlanCardActivity>): PlanCardActivity =>
  ({ id: "a", name: "Yasaka Shrine", type: "activity", status: "planned", time: "", location: "Gion", cost: 0, comments: 0, ...over }) as PlanCardActivity;

test("U1 an untimed item is an all-day event, never an invented 09:00", () => {
  const ics = buildDayIcs([act({ time: "" })], "20261031", "Kyoto");
  assert.match(ics, /DTSTART;VALUE=DATE:20261031\r\n/);
  assert.match(ics, /DTEND;VALUE=DATE:20261101\r\n/);
  assert.doesNotMatch(ics, /T0900/);
});

test("U2 an untimed item at year end ends on the next calendar day", () => {
  const ics = buildDayIcs([act({ time: "TBD" })], "20261231", "Kyoto");
  assert.match(ics, /DTEND;VALUE=DATE:20270101/);
});

test("U3 a timed item with a known duration ends at start + duration", () => {
  const ics = buildDayIcs([act({ time: "14:30", durationMinutes: 90 })], "20261031", "Kyoto");
  assert.match(ics, /DTSTART:20261031T143000\r\n/);
  assert.match(ics, /DTEND:20261031T160000\r\n/);
  assert.doesNotMatch(ics, /VALUE=DATE/);
});

test("U4 a duration past midnight ends on the next day", () => {
  const ics = buildDayIcs([act({ time: "23:30", durationMinutes: 60 })], "20261031", "Kyoto");
  assert.match(ics, /DTEND:20261101T003000/);
});

test("U5 a timed item with no duration carries DTSTART only — no made-up end", () => {
  for (const durationMinutes of [undefined, null, 0]) {
    const ics = buildDayIcs([act({ time: "14:30", durationMinutes })], "20261031", "Kyoto");
    assert.match(ics, /DTSTART:20261031T143000\r\n/);
    assert.doesNotMatch(ics, /DTEND/);
  }
});

test("U6 a day with no date has no .ics date — never today's", () => {
  assert.equal(dayIcsDate({ dayNum: 1 } as PlanCardDay), null);
  assert.equal(dayIcsDate({ dayNum: 1, date: "" } as PlanCardDay), null);
  assert.equal(dayIcsDate({ dayNum: 1, date: "2026-10-31" } as PlanCardDay), "20261031");
});
