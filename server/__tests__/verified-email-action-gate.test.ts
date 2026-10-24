/**
 * Pure decision for the verified-email action gate. No database.
 *
 * Enforcement is emailSendsEnabled(): only the exact string "true" turns the
 * gate on. Unset, "false", and "TRUE" leave the decision at allow.
 *
 *   npx tsx --test --test-force-exit server/__tests__/verified-email-action-gate.test.ts
 */
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { emailVerificationDeniedBody } from "../../shared/email-verification-gate";
import {
  decideVerifiedEmailAction,
  requireVerifiedEmail,
  verifiedEmailActionsEnforced,
} from "../services/verified-email-action-gate";

const priorSends = process.env.EMAIL_SENDS_ENABLED;

function setSends(value: string | undefined): void {
  if (value === undefined) delete process.env.EMAIL_SENDS_ENABLED;
  else process.env.EMAIL_SENDS_ENABLED = value;
}

after(() => {
  setSends(priorSends);
});

test("decideVerifiedEmailAction allows every account while enforcement is off", () => {
  assert.equal(decideVerifiedEmailAction({ enforced: false, emailVerified: false }), "allow");
  assert.equal(decideVerifiedEmailAction({ enforced: true, emailVerified: false }), "deny");
  assert.equal(decideVerifiedEmailAction({ enforced: true, emailVerified: true }), "allow");
  assert.equal(decideVerifiedEmailAction({ enforced: false, emailVerified: true }), "allow");
});

test("verifiedEmailActionsEnforced is true only for the exact string true", () => {
  setSends(undefined);
  assert.equal(verifiedEmailActionsEnforced(), false);
  setSends("false");
  assert.equal(verifiedEmailActionsEnforced(), false);
  setSends("TRUE");
  assert.equal(verifiedEmailActionsEnforced(), false);
  setSends("true");
  assert.equal(verifiedEmailActionsEnforced(), true);
});

test("an unenforced gate calls next and writes no response", async () => {
  for (const value of [undefined, "false", "TRUE"] as const) {
    setSends(value);
    let nextCalls = 0;
    let status: number | undefined;
    const handler = requireVerifiedEmail("checkout");
    const req = {
      isAuthenticated: () => true,
      user: { id: "would-be-denied-if-enforced" },
    };
    const res = {
      status(code: number) {
        status = code;
        return this;
      },
      json() {
        throw new Error("unenforced gate must not write a body");
      },
    };
    await handler(req as any, res as any, () => {
      nextCalls += 1;
    });
    assert.equal(nextCalls, 1, `value ${value ?? "unset"}`);
    assert.equal(status, undefined);
  }
});

test("the denied body is the shared email-verification body", () => {
  assert.deepEqual(emailVerificationDeniedBody(), {
    code: "email_verification_required",
    message: "Verify your email to continue.",
    nextStep: "verify_email",
  });
});
