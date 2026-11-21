/**
 * A2 part 2 - dragging a stop on the desktop days board: the words and the writes (Leon, Nov 20, 2026; board
 * R3_DaysBoard).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { HOLD_DRAG_SLOP_PX, afterIdForRow, dropDayName, dropHereLabel, dropPlan, holdStillHolding, type DragDay } from "../stop-drag";

const tue: DragDay = { dayNumber: 1, dateIso: "2026-12-08", items: [{ id: "fushimi", name: "Fushimi Inari Shrine" }, { id: "tofuku", name: "Tofuku-ji" }] };
const wed: DragDay = { dayNumber: 2, dateIso: "2026-12-09", items: [{ id: "bamboo", name: "Arashiyama Bamboo Grove" }, { id: "tenryu", name: "Tenryu-ji" }] };
const thu: DragDay = { dayNumber: 3, dateIso: "2026-12-10", items: [] };
const days = [tue, wed, thu];

test("G1 the approved line, word for word", () => {
  assert.equal(dropHereLabel(wed, "tenryu"), "Drop here · Wed, after Tenryu-ji");
});

test("G2 ahead of a day's first stop, and on an empty day, the line has no 'after'", () => {
  assert.equal(dropHereLabel(wed, null), "Drop here · Wed");
  assert.equal(dropHereLabel(thu, null), "Drop here · Thu");
  assert.equal(dropHereLabel(wed, "not-on-this-day"), "Drop here · Wed");
});

test("G3 a plan with no dates names the day by its number", () => {
  assert.equal(dropDayName({ dayNumber: 2, dateIso: null }), "Day 2");
  assert.equal(dropHereLabel({ dayNumber: 2, dateIso: null, items: wed.items }, "tenryu"), "Drop here · Day 2, after Tenryu-ji");
});

test("G4 onto another day: the stop moves there, then that day is put in the dropped order", () => {
  assert.deepEqual(dropPlan({ itemId: "tofuku", fromDay: 1, target: { dayNumber: 2, afterId: "tenryu" }, days }), {
    move: { dayNumber: 2 },
    reorder: { dayNumber: 2, itemIds: ["bamboo", "tenryu", "tofuku"] },
  });
  assert.deepEqual(dropPlan({ itemId: "tofuku", fromDay: 1, target: { dayNumber: 2, afterId: "bamboo" }, days })?.reorder?.itemIds, ["bamboo", "tofuku", "tenryu"]);
  assert.deepEqual(dropPlan({ itemId: "tofuku", fromDay: 1, target: { dayNumber: 2, afterId: null }, days })?.reorder?.itemIds, ["tofuku", "bamboo", "tenryu"]);
});

test("G5 onto an empty day: the move alone, nothing to reorder", () => {
  assert.deepEqual(dropPlan({ itemId: "tofuku", fromDay: 1, target: { dayNumber: 3, afterId: null }, days }), { move: { dayNumber: 3 }, reorder: null });
});

test("G6 inside its own day: the reorder alone, and the list is only that day's stops", () => {
  assert.deepEqual(dropPlan({ itemId: "tofuku", fromDay: 1, target: { dayNumber: 1, afterId: null }, days }), {
    move: null,
    reorder: { dayNumber: 1, itemIds: ["tofuku", "fushimi"] },
  });
});

test("G7 a drop that changes nothing writes nothing", () => {
  assert.equal(dropPlan({ itemId: "tofuku", fromDay: 1, target: { dayNumber: 1, afterId: "fushimi" }, days }), null, "the place it already holds");
  assert.equal(dropPlan({ itemId: "tofuku", fromDay: 1, target: { dayNumber: 1, afterId: "tofuku" }, days }), null, "after itself");
  assert.equal(dropPlan({ itemId: "tofuku", fromDay: 1, target: null, days }), null, "no target");
  assert.equal(dropPlan({ itemId: "tofuku", fromDay: 1, target: { dayNumber: 9, afterId: null }, days }), null, "no such day");
  assert.equal(dropPlan({ itemId: "tofuku", fromDay: 1, target: { dayNumber: 2, afterId: "fushimi" }, days }), null, "after a stop that is not on that day");
});

test("G8 the pointer's row: lower half lands after it, upper half after the stop before it", () => {
  const ids = ["bamboo", "tenryu"];
  assert.equal(afterIdForRow({ rowId: "tenryu", dayItemIds: ids, upperHalf: false }), "tenryu");
  assert.equal(afterIdForRow({ rowId: "tenryu", dayItemIds: ids, upperHalf: true }), "bamboo");
  assert.equal(afterIdForRow({ rowId: "bamboo", dayItemIds: ids, upperHalf: true }), null);
});

// Hold-to-drag on the phone (Leon, Nov 21, 2026; board R3_MovePhone).
test("G9 onto a day chip: the stop moves to that day and the server seats it by its time - no reorder", () => {
  assert.deepEqual(dropPlan({ itemId: "tofuku", fromDay: 1, target: { dayNumber: 2, afterId: null, byTime: true }, days }), { move: { dayNumber: 2 }, reorder: null });
  assert.deepEqual(dropPlan({ itemId: "tofuku", fromDay: 1, target: { dayNumber: 3, afterId: null, byTime: true }, days }), { move: { dayNumber: 3 }, reorder: null });
});

test("G10 onto its own day's chip, or a day that is not in the plan, writes nothing", () => {
  assert.equal(dropPlan({ itemId: "tofuku", fromDay: 1, target: { dayNumber: 1, afterId: null, byTime: true }, days }), null);
  assert.equal(dropPlan({ itemId: "tofuku", fromDay: 1, target: { dayNumber: 9, afterId: null, byTime: true }, days }), null);
});

test("G11 a finger that drifts past the slop before the hold completes is a scroll", () => {
  const start = { x: 100, y: 100 };
  assert.equal(holdStillHolding(start, { x: 100 + HOLD_DRAG_SLOP_PX, y: 100 }), true);
  assert.equal(holdStillHolding(start, { x: 103, y: 104 }), true);
  assert.equal(holdStillHolding(start, { x: 100, y: 100 + HOLD_DRAG_SLOP_PX + 1 }), false);
});
