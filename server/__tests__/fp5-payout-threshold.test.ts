/**
 * FP-5 / S2 — the effective payout threshold (pure unit; no DB, no server).
 *
 * Evidence: docs/testing/CONSOLE_TABS_EXERCISE.md finding S2 (as-of `f747d0a`). Settings offered
 * "Minimum Payout Amount $" (the provider set 250 and it persisted to
 * `provider_settings.minimum_payout_amount`), while the Money page gated on a hardcoded
 * `stats.available < 10` and the server on `MIN_PAYOUT_CENTS` alone. Two different minimums, and
 * the provider's own was the one ignored: a provider batching at $250 would be offered a payout at
 * $10 and never learn why.
 *
 * The rule, both directions, in one resolver:
 *   • the PLATFORM FLOOR IS NEVER LOWERED — Stripe transfer economics, not the earner's call;
 *   • a STRICTER preference IS honoured — their money, their batching decision.
 *
 * NEGATIVES FIRST: every way a bad or hostile value could lower the floor.
 *
 * Run: npx tsx --test server/__tests__/fp5-payout-threshold.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { MIN_PAYOUT_CENTS, MIN_PAYOUT_DOLLARS, effectivePayoutMinimumCents } from "../config/payout.config";

// ── NEGATIVES FIRST — the floor never moves down, whatever arrives ─────────────────────────────

test("N1: a preference BELOW the platform floor does not lower it", () => {
  assert.equal(effectivePayoutMinimumCents("1"), MIN_PAYOUT_CENTS);
  assert.equal(effectivePayoutMinimumCents(5), MIN_PAYOUT_CENTS);
  assert.equal(effectivePayoutMinimumCents("9.99"), MIN_PAYOUT_CENTS);
});

test("N2: absent / null / empty degrades to the floor, never to zero", () => {
  // The safe failure mode for a threshold — the same posture `resolveCoordinationFee` takes on an
  // absent `fee_bands` row (§8). A provider with no settings row must not become unlimited.
  assert.equal(effectivePayoutMinimumCents(null), MIN_PAYOUT_CENTS);
  assert.equal(effectivePayoutMinimumCents(undefined), MIN_PAYOUT_CENTS);
  assert.equal(effectivePayoutMinimumCents(""), MIN_PAYOUT_CENTS);
});

test("N3: garbage and hostile values degrade to the floor", () => {
  for (const value of ["abc", "0", 0, -250, "-250", Number.NaN, Infinity, "1e-9"]) {
    assert.equal(
      effectivePayoutMinimumCents(value as any),
      MIN_PAYOUT_CENTS,
      `${String(value)} must not lower the platform floor`,
    );
  }
});

// ── The positives — a stricter preference actually gates ───────────────────────────────────────

test("P1: the exercise's own value — a provider who sets 250 is held to 250", () => {
  assert.equal(effectivePayoutMinimumCents("250.00"), 25000);
  assert.equal(effectivePayoutMinimumCents(250), 25000);
});

test("P2: a preference exactly at the floor resolves to the floor (no double-count, no drift)", () => {
  assert.equal(effectivePayoutMinimumCents(MIN_PAYOUT_DOLLARS), MIN_PAYOUT_CENTS);
  assert.equal(effectivePayoutMinimumCents("10.00"), MIN_PAYOUT_CENTS);
});

test("P3: fractional dollars round to whole cents, never to a float amount", () => {
  assert.equal(effectivePayoutMinimumCents("100.005"), 10001);
  assert.equal(effectivePayoutMinimumCents("12.34"), 1234);
  assert.equal(Number.isInteger(effectivePayoutMinimumCents("33.333")), true);
});

test("P4: the resolver is the ONE authority — the floor constant is not re-typed anywhere it gates", () => {
  // Both consumers (POST /api/payouts/request and GET /api/provider/earnings/summary) call this
  // function; the Money page prints what the summary returns. This pins the identity the UI copy
  // and the server's refusal both depend on.
  assert.equal(MIN_PAYOUT_CENTS, MIN_PAYOUT_DOLLARS * 100);
  assert.equal(effectivePayoutMinimumCents(MIN_PAYOUT_DOLLARS - 1), MIN_PAYOUT_CENTS);
  assert.equal(effectivePayoutMinimumCents(MIN_PAYOUT_DOLLARS + 1), MIN_PAYOUT_CENTS + 100);
});
