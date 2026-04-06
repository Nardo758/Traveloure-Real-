import { Page } from '@playwright/test';

/**
 * Login to the platform with email and password.
 * Handles the /accept-terms flow automatically if the account hasn't accepted yet.
 */
export async function loginAs(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.waitForLoadState('networkidle');

  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.click('[data-testid="button-sign-in-submit"]');

  // Wait until we've left /login (could go to /dashboard, /accept-terms, etc.)
  await page.waitForURL((url) => !url.toString().includes('/login'), { timeout: 15000 });

  // Handle the /accept-terms page — two checkboxes must both be ticked first
  if (page.url().includes('/accept-terms')) {
    await page.locator('[data-testid="checkbox-accept-terms"]').click();
    await page.locator('[data-testid="checkbox-accept-privacy"]').click();
    await page.locator('[data-testid="button-accept-continue"]').click();

    // Wait until /accept-terms is gone
    await page.waitForURL((url) => !url.toString().includes('/accept-terms'), { timeout: 15000 });
  }

  // Final wait for the landing page to settle
  await page.waitForLoadState('networkidle');
}

/**
 * Logout from the platform.
 */
export async function logout(page: Page) {
  const profileButton = page.locator('[data-testid="profile-menu"]').first();

  if (await profileButton.isVisible().catch(() => false)) {
    await profileButton.click();
    const logoutButton = page.locator('[data-testid="button-logout"]').first();
    if (await logoutButton.isVisible().catch(() => false)) {
      await logoutButton.click();
    } else {
      await page.click('text=Logout');
    }
    await page.waitForURL((url) => url.toString().includes('/login') || url.toString().endsWith('/'), { timeout: 10000 }).catch(() => null);
  }
}

/**
 * Check if the current user is authenticated.
 */
export async function isLoggedIn(page: Page): Promise<boolean> {
  try {
    if (page.url().includes('/login')) return false;
    const response = await page.request.get('/api/auth/user');
    return response.status() === 200;
  } catch {
    return false;
  }
}

/**
 * Accept terms via the API directly (bypasses the UI — faster for test setup).
 */
export async function acceptTermsViaApi(page: Page) {
  await page.request.post('/api/auth/accept-terms', {
    data: { acceptTerms: true, acceptPrivacy: true },
  });
}

/**
 * Wait for authentication navigation to complete.
 */
export async function waitForAuth(page: Page, timeout = 15000) {
  await page.waitForURL((url) => !url.toString().includes('/login'), { timeout }).catch(() => null);
}
