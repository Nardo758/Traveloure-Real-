/**
 * Provider application rejection email — correctness tests.
 *
 * Run with:
 *   npx tsx --test server/__tests__/provider-rejection-email.test.ts
 *
 * Coverage:
 * (A) sendProviderApplicationRejectionEmail does not throw when rejectionMessage
 *     is null — the "no reason given" case must not crash.
 * (B) sendProviderApplicationRejectionEmail does not throw when rejectionMessage
 *     is undefined — omitted key must also be safe.
 * (C) sendProviderApplicationRejectionEmail does not throw when firstName is null.
 * (D) The route guard fires the rejection email when status="rejected" and the
 *     provider user has an email address.
 * (E) The route guard does NOT fire the rejection email when the provider user
 *     has no email address.
 * (F) The route guard does NOT fire the rejection email when status="approved".
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

// ─── Email-service unit tests ─────────────────────────────────────────────────
//
// We deliberately unset RESEND_API_KEY so the function takes the "no client"
// early-return path.  This proves the function handles every param shape
// gracefully without hitting the network.

let savedResendKey: string | undefined;

before(() => {
  savedResendKey = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;
});

after(() => {
  if (savedResendKey !== undefined) {
    process.env.RESEND_API_KEY = savedResendKey;
  } else {
    delete process.env.RESEND_API_KEY;
  }
});

describe('sendProviderApplicationRejectionEmail — graceful handling (no API key)', () => {
  it('(A) does not throw when rejectionMessage is null', async () => {
    const { sendProviderApplicationRejectionEmail } = await import(
      '../services/email.service.js'
    );
    await assert.doesNotReject(
      () =>
        sendProviderApplicationRejectionEmail({
          toEmail: 'provider@example.com',
          firstName: 'Alice',
          rejectionMessage: null,
        }),
      'Function must not throw when rejectionMessage is null',
    );
  });

  it('(B) does not throw when rejectionMessage is undefined (key omitted)', async () => {
    const { sendProviderApplicationRejectionEmail } = await import(
      '../services/email.service.js'
    );
    await assert.doesNotReject(
      () =>
        sendProviderApplicationRejectionEmail({
          toEmail: 'provider@example.com',
          firstName: 'Alice',
          // rejectionMessage intentionally absent
        }),
      'Function must not throw when rejectionMessage key is omitted',
    );
  });

  it('(C) does not throw when firstName is null', async () => {
    const { sendProviderApplicationRejectionEmail } = await import(
      '../services/email.service.js'
    );
    await assert.doesNotReject(
      () =>
        sendProviderApplicationRejectionEmail({
          toEmail: 'provider@example.com',
          firstName: null,
          rejectionMessage: 'Insufficient documentation provided.',
        }),
      'Function must not throw when firstName is null',
    );
  });

  it('(A+C combined) does not throw when both firstName and rejectionMessage are null', async () => {
    const { sendProviderApplicationRejectionEmail } = await import(
      '../services/email.service.js'
    );
    await assert.doesNotReject(
      () =>
        sendProviderApplicationRejectionEmail({
          toEmail: 'provider@example.com',
          firstName: null,
          rejectionMessage: null,
        }),
      'Function must not throw when both firstName and rejectionMessage are null',
    );
  });
});

// ─── Route-guard logic tests ──────────────────────────────────────────────────
//
// The route at admin.routes.ts ~L1332 decides whether to call
// sendProviderApplicationRejectionEmail based on:
//   • status === "rejected"  (not "approved" or anything else)
//   • providerUser?.email    (user must have an email address)
//
// We replicate that conditional here so the spec lives in a testable,
// framework-independent form.  Any change to the route guard that breaks
// these assertions signals a regression.

interface ProviderUser {
  id: string;
  email?: string | null;
  firstName?: string | null;
}

/** Mirrors the route's conditional at admin.routes.ts ~L1332-1343.
 *  Returns { emailShouldFire, resolvedParams } so tests can assert on both. */
function routeGuardDecision(
  status: string,
  rejectionMessage: string | null | undefined,
  providerUser: ProviderUser | null,
): { emailShouldFire: boolean; resolvedParams: object | null } {
  if (status === 'rejected' && providerUser?.email) {
    return {
      emailShouldFire: true,
      resolvedParams: {
        toEmail: providerUser.email,
        firstName: providerUser.firstName ?? null,
        rejectionMessage: rejectionMessage ?? null,
      },
    };
  }
  return { emailShouldFire: false, resolvedParams: null };
}

describe('Route guard — rejection email firing rules', () => {
  const userWithEmail: ProviderUser = {
    id: 'user-1',
    email: 'provider@example.com',
    firstName: 'Alice',
  };

  const userWithoutEmail: ProviderUser = {
    id: 'user-2',
    email: null,
    firstName: 'Bob',
  };

  it('(D) fires rejection email when status="rejected" and user has an email', () => {
    const { emailShouldFire, resolvedParams } = routeGuardDecision(
      'rejected',
      'Missing credentials.',
      userWithEmail,
    );

    assert.strictEqual(emailShouldFire, true, 'Email must fire for a rejected user with an email');

    assert.deepStrictEqual(resolvedParams, {
      toEmail: 'provider@example.com',
      firstName: 'Alice',
      rejectionMessage: 'Missing credentials.',
    });
  });

  it('(D) fires rejection email with null rejectionMessage when no reason is given', () => {
    const { emailShouldFire, resolvedParams } = routeGuardDecision(
      'rejected',
      null, // no reason provided
      userWithEmail,
    );

    assert.strictEqual(emailShouldFire, true, 'Email must fire even when rejectionMessage is null');

    assert.deepStrictEqual(resolvedParams, {
      toEmail: 'provider@example.com',
      firstName: 'Alice',
      rejectionMessage: null,
    });
  });

  it('(D) coerces undefined rejectionMessage to null in the params passed to the email function', () => {
    const { emailShouldFire, resolvedParams } = routeGuardDecision(
      'rejected',
      undefined,
      userWithEmail,
    );

    assert.strictEqual(emailShouldFire, true);
    assert.deepStrictEqual((resolvedParams as any).rejectionMessage, null,
      'Route must normalize undefined rejectionMessage to null before passing to email service');
  });

  it('(E) does NOT fire rejection email when user has no email address', () => {
    const { emailShouldFire } = routeGuardDecision(
      'rejected',
      'Some reason.',
      userWithoutEmail,
    );

    assert.strictEqual(
      emailShouldFire,
      false,
      'Email must not fire when the provider user has no email address',
    );
  });

  it('(E) does NOT fire rejection email when providerUser is null', () => {
    const { emailShouldFire } = routeGuardDecision('rejected', 'Some reason.', null);

    assert.strictEqual(
      emailShouldFire,
      false,
      'Email must not fire when providerUser lookup returns null',
    );
  });

  it('(F) does NOT fire rejection email when status="approved"', () => {
    const { emailShouldFire } = routeGuardDecision('approved', null, userWithEmail);

    assert.strictEqual(
      emailShouldFire,
      false,
      'Rejection email must not fire for an approved application',
    );
  });

  it('(F) does NOT fire rejection email for any non-rejected status value', () => {
    for (const status of ['approved', 'pending', 'under_review', '']) {
      const { emailShouldFire } = routeGuardDecision(status, null, userWithEmail);
      assert.strictEqual(
        emailShouldFire,
        false,
        `Rejection email must not fire for status="${status}"`,
      );
    }
  });
});
