/**
 * Smoke 10 (ledger `2026-10-04-smoke10-fixes`) — the pure rules, on the smoke-10 fixture.
 *   F1 S10-1(a) a stop ending 08:30 before a 10:10 INTERNATIONAL departure is flagged (cut-off 07:40)
 *   F2 S10-1(a) arrival is measured against arrival + buffer; an absent buffer is the international one
 *   F3 S10-5 a time edit re-sorts the day: timed stops by time, untimed stops keep their place
 */
import test from "node:test";
import assert from "node:assert/strict";
import { FLIGHT_BUFFER_MIN, flightCutoffTime, flightTimeConflictLine } from "../getting-there";
import { orderDayByTime } from "../day-order";

test("F1 S10-1(a): Nishiki Market 07:00–08:30 against a 10:10 international departure is flagged", () => {
  assert.equal(FLIGHT_BUFFER_MIN.departureBefore.international, 150);
  assert.equal(flightCutoffTime("departure", "10:10", 150), "07:40");
  const stops = [
    { id: "nishiki", startTime: "07:00", endTime: "08:30" },
    { id: "early", startTime: "06:30", endTime: "07:30" },
    { id: "dep", startTime: "07:40", endTime: null },
  ];
  assert.equal(flightTimeConflictLine("departure", "10:10", stops, "dep", 150), "1 stop on this day runs past the time to leave for your flight");
  // Measured against the FLIGHT time it would have passed — that was the bug.
  assert.equal(flightTimeConflictLine("departure", "10:10", [stops[0]], null, 0), null);
});

test("F2 S10-1(a): arrival + buffer; an absent buffer is the international figure", () => {
  assert.equal(flightCutoffTime("arrival", "09:05", 120), "11:05");
  assert.equal(flightCutoffTime("arrival", "09:05", null), "11:05");
  assert.equal(flightCutoffTime("departure", "10:10", null), "07:40");
  assert.equal(flightCutoffTime("departure", "01:00", 150), "00:00", "clamped to the day");
  assert.equal(
    flightTimeConflictLine("arrival", "09:05", [{ id: "a", startTime: "10:30", endTime: "11:30" }], null, 120),
    "1 stop on this day starts before you're out of the airport",
  );
  assert.equal(flightTimeConflictLine("arrival", null, [{ id: "a", startTime: "10:30" }]), null);
});

test("F3 S10-5: a stop moved to 09:00 moves up; untimed stops keep their place", () => {
  const day = [
    { id: "a", startTime: "08:00" },
    { id: "b", startTime: "10:30" },
    { id: "free", startTime: null },
    { id: "moved", startTime: "09:00" },
  ];
  assert.deepEqual(orderDayByTime(day), ["a", "moved", "free", "b"]);
  assert.deepEqual(orderDayByTime([{ id: "x", startTime: "10:00" }, { id: "y", startTime: "10:00" }]), ["x", "y"], "stable");
});
