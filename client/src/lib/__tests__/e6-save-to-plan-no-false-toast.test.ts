/**
 * E6: a press with no write must never claim a save.
 *
 * The defect was one line in `SaveToPlanButton`: with no `onSave` it toasted "Saved to plan" — a claim that
 * the plan had changed when nothing had been written and, on a traveler with no plan, nothing could be.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const SRC = fs.readFileSync("client/src/components/plan/SaveToPlanButton.tsx", "utf8");
/** Comments explain the old bug; they are not code, so the copy assertions must not read them. */
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");

test("E6: the bare 'Saved to plan' toast is gone", () => {
  assert.doesNotMatch(CODE, /toast\(\{\s*title:\s*WAITLIST_COPY\.savedToPlan/, "no toast may claim a save");
  assert.doesNotMatch(CODE, /useToast/, "the component no longer needs the toast at all");
});

test("E6: the press prefers the write, then the no-plan action, then nothing", () => {
  assert.match(CODE, /if \(onSave\) onSave\(\);/, "a real write wins");
  assert.match(CODE, /else if \(onNoPlan\) onNoPlan\(\);/, "the no-plan path opens the flow");
  assert.match(CODE, /data-no-plan/, "an un-wired press says so instead of pretending");
});

test("E6: the label still comes from the approved copy, not new words", () => {
  assert.match(CODE, /WAITLIST_COPY\.saveToPlan/);
  assert.match(CODE, /WAITLIST_COPY\.savedToPlan/);
  assert.doesNotMatch(CODE, /"Save(d)? to plan"/, "no inlined literal replaced the approved string");
});
