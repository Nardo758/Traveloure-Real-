import { test, expect } from '@playwright/test';
import { getAllHrefs } from '../../client/src/lib/nav-config';

/**
 * Footer link smoke test — guards against broken or missing routes.
 *
 * Derives every href from the single source of truth:
 *   client/src/lib/nav-config.ts  (footerSectionsConfig + navGroupsConfig + authNavConfig)
 *
 * Uses getAllHrefs() — the union of footer AND navbar hrefs — so that a stale
 * link removed from the footer config but left in the navbar config (or vice
 * versa) is still caught by BOTH gate runs.  Concretely:
 *
 *   - Route /foo exists in App.tsx, footer config, and nav config.
 *   - Dev removes /foo from App.tsx + footer config but forgets nav config.
 *   - getAllHrefs() still contains /foo (pulled from nav config).
 *   - This gate fails → the stale entry is surfaced even though it was
 *     cleaned from the footer config.
 *
 * What this catches:
 *   - A href typo pointing at a path with no matching <Route>
 *   - A <Route> deleted from App.tsx while a footer or nav link remained
 *   - A new footer/nav link added without a corresponding route
 *
 * Auth-protected routes that redirect to "/" rather than 404ing pass
 * this check — a redirect to a valid page is acceptable; a 404 is not.
 *
 * Runs in footer-links-gate.yml against a locally-built production
 * bundle (NODE_ENV=production) — avoids Vite HMR WebSocket noise.
 * No auth / globalSetup required.
 */

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5000';

// Union of footer + navbar hrefs — shared with navbar-links gate so both
// gates always test the same complete set of protected links.
const FOOTER_HREFS: string[] = getAllHrefs();

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
