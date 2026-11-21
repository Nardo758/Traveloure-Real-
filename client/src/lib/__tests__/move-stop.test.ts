/**
 * A2 part 1 - the Move sheet's words and its PATCH body (Leon, Nov 20, 2026; board R3_MovePhone, minus Ideas).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MOVE_STOP_COPY, moveDayLong, moveDayOption, moveDayShort, moveStopBody, moveStopRefusal } from "../move-stop";

const tue = { dayNumber: 1, dateIso: "2026-12-08", stops: 4 };
const wed = { dayNumber: 2, dateIso: "2026-12-09", stops: 2 };

test("M1 the approved wording, word for word", () => {
  assert.equal(MOVE_STOP_COPY.menu, "Move");
  assert.equal(MOVE_STOP_COPY.title("Tenryu-ji"), "Move Tenryu-ji to");
  assert.equal(MOVE_STOP_COPY.keepTime("14:30"), "Keep 14:30");
  assert.equal(MOVE_STOP_COPY.pickTime, "Pick a time");
  assert.equal(MOVE_STOP_COPY.confirm(moveDayLong(wed)), "Move to Wed 9 Dec");
  assert.equal(MOVE_STOP_COPY.booked, "This stop is booked. Change the booking to move it.");
  assert.equal(MOVE_STOP_COPY.stripHint, "Tap a day to see it. Hold a stop to drag it onto a day above.");
});

test("M2 day options: the stop's own day reads 'now', another day its stop count", () => {
  assert.equal(moveDayOption(tue, 1), "Tue 8 · now");
  assert.equal(moveDayOption(wed, 1), "Wed 9 · 2 stops");
  assert.equal(moveDayOption({ ...wed, stops: 1 }, 1), "Wed 9 · 1 stop");
  assert.equal(moveDayOption({ ...wed, stops: 0 }, 1), "Wed 9 · 0 stops");
});

test("M3 a plan with no dates names the day by its number, never a guessed weekday", () => {
  assert.equal(moveDayShort({ dayNumber: 2, dateIso: null }), "Day 2");
  assert.equal(moveDayLong({ dayNumber: 2, dateIso: null }), "Day 2");
  assert.equal(moveDayOption({ dayNumber: 2, dateIso: null, stops: 3 }, 1), "Day 2 · 3 stops");
});

test("M4 the body: day only keeps the time; a picked time is rounded to five minutes", () => {
  assert.deepEqual(moveStopBody({ currentDay: 1, toDay: 2, pickedTime: null }), { dayNumber: 2 });
  assert.deepEqual(moveStopBody({ currentDay: 1, toDay: 2, pickedTime: "09:32" }), { dayNumber: 2, startTime: "09:30" });
});

test("M5 nothing is sent with no day, the stop's own day, or an unreadable picked time", () => {
  assert.equal(moveStopBody({ currentDay: 1, toDay: null, pickedTime: null }), null);
  assert.equal(moveStopBody({ currentDay: 1, toDay: 1, pickedTime: null }), null);
  assert.equal(moveStopBody({ currentDay: 1, toDay: 2, pickedTime: "" }), null);
});

test("M6 a booked stop is refused with the approved sentence; any other stop is not", () => {
  assert.equal(moveStopRefusal({ booked: true }), MOVE_STOP_COPY.booked);
  assert.equal(moveStopRefusal({ booked: false }), null);
});

test("M7 'Ideas' is not offered by A2 (it arrives with A4)", () => {
  const src = readFileSync(new URL("../move-stop.ts", import.meta.url), "utf8") + readFileSync(new URL("../../components/plan/MoveStopSheet.tsx", import.meta.url), "utf8");
  assert.equal(/no day/i.test(src.replace(/\/\*[\s\S]*?\*\//g, "")), false);
});
