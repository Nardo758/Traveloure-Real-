/**
 * Paid Optimize failure copy (ledger `2026-10-20-optimize-paid-failure-refund`).
 * Run: npx tsx --test client/src/lib/__tests__/optimize-failure-copy.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { OPTIMIZE_FAILED_REFUNDED, OPTIMIZE_FAILED_REFUND_PENDING } from "../optimize-failure-copy";

test("the refund sentences name the failure and the refund, with no amount or time", () => {
  for (const sentence of [OPTIMIZE_FAILED_REFUNDED, OPTIMIZE_FAILED_REFUND_PENDING]) {
    assert.match(sentence, /didn't finish/);
    assert.match(sentence, /plan is unchanged/);
    assert.match(sentence, /fee you paid/);
    assert.equal(/\d/.test(sentence), false);
    assert.equal(sentence.includes("$"), false);
    assert.equal(sentence.includes("%"), false);
  }
  assert.match(OPTIMIZE_FAILED_REFUNDED, /was refunded/);
  assert.match(OPTIMIZE_FAILED_REFUND_PENDING, /is being refunded/);
});

test("the review screen and the versions board both read those sentences", () => {
  const review = readFileSync("client/src/pages/itinerary-comparison.tsx", "utf8");
  const board = readFileSync("client/src/pages/plan-versions.tsx", "utf8");
  for (const src of [review, board]) {
    assert.match(src, /OPTIMIZE_FAILED_REFUNDED/);
    assert.match(src, /OPTIMIZE_FAILED_REFUND_PENDING/);
    assert.match(src, /optimizationFeeRefund/);
  }
});
