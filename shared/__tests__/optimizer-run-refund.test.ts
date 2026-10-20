/**
 * Pure gate for a paid Optimize failure (ledger `2026-10-20-optimize-paid-failure-refund`).
 * Run: npx tsx --test shared/__tests__/optimizer-run-refund.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  optimizerRunRefundIdempotencyKey,
  optimizerRunRefundPendingId,
  recordedPaymentCoversAnotherRun,
} from "../optimizer-run-refund";

test("a delivered run can use its payment again; an empty or refunded one cannot", () => {
  assert.equal(recordedPaymentCoversAnotherRun(2, null), true);
  assert.equal(recordedPaymentCoversAnotherRun(0, null), false);
  assert.equal(recordedPaymentCoversAnotherRun(2, "pending"), false);
  assert.equal(recordedPaymentCoversAnotherRun(2, "refunded"), false);
  assert.equal(recordedPaymentCoversAnotherRun(0, "refunded"), false);
});

test("the refund key and the claim id are one per PaymentIntent", () => {
  assert.equal(optimizerRunRefundIdempotencyKey("pi_a"), "optimizer-run-refund-pi_a");
  assert.equal(optimizerRunRefundPendingId("pi_a"), "pending-optimizer-pi_a");
  assert.notEqual(optimizerRunRefundIdempotencyKey("pi_a"), optimizerRunRefundIdempotencyKey("pi_b"));
});
