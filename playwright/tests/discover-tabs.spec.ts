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
 *   client/src/components/travelpulse/CityGrid.tsx   (data-testid="city-grid")
 *   client/src/components/ui/toaster.tsx             (data-testid="toast-${id}")
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

  test('default active tab is travelpulse, CityGrid is visible, services filter bar is hidden', async ({ page }) => {
    await gotoDiscover(page);

    // Radix Tabs sets aria-selected="true" on the active trigger.
    await expect(page.getByTestId('tab-travelpulse')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('tab-packages')).toHaveAttribute('aria-selected', 'false');
    await expect(page.getByTestId('tab-events')).toHaveAttribute('aria-selected', 'false');
    await expect(page.getByTestId('tab-services')).toHaveAttribute('aria-selected', 'false');

    // CityGrid surface must be visible on the default tab.
    await expect(page.getByTestId('city-grid')).toBeVisible();

    // Services filter bar belongs to the services TabsContent — must be hidden.
    await expect(page.getByTestId('services-filter-bar')).not.toBeVisible();
  });
});

// ── 2. Client-side tab switching ─────────────────────────────────────────────

test.describe('/discover — tab switching (client-side, URL must not change)', () => {
  test('packages tab: becomes active, CityGrid hidden, packages content visible, URL unchanged', async ({ page }) => {
    await gotoDiscover(page);

    await page.getByTestId('tab-packages').click();
    await page.waitForTimeout(500);

    await expect(page.getByTestId('tab-packages')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('tab-travelpulse')).toHaveAttribute('aria-selected', 'false');

    // CityGrid is in travelpulse tab — must no longer be visible.
    await expect(page.getByTestId('city-grid')).not.toBeVisible();

    // Services filter bar stays hidden (we are on packages, not services).
    await expect(page.getByTestId('services-filter-bar')).not.toBeVisible();

    // Packages content: either template cards (seeded) or the empty state (unauthenticated).
    const templateCards = page.locator('[data-testid^="card-template-"]');
    const cardCount = await templateCards.count();
    if (cardCount > 0) {
      await expect(templateCards.first()).toBeVisible();
    } else {
      // No templates seeded — unauthenticated users see "Become an expert" empty state.
      await expect(page.getByTestId('button-become-expert')).toBeVisible();
    }

    // Tab click must NOT mutate the URL.
    await expect(page).toHaveURL(`${BASE_URL}/discover`);
  });

  test('events tab: becomes active, GlobalCalendar is visible, CityGrid hidden, URL unchanged', async ({ page }) => {
    await gotoDiscover(page);

    await page.getByTestId('tab-events').click();
    await page.waitForTimeout(500);

    await expect(page.getByTestId('tab-events')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('global-calendar')).toBeVisible();
    await expect(page.getByTestId('city-grid')).not.toBeVisible();
    await expect(page.getByTestId('services-filter-bar')).not.toBeVisible();

    await expect(page).toHaveURL(`${BASE_URL}/discover`);
  });

  test('services tab: becomes active, filter bar visible, CityGrid hidden, service list rendered, URL unchanged', async ({ page }) => {
    await gotoDiscover(page);

    await page.getByTestId('tab-services').click();
    // Allow service data to load before asserting card presence.
    await page.waitForTimeout(2_000);

    await expect(page.getByTestId('tab-services')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('services-filter-bar')).toBeVisible();
    await expect(page.getByTestId('city-grid')).not.toBeVisible();

    // All filter controls should be visible inside the filter bar.
    await expect(page.getByTestId('input-location')).toBeVisible();
    await expect(page.getByTestId('select-category')).toBeVisible();
    await expect(page.getByTestId('input-min-price')).toBeVisible();
    await expect(page.getByTestId('input-max-price')).toBeVisible();
    await expect(page.getByTestId('select-rating')).toBeVisible();
    await expect(page.getByTestId('select-sort')).toBeVisible();

    // Services list rendered: either seeded cards OR the empty state.
    const serviceCards = page.locator('[data-testid^="card-service-"]');
    const cardCount = await serviceCards.count();
    if (cardCount > 0) {
      await expect(serviceCards.first()).toBeVisible();
    } else {
      await expect(page.getByTestId('services-no-results')).toBeVisible();
    }

    await expect(page).toHaveURL(`${BASE_URL}/discover`);
  });

  test('switching back to travelpulse tab re-activates it, CityGrid visible, hides services bar', async ({ page }) => {
    await gotoDiscover(page);

    // Switch away, then back.
    await page.getByTestId('tab-services').click();
    await page.waitForTimeout(300);
    await page.getByTestId('tab-travelpulse').click();
    await page.waitForTimeout(300);

    await expect(page.getByTestId('tab-travelpulse')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('city-grid')).toBeVisible();
    await expect(page.getByTestId('services-filter-bar')).not.toBeVisible();

    await expect(page).toHaveURL(`${BASE_URL}/discover`);
  });
});

// ── 3. URL deep-linking ───────────────────────────────────────────────────────

