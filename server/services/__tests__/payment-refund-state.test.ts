/**
 * F6 (#1823): the reconcile message reads the payment's refund state from Stripe, and FAILS SAFE.
 *
 * Five branches, exactly the Nov 10 brief's test list (lines 178-183). The Stripe read is injected, so nothing here
 * touches the network and every branch is reachable.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { PAYMENT_REFUND_STATE_MESSAGES, readPaymentRefundState } from "../checkout-claim.service";

const stub = (intent: any) => async () => intent;

test("F6.1 succeeded and fully refunded -> the automatic-refund message", async () => {
  const r = await readPaymentRefundState("pi_1", {
    retrievePaymentIntent: stub({ status: "succeeded", amount: 1000, latest_charge: { amount: 1000, amount_refunded: 1000 } }),
  });
  assert.equal(r.state, "refunded");
  assert.equal(r.message, PAYMENT_REFUND_STATE_MESSAGES.refunded);
});

test("F6.2 succeeded and partly refunded -> the manual-refund message", async () => {
  const r = await readPaymentRefundState("pi_2", {
    retrievePaymentIntent: stub({ status: "succeeded", amount: 1000, latest_charge: { amount: 1000, amount_refunded: 400 } }),
  });
  assert.equal(r.state, "needs_manual_refund");
  assert.equal(r.message, PAYMENT_REFUND_STATE_MESSAGES.needs_manual_refund);
});

test("F6.3 succeeded with no refund -> the manual-refund message", async () => {
  const r = await readPaymentRefundState("pi_3", {
    retrievePaymentIntent: stub({ status: "succeeded", amount: 1000, latest_charge: { amount: 1000, amount_refunded: 0 } }),
  });
  assert.equal(r.state, "needs_manual_refund");
});

test("F6.4 a Stripe error -> the manual-refund message, never the automatic one", async () => {
  const r = await readPaymentRefundState("pi_4", {
    retrievePaymentIntent: async () => { throw new Error("stripe down"); },
  });
  assert.equal(r.state, "needs_manual_refund");
  assert.notEqual(r.message, PAYMENT_REFUND_STATE_MESSAGES.refunded);
});

test("F6.5 not succeeded -> neither refund message", async () => {
  const r = await readPaymentRefundState("pi_5", {
    retrievePaymentIntent: stub({ status: "requires_payment_method", amount: 1000 }),
  });
  assert.equal(r.state, "not_charged");
  assert.equal(r.message, null);
});
