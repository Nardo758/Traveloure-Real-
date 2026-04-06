import { Page } from '@playwright/test';

/**
 * Login to the platform with email and password.
 * Handles the /accept-terms flow automatically if the account hasn't accepted yet.
 *
 * Uses URL-based waiting instead of networkidle — Vite HMR WebSocket prevents
 * networkidle from ever firing.
 */
export async function loginAs(page: Page, email: string, password: string) {
  console.log(`Logging in as ${email}`);

  await page.goto('/login', { waitUntil: 'load' });

  // Wait for the form inputs to be ready
  await page.waitForSelector('#email', { state: 'visible', timeout: 10000 });

  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.click('[data-testid="button-sign-in-submit"]');

  // Wait for navigation away from /login (URL-based, not networkidle)
  await page.waitForURL((url) => !url.toString().includes('/login'), { timeout: 20000 });

  // Handle /accept-terms — two checkboxes must be ticked before button enables
  if (page.url().includes('/accept-terms')) {
    console.log('On accept-terms page, accepting terms...');
    await page.waitForSelector('[data-testid="checkbox-accept-terms"]', { state: 'visible', timeout: 8000 });
    await page.waitForSelector('[data-testid="checkbox-accept-privacy"]', { state: 'visible', timeout: 8000 });
    await page.click('[data-testid="checkbox-accept-terms"]');
    await page.click('[data-testid="checkbox-accept-privacy"]');
    await page.waitForSelector('[data-testid="button-accept-continue"]:not([disabled])', { timeout: 8000 });
    await page.click('[data-testid="button-accept-continue"]');
    // Wait for navigation away from /accept-terms
    await page.waitForURL((url) => !url.toString().includes('/accept-terms'), { timeout: 15000 });
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
  await page.goto('/api/logout', { waitUntil: 'load' });
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
