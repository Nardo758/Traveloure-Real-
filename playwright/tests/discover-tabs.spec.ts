/**
 * discover-tabs.spec.ts — now the MARKETPLACE SURFACES suite.
 *
 * Marketplace un-group (decision-maker ratified Aug 23, ledger
 * 2026-08-23-marketplace-ungroup): the tabbed /discover shell is retired as a
 * user-facing surface. Each Marketplace surface is its OWN page with its own
 * single masthead and NO tab bar; the nav "Marketplace" dropdown deep-links
 * straight to them:
 *
 *   /destinations  → surface "travelpulse"  (CityGrid)
 *   /ready-made    → surface "packages"     (Ready-Made shelf)
 *   /events        → surface "events"       (GlobalCalendar)
 *   /services      → surface "services"     (filter bar + service cards)
 *
 * /discover survives ONLY as a smart redirect: ?tab= maps onto the surface
 * route and every other query param is forwarded (deep links carried real
 * state — q/city/categoryKey/expert-handoff params).
 *
 * File name kept so discover-tabs-gate.yml (job: discover-tabs-smoke) keeps
 * running this suite unchanged.
 *
 * Design constraints:
 *   - No authentication required — all four surfaces are publicly visible.
 *   - A surface page renders NO TabsList: tab triggers are NOT in the DOM
 *     (.not.toBeAttached()), the strongest possible "no grouped header" proof.
 *   - Radix mounts inactive TabsContent hidden, so "other surface content"
 *     is asserted .not.toBeVisible() rather than .not.toBeAttached().
 *   - Selectors use data-testid exclusively (no text matchers), except the
 *     masthead title assertions, which ARE the vocabulary contract.
 *
 * Relevant source files:
 *   client/src/pages/discover.tsx                     (surface prop + SURFACE_META)
 *   client/src/App.tsx                                (DiscoverRedirect + surface routes)
 *   client/src/components/travelpulse/CityGrid.tsx    (data-testid="city-grid")
 *   client/src/components/travelpulse/GlobalCalendar.tsx (data-testid="global-calendar")
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5000';

// ── helpers ──────────────────────────────────────────────────────────────────

/** Navigate and wait for React hydration to settle. */
async function gotoPath(page: import('@playwright/test').Page, path: string) {
  await page.goto(`${BASE_URL}${path}`, {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  });
  await page.waitForTimeout(2_000);
}

/** The four tab-trigger testids of the retired grouped header — none may exist. */
const RETIRED_TAB_TESTIDS = ['tab-travelpulse', 'tab-packages', 'tab-events', 'tab-services'];

async function expectNoTabBar(page: import('@playwright/test').Page) {
  for (const testId of RETIRED_TAB_TESTIDS) {
    await expect(page.getByTestId(testId)).not.toBeAttached();
  }
}

// ── 1. Surface pages — own masthead, own content, NO tab bar ─────────────────

test.describe('Marketplace surfaces — each page renders alone, no grouped header', () => {
  test('/destinations: masthead "Destinations", CityGrid visible, no tab bar', async ({ page }) => {
    await gotoPath(page, '/destinations');

    await expect(page.getByTestId('text-page-title')).toHaveText('Destinations');
    await expect(page.getByTestId('input-search')).toBeVisible();
    await expect(page.getByTestId('city-grid')).toBeVisible();
    await expect(page.getByTestId('services-filter-bar')).not.toBeVisible();
    await expectNoTabBar(page);
  });

  test('/events: masthead "Events", GlobalCalendar visible, no tab bar', async ({ page }) => {
    await gotoPath(page, '/events');

    await expect(page.getByTestId('text-page-title')).toHaveText('Events');
    await expect(page.getByTestId('global-calendar')).toBeVisible();
    await expect(page.getByTestId('city-grid')).not.toBeVisible();
    await expectNoTabBar(page);
  });

  test('/ready-made: masthead "Ready-Made Trips", shelf content visible, no tab bar', async ({ page }) => {
    await gotoPath(page, '/ready-made');

    await expect(page.getByTestId('text-page-title')).toHaveText('Ready-Made Trips');
    await expect(page.getByTestId('city-grid')).not.toBeVisible();
    await expectNoTabBar(page);

    // Shelf content: template cards if seeded, otherwise the empty state.
    const templateCards = page.locator('[data-testid^="card-template-"]');
    if ((await templateCards.count()) > 0) {
      await expect(templateCards.first()).toBeVisible();
    } else {
      await expect(page.getByTestId('button-become-expert-packages')).toBeVisible();
    }
  });

  test('/services: masthead "Services", filter bar visible, no tab bar', async ({ page }) => {
    await gotoPath(page, '/services');

    await expect(page.getByTestId('text-page-title')).toHaveText('Services');
    await expect(page.getByTestId('services-filter-bar')).toBeVisible();
    await expect(page.getByTestId('city-grid')).not.toBeVisible();
    await expectNoTabBar(page);
  });
});

