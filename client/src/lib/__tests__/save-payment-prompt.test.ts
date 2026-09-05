/**
 * save-payment-prompt.test.ts — CLAUDE.md Locked Decision 43(a)/(d); ledger
 * `2026-09-05-payment-method-posture` / `2026-09-05-wallets-on-platform-intents`.
 *
 * TWO THINGS ARE PINNED HERE, and they are the two halves of the same ruling.
 *
 * (1) THE PROMPT RENDERS ONLY ON A KNOWN-EMPTY VAULT (P*). The interesting states are not
 *     "has a card / has none" but the two ways of having NO ANSWER: the read is still in flight,
 *     or it degraded (`available: false`, which `/api/me/payment-methods` deliberately returns
 *     instead of a 500 when Stripe is unconfigured). §13: not knowing whether a card exists is
 *     not knowing that none does, and treating it as the latter is how a soft prompt turns into
 *     nagging someone who already saved a card.
 *
 * (2) SIGNUP COLLECTS NOTHING (A*). LD 43(a) is a conversion decision and it is unenforceable by
 *     a runtime assertion — the failure mode is somebody adding a card field to an auth screen,
 *     which no unit test of an existing screen catches. So it is pinned as a STATIC fact about
 *     the auth surfaces: they import neither the prompt, nor the add-card dialog, nor the
 *     payment-methods rail, transitively through nothing.
 *
 * NEGATIVE SPACE: these are source and predicate facts. They do not prove a browser rendered
 * anything, do not prove Stripe offered a wallet (device + dashboard + LD 43(e)'s operator-side
 * Apple Pay domain registration decide that), and say nothing about the server intents — those
 * are `server/__tests__/payment-method-posture.test.ts`.
 *
 * Run: npx tsx --test client/src/lib/__tests__/save-payment-prompt.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  shouldOfferSavePayment,
  savePromptDismissKey,
  readSavePromptDismissed,
  writeSavePromptDismissed,
  type SavePromptState,
} from "../save-payment-prompt";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const CLIENT_SRC = join(ROOT, "client", "src");
const read = (...p: string[]) => readFileSync(join(CLIENT_SRC, ...p), "utf-8");

/** The state in which the prompt SHOULD show — every P below varies exactly one field of it. */
const OFFERABLE: SavePromptState = { available: true, isLoading: false, methodCount: 0, dismissed: false };

// ── P: the predicate ────────────────────────────────────────────────────────────────────────────

test("P1: a known-empty vault, not dismissed, offers the prompt", () => {
  assert.equal(shouldOfferSavePayment(OFFERABLE), true);
});

test("P2: a vault that already holds a method offers nothing", () => {
  assert.equal(shouldOfferSavePayment({ ...OFFERABLE, methodCount: 1 }), false);
});

test("P3: STILL LOADING is not 'no card' — nothing is offered while the read is in flight", () => {
  assert.equal(shouldOfferSavePayment({ ...OFFERABLE, isLoading: true }), false);
});

test("P4: a DEGRADED read (available:false) is not 'no card' either — nothing is offered", () => {
  // The list route returns `{available:false, methods:[]}` when Stripe is unconfigured or the
  // read failed. methodCount is 0 there for a reason that is NOT "the user has no card".
  assert.equal(shouldOfferSavePayment({ ...OFFERABLE, available: false }), false);
  assert.equal(shouldOfferSavePayment({ available: false, isLoading: false, methodCount: 0, dismissed: true }), false);
});

test("P5: a dismissal is respected", () => {
  assert.equal(shouldOfferSavePayment({ ...OFFERABLE, dismissed: true }), false);
});

test("P6: loading wins over every other field (no flash before the answer lands)", () => {
  assert.equal(shouldOfferSavePayment({ available: true, isLoading: true, methodCount: 0, dismissed: false }), false);
});

// ── D: dismissal storage ────────────────────────────────────────────────────────────────────────

test("D1: dismissal is scoped, never global — two scopes are two keys", () => {
  assert.notEqual(savePromptDismissKey("trip:a"), savePromptDismissKey("trip:b"));
  assert.notEqual(savePromptDismissKey("trip:a"), savePromptDismissKey("trip-pass:a"));
  assert.match(savePromptDismissKey("trip:a"), /^traveloure\.savePaymentPrompt\.dismissed:trip:a$/);
});

test("D2: a store that THROWS reads as not-dismissed and never propagates", () => {
  const original = (globalThis as any).localStorage;
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() {
      throw new Error("site data blocked");
    },
  });
  try {
    assert.equal(readSavePromptDismissed("trip:x"), false);
    assert.doesNotThrow(() => writeSavePromptDismissed("trip:x"));
  } finally {
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: original, writable: true });
  }
});

test("D3: an ABSENT store reads as not-dismissed (a soft prompt shown once more is the safe failure)", () => {
  const original = (globalThis as any).localStorage;
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: undefined, writable: true });
  try {
    assert.equal(readSavePromptDismissed("trip:y"), false);
    assert.doesNotThrow(() => writeSavePromptDismissed("trip:y"));
  } finally {
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: original, writable: true });
  }
});

test("D4: a working store round-trips one scope without touching another", () => {
  const backing = new Map<string, string>();
  const original = (globalThis as any).localStorage;
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    writable: true,
    value: {
      getItem: (k: string) => backing.get(k) ?? null,
      setItem: (k: string, v: string) => void backing.set(k, v),
    },
  });
  try {
    assert.equal(readSavePromptDismissed("trip:1"), false);
    writeSavePromptDismissed("trip:1");
    assert.equal(readSavePromptDismissed("trip:1"), true);
    assert.equal(readSavePromptDismissed("trip:2"), false);
  } finally {
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: original, writable: true });
  }
});

