/**
 * Row 284. Static read of stripe-payment.service.ts. No service import, no Stripe,
 * no database, no network, no git.
 *
 *   T1  the named-method branch confirms the saved card and sets allow_redirects never
 *   T2  the legacy replay builder adds off_session and does not mention automatic_payment_methods
 *   T3  saved Apple Pay is still excluded in both resolvers
 *   T4  chargeSavedMethod's on-session body has the key; its legacy body does not
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const src = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../services/stripe-payment.service.ts"),
  "utf8",
);

const NEVER = "automatic_payment_methods: { enabled: true, allow_redirects: 'never' as const }";

function sliceBetween(start: string, end: string): string {
  const i = src.indexOf(start);
  const j = src.indexOf(end, i + start.length);
  assert.ok(i >= 0 && j > i, `missing slice ${start} .. ${end}`);
  return src.slice(i, j);
}

function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !/^\s*\/\//.test(line))
    .join("\n");
}

test("T1: the named-method branch confirms the saved card and sets allow_redirects never", () => {
  const branch = sliceBetween("const buildPaymentIntentParams", "const legacyPaymentIntentParams");
  assert.ok(branch.includes("payment_method: offSessionMethodId, confirm: true"));
  assert.ok(branch.includes(NEVER));
  const code = stripComments(src);
  assert.equal(code.includes("return_url"), false);
  assert.equal(code.includes("payment_method_types"), false);
});

test("T2: the legacy replay builder adds off_session and does not carry automatic_payment_methods", () => {
  const legacy = sliceBetween("const legacyPaymentIntentParams", "const requestOptionsForAttempt");
  assert.match(legacy, /off_session: true as const/);
  assert.equal(legacy.includes("automatic_payment_methods"), false);
  assert.match(legacy, /\.\.\.paymentIntentShared\(customerId\)/);
  assert.match(legacy, /payment_method: offSessionMethodId/);
  assert.match(legacy, /confirm: true/);
});

test("T3: saved Apple Pay is still excluded from both one-click resolvers", () => {
  const create = sliceBetween("let offSessionMethodId", "const paymentIntentShared");
  const charge = sliceBetween("async chargeSavedMethod", "async createPaymentIntent");
  assert.match(create, /if \(chosen && !savedMethodConfirmsOnClick\(chosen\)\) offSessionMethodId = null/);
  assert.match(charge, /if \(!chosen \|\| !savedMethodConfirmsOnClick\(chosen\)\) return \{ status: 'no_saved_method' \}/);
});

test("T4: chargeSavedMethod's on-session body sets allow_redirects never and the legacy body does not", () => {
  const onSession = sliceBetween("const onSession: Stripe.PaymentIntentCreateParams = {", "const legacyOffSession");
  const legacy = sliceBetween("const legacyOffSession: Stripe.PaymentIntentCreateParams = {", "return createPaymentIntentPreservingKey");
  assert.ok(onSession.includes("payment_method: chosen.id"));
  assert.ok(onSession.includes("confirm: true"));
  assert.ok(onSession.includes(NEVER));
  assert.equal(legacy.includes("automatic_payment_methods"), false);
  assert.match(legacy, /off_session: true as const/);
  assert.match(legacy, /payment_method: chosen\.id/);
  assert.match(legacy, /confirm: true/);
});
