/**
 * CAPTURED-DEPOSIT RESOLUTION — the decision half of `2026-09-03-deposit-paid-cancel`, provable
 * with no database, no server and no Stripe.
 *
 * `resolveCapturedDeposit` is what decides, for a provider cancel, WHETHER money was captured and
 * HOW MUCH — server-derived from the booking row, never from a request body (§14). Its three
 * answers each carry a rule that must not be weakened, so each is pinned here:
 *
 *   C1  SCOPE — only `status = 'deposit_paid'` is in scope. `confirmed` (including a booking that
 *       has since paid its balance) resolves `not_deposit_paid`, which is what keeps this ruling
 *       from widening into the SEPARATE, still-unruled cancel-a-confirmed-booking refund gap
 *       (audit SD-2 / Q2) flagged beside OWNER_BOOKING_TRANSITIONS.
 *   C2  AMOUNT — the deposit, never the total. This is the bug: `total_amount + platform_fee` was
 *       being refunded for money that was never charged.
 *   C3  REFUSAL — a `deposit_paid` row that cannot say what it captured is `unresolvable`, never a
 *       zero. "Refunded $0.00" is a false statement about money and it would take the booking
 *       terminal with the traveler's deposit still sitting at Stripe (§13).
 *
 * The end-to-end money proof (a real refund against a real test-mode PaymentIntent, the retry, the
 * slot release) is `deposit-cancel.db.test.ts` — bench-only.
 *
 * Run solo: npx tsx --test server/__tests__/deposit-captured-resolution.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveCapturedDeposit } from "../services/deposit.service";

/** A well-formed deposit-partial row: $500 service, $150 deposit captured, $350 balance outstanding. */
const GOOD = {
  status: "deposit_paid",
  depositAmount: "150.00",
  depositPaid: true,
  balanceAmount: "350.00",
  balancePaid: false,
  stripePaymentIntentId: "pi_deposit_1",
  stripeDepositIntentId: "pi_deposit_1",
};

test("C1 — scope is `deposit_paid` and nothing else", () => {
  for (const status of ["confirmed", "pending", "payment_pending", "completed", "cancelled", "refunded", "expired", "", null, undefined]) {
    const r = resolveCapturedDeposit({ ...GOOD, status } as any);
    if (status === "deposit_paid") continue;
    assert.equal(
      r.kind,
      "not_deposit_paid",
      `status '${status}' must stay out of scope — widening here reopens the SD-2/Q2 gap`,
    );
  }
});

test("C2 — the amount is the captured DEPOSIT, not the booking total", () => {
  const r = resolveCapturedDeposit(GOOD as any);
  assert.equal(r.kind, "deposit_only");
  assert.equal((r as any).amount, 150, "must be the deposit, never total_amount + platform_fee");
  assert.equal((r as any).paymentIntentId, "pi_deposit_1");

  // Numeric and decimal-string columns resolve identically (the column is a SQL decimal).
  assert.equal((resolveCapturedDeposit({ ...GOOD, depositAmount: 150 } as any) as any).amount, 150);
  // Cents are preserved and rounded the way the rest of the deposit math rounds.
  assert.equal((resolveCapturedDeposit({ ...GOOD, depositAmount: "149.995" } as any) as any).amount, 150);
  assert.equal((resolveCapturedDeposit({ ...GOOD, depositAmount: "149.99" } as any) as any).amount, 149.99);
});

test("C3 — an unanswerable deposit_paid row is REFUSED, never resolved to 0", () => {
  const cases: Array<[string, Record<string, unknown>]> = [
    ["no_payment_intent", { stripePaymentIntentId: null }],
    ["no_payment_intent", { stripePaymentIntentId: "   " }],
    ["payment_intent_mismatch", { stripeDepositIntentId: "pi_some_other_intent" }],
    ["deposit_not_marked_paid", { depositPaid: false }],
    ["deposit_not_marked_paid", { depositPaid: null }],
    ["balance_already_paid", { balancePaid: true }],
    ["no_captured_deposit_amount", { depositAmount: null }],
    ["no_captured_deposit_amount", { depositAmount: "0.00" }],
    ["no_captured_deposit_amount", { depositAmount: "-10.00" }],
    ["no_captured_deposit_amount", { depositAmount: "not-a-number" }],
  ];
  for (const [reason, patch] of cases) {
    const r = resolveCapturedDeposit({ ...GOOD, ...patch } as any);
    assert.equal(r.kind, "unresolvable", `${JSON.stringify(patch)} must be refused, not coerced`);
    assert.equal((r as any).reason, reason);
    assert.equal((r as any).amount, undefined, "a refused row carries NO amount — never a 0 to refund");
  }
});

test("C4 — an absent deposit-intent column is fine; only a DISAGREEING one is not", () => {
  // A pre-Lane-7 or single-stamp row carries only `stripe_payment_intent_id`. That is the column
  // `refundServiceBooking` refunds against, so it alone is enough.
  const r = resolveCapturedDeposit({ ...GOOD, stripeDepositIntentId: null } as any);
  assert.equal(r.kind, "deposit_only");
  assert.equal((r as any).paymentIntentId, "pi_deposit_1");
});
