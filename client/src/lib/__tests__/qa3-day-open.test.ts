/**
 * QA round 3 PR 1 (Leon, Nov 11, 2026) — the slip's default open day: the first day holding an item, else Day 1; the
 * highlighted-item override stays.
 *
 *   D1 a confirmed 4-day plan with items on Day 2 only opens Day 2 (and only Day 2)
 *   D2 a plan with no items opens Day 1; a plan with items on Day 1 opens Day 1
 *   D3 the highlighted item still opens its own day, beside the default
 *   D4 SlipView reads this rule (one rule, no second copy), and a toggled day keeps the traveler's choice
 *
 * Run: node --import ./client/src/lib/__tests__/lc1-css-register.mjs --import tsx --test client/src/lib/__tests__/qa3-day-open.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { defaultOpenDayIndex, slipDayOpenByDefault } from "../slip-day-open";

const days = (counts: number[]) => counts.map((n, d) => Array.from({ length: n }, (_, i) => ({ id: `d${d + 1}-${i}` })));
const openDays = (counts: number[], highlightItemId: string | null = null) => {
  const slots = days(counts);
  const defaultIndex = defaultOpenDayIndex(counts);
  return slots.map((items, index) => slipDayOpenByDefault({ index, defaultIndex, items, highlightItemId }));
};

describe("QA round 3 — the default open day", () => {
  it("D1 confirmed 4-day plan, items on Day 2 only ⇒ Day 2 opens", () => {
    assert.equal(defaultOpenDayIndex([0, 2, 0, 0]), 1);
    assert.deepEqual(openDays([0, 2, 0, 0]), [false, true, false, false]);
  });
  it("D2 no items ⇒ Day 1; items on Day 1 ⇒ Day 1", () => {
    assert.equal(defaultOpenDayIndex([0, 0, 0, 0]), 0);
    assert.deepEqual(openDays([0, 0, 0, 0]), [true, false, false, false]);
    assert.equal(defaultOpenDayIndex([]), 0);
    assert.deepEqual(openDays([3, 1, 0, 0]), [true, false, false, false]);
  });
  it("D3 the highlighted item opens its own day too", () => {
    assert.deepEqual(openDays([0, 2, 0, 1], "d4-0"), [false, true, false, true]);
    assert.deepEqual(openDays([0, 0, 0, 0], "nope"), [true, false, false, false]);
  });
  it("D4 SlipView reads the rule; a toggled day keeps its choice", () => {
    const src = fs.readFileSync("client/src/components/plancard/SlipView.tsx", "utf8");
    assert.match(src, /const defaultOpenIdx = defaultOpenDayIndex\(daySlots\.map\(\(slot\) => slot\.groups\.flatMap\(\(g\) => g\.items\)\.length\)\);/);
    assert.match(src, /dayOpen\[key\] \?\? slipDayOpenByDefault\(\{ index: idx, defaultIndex: defaultOpenIdx, items, highlightItemId \}\)/);
    assert.doesNotMatch(src, /dayOpen\[key\] \?\? \(idx === 0/, "the old first-slot default is gone");
  });
});
