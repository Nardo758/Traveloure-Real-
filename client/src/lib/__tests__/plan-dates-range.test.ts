/**
 * Cut-list #1 slice B — the range calendar's pure rules (`client/src/lib/plan-dates-range.ts`).
 *
 *   R1 validate: same day ok, leave after arrive ok, leave before arrive is the one refusal, partial is incomplete
 *   R2 (deleted with `shiftRange`, QA round 3 option A — an earlier tap no longer moves the trip)
 *   R3 nextRange (QA round 3, Leon, Nov 11, 2026 — option A): a tap never silently rewrites the arrive day; an earlier
 *      tap is the leave day and the pair is refused; while refused, an earlier tap starts over and a later one clears it;
 *      a prefilled range follows the same rule; month/year/leap boundaries are calendar-day arithmetic
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

describe("R3 nextRange — one tap (option A)", () => {
  const refused = (r: { start: string | null; end: string | null }) => validateRange(r.start, r.end) === "leave_before_arrive";
  it("first tap is the arrive day", () => {
    assert.deepEqual(nextRange({ start: null, end: null }, "2026-11-12"), { start: "2026-11-12", end: null });
  });
  it("a later tap is the leave day; the same day again is a same-day trip", () => {
    assert.deepEqual(nextRange({ start: "2026-11-12", end: null }, "2026-11-15"), { start: "2026-11-12", end: "2026-11-15" });
    assert.deepEqual(nextRange({ start: "2026-11-12", end: null }, "2026-11-12"), { start: "2026-11-12", end: "2026-11-12" });
  });
  it("an earlier tap is the leave day and the pair is refused (arrive only, line 85)", () => {
    const r = nextRange({ start: "2026-11-12", end: null }, "2026-11-10");
    assert.deepEqual(r, { start: "2026-11-12", end: "2026-11-10" });
    assert.ok(refused(r), "the approved sentence shows and Save is disabled");
  });
  it("with both picked, an earlier tap is refused too (line 86); on/after arrive is the new leave", () => {
    const r = nextRange({ start: "2026-11-12", end: "2026-11-15" }, "2026-11-09");
    assert.deepEqual(r, { start: "2026-11-12", end: "2026-11-09" });
    assert.ok(refused(r));
    assert.deepEqual(nextRange({ start: "2026-11-12", end: "2026-11-15" }, "2026-11-20"), { start: "2026-11-12", end: "2026-11-20" });
    assert.deepEqual(nextRange({ start: "2026-11-12", end: "2026-11-15" }, "2026-11-12"), { start: "2026-11-12", end: "2026-11-12" });
  });
  it("while refused: an earlier tap starts a new range; an on/after tap sets the leave day and clears it", () => {
    const shown = { start: "2026-11-12", end: "2026-11-09" };
    assert.deepEqual(nextRange(shown, "2026-11-05"), { start: "2026-11-05", end: null }, "restart only while refused");
    const cleared = nextRange(shown, "2026-11-14");
    assert.deepEqual(cleared, { start: "2026-11-12", end: "2026-11-14" });
    assert.equal(validateRange(cleared.start, cleared.end), "ok");
    assert.deepEqual(nextRange(shown, "2026-11-12"), { start: "2026-11-12", end: "2026-11-12" }, "the arrive day itself clears it");
  });
  it("a prefilled plan (Dec 1–4) moves to Nov 28–Dec 1 in three taps, the refusal said on the way", () => {
    let r = { start: "2026-12-01" as string | null, end: "2026-12-04" as string | null };
    r = nextRange(r, "2026-11-28");
    assert.ok(refused(r), "first tap: refused, never a silent restart");
    r = nextRange(r, "2026-11-28");
    assert.deepEqual(r, { start: "2026-11-28", end: null });
    r = nextRange(r, "2026-12-01");
    assert.deepEqual(r, { start: "2026-11-28", end: "2026-12-01" });
  });
  it("the arrive day never changes outside the refused state", () => {
    let r = { start: "2026-11-20" as string | null, end: null as string | null };
    for (const d of ["2026-11-25", "2026-11-22", "2026-11-30", "2026-11-20"]) {
      r = nextRange(r, d);
      assert.equal(r.start, "2026-11-20", JSON.stringify(r));
    }
  });
  it("calendar-day arithmetic across month, year and leap boundaries", () => {
    assert.deepEqual(nextRange({ start: "2026-12-30", end: null }, "2027-01-02"), { start: "2026-12-30", end: "2027-01-02" });
    assert.ok(refused(nextRange({ start: "2028-03-01", end: null }, "2028-02-29")));
    assert.deepEqual(nextRange({ start: "2026-11-12", end: "2026-11-14" }, "nope"), { start: "2026-11-12", end: "2026-11-14" }, "a bad day changes nothing");
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
    assert.equal(LEAVE_BEFORE_ARRIVE_MESSAGE, "Leave date can't be before your arrive date.");
  });
});
