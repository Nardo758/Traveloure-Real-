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
  assert.equal(FIXED_PLAN_BUTTON, "Use Your plan, fixed");
  assert.equal(FIXED_DAY_CHANGED, "This day changed since your versions were made.");
  assert.equal(COMPARE_VERSIONS_LABEL, "Compare versions");
  const slip = readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../components/plancard/SlipView.tsx"), "utf8");
  assert.match(slip, new RegExp(`>\\s*${COMPARE_VERSIONS_LABEL}\\s*<`), "the same words as the slip header's link");
});

test("FP2 the whole-plan report: plurals, and the skipped part only when something was skipped", () => {
  assert.equal(fixedPlanResultLine(3, 1), "3 days fixed · 1 unchanged since you edited it");
  assert.equal(fixedPlanResultLine(1, 2), "1 day fixed · 2 unchanged since you edited them");
  assert.equal(fixedPlanResultLine(2, 0), "2 days fixed");
});

test("FP3 one day's counts: zeros omitted, all zero ⇒ nothing", () => {
  assert.equal(fixedDayResultLine({ moved: 2, added: 1, removed: 1 }), "2 moved · 1 added · 1 removed");
  assert.equal(fixedDayResultLine({ moved: 1, added: 0, removed: 0 }), "1 moved");
  assert.equal(fixedDayResultLine({ moved: 0, added: 0, removed: 0 }), null);
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
