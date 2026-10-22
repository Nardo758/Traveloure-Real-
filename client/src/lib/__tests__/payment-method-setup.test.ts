/**
 * payment-method-setup.test.ts — ledger `2026-10-21-signup-payment-step`,
 * amended by `2026-10-22-card-gate-skippable`.
 *
 * The signed-in step is one dismissible offer for every account. Supply flows
 * see nothing (`supplyPaymentGateSkipped`). The password form stays free of
 * Stripe, and SavePaymentMethodPrompt keeps its two mounts.
 *
 * Run: npx tsx --test client/src/lib/__tests__/payment-method-setup.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { LOCAL_EXPERT_APPLY_PATH, SUPPLY_APPLICATION_BY_ROLE, supplySignupContinuation } from "@shared/supply-entry";
import { EXPERT_ROLES, PROVIDER_ROLES } from "@shared/roles";
import {
  ADD_PAYMENT_METHOD_BUTTON,
  EXISTING_ACCOUNT_PAYMENT_PROMPT,
  PAYMENT_METHOD_OFFER,
  PAYMENT_METHOD_PROMPT_DISMISS,
  PAYMENT_METHOD_PROMPT_DISMISS_KEY,
  SIGNUP_PAYMENT_STEP_NOTE,
  clearPaymentMethodPromptDismissed,
  paymentMethodSetupMode,
  readPaymentMethodPromptDismissed,
  supplyPaymentGateSkipped,
  writePaymentMethodPromptDismissed,
  type PaymentMethodSetupInput,
} from "../payment-method-setup";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const read = (...parts: string[]) => readFileSync(join(ROOT, ...parts), "utf-8");

const READY: PaymentMethodSetupInput = {
  signedIn: true,
  termsPending: false,
  available: true,
  isLoading: false,
  methodCount: 0,
  dismissedThisSession: false,
  pathname: "/plans/abc",
  role: "user",
  signupSource: null,
};

test("every account with a known-empty vault is offered the prompt", () => {
  assert.equal(PAYMENT_METHOD_OFFER, EXISTING_ACCOUNT_PAYMENT_PROMPT);
  assert.equal(
    PAYMENT_METHOD_OFFER,
    "Save a payment method for the next time you pay. You can skip this and keep using your account.",
  );
  assert.equal(ADD_PAYMENT_METHOD_BUTTON, "Add a payment method");
  assert.equal(PAYMENT_METHOD_PROMPT_DISMISS, "Not now");
  assert.equal(paymentMethodSetupMode(READY), "prompt");
});

test("when the account was created does not change the offer", () => {
  for (const createdAt of [
    null,
    undefined,
    "",
    "not-a-date",
    "2020-01-01T00:00:00.000Z",
    "2026-10-20T23:59:59.999Z",
    "2026-10-21T00:00:00.000Z",
    new Date("2026-10-22T15:00:00.000Z"),
  ]) {
    assert.equal(
      paymentMethodSetupMode({ ...READY, createdAt } as PaymentMethodSetupInput),
      "prompt",
      String(createdAt),
    );
  }
});

test("Not now hides the prompt until the dismissal is cleared", () => {
  assert.equal(paymentMethodSetupMode({ ...READY, dismissedThisSession: true }), "hidden");
});

test("available false, a method already on file, and a list still loading show nothing", () => {
  assert.equal(paymentMethodSetupMode({ ...READY, available: false }), "hidden");
  assert.equal(paymentMethodSetupMode({ ...READY, methodCount: 1 }), "hidden");
  assert.equal(paymentMethodSetupMode({ ...READY, isLoading: true }), "hidden");
  assert.equal(
    paymentMethodSetupMode({ ...READY, createdAt: "2020-01-01T00:00:00.000Z", isLoading: true } as PaymentMethodSetupInput),
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

test("a traveler on a traveler page is offered the prompt", () => {
  for (const pathname of ["/", "/cart", "/plans/abc", "/bookings", "/experts", "/providers", "/experts/some-id"]) {
    assert.equal(paymentMethodSetupMode({ ...READY, pathname, role: "user" }), "prompt", pathname);
    assert.equal(supplyPaymentGateSkipped({ pathname, role: "user" }), false, pathname);
  }
});

test("supply routes hide the prompt, including /earn and the local-expert sign-in return", () => {
  const earn = supplySignupContinuation("?intent=supply");
  assert.equal(earn.kind, "chooser");
  const local = supplySignupContinuation("?intent=supply&role=local_expert");
  assert.equal(local.kind, "application");
  const paths = [
    "/earn",
    "/earn?role=local_expert",
    "/earn/",
    earn.kind === "chooser" ? earn.href : "",
    LOCAL_EXPERT_APPLY_PATH,
    local.kind === "application" ? local.href : "",
    "/become-expert",
    "/become-provider",
    "/start/events",
    "/expert/apply",
    "/provider/new-service",
    "/expert-status",
    "/provider-status",
    "/expert/city-knowledge-test",
    "/expert/dashboard",
    "/expert/today",
    "/provider/dashboard",
    "/provider/services/new",
    "/travel-experts",
    "/services-provider",
    ...Object.values(SUPPLY_APPLICATION_BY_ROLE),
  ];
  for (const pathname of paths) {
    assert.equal(paymentMethodSetupMode({ ...READY, pathname, role: "user" }), "hidden", pathname);
    assert.equal(
      paymentMethodSetupMode({ ...READY, pathname, role: "user", isLoading: true }),
      "hidden",
      `${pathname} loading`,
    );
  }
});

test("an earner role skips the prompt on a supply flow and on a traveler page", () => {
  for (const role of [...EXPERT_ROLES, ...PROVIDER_ROLES]) {
    assert.equal(
      paymentMethodSetupMode({ ...READY, pathname: "/expert/today", role }),
      "hidden",
      role,
    );
    assert.equal(paymentMethodSetupMode({ ...READY, pathname: "/cart", role }), "hidden", `${role} on /cart`);
  }
  assert.equal(paymentMethodSetupMode({ ...READY, pathname: "/provider/dashboard", role: "service_provider" }), "hidden");
  assert.equal(paymentMethodSetupMode({ ...READY, pathname: "/ea/dashboard", role: "executive_assistant" }), "prompt");
  assert.equal(paymentMethodSetupMode({ ...READY, pathname: "/cart", role: "provider" }), "prompt");
});

test("a recorded supply sign-up skips the prompt; a missing tag does not", () => {
  assert.equal(
    paymentMethodSetupMode({ ...READY, pathname: "/cart", role: "user", signupSource: "ig_dm" }),
    "hidden",
  );
  assert.equal(
    paymentMethodSetupMode({ ...READY, pathname: "/cart", role: "user", signupSource: "  " }),
    "prompt",
  );
  assert.equal(
    paymentMethodSetupMode({ ...READY, pathname: "/cart", role: "user", signupSource: null }),
    "prompt",
  );
  assert.equal(
    paymentMethodSetupMode({ ...READY, pathname: LOCAL_EXPERT_APPLY_PATH, role: "user", signupSource: null }),
    "hidden",
  );
});

test("the gate reuses AddCardDialog and is mounted once from App", () => {
  const gate = read("client", "src", "components", "payment", "PaymentMethodSetupGate.tsx");
  assert.match(gate, /import \{ AddCardDialog \}/);
  assert.equal(/import[^;]*SavePaymentMethodPrompt/.test(gate), false);
  assert.match(gate, /payment-method-setup-prompt/);
  assert.equal(gate.includes("payment-method-setup-required"), false);
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

test("the gate asks the one helper and does not restate supply routes", () => {
  const gate = read("client", "src", "components", "payment", "PaymentMethodSetupGate.tsx");
  const setup = read("client", "src", "lib", "payment-method-setup.ts");
  assert.match(gate, /supplyPaymentGateSkipped\(/);
  assert.match(gate, /pathname: location/);
  assert.match(gate, /role: user\?\.role/);
  assert.match(gate, /signupSource: user\?\.signupSource/);
  assert.equal(/startsWith\(/.test(gate), false);
  assert.equal(gate.includes("SUPPLY_APPLICATION_BY_ROLE"), false);
  assert.equal(gate.includes("isEarnerRole"), false);
  const modeFn = setup.slice(setup.indexOf("export function paymentMethodSetupMode"));
  assert.ok(modeFn.indexOf("supplyPaymentGateSkipped") < modeFn.indexOf('return "prompt"'));
  assert.match(setup, /SUPPLY_APPLICATION_BY_ROLE/);
  assert.equal(setup.includes('return "required"'), false);
  assert.equal(setup.includes("accountRequiresSavedMethod"), false);
  assert.equal(setup.includes("before you continue"), false);
});

test("the gate renders the shared offer and does not lock the account out", () => {
  const gate = read("client", "src", "components", "payment", "PaymentMethodSetupGate.tsx");
  for (const name of [
    "PAYMENT_METHOD_OFFER",
    "ADD_PAYMENT_METHOD_BUTTON",
    "PAYMENT_METHOD_PROMPT_DISMISS",
  ]) {
    assert.equal(gate.includes(name), true, name);
  }
  assert.match(gate, /triggerLabel=\{ADD_PAYMENT_METHOD_BUTTON\}/);
  assert.equal(gate.includes("You can skip this and keep using your account"), false);
  assert.equal(PAYMENT_METHOD_OFFER.includes("You can skip this and keep using your account"), true);
  assert.equal(gate.includes("before you continue"), false);
  assert.equal(gate.includes("Sign out"), false);
  assert.equal(gate.includes("logout"), false);
  const dialog = read("client", "src", "components", "payment", "AddCardDialog.tsx");
  assert.match(dialog, /triggerLabel = "Add payment method"/);
  const prompt = read("client", "src", "components", "payment", "SavePaymentMethodPrompt.tsx");
  assert.match(prompt, /<AddCardDialog \/>/);
  assert.equal(prompt.includes("triggerLabel"), false);
});
