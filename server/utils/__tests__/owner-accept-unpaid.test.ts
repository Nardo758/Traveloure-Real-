/**
 * Ledger 2026-09-24-request-rail-unpaid — the owner rail's Accept needs a payment on record.
 * Run with: npx tsx --test server/utils/__tests__/owner-accept-unpaid.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { OWNER_BOOKING_TRANSITIONS, ownerTransitionRefusal } from "../booking-from-states";

describe("owner accept refuses an unpaid request", () => {
  it("U1: accepting a row with no PaymentIntent is refused as unpaid", () => {
    assert.equal(ownerTransitionRefusal("confirmed", { stripePaymentIntentId: null }), "unpaid");
    assert.equal(ownerTransitionRefusal("confirmed", {}), "unpaid");
    assert.equal(ownerTransitionRefusal("confirmed", { stripePaymentIntentId: "" }), "unpaid");
  });

  it("U2: accepting a row the checkout stamped is allowed", () => {
    assert.equal(ownerTransitionRefusal("confirmed", { stripePaymentIntentId: "pi_123" }), null);
  });

  it("U3: declining is never refused for want of a payment", () => {
    assert.equal(ownerTransitionRefusal("cancelled", { stripePaymentIntentId: null }), null);
  });

  it("U4: the from-state list is unchanged — Accept still consumes only `pending`", () => {
    assert.deepEqual([...OWNER_BOOKING_TRANSITIONS.confirmed], ["pending"]);
  });
});
