// e2e/specs/login-ui.spec.ts
// Exercises the REAL SignInModal UI (not the API path the global-setup fixture
// uses), so a regression in the modal — trigger, fields, submit, or the
// post-login redirect — is caught. The API-login fixture stays as session setup
// for every other spec; this is the one place the human login flow is tested.

import { test, expect } from '../fixtures/roles';
import { ACCOUNTS, PASSWORD } from '../fixtures/accounts';

// Start unauthenticated — we are logging in from scratch here.
test.use({ storageState: { cookies: [], origins: [] } });

/**
 * Opens the SignInModal across viewports: the desktop header exposes
 * [data-testid="button-sign-in"] directly; on mobile it lives behind the
 * hamburger ([data-testid="button-mobile-menu"] → button-mobile-sign-in).
 * Testids verified in client/src/components/layout.tsx.
 */
async function openSignInModal(page: import('@playwright/test').Page) {
  const desktopTrigger = page.getByTestId('button-sign-in');
  if (await desktopTrigger.isVisible().catch(() => false)) {
    await desktopTrigger.click();
    return;
  }
  await page.getByTestId('button-mobile-menu').click();
  await page.getByTestId('button-mobile-sign-in').click();
}

test('SignInModal logs an expert in and redirects to the expert console', async ({ page }) => {
  await page.goto('/');

  await openSignInModal(page);
  await expect(page.getByTestId('modal-sign-in')).toBeVisible();

  await page.getByTestId('input-email').fill(ACCOUNTS.expert.email);
  await page.getByTestId('input-password').fill(PASSWORD);
  await page.getByTestId('button-auth-submit').click();

  // On success SignInModal does window.location = getRoleHomePath("expert").
  await expect(page).toHaveURL(/\/expert\/dashboard/, { timeout: 20_000 });
  await expect(page).not.toHaveURL(/\/login/);
});
