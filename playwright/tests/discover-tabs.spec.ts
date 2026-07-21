/**
 * discover-tabs.spec.ts
 *
 * Functional regression suite for the /discover page.
 *
 * Covers:
 *   1. Page load — hero band visible, travelpulse tab active by default
 *   2. Client-side tab switching — URL must NOT change on tab click
 *   3. URL deep-linking via ?tab=<value> — correct tab active on load
 *   4. Browse Services — filter bar inputs and quick-cat chips
 *   5. Add to cart — feedback toast appears on button click
 *   6. Expert handoff banner — conditional on ?source=quick-start&showExperts=true
 *
 * Design constraints:
 *   - No authentication required — all 4 tabs are publicly visible.
 *   - All TabsContent nodes are mounted upfront (no lazy-mount), so inactive
 *     tab content is in the DOM but hidden by CSS; use .toBeVisible() /
 *     .not.toBeVisible() rather than .toBeAttached().
 *   - Tab clicks do NOT write back to the URL (client-side state only).
 *     The "URL did not change" assertions guard against an accidental future
 *     URL-sync addition breaking this contract.
 *   - Selectors use data-testid exclusively (no text matchers) so the tests
 *     survive label-text changes and mobile viewport text truncation.
 *
 * Relevant source files:
 *   client/src/pages/discover.tsx
 *   client/src/components/travelpulse/GlobalCalendar.tsx
 *   client/src/components/travelpulse/CityGrid.tsx
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5000';

// ── helpers ──────────────────────────────────────────────────────────────────

/** Navigate and wait for React hydration to settle. */
async function gotoDiscover(
  page: import('@playwright/test').Page,
  search = '',
) {
  await page.goto(`${BASE_URL}/discover${search}`, {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  });
  // Allow React state + data-fetch effects to settle before asserting.
  await page.waitForTimeout(2_000);
}

// ── 1. Page load ─────────────────────────────────────────────────────────────

test.describe('/discover — page load', () => {
  test('hero band elements and all 4 tab triggers are visible', async ({ page }) => {
    await gotoDiscover(page);

    await expect(page.getByTestId('text-page-title')).toBeVisible();
    await expect(page.getByTestId('input-search')).toBeVisible();

    await expect(page.getByTestId('tab-travelpulse')).toBeVisible();
    await expect(page.getByTestId('tab-packages')).toBeVisible();
    await expect(page.getByTestId('tab-events')).toBeVisible();
    await expect(page.getByTestId('tab-services')).toBeVisible();
  });

  test('default active tab is travelpulse and services filter bar is hidden', async ({ page }) => {
    await gotoDiscover(page);

    // Radix Tabs sets aria-selected="true" on the active trigger.
    await expect(page.getByTestId('tab-travelpulse')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('tab-packages')).toHaveAttribute('aria-selected', 'false');
    await expect(page.getByTestId('tab-events')).toHaveAttribute('aria-selected', 'false');
    await expect(page.getByTestId('tab-services')).toHaveAttribute('aria-selected', 'false');

    // Services filter bar belongs to the services TabsContent — must be hidden.
    await expect(page.getByTestId('services-filter-bar')).not.toBeVisible();
  });
});

// ── 2. Client-side tab switching ─────────────────────────────────────────────

