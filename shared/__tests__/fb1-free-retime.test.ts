/**
 * FB-1 step 4b (ledger `2026-10-19-fb1-free-retime`): the pure planner for a free plan's retime tap.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatItemTime, planRetimeFix, type DayStop } from "../free-retime";

const stop = (id: string, start: number, len: number, movable = true): DayStop => ({ id, title: id, startMin: start, endMin: start + len, movable });

test("FR1 a too-early stop moves to its window and a following stop moves only where it would overlap", () => {
  const day = [stop("temple", 480, 60), stop("market", 570, 60), stop("dinner", 1080, 90)];
  assert.deepEqual(planRetimeFix(day, "temple", { notBeforeMin: 540 }), [
    { itemId: "temple", title: "temple", fromMin: 480, toMin: 540, endMin: 600 },
    { itemId: "market", title: "market", fromMin: 570, toMin: 600, endMin: 660 },
  ]);
});

test("FR2 a too-late stop moves earlier only when the stop before has ended", () => {
  const day = [stop("lunch", 720, 60), stop("museum", 900, 60)];
  assert.deepEqual(planRetimeFix(day, "museum", { notAfterMin: 840 }), [{ itemId: "museum", title: "museum", fromMin: 900, toMin: 840, endMin: 900 }]);
  assert.equal(planRetimeFix(day, "museum", { notAfterMin: 750 }), null, "it would collide with lunch");
});

test("FR3 no tap when a stop it would move is booked, locked or an expert's, or the stop itself is", () => {
  assert.equal(planRetimeFix([stop("temple", 480, 60), stop("tour", 570, 60, false)], "temple", { notBeforeMin: 540 }), null);
  assert.equal(planRetimeFix([stop("temple", 480, 60, false)], "temple", { notBeforeMin: 540 }), null);
});

test("FR4 nothing to do, an unmeetable window, or past midnight ⇒ no tap", () => {
  assert.equal(planRetimeFix([stop("temple", 600, 60)], "temple", { notBeforeMin: 540 }), null, "already inside the window");
  assert.equal(planRetimeFix([stop("temple", 480, 60)], "temple", { notBeforeMin: 600, notAfterMin: 560 }), null);
  assert.equal(planRetimeFix([stop("bar", 1380, 60), stop("club", 1410, 120)], "bar", { notBeforeMin: 1400 }), null);
});

test("FR5 the stored time format", () => {
  assert.equal(formatItemTime(540), "9:00 AM");
  assert.equal(formatItemTime(750), "12:30 PM");
  assert.equal(formatItemTime(0), "12:00 AM");
  assert.equal(formatItemTime(1305), "9:45 PM");
});
