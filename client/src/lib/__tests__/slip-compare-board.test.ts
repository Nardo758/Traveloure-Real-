/**
 * THE COMPARE BOARD (slip conformance, boards rev 15; ledger `2026-10-08-slip-compare-board`). The day
 * strip states the SERVER's minutes per day and judges nothing; every pinned sentence stays verbatim.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compareEyebrow, dayStripCells } from "../plan-compare";

const scored = (minutesByDay: Record<number, number>, basis: "matrix" | "est" = "matrix") =>
  ({ scored: true, minutesPerDay: 30, minutesByDay, basis, coverage: null, areasNear: 0, areasTotal: 0, located: 3, total: 3 }) as const;

test("C1: one cell per day in day order, the server's minutes, '~' on an estimate", () => {
  assert.deepEqual(dayStripCells(scored({ 3: 69.4, 1: 42, 2: 74 })), [
    { day: 1, label: "Day 1", minutes: "42 min" },
    { day: 2, label: "Day 2", minutes: "74 min" },
    { day: 3, label: "Day 3", minutes: "69 min" },
  ]);
  assert.equal(dayStripCells(scored({ 1: 10 }, "est"))[0].minutes, "~10 min");
});

test("C2: an unscored place has no strip, and a malformed day is dropped — never a zero", () => {
  assert.deepEqual(dayStripCells({ scored: false, reason: "option_unlocated", located: 0, total: 3 }), []);
  assert.deepEqual(dayStripCells(scored({ 0: 5, 1: NaN, 2: 12 } as any)), [{ day: 2, label: "Day 2", minutes: "12 min" }]);
});

test("C3: the eyebrow names the set and its count", () => {
  assert.equal(compareEyebrow("Where you'll stay", 3), "Where you'll stay · 3 places");
  assert.equal(compareEyebrow(null, 1), "Places to stay · 1 place");
});

test("C4: the page keeps every pinned testid and sentence source, and the strip judges nothing", () => {
  const src = readFileSync(new URL("../../pages/plan-compare.tsx", import.meta.url), "utf8");
  for (const id of ["compare-title", "compare-intro", "compare-foot", "compare-choose-", "compare-chosen-", "compare-easiest-", "compare-fit-", "compare-travel-", "compare-areas-", "compare-price-", "compare-option-"]) {
    assert.ok(src.includes(id), id);
  }
  assert.match(src, /\{compareTitle\(set\.options\.length\)\}/);
  assert.match(src, /\{compareIntroLine\(stops\.located, stops\.total\)\}/);
  assert.match(src, />\s*Easiest days\s*</);
  assert.doesNotMatch(src, /close to|far day/i);
});
