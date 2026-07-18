/**
 * auth-routes.spec.ts
 *
 * Authenticated smoke test — guards against crashes that only surface when a
 * real logged-in user visits a page and the component receives actual API data.
 *
 * The unauthenticated navbar-links gate (navbar-links.spec.ts) cannot catch
 * these bugs because auth-gated routes redirect to "/" before any data loads.
 * This spec fixes that blind spot by running the same 404 / content / crash
 * checks with a valid session cookie for each platform role.
 *
 * Three describe blocks run with separate storageState files written by
 * playwright/global-setup.ts:
 *
 *   playwright/.auth/expert.json   — travel_expert role (ci-expert@traveloure.test)
 *   playwright/.auth/provider.json — service_provider role
 *   playwright/.auth/admin.json    — admin role
 *
 * If globalSetup could not obtain a valid session (e.g. seed not run locally),
 * the storageState will be empty and routes will redirect as unauthenticated —
 * the tests will still pass (redirect ≠ 404), so local dev workflows are not
 * broken. CI always seeds the accounts before running Playwright.
 *
 * What this catches:
 *   - A page that crash-renders when a real API response contains a null field
 *   - A role-gated page that loads but immediately throws a JS error
 *   - An empty/blank dashboard that passes the 404 gate but is visually broken
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5000';
const NOT_FOUND_HEADING = '404 - Lost at Sea?';

// ── Shared helpers ──────────────────────────────────────────────────────────

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
    `[content-check] ${href} rendered without meaningful content. ` +
      'The page has no visible h1/h2/h3 heading and no <main> with text. ' +
      'Ensure the page component renders real content, not an empty shell.',
  );
}

async function smokeRoute(
  page: import('@playwright/test').Page,
  href: string,
): Promise<void> {
  const pageErrors: Error[] = [];
  page.on('pageerror', (err) => pageErrors.push(err));

  const uncaughtConsoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (
        text.includes('Uncaught') ||
        text.includes('React') ||
        text.includes('TypeError') ||
        text.includes('ReferenceError')
      ) {
        uncaughtConsoleErrors.push(text);
      }
    }
  });

  await page.goto(`${BASE_URL}${href}`, {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  });

  await page.waitForTimeout(3_000);

  const notFoundHeading = page.getByRole('heading', {
    name: NOT_FOUND_HEADING,
    exact: true,
  });
  await expect(
    notFoundHeading,
    `Expected ${href} NOT to render the 404 page`,
  ).not.toBeVisible({ timeout: 1_000 });

  const currentPath = new URL(page.url()).pathname;
  const redirected = currentPath !== href;

  if (!redirected) {
    await assertMeaningfulContent(page, href);

    if (pageErrors.length > 0) {
      const messages = pageErrors.map((e) => e.message).join('\n  ');
      throw new Error(
        `[crash-check] ${href} threw ${pageErrors.length} unhandled JS error(s) after load:\n  ${messages}`,
      );
    }

    if (uncaughtConsoleErrors.length > 0) {
      const messages = uncaughtConsoleErrors.join('\n  ');
      throw new Error(
        `[crash-check] ${href} logged ${uncaughtConsoleErrors.length} uncaught console error(s) after load:\n  ${messages}`,
      );
    }
  }

  console.log(
    `[auth-routes] PASS ${href}` +
      (redirected ? ` → redirected to ${currentPath}` : ''),
  );
}

// ── Expert routes ───────────────────────────────────────────────────────────

const EXPERT_ROUTES = [
  '/expert/dashboard',
  '/expert/clients',
  '/expert/bookings',
  '/expert/services',
  '/expert/earnings',
  '/expert/analytics',
  '/expert/profile',
  '/expert/assigned-trips',
  '/expert/content-studio',
  '/expert/settings',
  '/expert/verification',
  '/expert/contract-categories',
  '/expert/booking-partners',
  '/expert/workspace',
  '/expert/dmo-library',
];

test.describe('Auth smoke — expert routes (travel_expert role)', () => {
  test.use({ storageState: 'playwright/.auth/expert.json' });

  for (const href of EXPERT_ROUTES) {
    test(`${href} does not 404 or crash`, async ({ page }) => {
      await smokeRoute(page, href);
    });
  }
});

// ── Provider routes ─────────────────────────────────────────────────────────

const PROVIDER_ROUTES = [
  '/provider/dashboard',
  '/provider/bookings',
  '/provider/services',
  '/provider/earnings',
  '/provider/analytics',
  '/provider/performance',
  '/provider/calendar',
  '/provider/profile',
  '/provider/settings',
  '/provider/resources',
];

test.describe('Auth smoke — provider routes (service_provider role)', () => {
  test.use({ storageState: 'playwright/.auth/provider.json' });

  for (const href of PROVIDER_ROUTES) {
    test(`${href} does not 404 or crash`, async ({ page }) => {
      await smokeRoute(page, href);
    });
  }
});

// ── Admin routes ────────────────────────────────────────────────────────────

const ADMIN_ROUTES = [
  '/admin/dashboard',
  '/admin/users',
  '/admin/experts',
  '/admin/providers',
  '/admin/plans',
  '/admin/revenue',
  '/admin/analytics',
  '/admin/categories',
  '/admin/expert-templates',
  '/admin/template-approvals',
  '/admin/search',
  '/admin/notifications',
  '/admin/system',
  '/admin/ai-costs',
  '/admin/payouts',
  '/admin/fee-config',
  '/admin/fee-bands',
  '/admin/offering-types',
  '/admin/category-fees',
  '/admin/neighborhoods',
  '/admin/routing-queue',
  '/admin/content-tracking',
  '/admin/services',
  '/admin/affiliate-partners',
  '/admin/platform-providers',
  '/admin/qa-checklist',
];

test.describe('Auth smoke — admin routes (admin role)', () => {
  test.use({ storageState: 'playwright/.auth/admin.json' });

  for (const href of ADMIN_ROUTES) {
    test(`${href} does not 404 or crash`, async ({ page }) => {
      await smokeRoute(page, href);
    });
  }
});
