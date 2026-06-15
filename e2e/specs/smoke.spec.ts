// e2e/specs/smoke.spec.ts
// Proves the harness is wired: public page renders, and each saved session is authenticated.

import { test, expect, authFile } from '../fixtures/roles';

test.describe('harness smoke', () => {
  test('public landing renders without console errors', async ({ page, consoleErrors }) => {
    // domcontentloaded prevents the goto from blocking on Google Fonts (external CDN).
    // link-logo is a React-rendered element; Vite dev server in Replit needs up to
    // 60 s to compile and serve the JS bundle on first request after a cold start.
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="link-logo"]', { timeout: 60_000 });

    const jsErrors = consoleErrors.filter(
      (e) =>
        !e.includes('Failed to load resource') &&
        !e.includes('favicon') &&
        !e.includes('[vite]') &&
        !e.includes('ERR_') &&
        !e.includes('net::') &&
        !e.includes('Warning:') &&
        !e.includes('ResizeObserver') &&
        !e.includes('Non-Error'),
    );
    expect(jsErrors, 'no JS errors on landing').toHaveLength(0);
  });

  test.describe('authed as traveler', () => {
    test.use({ storageState: authFile('traveler') });
    test('session is authenticated', async ({ page }) => {
      await page.goto('/dashboard');
      await expect(page).not.toHaveURL(/\/login/);
    });
  });

  test.describe('authed as expert', () => {
    test.use({ storageState: authFile('expert') });
    test('expert surface loads', async ({ page }) => {
      await page.goto('/expert/dashboard');
      await expect(page).not.toHaveURL(/\/login/);
    });
  });
});
