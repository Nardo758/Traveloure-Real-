/**
 * Customer-create and saved-method webhook decisions (ledger
 * `2026-10-21-saved-method-required`). Pure, plus source pins. No database,
 * no Stripe, no key material.
 *
 * Run: npx tsx --test server/__tests__/stripe-customer-create.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  STRIPE_IDEMPOTENCY_KEY_MAX,
  customerCreateIdempotencyKey,
  customerIdAfterCreate,
} from "../services/stripe-customer-create";
import { vaultRecordLogLine, vaultWebhookDisposition } from "../services/vault-webhook";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function stripComments(src: string): string {
  return src
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join("\n");
}

test("customer create key is the user id, and recovery does not replay the deleted customer", () => {
  assert.equal(customerCreateIdempotencyKey("user-1"), "customer-create:user-1");
  assert.equal(
    customerCreateIdempotencyKey("user-1", "cus_stale"),
    "customer-create:user-1:after:cus_stale",
  );
  assert.notEqual(
    customerCreateIdempotencyKey("user-1"),
    customerCreateIdempotencyKey("user-1", "cus_stale"),
  );
});

test("a key that does not fit Stripe's idempotency limit is a hash of the same inputs", () => {
  const longId = "u".repeat(STRIPE_IDEMPOTENCY_KEY_MAX);
  const key = customerCreateIdempotencyKey(longId);
  assert.ok(key.length <= STRIPE_IDEMPOTENCY_KEY_MAX);
  assert.equal(key, customerCreateIdempotencyKey(longId));
  assert.notEqual(key, customerCreateIdempotencyKey(longId, "cus_stale"));
});

test("the conditional-update winner is stored, and a loser does not use a different created id", () => {
  assert.deepEqual(
    customerIdAfterCreate({ createdId: "cus_a", updateReturnedId: "cus_a", rereadId: null }),
    { returnId: "cus_a", orphanedCreatedId: null },
  );
  assert.deepEqual(
    customerIdAfterCreate({ createdId: "cus_b", updateReturnedId: null, rereadId: "cus_a" }),
    { returnId: "cus_a", orphanedCreatedId: "cus_b" },
  );
  assert.deepEqual(
    customerIdAfterCreate({ createdId: "cus_a", updateReturnedId: null, rereadId: "cus_a" }),
    { returnId: "cus_a", orphanedCreatedId: null },
  );
  assert.deepEqual(
    customerIdAfterCreate({ createdId: "cus_a", updateReturnedId: null, rereadId: null }),
    { returnId: null, orphanedCreatedId: "cus_a" },
  );
});

test("saved-method webhooks are record-only and payment events are not", () => {
  for (const type of ["setup_intent.succeeded", "payment_method.attached", "payment_method.detached"]) {
    assert.equal(vaultWebhookDisposition(type), "record_only");
    const line = vaultRecordLogLine(type);
    assert.match(line, /no fulfillment/);
    assert.match(line, /no local payment-method row/);
    assert.doesNotMatch(line, /sk_|rk_|whsec_/);
  }
  for (const type of [
    "payment_intent.succeeded",
    "payment_intent.payment_failed",
    "checkout.session.completed",
    "checkout.session.async_payment_succeeded",
    "customer.subscription.created",
  ]) {
    assert.equal(vaultWebhookDisposition(type), null);
  }
});

test("getOrCreateCustomer creates with the user-id key and does not adopt an email match", () => {
  const src = readFileSync(join(ROOT, "server/services/stripe-payment.service.ts"), "utf8");
  const start = src.indexOf("async getOrCreateCustomer(");
  const end = src.indexOf("private async readStoredStripeCustomerId(");
  assert.ok(start > 0 && end > start);
  const fn = stripComments(src.slice(start, end));
  assert.equal(fn.includes("customers.list"), false);
  assert.match(fn, /customerCreateIdempotencyKey\(userId\)/);
  assert.match(fn, /idempotencyKey/);
  assert.match(fn, /customerIdAfterCreate/);
  assert.match(fn, /stripe_customer_id IS NULL/);
  assert.match(fn, /RETURNING stripe_customer_id/);
  assert.match(src, /customerCreateIdempotencyKey\(userId, staleCustomerId\)/);
});

test("handleWebhook records vault events before the fulfillment switch", () => {
  const src = stripComments(readFileSync(join(ROOT, "server/services/stripe-payment.service.ts"), "utf8"));
  const vaultAt = src.indexOf('vaultWebhookDisposition(event.type) === "record_only"');
  const switchAt = src.indexOf("switch (event.type)");
  assert.ok(vaultAt > 0 && switchAt > vaultAt);
  const vaultSrc = stripComments(readFileSync(join(ROOT, "server/services/vault-webhook.ts"), "utf8"));
  assert.equal(/promotePaid|customers\.create|paymentIntents\.create|INSERT INTO|from ["'].*\/db["']/.test(vaultSrc), false);
});

test("boot prefix check is the shared policy, including the stripe.service.ts defense", () => {
  const boot = stripComments(readFileSync(join(ROOT, "server/services/stripe.service.ts"), "utf8"));
  assert.match(boot, /checkStripeKeyPrefix\(key, isProd\)/);
  assert.equal(/startsWith\("sk_/.test(boot), false);
  assert.equal(/startsWith\("rk_/.test(boot), false);
  const health = readFileSync(join(ROOT, "server/services/runtime-health.service.ts"), "utf8");
  assert.match(health, /sk_live_ or rk_live_/);
  assert.match(health, /sk_test_ or rk_test_/);
});
