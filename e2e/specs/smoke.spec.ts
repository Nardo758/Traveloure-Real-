// e2e/specs/smoke.spec.ts
// Proves the harness is wired: public page renders, and each saved session is authenticated.
// Once this is green, layer the conformance table and the five-flow specs on top.

import { test, expect, authFile } from '../fixtures/roles';

test.describe('harness smoke', () => {
  test('public landing renders without console errors', async ({ page, consoleErrors }) => {
    await page.goto('/');
    // Title is set client-side by SEOHead → "Traveloure - …"; toHaveTitle auto-waits.
    await expect(page).toHaveTitle(/traveloure/i); // SWAP #4 if the title differs
    expect(consoleErrors, 'no console errors on landing').toHaveLength(0);
  });

  test.describe('authed as traveler', () => {
    test.use({ storageState: authFile('traveler') });
    test('session is authenticated', async ({ page }) => {
      await page.goto('/dashboard'); // SWAP #4: real authed traveler route (getRoleHomePath)
      await expect(page).not.toHaveURL(/\/login/); // session stuck, not bounced to login
    });
  });

  test.describe('authed as expert', () => {
    test.use({ storageState: authFile('expert') });
    test('expert surface loads', async ({ page }) => {
      await page.goto('/expert/dashboard'); // SWAP #4: real authed expert route
      await expect(page).not.toHaveURL(/\/login/);
    });
  });
});
