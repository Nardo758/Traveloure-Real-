/**
 * Cut-list #1 slice B — the range calendar's pure rules (`client/src/lib/plan-dates-range.ts`).
 *
 *   R1 validate: same day ok, leave after arrive ok, leave before arrive is the one refusal, partial is incomplete
 *   R2 (deleted with `shiftRange`, QA round 3 option A — an earlier tap no longer moves the trip)
 *   R3 nextRange (QA round 3 option A, Leon, Nov 11, 2026, as amended by ruling (a), Nov 15): picking, an earlier tap is
 *      the leave day and the pair is refused; while refused, an earlier tap starts over and a later one clears it; with
 *      both days set (a prefilled plan included) a tap starts a NEW range — so a trip moves later as well as earlier
 *      (#2019 B8); month/year/leap boundaries are calendar-day arithmetic
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
  monthGridShowsDay,
} from "../plan-dates-range";

describe("R1 validateRange", () => {
  it("the table", () => {
    assert.equal(validateRange("2026-11-12", "2026-11-12"), "ok", "same-day trips are allowed");
    assert.equal(validateRange("2026-11-12", "2026-11-15"), "ok");
    assert.equal(validateRange("2026-11-15", "2026-11-12"), "leave_before_arrive");
  // R4-8: the boundary — a SAME-DAY window is a one-day trip, never 'inverted'.
  assert.equal(validateRange("2026-11-15", "2026-11-15"), "ok", "same day is valid");
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
  it("ruling (a): with both days set, any tap starts a new range there — earlier, later, or the arrive day itself", () => {
    const set = { start: "2026-11-12", end: "2026-11-15" };
    assert.deepEqual(nextRange(set, "2026-11-09"), { start: "2026-11-09", end: null });
    assert.deepEqual(nextRange(set, "2026-11-20"), { start: "2026-11-20", end: null });
    assert.deepEqual(nextRange(set, "2026-11-12"), { start: "2026-11-12", end: null });
    assert.deepEqual(nextRange({ start: "2026-11-12", end: "2026-11-12" }, "2026-11-14"), { start: "2026-11-14", end: null }, "a same-day range too");
  });
  it("while refused: an earlier tap starts a new range; an on/after tap sets the leave day and clears it", () => {
    const shown = { start: "2026-11-12", end: "2026-11-09" };
    assert.deepEqual(nextRange(shown, "2026-11-05"), { start: "2026-11-05", end: null }, "restart only while refused");
    const cleared = nextRange(shown, "2026-11-14");
    assert.deepEqual(cleared, { start: "2026-11-12", end: "2026-11-14" });
    assert.equal(validateRange(cleared.start, cleared.end), "ok");
    assert.deepEqual(nextRange(shown, "2026-11-12"), { start: "2026-11-12", end: "2026-11-12" }, "the arrive day itself clears it");
  });
  it("a prefilled plan moves EARLIER in two taps (Dec 1–4 → Nov 28–Dec 1)", () => {
    let r = { start: "2026-12-01" as string | null, end: "2026-12-04" as string | null };
    r = nextRange(r, "2026-11-28");
    assert.deepEqual(r, { start: "2026-11-28", end: null });
    r = nextRange(r, "2026-12-01");
    assert.deepEqual(r, { start: "2026-11-28", end: "2026-12-01" });
  });
  it("#2019 B8: a prefilled plan moves LATER in two taps (Dec 25 2026 → Dec 1–4 2027)", () => {
    let r = { start: "2026-12-25" as string | null, end: "2026-12-28" as string | null };
    r = nextRange(r, "2027-12-01");
    assert.deepEqual(r, { start: "2027-12-01", end: null });
    r = nextRange(r, "2027-12-04");
    assert.deepEqual(r, { start: "2027-12-01", end: "2027-12-04" });
  });
  it("picking (arrive only), the refusal still holds: an earlier tap is refused, never a silent restart", () => {
    let r = { start: "2026-11-20" as string | null, end: null as string | null };
    r = nextRange(r, "2026-11-18");
    assert.ok(refused(r), "the approved sentence shows and Save is disabled");
    assert.equal(r.start, "2026-11-20", "the arrive day is not rewritten while picking");
  });
  it("a full sequence: arrive, leave, then a restart from the complete range", () => {
    let r = { start: null as string | null, end: null as string | null };
    r = nextRange(r, "2026-11-20");
    r = nextRange(r, "2026-11-25");
    assert.deepEqual(r, { start: "2026-11-20", end: "2026-11-25" });
    r = nextRange(r, "2026-11-22");
    assert.deepEqual(r, { start: "2026-11-22", end: null }, "the complete range restarts at the tapped day");
    r = nextRange(r, "2026-11-30");
    assert.deepEqual(r, { start: "2026-11-22", end: "2026-11-30" });
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

// The calendar follows the start date (Leon, Nov 20, 2026): which days are on screen for a shown month.
// December 2026 starts on a Tuesday and ends on a Thursday, so its grid runs Sun Nov 29 - Sat Jan 2.
it("monthGridShowsDay: the shown month's own days and the neighbours that fill its first and last weeks", () => {
  for (const day of ["2026-12-01", "2026-12-31", "2026-11-29", "2026-11-30", "2027-01-02"]) {
    assert.equal(monthGridShowsDay(2026, 11, day), true, day);
  }
  for (const day of ["2026-11-28", "2026-11-21", "2027-01-03", "2026-10-31"]) {
    assert.equal(monthGridShowsDay(2026, 11, day), false, day);
  }
});

it("monthGridShowsDay: a month that starts on Sunday and ends on Saturday shows no neighbour", () => {
  // February 2026: Sun Feb 1 - Sat Feb 28.
  assert.equal(monthGridShowsDay(2026, 1, "2026-02-01"), true);
  assert.equal(monthGridShowsDay(2026, 1, "2026-02-28"), true);
  assert.equal(monthGridShowsDay(2026, 1, "2026-01-31"), false);
  assert.equal(monthGridShowsDay(2026, 1, "2026-03-01"), false);
});

it("monthGridShowsDay: no readable day means nothing to follow", () => {
  assert.equal(monthGridShowsDay(2026, 11, null), true);
  assert.equal(monthGridShowsDay(2026, 11, ""), true);
  assert.equal(monthGridShowsDay(2026, 11, "not-a-day"), true);
});
