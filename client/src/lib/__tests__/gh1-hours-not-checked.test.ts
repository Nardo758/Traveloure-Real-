/**
 * GH-1 (ledger `2026-10-17-gh1-no-google-hours`): "Hours not checked yet" replaces "checking hours…".
 *
 *   N1  The label, and its rule: a stop row with no hours line and no hours fact says it; a stay, a ride, a row
 *       with an hours line and a row with an hours fact (no line for the day) say nothing.
 *   N2  The slip passes the rule to the row; the row draws the label; "checking hours…" is gone.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { HOURS_NOT_CHECKED_YET_LABEL, showsHoursNotChecked } from "../plancard-refetch";

const read = (rel: string) => fs.readFileSync(path.resolve(process.cwd(), rel), "utf8");

test("N1 · the label and its rule", () => {
  assert.equal(HOURS_NOT_CHECKED_YET_LABEL, "Hours not checked yet");
  assert.equal(showsHoursNotChecked({ isStop: true, hasHoursLine: false, hasHoursFact: false }), true);
  assert.equal(showsHoursNotChecked({ isStop: false, hasHoursLine: false, hasHoursFact: false }), false, "a stay or a ride");
  assert.equal(showsHoursNotChecked({ isStop: true, hasHoursLine: true, hasHoursFact: true }), false);
  assert.equal(showsHoursNotChecked({ isStop: true, hasHoursLine: false, hasHoursFact: true }), false, "a fact with no line for the day");
});

test("N2 · the slip passes the rule and the row draws the label", () => {
  const slip = read("client/src/components/plancard/SlipView.tsx");
  assert.match(slip, /hoursNotChecked=\{showsHoursNotChecked\(\{/);
  const row = read("client/src/components/plan/ItemRow.tsx");
  assert.match(row, /\{HOURS_NOT_CHECKED_YET_LABEL\}/);
  for (const src of [slip, row, read("client/src/lib/plancard-refetch.ts")]) assert.doesNotMatch(src, /checking hours…/);
});
