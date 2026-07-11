// e2e/specs/helpers/auth.ts
// Imperative per-page login for the journey-4..7 specs.
//
// This is the SAME session mechanism e2e/global-setup.ts uses for the
// storageState files the journey-1/2/3 specs consume — not a second approach:
// the app has no /login page; auth is POST /api/auth/login (SignInModal →
// emailAuth.ts), which sets a passport session cookie. Calling it through
// page.request puts the cookie in the page's own jar, so subsequent
// page.goto() navigations are authenticated.
//
// Accounts/password come from e2e/fixtures/accounts.ts (the seeded
// @traveloure.test set; E2E_* env overrides respected) — the same rows
// global-setup logs in with.

import type { Page } from '@playwright/test';
import { ACCOUNTS, PASSWORD, type Role } from '../../fixtures/accounts';

/**
 * Log the page's browser context in as a seeded test account.
 * Mirrors global-setup: POST /api/auth/login, then an authed-confirmation
 * GET /api/auth/user so a silent cookie drop fails loudly here instead of
 * as a confusing downstream assertion.
 */
export async function loginAsTestAccount(page: Page, role: Role): Promise<void> {
  const account = ACCOUNTS[role];
  if (!account) {
    throw new Error(`loginAsTestAccount: unknown role "${role}" (valid: ${Object.keys(ACCOUNTS).join(', ')})`);
  }

  const login = await page.request.post('/api/auth/login', {
    data: { email: account.email, password: PASSWORD },
  });
  if (!login.ok()) {
    throw new Error(
      `loginAsTestAccount(${role}) failed: POST /api/auth/login → ${login.status()} ${login.statusText()} ` +
        `${(await login.text().catch(() => '')).slice(0, 200)}\n` +
        `Check: base URL reachable · E2E_TEST_PASSWORD matches seed · ${account.email} exists & has a password.`,
    );
  }

  const me = await page.request.get('/api/auth/user');
  if (!me.ok()) {
    throw new Error(
      `loginAsTestAccount(${role}): authed-confirmation failed — /api/auth/user returned ${me.status()} ` +
        `(session cookie was not retained; over http this usually means a Secure cookie was dropped).`,
    );
  }

  // Terms gate: accounts with NULL terms_accepted_at/privacy_accepted_at are
  // bounced to /accept-terms by ProtectedRoute before any authed destination,
  // so every waitForSelector on the target page times out (deploy-run bucket 1).
  // Accept once per login; idempotent against already-accepted accounts.
  const terms = await page.request.post('/api/auth/accept-terms', {
    data: { acceptTerms: true, acceptPrivacy: true },
  });
  if (!terms.ok()) {
    throw new Error(
      `loginAsTestAccount(${role}): accept-terms failed (${terms.status()}) — authed pages would bounce to /accept-terms`,
    );
  }
}
