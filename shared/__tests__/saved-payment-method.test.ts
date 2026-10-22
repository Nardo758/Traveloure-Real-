/**
 * Saved payment method labels and the Express Checkout dedupe.
 * Ledger `2026-10-21-saved-method-list-and-express`.
 *
 * Run: npx tsx --test shared/__tests__/saved-payment-method.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  expressCheckoutPaymentMethods,
  mapStripePaymentMethod,
  paymentElementOptions,
  paymentElementWalletsToHide,
  savedPaymentMethodLabel,
} from "../saved-payment-method";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

test("a card keeps the brand and last4 Stripe sent", () => {
  const mapped = mapStripePaymentMethod({
    id: "pm_card",
    type: "card",
    card: { brand: "visa", last4: "4242", exp_month: 12, exp_year: 2028, wallet: null },
  });
  assert.deepEqual(mapped, {
    id: "pm_card",
    type: "card",
    brand: "visa",
    last4: "4242",
    expMonth: 12,
    expYear: 2028,
    wallet: null,
    email: null,
  });
  assert.equal(savedPaymentMethodLabel(mapped!), "Visa ••4242");
});

test("Apple Pay and Google Pay prefix the card label and keep the real last4", () => {
  const apple = mapStripePaymentMethod({
    id: "pm_apple",
    type: "card",
    card: { brand: "mastercard", last4: "4444", exp_month: 1, exp_year: 2030, wallet: { type: "apple_pay" } },
  });
  assert.equal(apple?.wallet, "apple_pay");
  assert.equal(savedPaymentMethodLabel(apple!), "Apple Pay · Mastercard ••4444");
  const google = mapStripePaymentMethod({
    id: "pm_google",
    type: "card",
    card: { brand: "visa", last4: "1111", exp_month: 3, exp_year: 2029, wallet: { type: "google_pay" } },
  });
  assert.equal(savedPaymentMethodLabel(google!), "Google Pay · Visa ••1111");
});

test("a wallet card with no brand or last4 is named without an invented last4", () => {
  const mapped = mapStripePaymentMethod({
    id: "pm_apple_bare",
    type: "card",
    card: { wallet: { type: "apple_pay" } },
  });
  assert.equal(mapped?.brand, null);
  assert.equal(mapped?.last4, null);
  assert.equal(mapped?.expMonth, null);
  assert.equal(savedPaymentMethodLabel(mapped!), "Apple Pay");
});

test("Link uses its own email and does not copy a card last4", () => {
  const mapped = mapStripePaymentMethod({
    id: "pm_link",
    type: "link",
    link: { email: "ada@example.com" },
    card: { brand: "visa", last4: "4242", exp_month: 1, exp_year: 2030 },
  });
  assert.equal(mapped?.brand, null);
  assert.equal(mapped?.last4, null);
  assert.equal(mapped?.expMonth, null);
  assert.equal(mapped?.email, "ada@example.com");
  assert.equal(savedPaymentMethodLabel(mapped!), "Link · ada@example.com");
  const bare = mapStripePaymentMethod({ id: "pm_link2", type: "link", link: {} });
  assert.equal(savedPaymentMethodLabel(bare!), "Link");
});

test("a bank account last4 comes from that type, and an unknown type is not given a card brand", () => {
  const bank = mapStripePaymentMethod({
    id: "pm_bank",
    type: "us_bank_account",
    us_bank_account: { last4: "6789" },
    card: { brand: "visa", last4: "4242" },
  });
  assert.equal(bank?.last4, "6789");
  assert.equal(bank?.brand, null);
  assert.equal(savedPaymentMethodLabel(bank!), "US bank account ••6789");
  const unknown = mapStripePaymentMethod({ id: "pm_x", type: "au_becs_debit" });
  assert.equal(savedPaymentMethodLabel(unknown!), "au becs debit");
  assert.equal(savedPaymentMethodLabel(mapStripePaymentMethod({ id: "pm_sepa", type: "sepa_debit", sepa_debit: { last4: "3000" } })!), "SEPA debit ••3000");
});

test("a missing id is not a method, and empty strings are not last4s", () => {
  assert.equal(mapStripePaymentMethod({ type: "card", card: { brand: "visa", last4: "4242" } }), null);
  assert.equal(mapStripePaymentMethod(null), null);
  const blank = mapStripePaymentMethod({ id: "pm_blank", type: "card", card: { brand: "", last4: "", exp_month: 0, exp_year: 0 } });
  assert.equal(blank?.brand, null);
  assert.equal(blank?.last4, null);
  assert.equal(blank?.expMonth, null);
  assert.equal(blank?.expYear, null);
  assert.equal(savedPaymentMethodLabel(blank!), "Card");
});

test("Payment Element hides a wallet only when Express Checkout is showing it", () => {
  assert.equal(paymentElementWalletsToHide(null), null);
  assert.equal(paymentElementWalletsToHide({ applePay: false, googlePay: false }), null);
  assert.deepEqual(paymentElementWalletsToHide({ applePay: true, googlePay: false }), { applePay: "never" });
  assert.deepEqual(paymentElementWalletsToHide({ applePay: true, googlePay: true }), {
    applePay: "never",
    googlePay: "never",
  });
  assert.equal(paymentElementOptions(null), undefined);
  assert.deepEqual(paymentElementOptions({ applePay: "never" }), { wallets: { applePay: "never" } });
});

test("Express Checkout offers Apple Pay, Google Pay, and Link, and keeps PayPal off", () => {
  assert.deepEqual(expressCheckoutPaymentMethods("auto"), {
    applePay: "auto",
    googlePay: "auto",
    link: "auto",
    paypal: "never",
  });
  assert.equal(expressCheckoutPaymentMethods("never").link, "never");
});

test("the saved-method list does not ask for cards only and does not invent display fields", () => {
  const src = read("server/services/stripe-payment.service.ts");
  const fn = src.slice(src.indexOf("async listSavedPaymentMethods"), src.indexOf("async detachSavedPaymentMethod"));
  assert.ok(fn.includes("async listSavedPaymentMethods"), "list function not found");
  assert.equal(/type:\s*['"]card['"]/.test(fn), false);
  assert.equal(/\?\?\s*['"]card['"]/.test(fn), false);
  assert.equal(/\?\?\s*['"]['"]/.test(fn), false);
  assert.equal(/\?\?\s*0\b/.test(fn), false);
  assert.match(fn, /mapStripePaymentMethod/);
});

test("Express Checkout resolves the click, reports a failed confirm, and pins no method list", () => {
  const src = read("client/src/components/payment/wallet-express-checkout.tsx");
  assert.match(src, /event\.resolve\(\)/);
  assert.match(src, /paymentFailed/);
  assert.match(src, /expressCheckoutPaymentMethods/);
  assert.equal(/payment_method_types|paymentMethodTypes|paymentMethodOrder/.test(src), false);
  assert.match(src, /if \(confirmingRef\.current\) return/);
});

test("the setup dialog and the pay sheet mount Express Checkout and do not pin methods", () => {
  for (const rel of [
    "client/src/components/payment/AddCardDialog.tsx",
    "client/src/components/booking/StripeCheckout.tsx",
  ]) {
    const src = read(rel);
    assert.match(src, /WalletExpressCheckout/, rel);
    assert.match(src, /link="auto"/, rel);
    assert.equal(/wallets\s*:/.test(src), false, rel);
    assert.equal(/payment_method_types|paymentMethodOrder/.test(src), false, rel);
  }
});

test("the hold sheet keeps Link off on both elements", () => {
  const src = read("client/src/components/plan/HandoffChooser.tsx");
  assert.match(src, /WalletExpressCheckout/);
  assert.match(src, /link="never"/);
  assert.match(src, /link:\s*"never"/);
});
