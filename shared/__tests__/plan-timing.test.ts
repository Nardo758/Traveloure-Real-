/**
 * PLAN TIMING — the one 48-hour window and the one zoned-instant derivation, pinned.
 * Lane L9 of the Console & AI Concierge brief; ledger `2026-09-07-trip-card-one-page`.
 * CLAUDE.md Locked Decision 30, §13, §18 rule 1. Shared with lane L10 (Home time axis).
 *
 * WHY THIS EXISTS. `tripCardIsPrimary`'s window arm used to read `new Date("YYYY-MM-DD")`, which
 * is UTC midnight — neither the plan's zone nor the viewer's — and nothing pinned it. The Trip
 * Card's "Back to planning" suppression, its countdown and Home's dated rows all hang on the same
 * two questions, so the derivation is one module and these are its proofs.
 *
 * What these hold:
 *   T1  a zoned wall clock resolves to the right instant, DST edges included
 *   T2  NULL / unknown zone ⇒ NO instant (never UTC, never the device's clock)
 *   T3  the window is exact with a zone and date-alone without one
 *   T4  underway is exact with a zone (inclusive of the last day) and date-alone without one
 *   T5  `tripCardIsPrimary` delegates: finalized wins; window; underway; nothing ⇒ false
 *   T6  countdown is allowed only with a known zone
 *
 * Pure: no DB, no DOM, no network, no clock of its own — `now` is always explicit.
 * Run: npx tsx --test shared/__tests__/plan-timing.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calendarDaysUntil,
  countdownAllowed,
  isInsideHandoverWindow,
  isPlanUnderway,
  parseCalendarDateParts,
  parseWallClockMinutes,
  planStartInstant,
  zonedTodayIso,
  zonedWallClockToInstant,
} from "../plan-timing";
import { tripCardForcedPrimaryByDateAlone, tripCardIsPrimary } from "../trip-primary-surface";

describe("T1 zoned wall clock → instant", () => {
  it("Tokyo has no DST: 2026-09-10 16:00 Asia/Tokyo is 07:00Z", () => {
    const d = zonedWallClockToInstant("2026-09-10", "16:00", "Asia/Tokyo");
    assert.equal(d?.toISOString(), "2026-09-10T07:00:00.000Z");
  });
  it("Paris in summer is UTC+2, in winter UTC+1 — the offset follows the date, not the zone", () => {
    assert.equal(
      zonedWallClockToInstant("2026-07-01", "12:00", "Europe/Paris")?.toISOString(),
      "2026-07-01T10:00:00.000Z",
    );
    assert.equal(
      zonedWallClockToInstant("2026-12-01", "12:00", "Europe/Paris")?.toISOString(),
      "2026-12-01T11:00:00.000Z",
    );
  });
  it("New York midnight on a DST-change day still lands on that day's midnight", () => {
    // 2026-03-08 is the US spring-forward date; midnight is before the 02:00 jump (EST, UTC-5).
    assert.equal(planStartInstant("2026-03-08", "America/New_York")?.toISOString(), "2026-03-08T05:00:00.000Z");
    // The day after, midnight is EDT (UTC-4).
    assert.equal(planStartInstant("2026-03-09", "America/New_York")?.toISOString(), "2026-03-09T04:00:00.000Z");
  });
  it("a longer ISO string contributes ONLY its leading date — no zone conversion of a date column", () => {
    assert.equal(
      planStartInstant("2026-09-10T23:30:00.000Z", "Asia/Tokyo")?.toISOString(),
      "2026-09-09T15:00:00.000Z",
    );
  });
  it("shape guards: an impossible date or a non-HH:MM time is NULL, never rolled forward", () => {
    assert.equal(parseCalendarDateParts("2026-02-30"), null);
    assert.equal(parseCalendarDateParts("not a date"), null);
    assert.equal(parseWallClockMinutes("25:00"), null);
    assert.equal(parseWallClockMinutes("9:5"), null);
    assert.equal(parseWallClockMinutes("09:05"), 545);
    assert.equal(zonedWallClockToInstant("2026-09-10", null, "Asia/Tokyo"), null);
  });
});

describe("T2 NULL zone ⇒ no instant (Locked Decision 30)", () => {
  it("null, empty and unknown zones all answer NULL", () => {
    assert.equal(planStartInstant("2026-09-10", null), null);
    assert.equal(planStartInstant("2026-09-10", undefined), null);
    assert.equal(planStartInstant("2026-09-10", ""), null);
    assert.equal(planStartInstant("2026-09-10", "Mars/Olympus_Mons"), null);
    assert.equal(zonedTodayIso(new Date("2026-09-10T00:00:00Z"), null), null);
  });
  it("zonedTodayIso reads the calendar date in the plan's zone, not the device's", () => {
    // 23:30Z on the 9th is already the 10th in Tokyo.
    assert.equal(zonedTodayIso(new Date("2026-09-09T23:30:00Z"), "Asia/Tokyo"), "2026-09-10");
    assert.equal(zonedTodayIso(new Date("2026-09-09T23:30:00Z"), "America/Los_Angeles"), "2026-09-09");
  });
});

describe("T3 the 48-hour handover window", () => {
  const start = "2026-09-10";
  it("with a zone: exact — one minute before T-48h is outside, T-48h itself is inside", () => {
    // Tokyo midnight on the 10th = 2026-09-09T15:00Z; T-48h = 2026-09-07T15:00Z.
    assert.equal(isInsideHandoverWindow(new Date("2026-09-07T14:59:00Z"), start, "Asia/Tokyo"), false);
    assert.equal(isInsideHandoverWindow(new Date("2026-09-07T15:00:00Z"), start, "Asia/Tokyo"), true);
    assert.equal(isInsideHandoverWindow(new Date("2026-09-12T15:00:00Z"), start, "Asia/Tokyo"), true);
  });
  it("without a zone: the DATE ALONE — from two calendar days before, at the viewer's own midnight", () => {
    // Local-time constructors: the viewer's calendar date is what is compared.
    const threeDaysBefore = new Date(2026, 8, 7, 23, 59);
    const twoDaysBefore = new Date(2026, 8, 8, 0, 1);
    assert.equal(isInsideHandoverWindow(threeDaysBefore, start, null), false);
    assert.equal(isInsideHandoverWindow(twoDaysBefore, start, null), true);
    assert.equal(calendarDaysUntil(start, twoDaysBefore), 2);
  });
  it("a start date that cannot be parsed is NEVER inside the window", () => {
    assert.equal(isInsideHandoverWindow(new Date(), null, "Asia/Tokyo"), false);
    assert.equal(isInsideHandoverWindow(new Date(), "soon", null), false);
  });
  it("the hours argument is honoured (L10 may ask for a different window)", () => {
    assert.equal(isInsideHandoverWindow(new Date("2026-09-08T15:00:00Z"), start, "Asia/Tokyo", 24), true);
    assert.equal(isInsideHandoverWindow(new Date("2026-09-08T14:59:00Z"), start, "Asia/Tokyo", 24), false);
  });
});

describe("T4 underway", () => {
  it("with a zone: from the plan's midnight through the END of its last day", () => {
    assert.equal(isPlanUnderway(new Date("2026-09-09T14:59:00Z"), "2026-09-10", "2026-09-12", "Asia/Tokyo"), false);
    assert.equal(isPlanUnderway(new Date("2026-09-09T15:00:00Z"), "2026-09-10", "2026-09-12", "Asia/Tokyo"), true);
    // 23:59 Tokyo on the 12th = 14:59Z on the 12th: still underway.
    assert.equal(isPlanUnderway(new Date("2026-09-12T14:59:00Z"), "2026-09-10", "2026-09-12", "Asia/Tokyo"), true);
    assert.equal(isPlanUnderway(new Date("2026-09-12T15:00:00Z"), "2026-09-10", "2026-09-12", "Asia/Tokyo"), false);
  });
  it("without a zone: the date alone, inclusive of both ends", () => {
    assert.equal(isPlanUnderway(new Date(2026, 8, 9, 23, 59), "2026-09-10", "2026-09-12", null), false);
    assert.equal(isPlanUnderway(new Date(2026, 8, 10, 0, 1), "2026-09-10", "2026-09-12", null), true);
    assert.equal(isPlanUnderway(new Date(2026, 8, 12, 23, 59), "2026-09-10", "2026-09-12", null), true);
    assert.equal(isPlanUnderway(new Date(2026, 8, 13, 0, 1), "2026-09-10", "2026-09-12", null), false);
  });
  it("a missing end date is never underway — no open-ended claim", () => {
    assert.equal(isPlanUnderway(new Date(2026, 8, 10, 12), "2026-09-10", null, null), false);
    assert.equal(isPlanUnderway(new Date("2026-09-10T12:00:00Z"), "2026-09-10", null, "Asia/Tokyo"), false);
  });
});

describe("T5 tripCardIsPrimary delegates to the one derivation", () => {
  it("finalized wins regardless of dates", () => {
    assert.equal(tripCardIsPrimary({ finalizedAt: "2026-01-01T00:00:00Z", now: new Date(2020, 0, 1) }), true);
  });
  it("window arm, zoned", () => {
    assert.equal(
      tripCardIsPrimary({ startDate: "2026-09-10", endDate: "2026-09-12", timezone: "Asia/Tokyo", now: new Date("2026-09-07T15:00:00Z") }),
      true,
    );
    assert.equal(
      tripCardIsPrimary({ startDate: "2026-09-10", endDate: "2026-09-12", timezone: "Asia/Tokyo", now: new Date("2026-09-07T14:59:00Z") }),
      false,
    );
  });
  it("window arm, date-alone when the zone is NULL", () => {
    assert.equal(
      tripCardIsPrimary({ startDate: "2026-09-10", endDate: "2026-09-12", now: new Date(2026, 8, 8, 0, 1) }),
      true,
    );
    assert.equal(
      tripCardIsPrimary({ startDate: "2026-09-10", endDate: "2026-09-12", now: new Date(2026, 8, 7, 23, 59) }),
      false,
    );
  });
  it("nothing real to derive from ⇒ the slip stays primary (false)", () => {
    assert.equal(tripCardIsPrimary({ now: new Date() }), false);
    assert.equal(tripCardForcedPrimaryByDateAlone({ startDate: null, endDate: null }), false);
  });
  it("forced-by-date-alone ignores finalizedAt by construction", () => {
    assert.equal(
      tripCardForcedPrimaryByDateAlone({ startDate: "2026-09-10", endDate: "2026-09-12", timezone: "Asia/Tokyo", now: new Date("2026-09-01T00:00:00Z") }),
      false,
    );
  });
});

describe("T6 a countdown needs a known zone", () => {
  it("allowed only with a zone Intl knows", () => {
    assert.equal(countdownAllowed("Asia/Tokyo"), true);
    assert.equal(countdownAllowed(null), false);
    assert.equal(countdownAllowed("Not/A_Zone"), false);
  });
});
