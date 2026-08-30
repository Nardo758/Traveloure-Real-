/**
 * Unit tests for the cancellation-policy refund schedule (cancellation-policy.service.ts).
 * Run: npx tsx --test server/services/__tests__/cancellation-policy.test.ts
 *
 * The integration counterpart (real dev DB + Stripe test mode: 50% partial refund, Stripe
 * failure → status restore → retry, repeat/concurrent refund idempotency, proportional
 * platform-revenue reversal) lives in scripts/test-cancellation-refund-integration.ts.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeCancellationRefund } from '../cancellation-policy.service';

const NOW = new Date('2026-08-10T00:00:00Z');
const q = (policyType: string | null, scheduledDate: string | null, totalAmount = 100) =>
  computeCancellationRefund({ policyType, totalAmount, scheduledDate, now: NOW });

test('flexible: full refund at ≥24h, none inside 24h', () => {
  assert.equal(q('flexible', '2026-08-11T00:00:00Z').refundPercent, 100); // exactly 24h
  assert.equal(q('flexible', '2026-08-10T10:00:00Z').refundPercent, 0);
});

test('legacy naive timestamps and date-only values use deterministic UTC boundaries', () => {
  assert.equal(q('flexible', '2026-08-11T00:00:00').hoursUntilStart, 24);
  assert.equal(q('flexible', '2026-08-11').hoursUntilStart, 24);
  assert.equal(q('moderate', '2026-08-12T00:00:00').refundPercent, 50);
  assert.equal(q('strict', '2026-08-17T00:00:00').refundPercent, 50);
});

test('explicit timezone offsets remain authoritative', () => {
  assert.equal(q('flexible', '2026-08-11T05:30:00+05:30').hoursUntilStart, 24);
  assert.equal(q('flexible', '2026-08-10T16:00:00-08:00').hoursUntilStart, 24);
});

test('moderate: 100% at ≥5d, 50% at ≥48h, 0% inside 48h', () => {
  assert.equal(q('moderate', '2026-08-15T00:00:00Z').refundPercent, 100);
  const half = q('moderate', '2026-08-13T00:00:00Z');
  assert.equal(half.refundPercent, 50);
  assert.equal(half.refundAmount, 50);
  assert.equal(q('moderate', '2026-08-11T00:00:00Z').refundPercent, 0);
});

test('50% refund rounds to cents on odd totals', () => {
  const half = q('moderate', '2026-08-13T00:00:00Z', 99.99);
  assert.equal(half.refundAmount, 50); // 49.995 → 50.00
  assert.ok(half.refundAmount <= 99.99);
});

test('strict: 50% at ≥7d, 0% inside', () => {
  assert.equal(q('strict', '2026-08-17T00:00:00Z').refundPercent, 50);
  assert.equal(q('strict', '2026-08-16T23:00:00Z').refundPercent, 0);
});

test('non_refundable: automatic refund refused regardless of timing', () => {
  const far = q('non_refundable', '2027-01-01T00:00:00Z');
  assert.equal(far.refundPercent, 0);
  assert.equal(far.automaticRefundAllowed, false);
  assert.match(far.message, /non-refundable/i);
});

test('missing/unknown policy defaults to flexible', () => {
  const nul = q(null, '2026-08-15T00:00:00Z');
  assert.equal(nul.policyType, 'flexible');
  assert.equal(nul.policyDefaulted, true);
  assert.equal(nul.refundPercent, 100);
  assert.equal(q('bogus_value', '2026-08-10T01:00:00Z').policyType, 'flexible');
});

test('no scheduled date → most generous tier per policy', () => {
  assert.equal(q('flexible', null).refundPercent, 100);
  assert.equal(q('moderate', null).refundPercent, 100);
  assert.equal(q('strict', null).refundPercent, 50);
  assert.equal(q('non_refundable', null).refundPercent, 0);
});

test('never refunds more than paid; negative/garbage totals clamp to 0', () => {
  assert.equal(q('flexible', '2026-08-15T00:00:00Z', -50).refundAmount, 0);
  assert.equal(q('flexible', '2026-08-15T00:00:00Z', NaN).refundAmount, 0);
});
