/** B5 (ledger `2026-09-30-b5-dates-days-and-nights`): a window's span says days AND nights. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { planSpanLabel } from "../plan-dates";

test("S1 Nov 11–15 is five days and four nights, never '4 days'", () => {
  assert.equal(planSpanLabel("2026-11-11", "2026-11-15"), "5 days · 4 nights");
});
test("S2 a one-day plan is one day and names no night", () => {
  assert.equal(planSpanLabel("2026-11-11", "2026-11-11"), "1 day");
  assert.equal(planSpanLabel("2026-11-11", "2026-11-12"), "2 days · 1 night");
});
test("S3 a month and a DST boundary are counted as calendar days", () => {
  assert.equal(planSpanLabel("2026-10-30", "2026-11-02"), "4 days · 3 nights");
  assert.equal(planSpanLabel("2026-03-07", "2026-03-09"), "3 days · 2 nights");
});
test("S4 §13 — an inverted, missing or malformed window says nothing", () => {
  assert.equal(planSpanLabel("2026-11-15", "2026-11-11"), null);
  assert.equal(planSpanLabel("", "2026-11-11"), null);
  assert.equal(planSpanLabel(undefined, null), null);
  assert.equal(planSpanLabel("Nov 11", "2026-11-15"), null);
});
