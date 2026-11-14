/**
 * E1 — the plan editor REFUSES a backwards date range instead of silently repairing it.
 *
 * Before this change `commitPlan` did `else if (... new Date(end) < new Date(start)) { end = start }`,
 * so First day 12/09 + Last day 12/08 saved a one-day plan and told the traveler nothing — the only
 * place in the product that changed an answer instead of refusing it. The shared calendar
 * (`PlanDatesCalendar`), the guest pop-up, and both server rails already refuse the same input.
 *
 * Pinned here:
 *   - the rule itself, on the YYYY-MM-DD prefix (never a Date, so no timezone can flip it);
 *   - SAME-DAY is allowed (a one-day trip is not a backwards range);
 *   - the `shape === "day"` branch is untouched — a one-day OCCASION is a different thing;
 *   - the Save and Next controls are disabled, the approved sentence is shown under Last day,
 *   - and `commitPlan` refuses before it can PATCH (the backstop).
 *
 * No new user-facing string: the sentence is `LEAVE_BEFORE_ARRIVE_MESSAGE`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { planWhenIsBackwards } from "../../components/trip/plan-modal";
import { LEAVE_BEFORE_ARRIVE_MESSAGE } from "../plan-dates-range";

const SRC = fs.readFileSync("client/src/components/trip/plan-modal.tsx", "utf8");
const COMMIT = SRC.match(/async function commitPlan[\s\S]*?\r?\n  \}\r?\n/)?.[0] ?? "";

test("E1: a backwards range is backwards; a same-day range is not", () => {
  assert.equal(planWhenIsBackwards("2026-12-09", "2026-12-08"), true, "12/09 → 12/08 is backwards");
  assert.equal(planWhenIsBackwards("2026-12-03", "2026-12-03"), false, "same day is a one-day trip");
  assert.equal(planWhenIsBackwards("2026-12-03", "2026-12-05"), false, "an ordinary range");
  assert.equal(planWhenIsBackwards("", "2026-12-05"), false, "an unanswered first day is not backwards");
  assert.equal(planWhenIsBackwards("2026-12-03", ""), false, "an unanswered last day is not backwards");
  assert.equal(planWhenIsBackwards("not a date", "2026-12-05"), false, "an unparseable value is left to the input");
});

test("E1: the comparison is by calendar day, never by instant", () => {
  // Same calendar day either side of midnight UTC must not read as backwards.
  assert.equal(planWhenIsBackwards("2026-12-03T23:30:00Z", "2026-12-03T00:10:00Z"), false);
  // A genuine reversal still reads as one.
  assert.equal(planWhenIsBackwards("2026-12-03T00:10:00Z", "2026-12-02T23:30:00Z"), true);
});

test("E1: the silent repair is gone, and commitPlan refuses instead", () => {
  assert.doesNotMatch(SRC, /new Date\(end\) < new Date\(start\)/, "the Date-based repair is removed");
  // The ONLY remaining `end = start` is the day-shape branch (a one-day occasion, not a range).\n  const rewrites = COMMIT.match(/end = start/g) ?? [];\n  assert.equal(rewrites.length, 1, "the backwards-range repair is gone; only the day-shape branch rewrites");
  assert.match(COMMIT, /planWhenIsBackwards\(start, end\)/, "it asks the one rule");
  assert.match(COMMIT, /setSaveError\(LEAVE_BEFORE_ARRIVE_MESSAGE\)/, "and shows the approved sentence");
  assert.match(COMMIT, /return undefined/, "and stops before writing");
  // The refusal must precede the PATCH, or a backwards range could still be sent.
  const refusalAt = COMMIT.indexOf("planWhenIsBackwards(start, end)");
  const patchAt = COMMIT.indexOf('apiRequest("PATCH"');
  assert.ok(refusalAt >= 0 && patchAt >= 0 && refusalAt < patchAt, "the refusal runs before the PATCH");
});

test("E1: a one-day OCCASION still collapses its range (that branch is untouched)", () => {
  assert.match(COMMIT, /if \(shape === "day"\) \{[\s\S]{0,240}?end = start/, "the day-shape branch still sets one date");
  assert.match(SRC, /const datesBackwards = shape !== "day" && planWhenIsBackwards\(startDate, endDate\);/, "the guard exempts the day shape");
});

test("E1: Save and Next are disabled, and the sentence renders under Last day", () => {
  assert.match(SRC, /disabled=\{saving \|\| datesBackwards\}/, "Save is disabled on a backwards range");
  assert.match(SRC, /disabled=\{datesBackwards\}/, "Next is disabled on a backwards range");
  const msg = SRC.match(/data-testid="text-etp-dates-backwards"[\s\S]{0,160}?LEAVE_BEFORE_ARRIVE_MESSAGE/);
  assert.ok(msg, "the approved sentence is rendered in the backwards-only block");
  assert.equal(LEAVE_BEFORE_ARRIVE_MESSAGE, "Leave date can't be before your arrive date.");
});
