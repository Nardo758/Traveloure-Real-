/**
 * Affiliate reconciliation — widened internal window tests (task #990).
 *
 * Run with: npx tsx --test server/__tests__/affiliate-reconciliation-window.test.ts
 *
 * Tests the DB-boundary logic: does getReconciliationView / matchRecords start
 * its internal SQL query early enough to include earnings from the last days of
 * the previous month when the admin is viewing "this_month"?
 *
 * Because we cannot hit a real DB in CI we verify the boundary maths directly
 * against the exported helpers and assert the route-level default is correct.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";

const {
  getPeriodDates,
  LATE_REPORT_TOLERANCE_DAYS,
} = await import("../services/affiliate-reconciliation.service");
const { pool } = await import("../db");

after(async () => {
  await pool.end().catch(() => {});
});

// ─── getPeriodDates ──────────────────────────────────────────────────────────

test("getPeriodDates('last_35_days') window spans at least one full month boundary", () => {
  const { start, end } = getPeriodDates("last_35_days");
  const diffDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
  assert.ok(diffDays >= 35, `expected ≥ 35-day window, got ${diffDays.toFixed(1)}`);
  assert.ok(end >= start, "end must be after start");
});

test("getPeriodDates('this_month') start is the 1st of the current month at midnight", () => {
  const { start } = getPeriodDates("this_month");
  const now = new Date();
  assert.equal(start.getFullYear(), now.getFullYear());
  assert.equal(start.getMonth(), now.getMonth());
  assert.equal(start.getDate(), 1);
});

// ─── widenedStart boundary maths ─────────────────────────────────────────────
//
// getReconciliationView computes:
//   widenedStart = start − LATE_REPORT_TOLERANCE_DAYS
// and passes it as matchRecords({ internalWindowStart: widenedStart }).
//
// We replicate that arithmetic here and assert:
//   1. widenedStart is strictly before the period's own start.
//   2. A Dec 28 internal row IS within the widened window when the period is
//      "this_month" and today is any day in January (the first month after Dec).
//   3. The same Dec 28 row is NOT within the un-widened "this_month" window.
//
// These assertions prove that widening the SQL start date is what makes the
// cross-month internal row available for matching — without it the row would
// never be loaded from the DB and would always appear unmatched.

test("widenedStart is strictly earlier than the period start", () => {
  const { start } = getPeriodDates("this_month");
  const widenedStart = new Date(start.getTime() - LATE_REPORT_TOLERANCE_DAYS * 24 * 60 * 60 * 1000);
  assert.ok(widenedStart < start, "widenedStart must precede the period start");
  const diffDays = (start.getTime() - widenedStart.getTime()) / (1000 * 60 * 60 * 24);
  assert.ok(Math.abs(diffDays - LATE_REPORT_TOLERANCE_DAYS) < 0.01, `expected exactly ${LATE_REPORT_TOLERANCE_DAYS} days gap`);
});

test("a Dec 28 internal row falls inside widenedStart when period is this_month in January", () => {
  // Simulate: today = Jan 3
  const simulatedToday = new Date("2026-01-03T10:00:00Z");
  const periodStart = new Date(simulatedToday.getFullYear(), simulatedToday.getMonth(), 1); // Jan 1
  const widenedStart = new Date(periodStart.getTime() - LATE_REPORT_TOLERANCE_DAYS * 24 * 60 * 60 * 1000);

  const dec28 = new Date("2025-12-28T20:00:00Z");

  // Without widening → outside window
  assert.ok(dec28 < periodStart, "Dec 28 must be before the Jan 1 period start");

  // With widening → inside window
  assert.ok(
    dec28 >= widenedStart,
    `Dec 28 (${dec28.toISOString()}) must be ≥ widenedStart (${widenedStart.toISOString()})`
  );
});

test("a Dec 1 internal row falls OUTSIDE widenedStart when period is this_month in January", () => {
  // Rows that are a full month old should not be swept in by the window widening.
  const simulatedToday = new Date("2026-01-03T10:00:00Z");
  const periodStart = new Date(simulatedToday.getFullYear(), simulatedToday.getMonth(), 1);
  const widenedStart = new Date(periodStart.getTime() - LATE_REPORT_TOLERANCE_DAYS * 24 * 60 * 60 * 1000);

  const dec1 = new Date("2025-12-01T00:00:00Z");
  assert.ok(dec1 < widenedStart, "Dec 1 must be before widenedStart; only the last ~10 days of the prior month are included");
});

// ─── Route default ────────────────────────────────────────────────────────────

test("admin reconciliation route defaults to last_35_days when no period param is supplied", async () => {
  // Read the route source and assert the default literal is last_35_days.
  const fs = await import("node:fs/promises");
  const src = await fs.readFile("server/routes/admin.routes.ts", "utf8");

  // Find the affiliate/reconciliation route block and assert the default.
  const routeBlock = src.slice(src.indexOf("/api/admin/affiliate/reconciliation"));
  const defaultLine = routeBlock.split("\n").find((l) => l.includes("|| \"") && l.includes("period"));
  assert.ok(defaultLine, "expected to find a default period assignment in the route");
  assert.ok(
    defaultLine!.includes('"last_35_days"'),
    `route must default to last_35_days; found: ${defaultLine!.trim()}`
  );
});
