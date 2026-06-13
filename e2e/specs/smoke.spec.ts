import { test, expect } from '../fixtures/roles';
import { authFile } from '../fixtures/roles';
import { accounts, allRoles } from '../fixtures/accounts';

/**
 * SWAP #4 — proves the harness works: the app loads, and each role's cached
 * session lands on its authed home route without being bounced back to a
 * public/landing surface.
 *
 * Authed routes per role come from client/src/lib/role-utils.ts
 * (getRoleHomePath) and are declared on each account's `home` field.
 */

test.describe('smoke: app is up', () => {
  test('home page renders with a non-empty title', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/.+/);
    await expect(page.locator('body')).toBeVisible();
  });
});

for (const role of allRoles) {
  const account = accounts[role];

  test.describe(`smoke: ${role} authed`, () => {
    test.use({ storageState: authFile(role) });

    test(`reaches ${account.home}`, async ({ page }) => {
      const res = await page.goto(account.home, { waitUntil: 'domcontentloaded' });

      // Server should not hard-error the authed route.
      expect(res?.status() ?? 0, `HTTP status for ${account.home}`).toBeLessThan(400);

      // The session must hold: we should remain on the role home, not be
      // redirected to the public landing ("/") or have an auth modal forced.
      await expect(page).toHaveURL(new RegExp(`${escapeRe(account.home)}`));
      await expect(page.locator('body')).toBeVisible();
    });
  });
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