test.describe('/discover — URL deep-linking via ?tab=', () => {
  test('?tab=packages activates packages tab, CityGrid hidden, packages content visible', async ({ page }) => {
    await gotoDiscover(page, '?tab=packages');

    await expect(page.getByTestId('tab-packages')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('tab-travelpulse')).toHaveAttribute('aria-selected', 'false');

    // CityGrid (travelpulse) must not be visible.
    await expect(page.getByTestId('city-grid')).not.toBeVisible();

    // Services filter bar must be hidden.
    await expect(page.getByTestId('services-filter-bar')).not.toBeVisible();

    // Packages content: template cards if seeded, otherwise the empty state.
    const templateCards = page.locator('[data-testid^="card-template-"]');
    const cardCount = await templateCards.count();
    if (cardCount > 0) {
      await expect(templateCards.first()).toBeVisible();
    } else {
      await expect(page.getByTestId('button-become-expert')).toBeVisible();
    }
  });

  test('?tab=events activates events tab and shows GlobalCalendar on load', async ({ page }) => {
    await gotoDiscover(page, '?tab=events');

    await expect(page.getByTestId('tab-events')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('global-calendar')).toBeVisible();
    await expect(page.getByTestId('city-grid')).not.toBeVisible();
  });

  test('?tab=services activates services tab and shows filter bar on load', async ({ page }) => {
    await gotoDiscover(page, '?tab=services');

    await expect(page.getByTestId('tab-services')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('services-filter-bar')).toBeVisible();
    await expect(page.getByTestId('city-grid')).not.toBeVisible();
  });

  test('?tab=invalidvalue falls back to travelpulse tab and CityGrid is visible', async ({ page }) => {
    await gotoDiscover(page, '?tab=invalidvalue');

    await expect(page.getByTestId('tab-travelpulse')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('city-grid')).toBeVisible();
    await expect(page.getByTestId('services-filter-bar')).not.toBeVisible();
  });
});

// ── 4. Browse Services — filter bar and quick-cat chips ──────────────────────

test.describe('/discover — Browse Services tab filters', () => {
  test.beforeEach(async ({ page }) => {
    await gotoDiscover(page, '?tab=services');
    await expect(page.getByTestId('services-filter-bar')).toBeVisible();
    // Wait for service data to settle before filter interactions.
    await page.waitForTimeout(1_500);
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

  test('clicking button-quick-cat-all resets to full results after a category filter', async ({ page }) => {
    // Establish a filtered state first: apply a specific category chip if one exists.
    const catChips = page.locator(
      '[data-testid^="button-quick-cat-"]:not([data-testid="button-quick-cat-all"])',
    );
    const chipCount = await catChips.count();

    if (chipCount > 0) {
      // Apply the first non-"All" chip to filter the list.
      await catChips.first().click();
      await page.waitForTimeout(800);
      // Filtered state: service cards or empty state visible.
      const filteredCards = page.locator('[data-testid^="card-service-"]');
      const filteredCardCount = await filteredCards.count();
      const filteredState = filteredCardCount > 0 ? 'cards' : 'empty';

      // Now click "All" to reset.
      await page.getByTestId('button-quick-cat-all').click();
      await page.waitForTimeout(800);

      if (filteredState === 'empty') {
        // "All" should produce at least as many results as the filtered empty state.
        // Either cards appear now (list restored) or empty state still shows (no data seeded).
        const resetCards = page.locator('[data-testid^="card-service-"]');
        const resetCardCount = await resetCards.count();
        if (resetCardCount > 0) {
          await expect(resetCards.first()).toBeVisible();
        } else {
          await expect(page.getByTestId('services-no-results')).toBeVisible();
        }
      } else {
        // We had cards before; "All" must still show cards (broader set, >= filtered count).
        const resetCards = page.locator('[data-testid^="card-service-"]');
        await expect(resetCards.first()).toBeVisible();
        const resetCardCount = await resetCards.count();
        expect(resetCardCount).toBeGreaterThanOrEqual(filteredCardCount);
      }
    } else {
      // No category chips — click "All" and confirm the list state is stable.
      await page.getByTestId('button-quick-cat-all').click();
      await page.waitForTimeout(800);
      const serviceCards = page.locator('[data-testid^="card-service-"]');
      const cardCount = await serviceCards.count();
      if (cardCount > 0) {
        await expect(serviceCards.first()).toBeVisible();
      } else {
        await expect(page.getByTestId('services-no-results')).toBeVisible();
      }
    }

    // Invariant: filter bar and tab remain stable after reset.
    await expect(page.getByTestId('tab-services')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('services-filter-bar')).toBeVisible();
  });

  test('clicking a specific category chip shows filtered results or empty state', async ({ page }) => {
    const catChips = page.locator(
      '[data-testid^="button-quick-cat-"]:not([data-testid="button-quick-cat-all"])',
    );
    const count = await catChips.count();

    if (count === 0) {
      // No category chips seeded — confirm "All" chip still present and page stable.
      await expect(page.getByTestId('button-quick-cat-all')).toBeVisible();
      return;
    }

    await catChips.first().click();
    await page.waitForTimeout(1_000);

    // Filter bar stays visible — we are still on the services tab.
    await expect(page.getByTestId('services-filter-bar')).toBeVisible();
    await expect(page.getByTestId('tab-services')).toHaveAttribute('aria-selected', 'true');

    // After category filter: either matching service cards appear OR empty state renders.
    // Both are valid outcomes — assert exactly one of them is visible.
    const serviceCards = page.locator('[data-testid^="card-service-"]');
    const cardCount = await serviceCards.count();
    if (cardCount > 0) {
      await expect(serviceCards.first()).toBeVisible();
    } else {
      await expect(page.getByTestId('services-no-results')).toBeVisible();
    }
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

    // Toast renders with data-testid="toast-{id}" (set in toaster.tsx).
    // Any toast appearing within the viewport confirms the feedback was shown.
    await expect(page.locator('[data-testid^="toast-"]').first()).toBeVisible({ timeout: 5_000 });
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
