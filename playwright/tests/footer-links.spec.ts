import { test, expect } from '@playwright/test';
import { getAllFooterHrefs } from '../../client/src/lib/nav-config';

/**
 * Footer link smoke test — guards against broken or missing routes.
 *
 * Derives every href from the single source of truth:
 *   client/src/lib/nav-config.ts  (footerSectionsConfig)
 *
 * Adding or renaming a link in nav-config.ts automatically adds it to
 * this test on the next PR. A href with no matching <Route> in App.tsx
 * will render the NotFound (404) page and fail the assertion here.
 *
 * What this catches:
 *   - A href typo pointing at a path with no matching <Route>
 *   - A <Route> deleted from App.tsx while a footer link remained
 *   - A new footer link added without a corresponding route
 *
 * Auth-protected routes that redirect to "/" rather than 404ing pass
 * this check — a redirect to a valid page is acceptable; a 404 is not.
 *
 * Runs in footer-links-gate.yml against a locally-built production
 * bundle (NODE_ENV=production) — avoids Vite HMR WebSocket noise.
 * No auth / globalSetup required.
 */

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5000';

// Derive hrefs from the shared footer config — the same list layout.tsx uses.
const FOOTER_HREFS: string[] = getAllFooterHrefs();

// ── 404 fingerprint ────────────────────────────────────────────────────────────
// The NotFound component renders an <h1> with this exact text.
// See client/src/pages/not-found.tsx.
const NOT_FOUND_HEADING = '404 - Lost at Sea?';

// ── Tests ──────────────────────────────────────────────────────────────────────

test.describe('Footer link smoke — no broken routes', () => {
  for (const href of FOOTER_HREFS) {
    test(`${href} does not render NotFound`, async ({ page }) => {
      await page.goto(`${BASE_URL}${href}`, {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      });

      // Allow a short moment for client-side navigation / redirects to settle.
      // 3 s is enough for a React redirect (ProtectedRoute → window.location.replace("/")).
      await page.waitForTimeout(3_000);

      // Assert the 404 heading is NOT present anywhere on the page.
      const notFoundHeading = page.getByRole('heading', { name: NOT_FOUND_HEADING, exact: true });
      await expect(notFoundHeading, `Expected ${href} NOT to render the 404 page`).not.toBeVisible({ timeout: 1_000 });

      console.log(`[footer-links] PASS ${href}`);
    });
  }
});