// ── A: the shipped artifacts ────────────────────────────────────────────────────────────────────

const promptSrc = read("components", "payment", "SavePaymentMethodPrompt.tsx");
const signupSrc = read("pages", "Signup.tsx");

test("A1: the prompt asks the shared predicate rather than re-deriving the rule (§18 rule 1)", () => {
  assert.match(promptSrc, /shouldOfferSavePayment/);
  assert.match(promptSrc, /useSavedPayment/);
});

test("A2: ONE add-card rail — the prompt opens the existing AddCardDialog and mints no Stripe call", () => {
  assert.match(promptSrc, /AddCardDialog/);
  assert.equal(/loadStripe|setupIntents|paymentIntents|confirmSetup|confirmPayment/.test(promptSrc), false);
});

test("A3: the prompt states no amount (§14 — it charges nothing and prices nothing)", () => {
  assert.equal(/\$\{[^}]*(price|amount|cents|Cents)[^}]*\}|toFixed\(2\)/.test(promptSrc), false);
});

test("A4: LD 43(a) — Signup imports neither the prompt, nor AddCardDialog, nor any payment rail", () => {
  for (const forbidden of [
    "SavePaymentMethodPrompt",
    "AddCardDialog",
    "PaymentMethodsCard",
    "use-saved-payment",
    "payment-methods",
    "@stripe/",
  ]) {
    assert.equal(signupSrc.includes(forbidden), false, `Signup.tsx references ${forbidden} — LD 43(a) says signup collects no payment method, ever`);
  }
});

test("A5: no auth-shaped page anywhere reaches a payment rail", () => {
  // Broader than A4 on purpose: LD 43(a) is about the MOMENT, not one filename, so a renamed or
  // added auth screen is covered. Stated limit: it matches on file NAME, so an auth screen with
  // an unrelated name is outside it.
  const authish: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (entry === "__tests__") continue;
        walk(full);
      } else if (/\.tsx?$/.test(entry) && /signup|sign-up|signin|sign-in|login|register|reset-password|verify-email/i.test(entry)) {
        authish.push(full);
      }
    }
  };
  walk(CLIENT_SRC);
  assert.ok(authish.length > 0, "no auth-shaped source files found — the sweep would be vacuous");
  const offenders: string[] = [];
  for (const file of authish) {
    const src = readFileSync(file, "utf-8");
    if (/SavePaymentMethodPrompt|AddCardDialog|PaymentMethodsCard|@stripe\//.test(src)) {
      offenders.push(relative(ROOT, file));
    }
  }
  assert.deepEqual(offenders, [], `auth surfaces must collect no payment method (LD 43(a)): ${offenders.join(", ")}`);
});

test("A6: the prompt has exactly the TWO mounts the ruling names, and no third", () => {
  const mounts: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (entry === "__tests__") continue;
        walk(full);
      } else if (/\.tsx?$/.test(entry) && !full.endsWith("SavePaymentMethodPrompt.tsx")) {
        if (/from "@\/components\/payment\/SavePaymentMethodPrompt"/.test(readFileSync(full, "utf-8"))) {
          mounts.push(relative(CLIENT_SRC, full).split("\\").join("/"));
        }
      }
    }
  };
  walk(CLIENT_SRC);
  assert.deepEqual(
    mounts.sort(),
    ["components/plancard/SlipView.tsx", "components/plancard/TripPassCard.tsx"].sort(),
    "LD 43(d) gives the soft prompt exactly two mounts — after a Trip Pass purchase, and at Finalize",
  );
});

test("A7: the Finalize mount is gated on the plan holding BOOKABLE rows, and on the owner", () => {
  const slip = read("components", "plancard", "SlipView.tsx");
  assert.match(slip, /const hasBookableRows = useMemo\(/);
  assert.match(slip, /routingStatus === "ready_for_checkout" \|\| isPurchasedRow\(a\)/);
  assert.match(slip, /isOwner && isPrimary && hasBookableRows && \(/);
});

test("A8: the Payment Element sheets suppress no wallet — no paymentMethodOrder, no method pin", () => {
  // LD 43(c) is a server-side parameter, but a client that ORDERS or FILTERS methods can undo it.
  for (const [name, src] of [
    ["StripeCheckout", read("components", "booking", "StripeCheckout.tsx")],
    ["AddCardDialog", read("components", "payment", "AddCardDialog.tsx")],
  ] as const) {
    assert.equal(/paymentMethodOrder/.test(src), false, `${name} orders payment methods`);
    assert.equal(/wallets\s*:/.test(src), false, `${name} configures the wallets option`);
    assert.equal(/paymentMethodTypes|payment_method_types/.test(src), false, `${name} pins payment method types`);
  }
});

test("A9: the FAQ payment answer names the wallets that ship and still refuses PayPal", () => {
  const faq = read("pages", "faq.tsx");
  const answer = faq.slice(faq.indexOf("What payment methods do you accept?"));
  const block = answer.slice(0, 600);
  for (const wallet of ["Apple Pay", "Google Pay", "Link"]) {
    assert.ok(block.includes(wallet), `FAQ payment answer no longer names ${wallet}`);
  }
  assert.match(block, /don't accept PayPal/); // §13 — PayPal is still not integrated
});
