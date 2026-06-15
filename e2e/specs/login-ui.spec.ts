// e2e/specs/login-ui.spec.ts
// Exercises the REAL SignInModal UI (not the API path the global-setup fixture
// uses), so a regression in the modal — trigger, fields, submit, or the
// post-login redirect — is caught.

import { test, expect } from '../fixtures/roles';
import { ACCOUNTS, PASSWORD } from '../fixtures/accounts';

// Start unauthenticated — we are logging in from scratch here.
test.use({ storageState: { cookies: [], origins: [] } });

/**
 * Opens the SignInModal.  Desktop nav exposes [data-testid="button-sign-in"]
 * directly; on mobile it lives behind the hamburger.
 *
 * We wait for link-logo with a 60 s budget because the Replit Vite dev server
 * needs up to ~50 s to compile and serve the JS bundle on a cold start.
 */
async function openSignInModal(page: import('@playwright/test').Page) {
  await page.waitForSelector('[data-testid="link-logo"]', { timeout: 60_000 });

  const desktopTrigger = page.getByTestId('button-sign-in');
  if (await desktopTrigger.isVisible().catch(() => false)) {
    await desktopTrigger.click();
    return;
  }
  await page.getByTestId('button-mobile-menu').click();
  await page.getByTestId('button-mobile-sign-in').click();
}

test('SignInModal logs an expert in and redirects to the expert console', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  await openSignInModal(page);
  await expect(page.getByTestId('modal-sign-in')).toBeVisible();

  await page.getByTestId('input-email').fill(ACCOUNTS.expert.email);
  await page.getByTestId('input-password').fill(PASSWORD);
  await page.getByTestId('button-auth-submit').click();

  await expect(page).toHaveURL(/\/expert\/dashboard/, { timeout: 30_000 });
  await expect(page).not.toHaveURL(/\/login/);
});
