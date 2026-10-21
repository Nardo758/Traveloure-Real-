/**
 * checkout-session-fulfillment.test.ts — ledger `2026-10-21-checkout-dynamic-methods`.
 *
 * Run: npx tsx --test server/__tests__/checkout-session-fulfillment.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  checkoutSessionFulfillment,
  checkoutSessionWithholdLogLine,
} from "../services/checkout-session-fulfillment";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (...parts: string[]) => readFileSync(join(ROOT, ...parts), "utf8");

function stripComments(block: string): string {
  return block
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join("\n");
}

test("paid completed and paid async success fulfill; unpaid and failed do not", () => {
  assert.equal(checkoutSessionFulfillment("checkout.session.completed", "paid"), "fulfill");
  assert.equal(checkoutSessionFulfillment("checkout.session.async_payment_succeeded", "paid"), "fulfill");
  assert.equal(checkoutSessionFulfillment("checkout.session.completed", "unpaid"), "withhold");
  assert.equal(checkoutSessionFulfillment("checkout.session.completed", "no_payment_required"), "withhold");
  assert.equal(checkoutSessionFulfillment("checkout.session.completed", null), "withhold");
  assert.equal(checkoutSessionFulfillment("checkout.session.async_payment_succeeded", "unpaid"), "withhold");
  assert.equal(checkoutSessionFulfillment("checkout.session.async_payment_failed", "paid"), "withhold");
  assert.equal(checkoutSessionFulfillment("checkout.session.async_payment_failed", "unpaid"), "withhold");
  assert.equal(checkoutSessionFulfillment("payment_intent.succeeded", "paid"), null);
});

test("the withhold log names the event and carries no key", () => {
  const line = checkoutSessionWithholdLogLine("checkout.session.async_payment_failed", "unpaid", "cs_test_session");
  assert.match(line, /withheld/);
  assert.match(line, /payment_status=unpaid/);
  assert.match(line, /session=cs_test_session/);
  assert.doesNotMatch(line, /sk_|rk_|whsec_/);
});

test("the webhook fulfills checkout sessions only through this gate", () => {
  const src = stripComments(read("server", "services", "stripe-payment.service.ts"));
  const gateAt = src.indexOf("checkoutSessionFulfillment(event.type, session.payment_status)");
  const expertAt = src.indexOf("handleExpertServicePayment(session)");
  const transportAt = src.indexOf("handleStripePaymentSuccess(session.id)");
  assert.ok(gateAt > 0 && expertAt > gateAt && transportAt > gateAt);
  assert.match(src, /checkout\.session\.async_payment_succeeded/);
  assert.match(src, /checkout\.session\.async_payment_failed/);
  assert.match(src, /fulfillment !== "fulfill"/);
  const expert = src.slice(src.indexOf("async handleExpertServicePayment"));
  const insertAt = expert.indexOf("INSERT INTO expert_requests");
  const paidAt = expert.indexOf('payment_status !== "paid"');
  assert.ok(paidAt > 0 && insertAt > paidAt);
});

test("the three hosted Checkout Sessions do not pass payment_method_types", () => {
  for (const file of [
    "server/services/stripe.service.ts",
    "server/services/stripe-payment.service.ts",
    "server/services/membership-checkout.service.ts",
  ]) {
    const code = stripComments(read(...file.split("/")));
    assert.equal(code.includes("payment_method_types"), false, file);
    assert.match(read(...file.split("/")), /payment_status/);
  }
});
