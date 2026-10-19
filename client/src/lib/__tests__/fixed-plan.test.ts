/**
 * FB-1 step 4 (ledger `2026-10-19-fb1-fixed-by-tap`): the taps' words and the whole-plan body.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  COMPARE_VERSIONS_LABEL,
  FIXED_DAY_BUTTON,
  FIXED_DAY_CHANGED,
  FIXED_PLAN_BUTTON,
  fixedDayResultLine,
  fixedDayState,
  fixedPlanResultLine,
  flaggedPlanDays,
  showsFixedPlanButton,
} from "../fixed-plan";

const view = { variantId: "A", comparisonId: "c1", days: [{ day: 1, state: "fixable" as const }, { day: 3, state: "changed" as const }] };

test("FP1 the strings, and the stale line reuses the slip's existing Compare versions label", () => {
  assert.equal(FIXED_DAY_BUTTON, "Use the fixed day");
  assert.equal(FIXED_PLAN_BUTTON, "Use all fixed days");
  assert.equal(FIXED_DAY_CHANGED, "You’ve changed this day since these versions were made, so we didn’t replace it.");
  assert.equal(COMPARE_VERSIONS_LABEL, "Compare versions");
  const slip = readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../components/plancard/SlipView.tsx"), "utf8");
  assert.match(slip, new RegExp(`>\\s*${COMPARE_VERSIONS_LABEL}\\s*<`), "the same words as the slip header's link");
});

test("FP2 the whole-plan report: Marketing's words, plurals, and the skipped days named", () => {
  assert.equal(fixedPlanResultLine(3, [2]), "Updated 3 days. Skipped Day 2 because you’ve changed it.");
  assert.equal(fixedPlanResultLine(1, [2, 4]), "Updated 1 day. Skipped Day 2 and Day 4 because you’ve changed them.");
  assert.equal(fixedPlanResultLine(2, [1, 3, 5]), "Updated 2 days. Skipped Day 1, Day 3 and Day 5 because you’ve changed them.");
  assert.equal(fixedPlanResultLine(2, []), "Updated 2 days.");
});

test("FP3 one day's counts: 'stops' on the first part, zero parts omitted, all zero ⇒ nothing", () => {
  assert.equal(fixedDayResultLine({ day: 2, moved: 2, added: 1, removed: 1 }), "Day 2 updated: 2 stops moved, 1 added, 1 removed");
  assert.equal(fixedDayResultLine({ day: 1, moved: 1, added: 0, removed: 0 }), "Day 1 updated: 1 stop moved");
  assert.equal(fixedDayResultLine({ day: 3, moved: 0, added: 2, removed: 1 }), "Day 3 updated: 2 stops added, 1 removed");
  assert.equal(fixedDayResultLine({ day: 1, moved: 0, added: 0, removed: 0 }), null);
  assert.equal(fixedDayResultLine(null), null);
});

test("FP4 the whole-plan tap sends every flagged day (the server skips the changed ones); the button needs one fixable", () => {
  assert.deepEqual(flaggedPlanDays(view), [{ day: 1, variantId: "A" }, { day: 3, variantId: "A" }]);
  assert.equal(showsFixedPlanButton(view), true);
  assert.equal(showsFixedPlanButton({ ...view, days: [{ day: 3, state: "changed" }] }), false);
  assert.equal(showsFixedPlanButton(null), false);
  assert.equal(fixedDayState(view, 1), "fixable");
  assert.equal(fixedDayState(view, 3), "changed");
  assert.equal(fixedDayState(view, 2), null, "a day with nothing to fix draws nothing");
});
