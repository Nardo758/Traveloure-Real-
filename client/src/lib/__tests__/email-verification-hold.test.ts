/**
 * Client hold path (ledger `2026-10-21-email-verification-gate`).
 * The server flag is the authority. This only reads it.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { emailVerificationHoldRequired, isEmailVerificationHoldPath } from "../email-verification-hold";

function readSrc(rel: string): string {
  return readFileSync(new URL(`../../../../${rel}`, import.meta.url), "utf8");
}

describe("email verification hold", () => {
  it("holds only when the server says the email is still required", () => {
    assert.equal(emailVerificationHoldRequired(null), false);
    assert.equal(emailVerificationHoldRequired(undefined), false);
    assert.equal(emailVerificationHoldRequired({ emailVerificationRequired: false }), false);
    assert.equal(emailVerificationHoldRequired({ emailVerificationRequired: true }), true);
  });

  it("drops the check-email screen and sends sign-up on to sign-in", () => {
    const signup = readSrc("client/src/pages/Signup.tsx");
    const modal = readSrc("client/src/components/SignInModal.tsx");
    for (const [name, src] of [
      ["Signup.tsx", signup],
      ["SignInModal.tsx", modal],
    ] as const) {
      assert.equal(src.includes("registered.title"), false, name);
      assert.equal(src.includes("registered.body"), false, name);
      assert.equal(src.includes("signup-neutral-result"), false, name);
      assert.equal(src.includes("Check your email"), false, name);
      assert.equal(src.includes("PaymentMethodSetupGate"), false, name);
      assert.equal(src.includes("AddCardDialog"), false, name);
      assert.equal(src.includes("payout-setup"), false, name);
      assert.match(src, /registered\.paymentStep/, name);
    }
    assert.match(signup, /window\.location\.assign\("\/login"\)/);
    const follow = modal.slice(modal.indexOf("isRegistrationNeutral"), modal.indexOf("if (read.kind === \"non-json\""));
    assert.match(follow, /setMode\("signin"\)/);
    assert.equal(follow.includes("setSignupSubmitted(true)"), false);
  });

  it("treats the verify screen, including a token query, as the hold path", () => {
    assert.equal(isEmailVerificationHoldPath("/verify-email"), true);
    assert.equal(isEmailVerificationHoldPath("/verify-email/"), true);
    assert.equal(isEmailVerificationHoldPath("/verify-email?token=abc"), true);
    assert.equal(isEmailVerificationHoldPath("/dashboard"), false);
    assert.equal(isEmailVerificationHoldPath(""), false);
  });
});
