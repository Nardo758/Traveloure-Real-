import { test, expect } from '@playwright/test';

/**
 * Regression guard: /admin/fee-config must always redirect to /admin/fee-bands.
 *
 * The old fee-config page was removed and replaced with a <Redirect> in App.tsx.
 * Without this test, a future route refactor or accidental re-import could silently
 * restore the old form — which looks functional but saves nothing.
 *
 * This test is deliberately auth-unaware: the redirect happens at the React-router
 * layer before any auth check, so we can assert the URL change without logging in.
 * If that ever changes (e.g. the redirect is gated), update accordingly.
 */

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5000';

test.describe('Admin fee-config redirect regression', () => {
  test('/admin/fee-config redirects to /admin/fee-bands', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/fee-config`, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });

    // Allow client-side navigation to settle.
    await page.waitForTimeout(3_000);

    const currentPath = new URL(page.url()).pathname;
    expect(
      currentPath,
      'Expected /admin/fee-config to redirect to /admin/fee-bands, ' +
        `but the browser landed on ${currentPath}. ` +
        'The deprecated fee-config page may have been accidentally restored.',
    ).toBe('/admin/fee-bands');
  });
});
