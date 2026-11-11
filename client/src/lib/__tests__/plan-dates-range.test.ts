/**
 * Cut-list #1 slice B — the range calendar's pure rules (`client/src/lib/plan-dates-range.ts`).
 *
 *   R1 validate: same day ok, leave after arrive ok, leave before arrive is the one refusal, partial is incomplete
 *   R2 shiftRange keeps the nights across month ends, year ends, leap days and DST weekends
 *   R3 nextRange: the tap rules (arrive, leave, same day, earlier tap moves the trip, later tap is the new leave)
 *   R4 initialRange: no prefill when the dates were never chosen; confirmed dates prefill
 *   R5 rangeSummary formats like the header chip and claims nothing when nothing is picked
 *   R6 the refusal sentence is the approved wording, verbatim
 *
 * Run: npx tsx --test client/src/lib/__tests__/plan-dates-range.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  LEAVE_BEFORE_ARRIVE_MESSAGE,
  dayNumber,
  initialRange,
  isoDay,
  nextRange,
  rangeSummary,
  shiftRange,
  validateRange,
} from "../plan-dates-range";

describe("R1 validateRange", () => {
  it("the table", () => {
    assert.equal(validateRange("2026-11-12", "2026-11-12"), "ok", "same-day trips are allowed");
    assert.equal(validateRange("2026-11-12", "2026-11-15"), "ok");
    assert.equal(validateRange("2026-11-15", "2026-11-12"), "leave_before_arrive");
    assert.equal(validateRange("2026-11-12", null), "incomplete");
    assert.equal(validateRange(null, "2026-11-12"), "incomplete");
    assert.equal(validateRange("2026-02-30", "2026-03-01"), "incomplete", "not a real day");
  });
});

describe("R2 shiftRange keeps the nights", () => {
  const cases: Array<[string, string, string, string]> = [
    ["2026-11-12", "2026-11-15", "2026-11-29", "2026-12-02"],
    ["2026-12-30", "2027-01-02", "2027-01-30", "2027-02-02"],
    ["2028-02-27", "2028-03-01", "2028-02-28", "2028-03-02"], // leap year
    ["2026-03-06", "2026-03-09", "2026-03-07", "2026-03-10"], // US DST starts Mar 8
    ["2026-10-24", "2026-10-26", "2026-10-25", "2026-10-27"], // EU DST ends Oct 25
    ["2026-11-12", "2026-11-12", "2026-11-20", "2026-11-20"], // a same-day trip stays one day
  ];
  for (const [a, b, newStart, expectEnd] of cases) {
    it(`${a}..${b} → ${newStart}`, () => {
      assert.deepEqual(shiftRange({ start: a, end: b }, newStart), { start: newStart, end: expectEnd });
    });
  }
  it("a missing leave day stays missing; a bad day changes nothing", () => {
    assert.deepEqual(shiftRange({ start: "2026-11-12", end: null }, "2026-11-20"), { start: "2026-11-20", end: null });
    assert.deepEqual(shiftRange({ start: "2026-11-12", end: "2026-11-14" }, "nope"), { start: "2026-11-12", end: "2026-11-14" });
  });
});

describe("R3 nextRange — one tap", () => {
  it("first tap is the arrive day", () => {
    assert.deepEqual(nextRange({ start: null, end: null }, "2026-11-12"), { start: "2026-11-12", end: null });
  });
  it("a later tap is the leave day; the same day again is a same-day trip", () => {
    assert.deepEqual(nextRange({ start: "2026-11-12", end: null }, "2026-11-15"), { start: "2026-11-12", end: "2026-11-15" });
    assert.deepEqual(nextRange({ start: "2026-11-12", end: null }, "2026-11-12"), { start: "2026-11-12", end: "2026-11-12" });
  });
  it("an earlier tap before a leave day exists starts over there", () => {
    assert.deepEqual(nextRange({ start: "2026-11-12", end: null }, "2026-11-10"), { start: "2026-11-10", end: null });
  });
  it("with both picked: earlier moves the trip (nights kept), on/after arrive is the new leave", () => {
    assert.deepEqual(nextRange({ start: "2026-11-12", end: "2026-11-15" }, "2026-11-09"), { start: "2026-11-09", end: "2026-11-12" });
    assert.deepEqual(nextRange({ start: "2026-11-12", end: "2026-11-15" }, "2026-11-20"), { start: "2026-11-12", end: "2026-11-20" });
    assert.deepEqual(nextRange({ start: "2026-11-12", end: "2026-11-15" }, "2026-11-12"), { start: "2026-11-12", end: "2026-11-12" });
  });
  it("a tap can never produce leave before arrive", () => {
    let r = { start: null as string | null, end: null as string | null };
    for (const d of ["2026-11-20", "2026-11-03", "2026-11-25", "2026-11-01", "2026-11-01"]) {
      r = nextRange(r, d);
      assert.notEqual(validateRange(r.start, r.end), "leave_before_arrive", JSON.stringify(r));
    }
  });
});

describe("R4 initialRange", () => {
  it("no prefill for dates nobody chose", () => {
    assert.deepEqual(initialRange({ startDate: "2026-11-11", endDate: "2026-11-11", datesConfirmed: false }), { start: null, end: null });
  });
  it("confirmed (or unstated) dates prefill, timestamps read as their day", () => {
    assert.deepEqual(initialRange({ startDate: "2026-11-12", endDate: "2026-11-15", datesConfirmed: true }), { start: "2026-11-12", end: "2026-11-15" });
    assert.deepEqual(initialRange({ startDate: "2026-11-12T00:00:00.000Z", endDate: "2026-11-15T00:00:00.000Z" }), { start: "2026-11-12", end: "2026-11-15" });
    assert.equal(isoDay(null), "");
    assert.equal(dayNumber("2026-13-01"), null);
  });
});

describe("R5 rangeSummary", () => {
  it("formats like the header chip", () => {
    assert.equal(rangeSummary({ start: null, end: null }), null);
    assert.equal(rangeSummary({ start: "2026-11-12", end: null }), "Nov 12 –");
    assert.equal(rangeSummary({ start: "2026-11-12", end: "2026-11-12" }), "Nov 12");
    assert.equal(rangeSummary({ start: "2026-11-12", end: "2026-11-15" }), "Nov 12–15");
    assert.equal(rangeSummary({ start: "2026-11-28", end: "2026-12-03" }), "Nov 28 – Dec 3");
  });
});

describe("R6 copy", () => {
  it("the refusal is the approved sentence", () => {
    assert.equal(LEAVE_BEFORE_ARRIVE_MESSAGE, "Leave date must be after your arrive date.");
  });
});
