/**
 * S-09 predicates (ledger `2026-10-21-email-verification-gate`).
 *
 * The payment-method step stays behind email verification, and this lane never
 * turns it on. The allowlist is the only set of routes a held session may call.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { nextSignupStep, SIGNUP_STEP_PAYMENT_METHOD, SIGNUP_STEP_VERIFY_EMAIL } from "../signup-steps";
import {
  emailVerificationAccess,
  emailVerificationDeniedBody,
  isEmailVerificationAllowlisted,
  EMAIL_VERIFICATION_HOLD_ENFORCED,
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
  it("does not enforce the hold while mail is not sent", () => {
    // Ledger `2026-10-23-drop-check-email`. The predicate below still describes
    // a hold. Sign-in and the product do not apply it. Changing the address on
    // an unverified account still asks that predicate.
    assert.equal(EMAIL_VERIFICATION_HOLD_ENFORCED, false);
    const service = readFileSync(
      new URL("../../server/services/email-verification.service.ts", import.meta.url),
      "utf8",
    );
    const resolve = service.slice(
      service.indexOf("export async function resolveEmailVerificationAccess"),
      service.indexOf("export async function readEmailVerificationGate"),
    );
    assert.equal(resolve.includes("EMAIL_VERIFICATION_HOLD_ENFORCED"), false);
    const read = service.slice(
      service.indexOf("export async function readEmailVerificationGate"),
      service.indexOf("export function stampGrandfatherOnSession"),
    );
    assert.match(read, /if \(!EMAIL_VERIFICATION_HOLD_ENFORCED\)/);
    assert.match(read, /emailVerificationRequired: false/);
    const stamp = service.slice(
      service.indexOf("export function stampGrandfatherOnSession"),
      service.indexOf("export async function pathAfterAuth"),
    );
    assert.match(stamp, /if \(!EMAIL_VERIFICATION_HOLD_ENFORCED\) return/);
    const after = service.slice(service.indexOf("export async function pathAfterAuth"));
    assert.match(after, /if \(!EMAIL_VERIFICATION_HOLD_ENFORCED\) return fallback/);
    assert.match(service, /if \(access !== "hold"\) return/);
    const middleware = readFileSync(
      new URL("../../server/middleware/email-verification-gate.ts", import.meta.url),
      "utf8",
    );
    assert.match(middleware, /if \(!EMAIL_VERIFICATION_HOLD_ENFORCED\) return next\(\)/);
  });

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
