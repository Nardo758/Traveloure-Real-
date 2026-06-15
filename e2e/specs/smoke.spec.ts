// e2e/specs/smoke.spec.ts
// Proves the harness is wired: public page renders, and each saved session is authenticated.
// Once this is green, layer the conformance table and the five-flow specs on top.

import { test, expect, authFile } from '../fixtures/roles';

test.describe('harness smoke', () => {
  test('public landing renders without console errors', async ({ page, consoleErrors }) => {
    // Use domcontentloaded so external fonts (Google Fonts) don't block the goto timeout.
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    // Static HTML has <title>Traveloure</title>; React's SEOHead sets it to "Home | Traveloure".
    // Both match /traveloure/i.  Explicit 10 s cap prevents indefinite retry on slow CI.
    await expect(page).toHaveTitle(/traveloure/i, { timeout: 10_000 });
    // Filter network-level noise and Vite HMR warnings.
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
