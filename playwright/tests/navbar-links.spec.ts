import { test, expect } from '@playwright/test';

/**
 * Navbar link smoke test — guards against broken or missing routes.
 *
 * Iterates every href from navItems and authNavItems in
 * client/src/components/layout.tsx and asserts that navigating to
 * each URL does NOT render the NotFound (404) page.
 *
 * Auth-protected routes that redirect to "/" rather than showing 404
 * pass this check — a redirect to a valid page is acceptable; a 404
 * is not.
 *
 * What this catches:
 *   - A href typo that points at a path with no matching <Route>
 *   - A <Route> that was deleted from App.tsx while the nav item remained
 *   - A new nav item added without a corresponding route
 *
 * HOW TO KEEP IN SYNC
 * When you add or rename a navItem / authNavItem href in layout.tsx,
 * add the corresponding path to NAVBAR_HREFS below. The CI gate will
 * fail the PR if the new href is missing a route.
 *
 * Runs in navbar-links-gate.yml against a locally-built production
 * bundle (NODE_ENV=production) — avoids Vite HMR WebSocket noise.
 * No auth / globalSetup required; 404-checking works for all routes
 * including auth-gated ones (which redirect to "/" instead of 404ing).
 */

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5000';

/**
 * Every href present in navItems and authNavItems in layout.tsx.
 *
 * Query-string variants are de-duped to their base path where the base
 * path already appears (e.g. /discover appears as both a bare path and
 * with ?tab=events — we test the bare path once and the variant once).
 *
 * KEEP THIS LIST IN SYNC WITH:
 *   client/src/components/layout.tsx  →  navItems / authNavItems
 */
const NAVBAR_HREFS: string[] = [
  // ── navItems › Discover ──────────────────────────────────────────────
  '/discover',
  '/discover?tab=events',

  // ── navItems › Experts & Services ────────────────────────────────────
  '/experts?role=local_expert',
  '/experts?role=travel_expert',
  '/discover?tab=services',

  // ── navItems › Experiences › Travel & Getaways ───────────────────────
  '/experiences/travel',
  '/experiences/romance',
  '/experiences/date-night',
  '/experiences/retreats',

  // ── navItems › Experiences › Celebrations ────────────────────────────
  '/experiences/birthday',

  // ── navItems › Experiences › Life Milestones ─────────────────────────
  '/experiences/wedding',
  '/experiences/proposal',
  '/experiences/engagement-party',
  '/experiences/baby-shower',
  '/experiences/wedding-anniversaries',

  // ── navItems › Experiences › Group Events ────────────────────────────
  '/experiences/corporate-events',
  '/experiences/corporate',
  '/experiences/boys-trip',
  '/experiences/girls-trip',
  '/experiences/reunions',

  // ── navItems › Planning Tools › Tools ────────────────────────────────
  '/ai-assistant',  // requiresAuth — redirects to / (not 404)
  '/visa-help',

  // ── navItems › Planning Tools › Explore ──────────────────────────────
  // /discover already listed above
  '/deals',

  // ── navItems (top-level) ─────────────────────────────────────────────
  '/earn',
  '/contact',

  // ── authNavItems ──────────────────────────────────────────────────────
  '/dashboard',   // requiresAuth — redirects to / (not 404)
  '/concierge',
  '/chat',        // requiresAuth — redirects to / (not 404)
];

// ── 404 fingerprint ────────────────────────────────────────────────────────────
// The NotFound component renders an <h1> with this exact text.
// See client/src/pages/not-found.tsx.
const NOT_FOUND_HEADING = '404 - Lost at Sea?';

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Deduplicate hrefs — base paths already covered by a query-string
 * variant need not be navigated twice, but we always include the
 * query-string variant because the tab/role param may affect routing.
 */
function deduplicateHrefs(hrefs: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const href of hrefs) {
    if (!seen.has(href)) {
      seen.add(href);
      result.push(href);
    }
  }
  return result;
}

const UNIQUE_HREFS = deduplicateHrefs(NAVBAR_HREFS);

// ── Tests ──────────────────────────────────────────────────────────────────────

test.describe('Navbar link smoke — no broken routes', () => {
  for (const href of UNIQUE_HREFS) {
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