// ── 2. /discover — smart redirect (the old ?tab= URL contract keeps meaning) ─

test.describe('/discover — redirects onto the surface routes', () => {
  test('plain /discover lands on /destinations (the old default tab)', async ({ page }) => {
    await page.goto(`${BASE_URL}/discover`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForURL(`${BASE_URL}/destinations`, { timeout: 15_000 });
    await expect(page.getByTestId('text-page-title')).toHaveText('Destinations');
  });

  test('?tab=events lands on /events', async ({ page }) => {
    await page.goto(`${BASE_URL}/discover?tab=events`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForURL(`${BASE_URL}/events`, { timeout: 15_000 });
    await expect(page.getByTestId('global-calendar')).toBeVisible();
  });

  test('?tab=packages lands on /ready-made', async ({ page }) => {
    await page.goto(`${BASE_URL}/discover?tab=packages`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForURL(`${BASE_URL}/ready-made`, { timeout: 15_000 });
    await expect(page.getByTestId('text-page-title')).toHaveText('Ready-Made Trips');
  });

  test('?tab=services + extra params lands on /services with params forwarded', async ({ page }) => {
    await page.goto(`${BASE_URL}/discover?tab=services&q=tea`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForURL(`${BASE_URL}/services?q=tea`, { timeout: 15_000 });
    await expect(page.getByTestId('services-filter-bar')).toBeVisible();
  });

  test('?tab=invalidvalue falls back to /destinations', async ({ page }) => {
    await page.goto(`${BASE_URL}/discover?tab=invalidvalue`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForURL(`${BASE_URL}/destinations`, { timeout: 15_000 });
    await expect(page.getByTestId('city-grid')).toBeVisible();
  });
});

// ── 3. Services page — filter bar and quick-cat chips ────────────────────────

test.describe('/services — filters', () => {
  test.beforeEach(async ({ page }) => {
    await gotoPath(page, '/services');
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

    // Filter bar stays visible — still the services surface, no navigation.
    await expect(page.getByTestId('services-filter-bar')).toBeVisible();

    // After category filter: either matching service cards appear OR empty state renders.
    const serviceCards = page.locator('[data-testid^="card-service-"]');
    if ((await serviceCards.count()) > 0) {
      await expect(serviceCards.first()).toBeVisible();
    } else {
      await expect(page.getByTestId('services-no-results')).toBeVisible();
    }
  });

  test('clicking button-quick-cat-all resets to the full result set', async ({ page }) => {
    const catChips = page.locator(
      '[data-testid^="button-quick-cat-"]:not([data-testid="button-quick-cat-all"])',
    );
    if ((await catChips.count()) > 0) {
      await catChips.first().click();
      await page.waitForTimeout(800);
      const filteredCardCount = await page.locator('[data-testid^="card-service-"]').count();

      await page.getByTestId('button-quick-cat-all').click();
      await page.waitForTimeout(800);

      const resetCards = page.locator('[data-testid^="card-service-"]');
      const resetCardCount = await resetCards.count();
      if (resetCardCount > 0) {
        await expect(resetCards.first()).toBeVisible();
        expect(resetCardCount).toBeGreaterThanOrEqual(filteredCardCount);
      } else {
        await expect(page.getByTestId('services-no-results')).toBeVisible();
      }
    } else {
      await page.getByTestId('button-quick-cat-all').click();
      await page.waitForTimeout(800);
      const serviceCards = page.locator('[data-testid^="card-service-"]');
      if ((await serviceCards.count()) > 0) {
        await expect(serviceCards.first()).toBeVisible();
      } else {
        await expect(page.getByTestId('services-no-results')).toBeVisible();
      }
    }

    // Invariant: filter bar remains after reset.
    await expect(page.getByTestId('services-filter-bar')).toBeVisible();
  });
});

// ── 4. Add to cart ───────────────────────────────────────────────────────────

test.describe('/services — add to cart', () => {
  test('clicking add-to-cart shows toast feedback', async ({ page }) => {
    await gotoPath(page, '/services');
    // Give time for service data to load.
    await page.waitForTimeout(3_000);

    const serviceCards = page.locator('[data-testid^="card-service-"]');
    if ((await serviceCards.count()) === 0) {
      test.skip(true, 'No service cards seeded — skipping cart add test');
      return;
    }

    const cardTestId = (await serviceCards.first().getAttribute('data-testid')) ?? '';
    const serviceId = cardTestId.replace('card-service-', '');

    const addBtn = page.getByTestId(`button-add-to-cart-${serviceId}`);
    await expect(addBtn).toBeVisible();
    await addBtn.click();

    // Toast renders with data-testid="toast-{id}" (set in toaster.tsx).
    await expect(page.locator('[data-testid^="toast-"]').first()).toBeVisible({ timeout: 5_000 });
  });
});

// ── 5. Expert handoff banner (quick-start → /services carries the params) ────

test.describe('/services — expert handoff banner', () => {
  test('banner is visible when source=quick-start&showExperts=true', async ({ page }) => {
    await gotoPath(page, '/services?source=quick-start&showExperts=true');

    await expect(page.getByTestId('button-dismiss-handoff-banner')).toBeVisible();
    await expect(page.getByTestId('text-matched-experts-title')).toBeVisible();
  });

  test('banner is absent on a plain surface page (no query params)', async ({ page }) => {
    await gotoPath(page, '/destinations');

    // Conditionally rendered (React && short-circuit) — absent means NOT in the DOM.
    await expect(page.getByTestId('button-dismiss-handoff-banner')).not.toBeAttached();
  });

  test('dismissing the banner removes it from the page', async ({ page }) => {
    await gotoPath(page, '/services?source=quick-start&showExperts=true');

    await expect(page.getByTestId('button-dismiss-handoff-banner')).toBeVisible();
    await page.getByTestId('button-dismiss-handoff-banner').click();
    await page.waitForTimeout(500);

    await expect(page.getByTestId('button-dismiss-handoff-banner')).not.toBeAttached();
  });
});

// ── 6. Mobile viewport — surfaces stay legible with no tab bar ───────────────

test.describe('Marketplace surfaces — mobile viewport (375 px)', () => {
  const SURFACES = [
    { path: '/destinations', title: 'Destinations', contentTestId: 'city-grid' },
    { path: '/events',       title: 'Events',       contentTestId: 'global-calendar' },
    { path: '/services',     title: 'Services',     contentTestId: 'services-filter-bar' },
  ] as const;

  for (const surface of SURFACES) {
    test(`${surface.path} at 375px: masthead + content visible, no tab bar`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await gotoPath(page, surface.path);

      await expect(page.getByTestId('text-page-title')).toHaveText(surface.title);
      await expect(page.getByTestId(surface.contentTestId)).toBeVisible();
      await expectNoTabBar(page);
    });
  }
});
