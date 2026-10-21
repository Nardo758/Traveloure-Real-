/**
 * payment-method-setup.test.ts — ledger `2026-10-21-signup-payment-step`.
 *
 * The signed-in step's predicate, plus the source facts that keep the password
 * form free of Stripe and keep SavePaymentMethodPrompt at its two mounts.
 *
 * Run: npx tsx --test client/src/lib/__tests__/payment-method-setup.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PAYMENT_METHOD_PROMPT_DISMISS_KEY,
  REQUIRED_PAYMENT_STEP_BODY,
  SAVED_METHOD_REQUIRED_FROM,
  SIGNUP_PAYMENT_STEP_NOTE,
  accountRequiresSavedMethod,
  clearPaymentMethodPromptDismissed,
  paymentMethodSetupMode,
  readPaymentMethodPromptDismissed,
  writePaymentMethodPromptDismissed,
  type PaymentMethodSetupInput,
} from "../payment-method-setup";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const read = (...parts: string[]) => readFileSync(join(ROOT, ...parts), "utf-8");

const READY: PaymentMethodSetupInput = {
  signedIn: true,
  termsPending: false,
  createdAt: "2026-10-21T00:00:00.000Z",
  available: true,
  isLoading: false,
  methodCount: 0,
  dismissedThisSession: false,
};

test("the cutoff is the ruling date, and an unreadable date is not a new account", () => {
  assert.equal(SAVED_METHOD_REQUIRED_FROM, "2026-10-21T00:00:00.000Z");
  assert.equal(accountRequiresSavedMethod("2026-10-20T23:59:59.999Z"), false);
  assert.equal(accountRequiresSavedMethod("2026-10-21T00:00:00.000Z"), true);
  assert.equal(accountRequiresSavedMethod(new Date("2026-10-22T15:00:00.000Z")), true);
  assert.equal(accountRequiresSavedMethod(null), false);
  assert.equal(accountRequiresSavedMethod(undefined), false);
  assert.equal(accountRequiresSavedMethod(""), false);
  assert.equal(accountRequiresSavedMethod("not-a-date"), false);
});

test("a new account with a known-empty vault is required", () => {
  assert.equal(paymentMethodSetupMode(READY), "required");
});

test("an existing account with a known-empty vault is a prompt, and a dismissal hides it", () => {
  const existing = { ...READY, createdAt: "2026-10-20T12:00:00.000Z" };
  assert.equal(paymentMethodSetupMode(existing), "prompt");
  assert.equal(paymentMethodSetupMode({ ...existing, dismissedThisSession: true }), "hidden");
});

test("a missing createdAt is the existing-account prompt, not the required step", () => {
  assert.equal(paymentMethodSetupMode({ ...READY, createdAt: null }), "prompt");
});

test("available false and a method already on file hide the step", () => {
  assert.equal(paymentMethodSetupMode({ ...READY, available: false }), "hidden");
  assert.equal(paymentMethodSetupMode({ ...READY, methodCount: 1 }), "hidden");
  const existing = { ...READY, createdAt: "2020-01-01T00:00:00.000Z", available: false };
  assert.equal(paymentMethodSetupMode(existing), "hidden");
});

test("a new account still loading is checking; an existing account waits without a flash", () => {
  assert.equal(paymentMethodSetupMode({ ...READY, isLoading: true }), "checking");
  assert.equal(
    paymentMethodSetupMode({ ...READY, createdAt: "2020-01-01T00:00:00.000Z", isLoading: true }),
    "hidden",
  );
});

test("signed out, or terms still pending, hides the step", () => {
  assert.equal(paymentMethodSetupMode({ ...READY, signedIn: false }), "hidden");
  assert.equal(paymentMethodSetupMode({ ...READY, termsPending: true }), "hidden");
});

test("session dismissal is written, read, and cleared", () => {
  const store = new Map<string, string>();
  const previous = globalThis.sessionStorage;
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    },
  });
  try {
    assert.equal(readPaymentMethodPromptDismissed(), false);
    writePaymentMethodPromptDismissed();
    assert.equal(store.get(PAYMENT_METHOD_PROMPT_DISMISS_KEY), "1");
    assert.equal(readPaymentMethodPromptDismissed(), true);
    clearPaymentMethodPromptDismissed();
    assert.equal(readPaymentMethodPromptDismissed(), false);
  } finally {
    Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: previous });
  }
});

test("the gate reuses AddCardDialog and is mounted once from App", () => {
  const gate = read("client", "src", "components", "payment", "PaymentMethodSetupGate.tsx");
  assert.match(gate, /import \{ AddCardDialog \}/);
  assert.equal(/import[^;]*SavePaymentMethodPrompt/.test(gate), false);
  assert.match(gate, /payment-method-setup-required/);
  assert.match(gate, /payment-method-setup-prompt/);
  const app = read("client", "src", "App.tsx");
  assert.match(app, /<PaymentMethodSetupGate\s*\/>/);
  const logout = read("client", "src", "hooks", "use-auth.ts");
  assert.match(logout, /clearPaymentMethodPromptDismissed\(\)/);
});

test("signup surfaces say the step is after sign-in and do not import the gate", () => {
  const en = read("client", "src", "locales", "en", "auth.json");
  assert.match(en, new RegExp(SIGNUP_PAYMENT_STEP_NOTE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  for (const file of ["client/src/pages/Signup.tsx", "client/src/components/SignInModal.tsx"]) {
    const src = read(...file.split("/"));
    assert.match(src, /registered\.paymentStep/);
    assert.equal(src.includes("PaymentMethodSetupGate"), false);
    assert.equal(src.includes("AddCardDialog"), false);
  }
});

test("the gate renders the shared copy constants and does not restate them", () => {
  const gate = read("client", "src", "components", "payment", "PaymentMethodSetupGate.tsx");
  for (const name of [
    "REQUIRED_PAYMENT_STEP_TITLE",
    "REQUIRED_PAYMENT_STEP_BODY",
    "REQUIRED_PAYMENT_STEP_SIGNIN_NOTE",
    "PAYMENT_METHOD_CHECKING",
    "EXISTING_ACCOUNT_PAYMENT_PROMPT",
    "PAYMENT_METHOD_PROMPT_DISMISS",
    "PAYMENT_METHOD_STEP_SIGN_OUT",
  ]) {
    assert.equal(gate.includes(name), true, name);
  }
  assert.equal(gate.includes("You are charged only when you choose to pay"), false);
  assert.equal(REQUIRED_PAYMENT_STEP_BODY.includes("You are charged only when you choose to pay"), true);
});
