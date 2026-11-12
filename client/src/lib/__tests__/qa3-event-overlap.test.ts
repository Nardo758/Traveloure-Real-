/**
 * QA round 3, major 1 (Leon, Nov 11, 2026 — "any overlap, first overlapping day"): the ONE rule both save rails and
 * "Plan around it" read — `eventOutsideConfirmedDates` (refuse) and `eventPlanPlacement` (place), shared/plan-dates.ts.
 *
 *   O1 the overlap table on a CONFIRMED plan, Nov 20–22: every start × end position
 *   O2 an event with no end keeps the start-only rule (refused when it starts before or after the window)
 *   O3 an UNCONFIRMED plan accepts everything, and the event keeps its own start day (the ruling's unconfirmed arm)
 *   O4 placement: a multi-day event that starts before a confirmed window lands on its first day (Day 1); one that
 *      starts inside lands on its own day; an end before the start reads as a one-day event
 *   O5 the bare-string form (the pre-round-3 call shape) still reads as a start with no end
 *   O6 an event that starts INSIDE a confirmed Nov 20–22 window lands on its own day: Nov 21 ⇒ Day 2, not Day 1 —
 *      with an end inside, with an end after the window, and with no end (the first-overlap rule is for starts-before only)
 *
 * Run: npx tsx --test client/src/lib/__tests__/qa3-event-overlap.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { eventOutsideConfirmedDates, eventPlanPlacement } from "@shared/plan-dates";

const confirmed = { startDate: "2026-11-20", endDate: "2026-11-22", datesConfirmed: true };
const unconfirmed = { ...confirmed, datesConfirmed: false };

describe("QA round 3 major 1 — event overlap", () => {
  it("O1 overlap table on a confirmed plan", () => {
    // [start, end, refused]
    const table: Array<[string, string, boolean, string]> = [
      ["2026-11-10", "2026-11-15", true, "start before, end before"],
      ["2026-11-10", "2026-11-20", false, "start before, end on the first day"],
      ["2026-11-10", "2026-11-21", false, "start before, end inside"],
      ["2026-11-10", "2026-12-06", false, "start before, end after (spans the window)"],
      ["2026-11-20", "2026-11-21", false, "start inside, end inside"],
      ["2026-11-21", "2026-12-06", false, "start inside, end after"],
      ["2026-11-22", "2026-11-22", false, "start and end on the last day"],
      ["2026-11-23", "2026-11-30", true, "start after, end after"],
    ];
    for (const [start, end, refused, why] of table) {
      assert.equal(eventOutsideConfirmedDates({ start, end }, confirmed), refused, why);
    }
  });

  it("O2 no end ⇒ start-only rule", () => {
    assert.equal(eventOutsideConfirmedDates({ start: "2026-11-10", end: null }, confirmed), true, "starts before");
    assert.equal(eventOutsideConfirmedDates({ start: "2026-11-21" }, confirmed), false, "starts inside");
    assert.equal(eventOutsideConfirmedDates({ start: "2026-11-23", end: undefined }, confirmed), true, "starts after");
    assert.equal(eventOutsideConfirmedDates({ start: null, end: "2026-11-21" }, confirmed), false, "no start ⇒ no claim");
  });

  it("O3 unconfirmed plan accepts, and the event keeps its own start", () => {
    assert.equal(eventOutsideConfirmedDates({ start: "2026-11-10", end: "2026-11-15" }, unconfirmed), false);
    assert.equal(eventOutsideConfirmedDates({ start: "2026-11-10", end: "2026-12-06" }, unconfirmed), false);
    assert.deepEqual(eventPlanPlacement({ start: "2026-11-10", end: "2026-12-06" }, unconfirmed), {
      scheduledDate: "2026-11-10",
      dayNumber: null,
    });
    assert.deepEqual(eventPlanPlacement({ start: "2026-11-21", end: "2026-12-06" }, unconfirmed), {
      scheduledDate: "2026-11-21",
      dayNumber: 2,
    });
  });

  it("O4 placement on a confirmed plan", () => {
    assert.deepEqual(eventPlanPlacement({ start: "2026-11-17", end: "2026-12-06" }, confirmed), {
      scheduledDate: "2026-11-20",
      dayNumber: 1,
    }, "first overlapping day");
    assert.deepEqual(eventPlanPlacement({ start: "2026-11-21", end: "2026-12-06" }, confirmed), {
      scheduledDate: "2026-11-21",
      dayNumber: 2,
    }, "its own day when it starts inside");
    assert.deepEqual(eventPlanPlacement({ start: "2026-11-17", end: "2026-11-01" }, confirmed), {
      scheduledDate: "2026-11-17",
      dayNumber: null,
    }, "an end before the start is a one-day event (no overlap, kept on its own day)");
    assert.equal(eventOutsideConfirmedDates({ start: "2026-11-17", end: "2026-11-01" }, confirmed), true);
    assert.equal(eventPlanPlacement({ start: null }, confirmed), null);
  });

  it("O6 a start inside the window lands on its own day (Nov 21 ⇒ Day 2)", () => {
    const day2 = { scheduledDate: "2026-11-21", dayNumber: 2 };
    assert.deepEqual(eventPlanPlacement({ start: "2026-11-21", end: "2026-11-22" }, confirmed), day2, "end inside");
    assert.deepEqual(eventPlanPlacement({ start: "2026-11-21", end: "2026-12-06" }, confirmed), day2, "end after the window");
    assert.deepEqual(eventPlanPlacement({ start: "2026-11-21" }, confirmed), day2, "no end");
    assert.equal(eventOutsideConfirmedDates({ start: "2026-11-21", end: "2026-12-06" }, confirmed), false);
  });

  it("O5 a bare string is a start with no end", () => {
    assert.equal(eventOutsideConfirmedDates("2026-11-17", confirmed), true);
    assert.equal(eventOutsideConfirmedDates("2026-11-21", confirmed), false);
    assert.deepEqual(eventPlanPlacement("2026-11-22", confirmed), { scheduledDate: "2026-11-22", dayNumber: 3 });
  });
});

/**
 * QA round 3, major 8 (Leon, Nov 11, 2026): `planDayNumbers`, the ONE rule for which days a plan page draws.
 *   P1 confirmed Dec 1–4 with every item on day 1 (TB1) ⇒ days 1–4
 *   P2 the same window unconfirmed ⇒ the days the items hold (1)
 *   P3 an item outside a confirmed window keeps its day (never hidden); an unparseable window draws the items' days
 *   P4 a Date-typed start/end reads as its calendar day; a one-day confirmed plan is one day
 */