test.describe('/discover — tab switching (client-side, URL must not change)', () => {
  test('packages tab: becomes active and services filter bar stays hidden', async ({ page }) => {
    await gotoDiscover(page);

    await page.getByTestId('tab-packages').click();
    await page.waitForTimeout(500);

    await expect(page.getByTestId('tab-packages')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('tab-travelpulse')).toHaveAttribute('aria-selected', 'false');
    await expect(page.getByTestId('services-filter-bar')).not.toBeVisible();

    // Tab click must NOT mutate the URL.
    await expect(page).toHaveURL(`${BASE_URL}/discover`);
  });

  test('events tab: becomes active, GlobalCalendar is visible, URL unchanged', async ({ page }) => {
    await gotoDiscover(page);

    await page.getByTestId('tab-events').click();
    await page.waitForTimeout(500);

    await expect(page.getByTestId('tab-events')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('global-calendar')).toBeVisible();
    await expect(page.getByTestId('services-filter-bar')).not.toBeVisible();

    await expect(page).toHaveURL(`${BASE_URL}/discover`);
  });

  test('services tab: becomes active, filter bar visible, URL unchanged', async ({ page }) => {
    await gotoDiscover(page);

    await page.getByTestId('tab-services').click();
    await page.waitForTimeout(500);

    await expect(page.getByTestId('tab-services')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('services-filter-bar')).toBeVisible();

    // All filter controls should be visible inside the filter bar.
    await expect(page.getByTestId('input-location')).toBeVisible();
    await expect(page.getByTestId('select-category')).toBeVisible();
    await expect(page.getByTestId('input-min-price')).toBeVisible();
    await expect(page.getByTestId('input-max-price')).toBeVisible();
    await expect(page.getByTestId('select-rating')).toBeVisible();
    await expect(page.getByTestId('select-sort')).toBeVisible();

    await expect(page).toHaveURL(`${BASE_URL}/discover`);
  });

  test('switching back to travelpulse tab re-activates it and hides services bar', async ({ page }) => {
    await gotoDiscover(page);

    // Switch away, then back.
    await page.getByTestId('tab-services').click();
    await page.waitForTimeout(300);
    await page.getByTestId('tab-travelpulse').click();
    await page.waitForTimeout(300);

    await expect(page.getByTestId('tab-travelpulse')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('services-filter-bar')).not.toBeVisible();

    await expect(page).toHaveURL(`${BASE_URL}/discover`);
  });
});

// ── 3. URL deep-linking ───────────────────────────────────────────────────────

test.describe('/discover — URL deep-linking via ?tab=', () => {
  test('?tab=packages activates packages tab on load', async ({ page }) => {
    await gotoDiscover(page, '?tab=packages');

    await expect(page.getByTestId('tab-packages')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('tab-travelpulse')).toHaveAttribute('aria-selected', 'false');
    // Services filter bar must be hidden (we are on packages, not services).
    await expect(page.getByTestId('services-filter-bar')).not.toBeVisible();
  });

  test('?tab=events activates events tab and shows GlobalCalendar on load', async ({ page }) => {
    await gotoDiscover(page, '?tab=events');

    await expect(page.getByTestId('tab-events')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('global-calendar')).toBeVisible();
  });

  test('?tab=services activates services tab and shows filter bar on load', async ({ page }) => {
    await gotoDiscover(page, '?tab=services');

    await expect(page.getByTestId('tab-services')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('services-filter-bar')).toBeVisible();
  });

  test('?tab=invalidvalue falls back to travelpulse tab', async ({ page }) => {
    await gotoDiscover(page, '?tab=invalidvalue');

    await expect(page.getByTestId('tab-travelpulse')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('services-filter-bar')).not.toBeVisible();
  });
});

// ── 4. Browse Services — filter bar and quick-cat chips ──────────────────────

