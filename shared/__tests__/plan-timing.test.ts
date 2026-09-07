/**
 * plan-timing — the ONE zone-aware plan-start instant and the 48-hour handover window
 * (ledger `2026-09-07-home-time-axis`; CLAUDE.md Locked Decision 30, §13, §18 rule 1).
 * Pure: no DB, no network, no wall clock.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HANDOVER_WINDOW_MS,
  addCalendarDays,
  calendarDayOf,
  calendarParts,
  handoverInstant,
  isInsideHandoverWindow,
  isUsableTimeZone,
  planStartInstant,
  zonedMidnight,
} from "../plan-timing";
import { TRIP_CARD_HANDOVER_WINDOW_MS, tripCardIsPrimary } from "../trip-primary-surface";

test("T1: the window is the ONE constant from trip-primary-surface, never restated", () => {
  assert.equal(HANDOVER_WINDOW_MS, TRIP_CARD_HANDOVER_WINDOW_MS);
});

test("T2: a zoned plan starts at LOCAL midnight in its zone (Kyoto 00:00 = 15:00Z the day before)", () => {
  const s = planStartInstant("2026-10-02", "Asia/Tokyo");
  assert.ok(s);
  assert.equal(s.zoned, true);
  assert.equal(s.day, "2026-10-02");
  assert.equal(s.instant.toISOString(), "2026-10-01T15:00:00.000Z");
});

test("T3: NULL zone ⇒ UTC midnight of the calendar day, flagged unzoned — the tripCardIsPrimary parse", () => {
  const s = planStartInstant("2026-10-02", null);
  assert.ok(s);
  assert.equal(s.zoned, false);
  assert.equal(s.instant.toISOString(), "2026-10-02T00:00:00.000Z");
  assert.equal(s.instant.getTime(), new Date("2026-10-02").getTime());
});

test("T4: an unusable zone string is answered exactly as NULL is", () => {
  assert.equal(isUsableTimeZone("Mars/Olympus_Mons"), false);
  const s = planStartInstant("2026-10-02", "Mars/Olympus_Mons");
  assert.ok(s);
  assert.equal(s.zoned, false);
});

test("T5: an unparseable start yields null, never 'now'", () => {
  assert.equal(planStartInstant(null, "Asia/Tokyo"), null);
  assert.equal(planStartInstant("", null), null);
  assert.equal(planStartInstant("2026-02-30", null), null);
  assert.equal(calendarParts("not a date"), null);
});

test("T6: handoverInstant = start − window, in the plan's zone", () => {
  const h = handoverInstant("2026-10-02", "Asia/Tokyo");
  assert.ok(h);
  assert.equal(h.zoned, true);
  assert.equal(h.instant.toISOString(), "2026-09-29T15:00:00.000Z");
});

test("T7: NULL zone ⇒ the handover degrades to a calendar day two days before the start", () => {
  const h = handoverInstant("2026-10-02", null);
  assert.ok(h);
  assert.equal(h.zoned, false);
  assert.equal(h.day, "2026-09-30");
});

test("T8: isInsideHandoverWindow agrees with tripCardIsPrimary's date arm for an unzoned plan", () => {
  const start = "2026-10-02";
  const justBefore = new Date("2026-09-29T23:59:59Z");
  const justAfter = new Date("2026-09-30T00:00:00Z");
  assert.equal(isInsideHandoverWindow(justBefore, start, null), false);
  assert.equal(isInsideHandoverWindow(justAfter, start, null), true);
  assert.equal(tripCardIsPrimary({ startDate: start, now: justBefore }), false);
  assert.equal(tripCardIsPrimary({ startDate: start, now: justAfter }), true);
});

test("T9: a zoned plan's window opens on the zone's clock, not UTC's", () => {
  const start = "2026-10-02";
  assert.equal(isInsideHandoverWindow(new Date("2026-09-29T14:59:59Z"), start, "Asia/Tokyo"), false);
  assert.equal(isInsideHandoverWindow(new Date("2026-09-29T15:00:00Z"), start, "Asia/Tokyo"), true);
});

test("T10: an unparseable start never claims the window is open", () => {
  assert.equal(isInsideHandoverWindow(new Date(), null, "Asia/Tokyo"), false);
});

test("T11: zonedMidnight survives a DST transition day (Europe/London, 2026-03-29)", () => {
  const m = zonedMidnight(2026, 3, 29, "Europe/London");
  assert.equal(m.toISOString(), "2026-03-29T00:00:00.000Z"); // GMT until 01:00 that morning
  const s = zonedMidnight(2026, 7, 1, "Europe/London");
  assert.equal(s.toISOString(), "2026-06-30T23:00:00.000Z"); // BST
});

test("T12: calendarDayOf reads the zone's day when zoned, UTC's when not", () => {
  const instant = new Date("2026-10-01T20:00:00Z");
  assert.equal(calendarDayOf(instant, "Asia/Tokyo"), "2026-10-02");
  assert.equal(calendarDayOf(instant, null), "2026-10-01");
  assert.equal(addCalendarDays("2026-10-01", -2), "2026-09-29");
  assert.equal(addCalendarDays("nope", 1), null);
});
