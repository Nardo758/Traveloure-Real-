/**
 * S-09 predicates (ledger `2026-10-21-email-verification-gate`).
 *
 * The payment-method step stays behind email verification, and this lane never
 * turns it on. The allowlist is the only set of routes a held session may call.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { nextSignupStep, SIGNUP_STEP_PAYMENT_METHOD, SIGNUP_STEP_VERIFY_EMAIL } from "../signup-steps";
import {
  emailVerificationAccess,
  emailVerificationDeniedBody,
  isEmailVerificationAllowlisted,
  EMAIL_VERIFICATION_HOLD_MESSAGE,
  EMAIL_VERIFICATION_REQUIRED_CODE,
} from "../email-verification-gate";

describe("next signup step", () => {
  it("asks for the email before a payment method", () => {
    assert.equal(
      nextSignupStep({ emailVerificationRequired: true, paymentMethodRequired: true }),
      SIGNUP_STEP_VERIFY_EMAIL,
    );
    assert.equal(nextSignupStep({ emailVerificationRequired: true }), SIGNUP_STEP_VERIFY_EMAIL);
  });

  it("offers a payment method only after email is clear and a later lane asks for it", () => {
    assert.equal(
      nextSignupStep({ emailVerificationRequired: false, paymentMethodRequired: true }),
      SIGNUP_STEP_PAYMENT_METHOD,
    );
    assert.equal(nextSignupStep({ emailVerificationRequired: false }), null);
    assert.equal(nextSignupStep({ emailVerificationRequired: false, paymentMethodRequired: false }), null);
  });
});

describe("verification access", () => {
  it("opens for a verified address and for a grandfathered account, and holds otherwise", () => {
    assert.equal(emailVerificationAccess({ emailVerified: new Date(), grandfathered: false }), "open");
    assert.equal(emailVerificationAccess({ emailVerified: null, grandfathered: true }), "open");
    assert.equal(emailVerificationAccess({ emailVerified: null, grandfathered: false }), "hold");
    assert.equal(emailVerificationAccess({ emailVerified: undefined, grandfathered: false }), "hold");
  });

  it("allowlists the verify screen and refuses the product", () => {
    assert.equal(isEmailVerificationAllowlisted("POST", "/api/auth/resend-verification"), true);
    assert.equal(isEmailVerificationAllowlisted("post", "/api/auth/login/"), true);
    assert.equal(isEmailVerificationAllowlisted("GET", "/api/auth/user?x=1"), true);
    assert.equal(isEmailVerificationAllowlisted("POST", "/api/trips"), false);
    assert.equal(isEmailVerificationAllowlisted("POST", "/api/provider/services"), false);
    assert.equal(isEmailVerificationAllowlisted("GET", "/api/dashboard"), false);
  });

  it("refuses with the hold code and the verify step", () => {
    assert.deepEqual(emailVerificationDeniedBody(), {
      code: EMAIL_VERIFICATION_REQUIRED_CODE,
      message: EMAIL_VERIFICATION_HOLD_MESSAGE,
      nextStep: SIGNUP_STEP_VERIFY_EMAIL,
    });
  });
});
