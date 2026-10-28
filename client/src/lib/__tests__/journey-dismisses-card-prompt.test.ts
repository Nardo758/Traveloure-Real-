/**
 * ROW 285: the Kyoto journey dismisses the add-a-card prompt the way a traveler does, and the
 * prompt stays. Ledger `2026-10-28-journeys-dismiss-card-prompt`.
 *
 * The journey suite runs only on main, nightly and by manual dispatch, so this is the part of
 * row 285 that pull-request CI can run. It reads the Kyoto spec and the gate as text.
 *
 *   D1  the spec's `signedInTraveler` registers an init script that writes the app's own
 *       dismissal key, with the value `writePaymentMethodPromptDismissed()` stores
 *   D2  the gate still renders the prompt and its "Not now" button, and "Not now" still writes
 *       the dismissal (the prompt was not removed and stays skippable)
 *   D3  the spec forces no click and installs no locator handler; the real "Not now" test skips
 *       only when the saved-methods read answers `available: false` (no configured Stripe key)
 *
 * Static: files are read with node:fs; no git, no ref, no database, no network.
 * Run: node --import ./client/src/lib/__tests__/lc1-css-register.mjs --import tsx --test client/src/lib/__tests__/journey-dismisses-card-prompt.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  PAYMENT_METHOD_PROMPT_DISMISS_KEY,
  writePaymentMethodPromptDismissed,
} from "../payment-method-setup";

const ROOT = process.cwd();
const SPEC = fs.readFileSync(path.join(ROOT, "playwright/tests/journeys/j-kyoto-trips-golden-path.spec.ts"), "utf8");
const GATE = fs.readFileSync(path.join(ROOT, "client/src/components/payment/PaymentMethodSetupGate.tsx"), "utf8");

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

/** The value the app's own "Not now" stores, read by calling it against an in-memory store. */
function dismissedValue(): string | null {
  const store = new Map<string, string>();
  const original = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  });
  try {
    writePaymentMethodPromptDismissed();
    return store.get(PAYMENT_METHOD_PROMPT_DISMISS_KEY) ?? null;
  } finally {
    if (original) Object.defineProperty(globalThis, "sessionStorage", original);
    else delete (globalThis as { sessionStorage?: unknown }).sessionStorage;
  }
}

test("D1: signedInTraveler writes the app's own dismissal before the app mounts", () => {
  const src = stripComments(SPEC);
  assert.match(
    src,
    /import \{ PAYMENT_METHOD_PROMPT_DISMISS_KEY \} from "\.\.\/\.\.\/\.\.\/client\/src\/lib\/payment-method-setup";/,
    "the key is the app's constant, imported, not a copy",
  );
  const start = src.indexOf("async function signedInTraveler(");
  assert.ok(start >= 0, "signedInTraveler must be locatable");
  const helper = src.slice(start, src.indexOf("\n}\n", start));
  assert.match(helper, /page\.addInitScript\(/);
  assert.match(helper, /PAYMENT_METHOD_PROMPT_DISMISS_KEY/);
  const value = dismissedValue();
  assert.ok(value, "writePaymentMethodPromptDismissed() stores a value");
  assert.ok(
    helper.includes(`sessionStorage.setItem(key, ${JSON.stringify(value)})`),
    `the init script stores ${JSON.stringify(value)}, the value the app's "Not now" stores`,
  );
  assert.ok(helper.indexOf("addInitScript") < helper.indexOf("registerUser("), "the script is registered before sign-in");
});

test("D2: the prompt is still rendered and still skippable", () => {
  const src = stripComments(GATE);
  assert.match(src, /data-testid="payment-method-setup-prompt"/);
  assert.match(src, /data-testid="button-dismiss-payment-method-setup"/);
  assert.match(src, /writePaymentMethodPromptDismissed\(\);/);
  assert.match(src, /readPaymentMethodPromptDismissed\(\)/);
});

test("D3: the spec forces no click and installs no locator handler", () => {
  const src = stripComments(SPEC);
  assert.doesNotMatch(src, /force\s*:\s*true/);
  assert.doesNotMatch(src, /addLocatorHandler/);
  assert.match(src, /testid\(page, "button-dismiss-payment-method-setup"\)\.click\(\)/, "one journey clicks Not now for real");
  const realClick = src.slice(src.indexOf('test.describe("row 285 · the add-a-card prompt"'));
  const skips = realClick.match(/test\.skip\(/g) ?? [];
  assert.equal(skips.length, 1, "the real-click test skips in exactly one place");
  assert.match(realClick, /test\.skip\(available !== true,/, "and only when the server says no prompt can be offered");
});
