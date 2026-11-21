/**
 * A2 - the phone's day strip: which day it shows, and its chips' words (Leon, Nov 20, 2026; board R3_MovePhone,
 * minus Ideas; the hold-and-drag hint sentence returns with phone hold-drag).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { stripDayAria, stripDayKey, stripDayLabel, type StripDay } from "../day-strip";
import { MOVE_STOP_COPY } from "../move-stop";

const days: StripDay[] = [
  { key: "day-1", dayNum: 1, dateIso: "2026-12-08", stops: 2, itemIds: ["a", "b"] },
  { key: "day-2", dayNum: 2, dateIso: "2026-12-09", stops: 1, itemIds: ["c"] },
  { key: "day-3", dayNum: 3, dateIso: "2026-12-10", stops: 0, itemIds: [] },
];

test("D1 the hint is the approved hint's first sentence only", () => {
  assert.equal(MOVE_STOP_COPY.stripTapHint, "Tap a day to see it.");
  assert.ok(MOVE_STOP_COPY.stripHint.startsWith(MOVE_STOP_COPY.stripTapHint));
});

test("D2 a chip reads 'Tue 8'; with no date, the plan's own 'Day 2'; a slot with neither, 'Undated'", () => {
  assert.equal(stripDayLabel(days[0]), "Tue 8");
  assert.equal(stripDayLabel({ dayNum: 2, dateIso: null }), "Day 2");
  assert.equal(stripDayLabel({ dayNum: null, dateIso: null }), "Undated");
  assert.equal(stripDayAria(days[0]), "Tue 8 · 2 stops");
  assert.equal(stripDayAria(days[1]), "Wed 9 · 1 stop");
  assert.equal(stripDayAria(days[2]), "Thu 10 · 0 stops");
});

test("D3 the tapped chip wins", () => {
  assert.equal(stripDayKey({ days, chosenKey: "day-3", highlightItemId: "a", defaultIndex: 0 }), "day-3");
});

test("D4 with no tap, a linked stop's day; else the plan's default open day", () => {
  assert.equal(stripDayKey({ days, chosenKey: null, highlightItemId: "c", defaultIndex: 0 }), "day-2");
  assert.equal(stripDayKey({ days, chosenKey: null, highlightItemId: "gone", defaultIndex: 1 }), "day-2");
  assert.equal(stripDayKey({ days, chosenKey: null, highlightItemId: null, defaultIndex: 0 }), "day-1");
});

test("D5 a tapped day that is no longer in the plan falls back; a plan with no days shows none", () => {
  assert.equal(stripDayKey({ days, chosenKey: "day-9", highlightItemId: null, defaultIndex: 0 }), "day-1");
  assert.equal(stripDayKey({ days, chosenKey: null, highlightItemId: null, defaultIndex: 7 }), "day-1");
  assert.equal(stripDayKey({ days: [], chosenKey: null, highlightItemId: null, defaultIndex: 0 }), null);
});
