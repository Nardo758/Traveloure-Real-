/**
 * occasion-schedule.test.ts — pure unit proofs for the 14-day lead-window math.
 * Run solo: npx tsx --test server/services/__tests__/occasion-schedule.test.ts
 * No DB required (the scheduling decision is a pure function with an injectable `today`).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeDueOccurrence } from "../occasion-schedule";

const d = (s: string) => new Date(`${s}T12:00:00Z`); // noon UTC — normalized to date-only inside

test("none: exactly 14 days out is due, on its own date", () => {
  const due = computeDueOccurrence("2026-09-15", "none", d("2026-09-01"));
  assert.ok(due);
  assert.equal(due!.cycleKey, "2026-09-15");
  assert.equal(due!.occasionYear, 2026);
});

test("none: 15 days out is NOT due (outside the lead window)", () => {
  assert.equal(computeDueOccurrence("2026-09-16", "none", d("2026-09-01")), null);
});

test("none: a past date never fires again", () => {
  assert.equal(computeDueOccurrence("2026-08-20", "none", d("2026-09-01")), null);
});

test("none: the occasion day itself is due (0 days out)", () => {
  const due = computeDueOccurrence("2026-09-01", "none", d("2026-09-01"));
  assert.ok(due);
  assert.equal(due!.cycleKey, "2026-09-01");
});

test("annual: uses this year's occurrence when in-window", () => {
  const due = computeDueOccurrence("2020-09-11", "annual", d("2026-09-01"));
  assert.ok(due);
  assert.equal(due!.cycleKey, "2026-09-11");
  assert.equal(due!.occasionYear, 2026);
});

test("annual: rolls to next year across the year boundary", () => {
  const due = computeDueOccurrence("2019-01-05", "annual", d("2026-12-25"));
  assert.ok(due);
  assert.equal(due!.cycleKey, "2027-01-05");
  assert.equal(due!.occasionYear, 2027);
});

test("annual: not due when this year's date is >14 days out and next year's is far", () => {
  assert.equal(computeDueOccurrence("2020-09-20", "annual", d("2026-09-01")), null);
});

test("biweekly: next occurrence on the 14-day cadence is due, with that occurrence as the cycle key", () => {
  const due = computeDueOccurrence("2026-08-29", "biweekly", d("2026-09-01"));
  assert.ok(due);
  assert.equal(due!.cycleKey, "2026-09-12"); // 2026-08-29 + 14
});

test("biweekly: a first occurrence more than 14 days out is not yet due", () => {
  assert.equal(computeDueOccurrence("2026-10-01", "biweekly", d("2026-09-01")), null);
});

test("biweekly: consecutive days map to distinct cycles at the window seam", () => {
  // On the occurrence day → that occurrence; the day after → the next cycle (distinct key).
  const onDay = computeDueOccurrence("2026-09-01", "biweekly", d("2026-09-01"));
  const dayAfter = computeDueOccurrence("2026-09-01", "biweekly", d("2026-09-02"));
  assert.ok(onDay && dayAfter);
  assert.equal(onDay!.cycleKey, "2026-09-01");
  assert.equal(dayAfter!.cycleKey, "2026-09-15");
  assert.notEqual(onDay!.cycleKey, dayAfter!.cycleKey);
});
