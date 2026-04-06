import { Page } from '@playwright/test';

/**
 * Login to the platform with email and password.
 * Handles the /accept-terms flow automatically if the account hasn't accepted yet.
 */
export async function loginAs(page: Page, email: string, password: string) {
  console.log(`Logging in as ${email}`);

  await page.goto('/login');
  await page.waitForLoadState('networkidle');

  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.click('[data-testid="button-sign-in-submit"]');
  await page.waitForLoadState('networkidle');

  // Handle /accept-terms — two checkboxes must be ticked before button enables
  if (page.url().includes('/accept-terms')) {
    console.log('On accept-terms page, accepting terms...');
    await page.waitForSelector('[data-testid="checkbox-accept-terms"]', { timeout: 5000 });
    await page.waitForSelector('[data-testid="checkbox-accept-privacy"]', { timeout: 5000 });
    await page.click('[data-testid="checkbox-accept-terms"]');
    await page.click('[data-testid="checkbox-accept-privacy"]');
    await page.waitForSelector('[data-testid="button-accept-continue"]:not([disabled])', { timeout: 5000 });
    await page.click('[data-testid="button-accept-continue"]');
    await page.waitForLoadState('networkidle');
    if (page.url().includes('/accept-terms')) {
      throw new Error('Still on accept-terms page after accepting terms');
    }
  }

  console.log('Login successful, current URL:', page.url());
}

/**
 * Logout from the platform.
 */
export async function logout(page: Page) {
  await page.goto('/api/logout');
  await page.waitForLoadState('networkidle');
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
