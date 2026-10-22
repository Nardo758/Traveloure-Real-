/**
 * Client hold path (ledger `2026-10-21-email-verification-gate`).
 * The server flag is the authority. This only reads it.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { emailVerificationHoldRequired, isEmailVerificationHoldPath } from "../email-verification-hold";

describe("email verification hold", () => {
  it("holds only when the server says the email is still required", () => {
    assert.equal(emailVerificationHoldRequired(null), false);
    assert.equal(emailVerificationHoldRequired(undefined), false);
    assert.equal(emailVerificationHoldRequired({ emailVerificationRequired: false }), false);
    assert.equal(emailVerificationHoldRequired({ emailVerificationRequired: true }), true);
  });

  it("treats the verify screen, including a token query, as the hold path", () => {
    assert.equal(isEmailVerificationHoldPath("/verify-email"), true);
    assert.equal(isEmailVerificationHoldPath("/verify-email/"), true);
    assert.equal(isEmailVerificationHoldPath("/verify-email?token=abc"), true);
    assert.equal(isEmailVerificationHoldPath("/dashboard"), false);
    assert.equal(isEmailVerificationHoldPath(""), false);
  });
});
