import { test, expect } from '@playwright/test';
import { getAllHrefs } from '../../client/src/lib/nav-config';

/**
 * Navbar link smoke test — guards against broken or missing routes.
 *
 * Derives every href from the single source of truth:
 *   client/src/lib/nav-config.ts  (navGroupsConfig + authNavConfig + footerSectionsConfig)
 *
 * Uses getAllHrefs() — the union of navbar AND footer hrefs — so that a stale
 * link removed from the navbar config but left in the footer config (or vice
 * versa) is still caught by BOTH gate runs.  Concretely:
 *
 *   - Route /foo exists in App.tsx, nav config, and footer config.
 *   - Dev removes /foo from App.tsx + nav config but forgets footer config.
 *   - getAllHrefs() still contains /foo (pulled from footer config).
 *   - This gate fails → the stale entry is surfaced even though it was
 *     cleaned from the nav config.
 *
 * What this catches:
 *   - A href typo pointing at a path with no matching <Route>
 *   - A <Route> deleted from App.tsx while a nav or footer link remained
 *   - A new nav/footer link added without a corresponding route
 *
 * Auth-protected routes that redirect to "/" rather than 404ing pass
 * this check — a redirect to a valid page is acceptable; a 404 is not.
 *
 * Runs in navbar-links-gate.yml against a locally-built production
 * bundle (NODE_ENV=production) — avoids Vite HMR WebSocket noise.
 * No auth / globalSetup required.
 */

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5000';

// Union of navbar + footer hrefs — shared with footer-links gate so both
// gates always test the same complete set of protected links.
const NAVBAR_HREFS: string[] = getAllHrefs();

// ── 404 fingerprint ────────────────────────────────────────────────────────────
// The NotFound component renders an <h1> with this exact text.
// See client/src/pages/not-found.tsx.
const NOT_FOUND_HEADING = '404 - Lost at Sea?';

// ── Tests ──────────────────────────────────────────────────────────────────────

test.describe('Navbar link smoke — no broken routes', () => {
  for (const href of NAVBAR_HREFS) {
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

      console.log(`[navbar-links] PASS ${href}`);
    });
  }
});