import { planDayNumbers } from "@shared/plan-dates";

describe("QA round 3 major 8 — plan days", () => {
  const window = { startDate: "2026-12-01", endDate: "2026-12-04" };
  it("P1 confirmed window draws every day", () => {
    assert.deepEqual(planDayNumbers([1, 1, 1, 1, 1, 1, 1], { ...window, datesConfirmed: true }), [1, 2, 3, 4]);
  });
  it("P2 unconfirmed is unchanged", () => {
    assert.deepEqual(planDayNumbers([1, 1, 1], { ...window, datesConfirmed: false }), [1]);
    assert.deepEqual(planDayNumbers([], { ...window, datesConfirmed: false }), []);
  });
  it("P3 an item outside the window keeps its day; a bad window draws the items' days", () => {
    assert.deepEqual(planDayNumbers([3, 6], { ...window, datesConfirmed: true }), [1, 2, 3, 4, 6]);
    assert.deepEqual(planDayNumbers([2], { startDate: "2026-12-04", endDate: "2026-12-01", datesConfirmed: true }), [2]);
    assert.deepEqual(planDayNumbers([1, null, undefined], { startDate: null, endDate: null, datesConfirmed: true }), [1]);
  });
  it("P4 Date values and a one-day plan", () => {
    assert.deepEqual(
      planDayNumbers([], { startDate: new Date("2026-12-01T00:00:00Z"), endDate: new Date("2026-12-03T00:00:00Z"), datesConfirmed: true }),
      [1, 2, 3],
    );
    assert.deepEqual(planDayNumbers([], { startDate: "2026-12-01", endDate: "2026-12-01", datesConfirmed: true }), [1]);
  });
});