test.describe('/discover — Browse Services tab filters', () => {
  test.beforeEach(async ({ page }) => {
    await gotoDiscover(page, '?tab=services');
    await expect(page.getByTestId('services-filter-bar')).toBeVisible();
  });

  test('filter bar inputs are all present', async ({ page }) => {
    await expect(page.getByTestId('input-location')).toBeVisible();
    await expect(page.getByTestId('select-category')).toBeVisible();
    await expect(page.getByTestId('input-min-price')).toBeVisible();
    await expect(page.getByTestId('input-max-price')).toBeVisible();
    await expect(page.getByTestId('select-rating')).toBeVisible();
    await expect(page.getByTestId('select-sort')).toBeVisible();
  });

  test('button-quick-cat-all chip is always present', async ({ page }) => {
    await expect(page.getByTestId('button-quick-cat-all')).toBeVisible();
  });

  test('clicking button-quick-cat-all keeps page stable', async ({ page }) => {
    await page.getByTestId('button-quick-cat-all').click();
    await page.waitForTimeout(800);

    // Page should still be on services tab and filter bar visible.
    await expect(page.getByTestId('tab-services')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('services-filter-bar')).toBeVisible();
  });

  test('clicking a specific category chip filters results without crashing', async ({ page }) => {
    const catChips = page.locator(
      '[data-testid^="button-quick-cat-"]:not([data-testid="button-quick-cat-all"])',
    );
    const count = await catChips.count();

    if (count === 0) {
      // No category chips seeded — the "All" chip is the only one present.
      // This is valid; just confirm the page is still stable.
      await expect(page.getByTestId('button-quick-cat-all')).toBeVisible();
      return;
    }

    await catChips.first().click();
    await page.waitForTimeout(1_000);

    // After filtering: either service cards appear OR an empty state renders.
    // Both are valid — the test just asserts no crash (filter bar still visible).
    await expect(page.getByTestId('services-filter-bar')).toBeVisible();
    await expect(page.getByTestId('tab-services')).toHaveAttribute('aria-selected', 'true');
  });
});

// ── 5. Add to cart ───────────────────────────────────────────────────────────

test.describe('/discover — add to cart from Browse Services', () => {
  test('clicking add-to-cart shows toast feedback', async ({ page }) => {
    await gotoDiscover(page, '?tab=services');
    // Give time for service data to load.
    await page.waitForTimeout(3_000);

    const serviceCards = page.locator('[data-testid^="card-service-"]');
    const cardCount = await serviceCards.count();

    if (cardCount === 0) {
      test.skip(true, 'No service cards seeded — skipping cart add test');
      return;
    }

    // Derive the service ID from the first visible card's testid.
    const firstCard = serviceCards.first();
    const cardTestId = await firstCard.getAttribute('data-testid') ?? '';
    const serviceId = cardTestId.replace('card-service-', '');

    const addBtn = page.getByTestId(`button-add-to-cart-${serviceId}`);
    await expect(addBtn).toBeVisible();
    await addBtn.click();

    // Unauthenticated → "Saved!" toast (guest cart fallback).
    // Authenticated  → "Added to cart!" toast.
    // Radix Toast.Root renders as `li` with role="status" (polite) for default
    // toasts and role="alert" (assertive) for destructive ones. Cover both.
    const feedbackToast = page
      .locator('[role="status"], [role="alert"]')
      .filter({ hasText: /Added to cart|Saved/i });
    await expect(feedbackToast).toBeVisible({ timeout: 5_000 });
  });
});

// ── 6. Expert handoff banner ─────────────────────────────────────────────────

test.describe('/discover — expert handoff banner', () => {
  test('banner is visible when source=quick-start&showExperts=true', async ({ page }) => {
    await gotoDiscover(page, '?source=quick-start&showExperts=true');

    await expect(page.getByTestId('button-dismiss-handoff-banner')).toBeVisible();
    await expect(page.getByTestId('text-matched-experts-title')).toBeVisible();
  });

  test('banner is absent on plain /discover (no query params)', async ({ page }) => {
    await gotoDiscover(page);

    // The banner is conditionally rendered (React && short-circuit), so when
    // absent it is NOT in the DOM at all — use not.toBeAttached().
    await expect(page.getByTestId('button-dismiss-handoff-banner')).not.toBeAttached();
  });

  test('dismissing the banner removes it from the page', async ({ page }) => {
    await gotoDiscover(page, '?source=quick-start&showExperts=true');

    await expect(page.getByTestId('button-dismiss-handoff-banner')).toBeVisible();
    await page.getByTestId('button-dismiss-handoff-banner').click();
    await page.waitForTimeout(500);

    await expect(page.getByTestId('button-dismiss-handoff-banner')).not.toBeAttached();
  });
});
