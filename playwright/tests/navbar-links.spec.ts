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
 *   - A route that exists but renders a blank/empty page (stub page)
 *
 * Auth-protected routes that redirect to "/" rather than 404ing pass
 * this check — a redirect to a valid page is acceptable; a 404 is not.
 * Redirected routes are excluded from the content check since the landing
 * page they redirect to already has meaningful content.
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

// ── Content check ──────────────────────────────────────────────────────────────
// A page is considered to have "meaningful content" if it has:
//   (a) at least one visible heading (h1–h3), OR
//   (b) a <main> element whose trimmed text content is non-empty.
//
// This catches stub pages that slip past the 404 gate: pages that have a
// valid <Route> and render something other than NotFound, but are completely
// blank or empty shells.
//
// The check is only applied to routes that did NOT redirect — auth-gated
// routes that bounce to "/" are already landing on content-rich pages and
// do not need this assertion.
async function assertMeaningfulContent(
  page: import('@playwright/test').Page,
  href: string,
): Promise<void> {
  // Check (a): at least one visible heading h1–h3.
  const heading = page.locator('h1, h2, h3').first();
  const headingVisible = await heading.isVisible().catch(() => false);
  if (headingVisible) return;

  // Check (b): a <main> with non-empty trimmed text.
  const mainText = await page
    .locator('main')
    .first()
    .textContent()
    .catch(() => null);
  if (mainText && mainText.trim().length > 0) return;

  // Neither condition met — fail with a descriptive message.
  throw new Error(
    `[content-check] ${href} rendered without meaningful content. ` +
      'The page has no visible h1/h2/h3 heading and no <main> with text. ' +
      'Ensure the page component renders real content, not an empty shell.',
  );
}

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

      // Detect whether the page redirected away from the requested href.
      // Auth-gated routes bounce to "/" — skip the content check for those
      // since the destination (landing page) already has rich content.
      const currentPath = new URL(page.url()).pathname;
      const redirected = currentPath !== href;

      if (!redirected) {
        // Content check: the page must have at least one heading or a populated
        // <main>. This catches blank stub pages that pass the 404 gate.
        await assertMeaningfulContent(page, href);
      }

      console.log(
        `[navbar-links] PASS ${href}` + (redirected ? ` → redirected to ${currentPath}` : ''),
      );
    });
  }
});
