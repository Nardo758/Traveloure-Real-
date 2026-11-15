/**
 * E6 follow-up (Leon, Nov 15): an in-plan "Save to plan" press opens the item's Details.
 *
 * One of the five in-plan rows has a Details opener in scope — SlipView's item sheet, whose `setSheetOpen`
 * already backs the title tap and ⋯ → Details. The press must use it instead of doing nothing.
 *
 * The other four rows (LegRow, ActivitiesSection x2, TransportSection) mount the same button with no Details
 * opener of their own, so they need the callback plumbed from SlipView — noted in the PR, not silently
 * claimed as done.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const SLIP = fs.readFileSync("client/src/components/plancard/SlipView.tsx", "utf8");
const BTN = fs.readFileSync("client/src/components/plan/SaveToPlanButton.tsx", "utf8");

test("the in-plan press opens the item's own Details sheet", () => {
  assert.match(SLIP, /<SaveToPlanButton[\s\S]{0,400}?onNoPlan=\{\(\) => setSheetOpen\(true\)\}/, "the press opens the sheet");
  assert.match(SLIP, /const \[sheetOpen, setSheetOpen\] = useState\(false\)/, "the sheet is the one the title tap opens");
});

test("the press no longer claims a save it did not make", () => {
  const CODE = BTN.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
  assert.doesNotMatch(CODE, /toast\(\{\s*title:\s*WAITLIST_COPY\.savedToPlan/, "no false 'Saved to plan'");
  assert.match(CODE, /onNoPlan/, "the no-write path exists");
});

test("the remaining four rows still need the callback, and the test says so", () => {
  const rows = [
    "client/src/components/plan/LegRow.tsx",
    "client/src/components/plancard/ActivitiesSection.tsx",
    "client/src/components/plancard/TransportSection.tsx",
  ];
  for (const row of rows) {
    const src = fs.readFileSync(row, "utf8");
    assert.match(src, /<SaveToPlanButton/, row + " still mounts the button");
    assert.doesNotMatch(src, /onNoPlan/, row + " has no Details opener to wire yet");
  }
});
