/**
 * Ops gap 10 (ledger `2026-10-22-report-message-context`): the clamp and the sender labels.
 *   RX1  missing or junk ⇒ the default (10); each side is clamped to 25; a negative is 0
 *   RX2  the sender is named by role in the report, never by id
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { REPORT_CONTEXT_DEFAULT, REPORT_CONTEXT_MAX, clampReportContextCount, reportContextSender } from "../report-context";

test("RX1 — the clamp", () => {
  assert.equal(REPORT_CONTEXT_DEFAULT, 10);
  assert.equal(REPORT_CONTEXT_MAX, 25);
  assert.deepEqual(
    [undefined, null, "", "abc", "5", 5, "25", "26", 1000, "-3", "7.9"].map(clampReportContextCount),
    [10, 10, 10, 10, 5, 5, 25, 25, 25, 0, 7],
  );
});

test("RX2 — sender labels", () => {
  assert.equal(reportContextSender("b", "a", "b"), "reported");
  assert.equal(reportContextSender("a", "a", "b"), "reporter");
  assert.equal(reportContextSender("c", "a", "b"), "other");
});
