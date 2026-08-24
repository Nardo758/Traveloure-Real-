/**
 * ea-console-pages.spec.ts
 *
 * Confirms that the three core EA console pages (/ea/executives, /ea/events,
 * /ea/gifts) load without error for a logged-in executive_assistant user and
 * that the backing API endpoints (/api/ea/executives, /api/ea/events,
 * /api/ea/gifts) return HTTP 200 rather than 401/403.
 *
 * Auth: uses the pre-built ea.json storageState written by globalSetup.
 *       In local dev the session guard emits a warning and skips gracefully
 *       if the seed has not been run; in CI it throws immediately.
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5000';
const IS_CI = process.env.CI === 'true';

/** Pages to smoke-test, paired with the API endpoint each one calls. */
const EA_PAGES = [
  { href: '/ea/executives', api: '/api/ea/executives', label: 'Executive Management' },
  { href: '/ea/events',     api: '/api/ea/events',     label: 'Events'               },
  { href: '/ea/gifts',      api: '/api/ea/gifts',      label: 'Gifts'                },
] as const;

test.describe('EA console pages — executive_assistant role', () => {
  test.use({ storageState: 'playwright/.auth/ea.json' });

  let eaSessionOk = false;

  test.beforeAll(async ({ request }) => {
    const res  = await request.get(`${BASE_URL}/api/auth/session`);
    const body = await res.json().catch(() => ({})) as Record<string, unknown>;

    const authenticated = body.authenticated === true;
    const role          = (body.user as Record<string, unknown> | undefined)?.role ?? '';
    const roleOk        = authenticated && role === 'executive_assistant';

    console.log(
      `[ea-console] session check — authenticated=${authenticated}, role=${role}`,
    );

    if (IS_CI) {
      if (!authenticated) {
        throw new Error(
          `[ea-console] EA storageState did not yield an authenticated session. ` +
          `Got: ${JSON.stringify(body)}. ` +
          `Ensure scripts/seed-ci-test-users.ts ran and globalSetup completed.`,
        );
      }
      if (!roleOk) {
        throw new Error(
          `[ea-console] EA session has unexpected role "${role}". ` +
          `Expected "executive_assistant".`,
        );
      }
    } else if (!roleOk) {
      console.warn(
        '[ea-console] EA session not authenticated or wrong role. ' +
        'Tests will be skipped. Run scripts/seed-ci-test-users.ts and restart the server.',
      );
    }

    eaSessionOk = roleOk;
  });

  for (const { href, api, label } of EA_PAGES) {
    test(`${href} renders without error and ${api} returns 200`, async ({ page }) => {
      test.skip(!eaSessionOk, 'EA session not ready — skipped in local dev');

      // ── Capture JS errors ──────────────────────────────────────────────
      const pageErrors: string[] = [];
      page.on('pageerror', (err) => pageErrors.push(err.message));

      // ── Capture API response status for the EA endpoint ────────────────
      let apiStatus: number | null = null;
      page.on('response', (response) => {
        if (response.url().includes(api)) {
          apiStatus = response.status();
        }
      });

      // ── Navigate ───────────────────────────────────────────────────────
      await page.goto(`${BASE_URL}${href}`, {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      });

      // Let React finish rendering and all API fetches settle.
      await page.waitForTimeout(3_000);

      // ── 1. Page must not have been redirected to login ─────────────────
      const currentPath = new URL(page.url()).pathname;
      expect(
        currentPath,
        `${href} redirected to ${currentPath} — user was not authenticated`,
      ).toBe(href);

      // ── 2. Page must show meaningful content (heading) ─────────────────
      const heading = page.getByText(label, { exact: false }).first();
      await expect(heading, `${href} heading "${label}" must be visible`).toBeVisible({
        timeout: 5_000,
      });

      // ── 3. No unhandled JS errors ──────────────────────────────────────
      expect(
        pageErrors,
        `${href} threw unhandled JS error(s):\n  ${pageErrors.join('\n  ')}`,
      ).toHaveLength(0);

      // ── 4. API returned 200 (not 401 / 403) ───────────────────────────
      // The network event may arrive slightly after page load settles.
      if (apiStatus === null) {
        // Trigger it explicitly with the shared session context.
        const apiRes = await page.request.get(`${BASE_URL}${api}`);
        apiStatus = apiRes.status();
      }

      expect(
        apiStatus,
        `${api} must return 200 for an executive_assistant user (got ${apiStatus})`,
      ).toBe(200);

      console.log(`[ea-console] PASS ${href} — ${api} → ${apiStatus}`);
    });
  }
});
