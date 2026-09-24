import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BUY_NOW_CART_PATH,
  canRemoveBeforePayment,
  readCartIntentParam,
  resolveCartIntent,
} from "../cart-intent";

describe("cart intent — buying vs planning", () => {
  it("C1: the door's own word wins, and only buy/plan are words", () => {
    assert.equal(readCartIntentParam("?intent=buy"), "buy");
    assert.equal(readCartIntentParam("intent=plan&x=1"), "plan");
    assert.equal(readCartIntentParam("?intent=optimize"), null);
    assert.equal(readCartIntentParam(""), null);
    assert.equal(readCartIntentParam(null), null);
    assert.equal(readCartIntentParam(BUY_NOW_CART_PATH.split("?")[1]), "buy");
    const planItems = [{ itineraryItemId: "it-1" }];
    assert.equal(resolveCartIntent({ urlIntent: "buy", items: planItems }), "buy");
    assert.equal(resolveCartIntent({ urlIntent: "plan", items: [] }), "plan");
  });

  it("C2: with no word, a plan-linked line makes it a planning cart, else it is a buying cart", () => {
    assert.equal(resolveCartIntent({ urlIntent: null, items: [{ itineraryItemId: "it-1" }, {}] }), "plan");
    assert.equal(resolveCartIntent({ urlIntent: null, items: [{ itineraryItemId: null }, {}] }), "buy");
    assert.equal(resolveCartIntent({ urlIntent: null, items: [{ itineraryItemId: "" }] }), "buy");
    assert.equal(resolveCartIntent({ urlIntent: null, items: [] }), "buy");
  });

  it("C3: lines are removable on the payment step only until checkout has started", () => {
    assert.equal(canRemoveBeforePayment({ paymentStarted: false, orderSnapshotted: false }), true);
    assert.equal(canRemoveBeforePayment({ paymentStarted: true, orderSnapshotted: false }), false);
    assert.equal(canRemoveBeforePayment({ paymentStarted: false, orderSnapshotted: true }), false);
  });
});
