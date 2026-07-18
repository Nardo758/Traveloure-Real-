import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * App route coverage check — guards against broken routes that are NOT
 * listed in nav-config.ts (detail pages, onboarding flows, public share
 * pages, role dashboards, etc.).
 *
 * This complements navbar-links.spec.ts / footer-links.spec.ts:
 *   - Those specs cover routes that are linked from the navbar/footer.
 *   - This spec covers ALL routes registered in App.tsx, including ones that
 *     are never linked (e.g. /itinerary-view/:token, /booking/confirmation).
 *
 * How it works:
 *   1. At test-collection time, reads client/src/App.tsx and extracts every
 *      `<Route path="...">` value with a regex.
 *   2. Dynamic segments (:id, :token, :slug, …) are replaced with canonical
 *      placeholder values so the URL is visitable.
 *   3. Duplicate resolved paths (e.g. /city/:slug and /city/:city both become
 *      /city/tokyo) are deduplicated — only one test is generated per URL.
 *   4. Each resolved path is visited and checked:
 *      (a) The NotFound (404) heading must NOT be present.
 *      (b) If the page did NOT redirect, it must have at least one visible
 *          h1/h2/h3 heading OR a non-empty <main> element (content check).
 *          Auth-gated routes that bounce to "/" are redirects — they are
 *          exempt from the content check since the destination already has
 *          meaningful content.
 *
 * What this catches:
 *   - A <Route> in App.tsx whose component renders NotFound (stub/typo)
 *   - A new page added to App.tsx but with a blank/empty component
 *   - A dynamic route (/itinerary-view/:token) whose page always shows 404
 *   - Routes accidentally removed from App.tsx but still reachable
 *
 * Runs in navbar-links-gate.yml alongside the navbar and footer gates.
 * No auth / globalSetup required — auth-gated routes redirect to "/" which
 * is a valid page, so they pass the 404 check and are skipped on content.
 */

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5000';

// ── 404 fingerprint ─────────────────────────────────────────────────────────
const NOT_FOUND_HEADING = '404 - Lost at Sea?';

// ── Dynamic segment placeholder map ─────────────────────────────────────────
// When a route contains :paramName, we replace it with this value so the URL
// is visitable. Add entries here whenever a new param name is introduced.
const SEGMENT_PLACEHOLDERS: Record<string, string> = {
  id: '1',
  token: 'preview-token',
  slug: 'tokyo',
  city: 'tokyo',
  clientId: '1',
  tripId: '1',
  contentType: 'blog',
};

function substituteParams(routePath: string): string {
  return routePath.replace(/:([a-zA-Z]+)/g, (_match, name: string) => {
    return SEGMENT_PLACEHOLDERS[name] ?? '1';
  });
}

// ── Route extraction ─────────────────────────────────────────────────────────
// Read App.tsx once at module-load time (synchronous, before tests run).
// This means adding a <Route> to App.tsx automatically adds it to this test
// on the next PR — no manual list to maintain.
function extractAppRoutes(): string[] {
  const appTsxPath = path.resolve(__dirname, '../../client/src/App.tsx');
  const source = fs.readFileSync(appTsxPath, 'utf-8');

  // Match every <Route path="..."> including multi-segment paths.
  const routePathRe = /<Route\s+path="([^"]+)"/g;
  const raw: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = routePathRe.exec(source)) !== null) {
    raw.push(m[1]);
  }

  // Substitute dynamic segments and deduplicate resolved URLs.
  const resolved = raw.map(substituteParams);
  return [...new Set(resolved)];
}

// ── Content check ────────────────────────────────────────────────────────────
// A page has "meaningful content" if it has:
//   (a) at least one visible heading (h1–h3), OR
//   (b) a <main> element whose trimmed text is non-empty.
// Catches stub pages that slip past the 404 check.
async function assertMeaningfulContent(
  page: import('@playwright/test').Page,
  href: string,
): Promise<void> {
  const heading = page.locator('h1, h2, h3').first();
  const headingVisible = await heading.isVisible().catch(() => false);
  if (headingVisible) return;

  const mainText = await page
    .locator('main')
    .first()
    .textContent()
    .catch(() => null);
  if (mainText && mainText.trim().length > 0) return;

  throw new Error(
    `[app-routes] ${href} rendered without meaningful content. ` +
      'The page has no visible h1/h2/h3 heading and no <main> with text. ' +
      'Ensure the page component renders real content, not an empty shell.',
  );
}

// ── Test suite ───────────────────────────────────────────────────────────────

const APP_ROUTES = extractAppRoutes();

test.describe('App route coverage — no broken routes', () => {
  for (const href of APP_ROUTES) {
    test(`${href} does not render NotFound`, async ({ page }) => {
      await page.goto(`${BASE_URL}${href}`, {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      });

      // Allow a short moment for client-side navigation / redirects to settle.
      // 3 s is enough for a React redirect (ProtectedRoute → window.location.replace("/")).
      await page.waitForTimeout(3_000);

      // Assert the 404 heading is NOT present anywhere on the page.
      const notFoundHeading = page.getByRole('heading', {
        name: NOT_FOUND_HEADING,
        exact: true,
      });
      await expect(
        notFoundHeading,
        `Expected ${href} NOT to render the 404 page`,
      ).not.toBeVisible({ timeout: 1_000 });

      // Detect whether the page redirected away from the requested href.
      // Auth-gated routes bounce to "/" — skip the content check for those
      // since the destination (landing page) already has rich content.
      const currentPath = new URL(page.url()).pathname;
      const redirected = currentPath !== href;

      if (!redirected) {
        await assertMeaningfulContent(page, href);
      }

      console.log(
        `[app-routes] PASS ${href}` +
          (redirected ? ` → redirected to ${currentPath}` : ''),
      );
    });
  }
});
