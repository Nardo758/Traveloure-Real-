/**
 * plan-budget.test.ts — the plan's budget total is DERIVED, and its ABSENCE is an answer.
 * Ledger `2026-09-04-event-budget`; CLAUDE.md Locked Decision 29.
 *
 * WHAT IS BEING PROVED. `client/src/lib/plan-budget.ts` is the ONE place a plan total is computed
 * from its events' stated budgets — there is no plan-level budget column and none is wanted, so a
 * second copy of this arithmetic at a call site is the drift class §18 rule 1 names. The module is
 * import-free and pure, so these assertions run against the real artifact with nothing stubbed.
 *
 * The negatives are the point: every one of them is a way a plausible implementation would turn
 * "the traveler did not say" into a number they never said (§13).
 *
 *   B1  a mix of stated and unstated events totals only the stated ones, and counts only those
 *   B2  no event stating a budget ⇒ NULL ⇒ the line is OMITTED, never "$0"
 *   B3  a single stated event totals to itself, and reads in the SINGULAR
 *   B4  blank, whitespace and unparseable values are NOT STATED — never coerced to zero
 *   B5  a negative is SUMMED and COUNTED, not filtered — the reader never disagrees with the rows
 *   B6  float tails are snapped to the column's two decimal places (a display total, not money)
 *   B7  the line names the count as part of the claim, and the amount is formatted once
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  formatPlanBudget,
  planBudgetLine,
  planBudgetTotal,
  statedEventBudget,
} from "../plan-budget";

test("B1: only the events that stated a budget are totalled, and only those are counted", () => {
  const summary = planBudgetTotal([
    { budget: "1200.00" },
    { budget: null },
    { budget: "350.00" },
    {},
    { budget: undefined },
  ]);
  assert.deepEqual(summary, { total: 1550, eventCount: 2 });
  // The count is NOT the plan's event count. Five events, two answers — saying "across 5 events"
  // would attribute a total to three events that stated nothing.
  assert.equal(summary?.eventCount, 2);
});

test("B2: when NO event states a budget the total is null — the line is omitted, never $0", () => {
  assert.equal(planBudgetTotal([]), null);
  assert.equal(planBudgetTotal(null), null);
  assert.equal(planBudgetTotal(undefined), null);
  assert.equal(planBudgetTotal([{ budget: null }, {}, { budget: "" }]), null);
  // And the whole line is absent, not an empty-ish string a caller might still render.
  assert.equal(planBudgetLine([{ budget: null }, {}]), null);
});

test("B3: a single stated event totals to itself and reads in the singular", () => {
  assert.deepEqual(planBudgetTotal([{ budget: "800.00" }]), { total: 800, eventCount: 1 });
  const line = planBudgetLine([{ budget: "800.00" }, { budget: null }]);
  assert.match(line ?? "", /across 1 event:/, '"across 1 events" reads as a bug beside a number');
  assert.doesNotMatch(line ?? "", /1 events/);
});

test("B4: blank, whitespace and unparseable values are NOT STATED — never coerced to zero", () => {
  // Number("") and Number(" ") are both 0. That coercion is exactly how "left blank" becomes
  // "said zero", so it is refused before it can happen.
  for (const value of ["", "   ", "abc", "$1,200", "NaN", null, undefined]) {
    assert.equal(
      statedEventBudget(value as string | number | null | undefined),
      null,
      `${JSON.stringify(value)} must read as NOT STATED`,
    );
  }
  assert.equal(statedEventBudget(Number.NaN), null);
  assert.equal(statedEventBudget(Number.POSITIVE_INFINITY), null);
  // A plain number is accepted for the day a payload carries one rather than the column's string.
  assert.equal(statedEventBudget(1200), 1200);
  assert.equal(statedEventBudget("1200.50"), 1200.5);
  // Zero is a STATED zero and stays one — it is the traveler's answer, not an absence.
  assert.equal(statedEventBudget("0"), 0);
  assert.deepEqual(planBudgetTotal([{ budget: "0" }]), { total: 0, eventCount: 1 });
});

test("B5: a negative row is summed and counted, NOT silently filtered", () => {
  // CHOICE, pinned deliberately. The write rail refuses a negative at admission
  // (`userExperienceBudgetSchema`), which is the only place that can stop one being born. A row
  // that somehow holds one — the column carries no DB CHECK, publish-trap posture — is still
  // shown, because dropping it would make the total disagree with the "across N events" printed
  // beside it. If this ever changes, this assertion is the thing to update deliberately.
  assert.deepEqual(planBudgetTotal([{ budget: "500" }, { budget: "-200" }]), {
    total: 300,
    eventCount: 2,
  });
});

test("B6: float tails are snapped to the column's two decimal places", () => {
  const summary = planBudgetTotal([{ budget: "0.1" }, { budget: "0.2" }]);
  assert.deepEqual(summary, { total: 0.3, eventCount: 2 });
  // A DISPLAY total is being rounded here. Nothing about this settles money (§14) — no charge,
  // fee, payout or rate reads this value.
  assert.equal(formatPlanBudget(summary!.total), "$0.30");
});

test("B7: the line names the count as part of the claim and formats the amount once", () => {
  assert.equal(
    planBudgetLine([{ budget: "1200" }, { budget: "350.50" }, { budget: null }]),
    "Budget across 2 events: $1,550.50",
  );
  // A round total keeps the slip's existing money reading ("$1,200"), a stated fraction keeps BOTH
  // cents digits — 0 or 2, never 1, stated once in formatPlanBudget.
  assert.equal(formatPlanBudget(1200), "$1,200");
  assert.equal(formatPlanBudget(1200.5), "$1,200.50");
});
