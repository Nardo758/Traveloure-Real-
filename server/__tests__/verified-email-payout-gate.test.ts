/**
 * Pure payout half of the verified-email gate. No database.
 *
 * EMAIL_SENDS_ENABLED must be exactly "true" before a null users.email_verified
 * refuses a payout. Any other value does not read the column. Grandfathering is
 * not an input: the reader returns the column, and null is unverified.
 *
 *   npx tsx --test --test-force-exit server/__tests__/verified-email-payout-gate.test.ts
 */
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { emailVerificationDeniedBody } from "../../shared/email-verification-gate";
import {
  PAYOUT_EMAIL_VERIFICATION_BODY,
  earnerEmailVerifiedForPayout,
  payoutEmailVerificationDenial,
} from "../services/verified-email-action-gate";

const priorSends = process.env.EMAIL_SENDS_ENABLED;

function setSends(value: string | undefined): void {
  if (value === undefined) delete process.env.EMAIL_SENDS_ENABLED;
  else process.env.EMAIL_SENDS_ENABLED = value;
}

after(() => {
  setSends(priorSends);
});

function reader(rows: Array<{ emailVerified: Date | null }>) {
  let reads = 0;
  const conn = {
    select() {
      reads += 1;
      return {
        from() {
          return {
            where() {
              return { limit: async () => rows };
            },
          };
        },
      };
    },
  };
  return { conn, get reads() { return reads; } };
}

test("PAYOUT_EMAIL_VERIFICATION_BODY is the shared verification refusal", () => {
  assert.deepEqual(PAYOUT_EMAIL_VERIFICATION_BODY, emailVerificationDeniedBody());
  assert.deepEqual(PAYOUT_EMAIL_VERIFICATION_BODY, {
    code: "email_verification_required",
    message: "Verify your email to continue.",
    nextStep: "verify_email",
  });
});

test("earnerEmailVerifiedForPayout reads the column and ignores grandfathering", async () => {
  const verified = reader([{ emailVerified: new Date("2026-10-24T00:00:00.000Z") }]);
  assert.equal(await earnerEmailVerifiedForPayout(verified.conn as any, "earner"), true);
  assert.equal(verified.reads, 1);

  const unverified = reader([{ emailVerified: null }]);
  assert.equal(await earnerEmailVerifiedForPayout(unverified.conn as any, "earner"), false);

  const missing = reader([]);
  assert.equal(await earnerEmailVerifiedForPayout(missing.conn as any, "earner"), false);
});

test("enforcement off does not read email_verified and does not deny", async () => {
  for (const value of [undefined, "false", "TRUE"] as const) {
    setSends(value);
    const unverified = reader([{ emailVerified: null }]);
    assert.equal(await payoutEmailVerificationDenial(unverified.conn as any, "earner"), null);
    assert.equal(unverified.reads, 0, `value ${value ?? "unset"}`);
  }
});

test("enforcement on denies only a null column", async () => {
  setSends("true");
  const unverified = reader([{ emailVerified: null }]);
  assert.deepEqual(
    await payoutEmailVerificationDenial(unverified.conn as any, "earner"),
    PAYOUT_EMAIL_VERIFICATION_BODY,
  );
  assert.equal(unverified.reads, 1);

  const verified = reader([{ emailVerified: new Date() }]);
  assert.equal(await payoutEmailVerificationDenial(verified.conn as any, "earner"), null);
  assert.equal(verified.reads, 1);

  const missing = reader([]);
  assert.deepEqual(
    await payoutEmailVerificationDenial(missing.conn as any, "missing"),
    PAYOUT_EMAIL_VERIFICATION_BODY,
  );
});
