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
  test('/destinations: masthead, CityGrid, and two-field search visible; no tab bar/ad', async ({ page }) => {
    await gotoPath(page, '/destinations');

    await expect(page.getByTestId('text-page-title')).toHaveText('Destinations');
    await expect(page.getByTestId('city-grid')).toBeVisible();
    await expect(page.getByTestId('button-filters')).not.toBeAttached();
    await expectNoTabBar(page);
    await expect(page.getByTestId('input-search')).toBeVisible();
    await expect(page.getByTestId('input-location')).toBeVisible();
    await expect(page.getByTestId('cta-how-it-works')).not.toBeAttached();
  });

  test('/events: masthead "Events", GlobalCalendar visible, no tab bar', async ({ page }) => {
    await gotoPath(page, '/events');

    await expect(page.getByTestId('text-page-title')).toHaveText('Events');
    await expect(page.getByTestId('global-calendar')).toBeVisible();
    await expect(page.getByTestId('city-grid')).not.toBeVisible();
    await expectNoTabBar(page);
    await expect(page.getByTestId('input-search')).not.toBeAttached();
    await expect(page.getByTestId('input-location')).not.toBeAttached();
    await expect(page.getByText('Best TimeBest Time to Visit', { exact: true })).not.toBeAttached();
  });

  test('/ready-made: masthead "Ready-Made Trips", shelf content visible, no tab bar', async ({ page }) => {
    await gotoPath(page, '/ready-made');

    await expect(page.getByTestId('text-page-title')).toHaveText('Ready-Made Trips');
    await expect(page.getByTestId('city-grid')).not.toBeVisible();
    await expectNoTabBar(page);
    await expect(page.getByTestId('input-search')).toBeVisible();
    await expect(page.getByTestId('input-location')).toBeVisible();
    await expect(page.locator(
      '[data-testid^="card-template-"], ' +
      '[data-testid^="button-view-template-"], ' +
      '[data-testid="section-templates"], ' +
      '[data-testid="button-view-all-templates"], ' +
      '[data-testid="button-become-expert-packages"]',
    )).toHaveCount(0);
  });

  test('/services: masthead, search, Filters +, and chip rail visible; no legacy filter bar', async ({ page }) => {
    await gotoPath(page, '/services');

    await expect(page.getByTestId('text-page-title')).toHaveText('Services');
    await expect(page.getByTestId('input-search')).toBeVisible();
    await expect(page.getByTestId('input-location')).toBeVisible();
    await expect(page.getByTestId('button-filters')).toBeVisible();
    await expect(page.getByTestId('button-quick-cat-all')).toBeVisible();
    await expect(page.getByTestId('services-filter-bar')).not.toBeAttached();
    await expect(page.getByTestId('select-category')).not.toBeAttached();
    await expect(page.getByText('Active filters:', { exact: true })).not.toBeAttached();
    await expect(page.getByTestId('city-grid')).not.toBeVisible();
    await expectNoTabBar(page);
    await expect(page.getByTestId('cta-how-it-works')).not.toBeAttached();
  });
});

test.describe('Marketplace two-field search — TripStrip destination prefill', () => {
  const SEARCH_SURFACES = ['/destinations', '/ready-made', '/services'] as const;

  for (const path of SEARCH_SURFACES) {
    test(`${path}: where reads its initial value from trip context`, async ({ page }) => {
      await page.addInitScript(() => {
        sessionStorage.setItem('experienceContext', JSON.stringify({ destination: 'Kyoto' }));
      });
      await gotoPath(page, path);

      await expect(page.getByTestId('input-location')).toHaveValue('Kyoto');
      expect(await page.evaluate(() => sessionStorage.getItem('experienceContext')))
        .toBe(JSON.stringify({ destination: 'Kyoto' }));
    });
  }
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
    await expect(page.getByTestId('button-filters')).toBeVisible();
  });

  test('?tab=invalidvalue falls back to /destinations', async ({ page }) => {
    await page.goto(`${BASE_URL}/discover?tab=invalidvalue`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForURL(`${BASE_URL}/destinations`, { timeout: 15_000 });
    await expect(page.getByTestId('city-grid')).toBeVisible();
  });
});

// ── 3. Services page — Filters + popover and category chip rail ─────────────

test.describe('/services — filters', () => {
  test.beforeEach(async ({ page }) => {
    await gotoPath(page, '/services');
    await expect(page.getByTestId('button-filters')).toBeVisible();
    // Wait for service data to settle before filter interactions.
    await page.waitForTimeout(1_500);
  });

  test('Filters + contains price, rating, sort, and Clear but no category select', async ({ page }) => {
    await expect(page.getByTestId('input-location')).toBeVisible();
    await expect(page.getByTestId('select-category')).not.toBeAttached();
    await page.getByTestId('button-filters').click();
    await expect(page.getByTestId('popover-filters')).toBeVisible();
    await expect(page.getByTestId('input-min-price')).toBeVisible();
    await expect(page.getByTestId('input-max-price')).toBeVisible();
    await expect(page.getByTestId('select-rating')).toBeVisible();
    await expect(page.getByTestId('select-sort')).toBeVisible();
    await expect(page.getByTestId('button-clear-filters')).toBeVisible();
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

    // Filters + stays visible — still the services surface, no navigation.
    await expect(page.getByTestId('button-filters')).toBeVisible();

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

    // Invariant: Filters + remains after reset.
    await expect(page.getByTestId('button-filters')).toBeVisible();
  });

  test('Clear stays inside the popover and preserves the existing URL reset contract', async ({ page }) => {
    await gotoPath(page, '/services?location=Kyoto&minPrice=100&maxPrice=400&minRating=4&sortBy=price_low');
    await page.getByTestId('button-filters').click();

    await expect(page.getByTestId('input-min-price')).toHaveValue('100');
    await expect(page.getByTestId('input-max-price')).toHaveValue('400');
    await expect(page.getByTestId('select-rating')).toContainText('4.0+');
    await expect(page.getByTestId('select-sort')).toContainText('Price: Low to High');

    await page.getByTestId('button-clear-filters').click();
    await expect(page.getByTestId('input-location')).toHaveValue('');
    await expect(page.getByTestId('input-min-price')).toHaveValue('');
    await expect(page.getByTestId('input-max-price')).toHaveValue('');
    await expect(page.getByTestId('select-rating')).toContainText('Any rating');
    await expect(page.getByTestId('select-sort')).toContainText('Price: Low to High');

    await expect.poll(async () => {
      return page.evaluate(() => Object.fromEntries(new URLSearchParams(window.location.search)));
    }).toEqual({ sortBy: 'price_low' });
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
    { path: '/services',     title: 'Services',     contentTestId: 'button-filters' },
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

// ── 7. City-feed bento — /discover/location (fixture-mocked, city-feed-bento) ─
//
// Phase 2 of the city-feed bento lane. Fully page.route-mocked (no DB seed):
// a committed LocationViewPayload fixture with exactly two neighbourhoods —
// 'gion' WITH a lead local expert, 'arashiyama' WITHOUT — plus a partner
// external stub, a wanted slot (via offering-types + a deterministic
// composition config), gems, services and a ready-made so spans exercise.
//
// The bento only groups by neighbourhood and assigns visual spans; it must
// never reorder the composed stream. Each bento tile carries data-order (its
// position in the neighbourhood's stream run), data-bento-role (anchor|tile)
// and data-col-span so these invariants are checkable without re-implementing
// the composition engine.
import { readFileSync } from 'fs';

const BENTO_FIX = JSON.parse(
  readFileSync(new URL('./fixtures/discover-location-kyoto.json', import.meta.url), 'utf-8'),
);

async function mockBentoEndpoints(page: import('@playwright/test').Page) {
  const json = (body: unknown) => ({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });

  // Location view payload (the page's primary query).
  await page.route('**/api/discover/location/kyoto**', (route) => route.fulfill(json(BENTO_FIX.locationView)));
  // Admin-configurable composition knobs — pinned so the interleave is deterministic.
  await page.route('**/api/feed-composition-config', (route) => route.fulfill(json(BENTO_FIX.feedConfig)));
  // Wanted-slot vocabulary.
  await page.route('**/api/offering-types/experts', (route) => route.fulfill(json(BENTO_FIX.offeringTypes)));
  // Experts for the market (the lead-expert source).
  await page.route('**/api/experts?location=**', (route) => route.fulfill(json(BENTO_FIX.experts)));
  // Ready-made trips (retag source for the expert_package candidate).
  await page.route('**/api/expert-templates**', (route) => route.fulfill(json(BENTO_FIX.packages)));
  // Engine slate (POST): one platform rec (stays a rec tile) + one expert_package (retags to a ready-made).
  await page.route('**/api/upsell/discover-location', (route) =>
    route.fulfill(json({ candidates: BENTO_FIX.candidates, suppressed: [] })),
  );
  // Demand + attribution + media — inert 200s so nothing hangs or errors.
  await page.route('**/api/services/demand**', (route) => route.fulfill(json({})));
  await page.route('**/api/upsell/impression', (route) => route.fulfill(json({ ok: true })));
  await page.route('**/api/upsell/click', (route) => route.fulfill(json({ ok: true })));
  await page.route('**/api/tracking/impression', (route) => route.fulfill(json({ ok: true })));
  await page.route('**/api/affiliates/track', (route) => route.fulfill(json({ ok: true })));
  await page.route('**/api/services/request', (route) => route.fulfill(json({ ok: true })));
  await page.route('**/api/media/place-photo**', (route) => route.fulfill(json({ url: null })));
}

/** Collect a neighbourhood bento's tiles in DOM (render) order with their span metadata. */
async function bentoTiles(page: import('@playwright/test').Page, slug: string) {
  const loc = page.locator(`[data-testid="bento-section-${slug}"] [data-testid^="bento-tile-"]`);
  const n = await loc.count();
  const tiles: { testid: string; order: number; role: string; colSpan: number }[] = [];
  for (let i = 0; i < n; i++) {
    const el = loc.nth(i);
    tiles.push({
      testid: (await el.getAttribute('data-testid')) ?? '',
      order: Number(await el.getAttribute('data-order')),
      role: (await el.getAttribute('data-bento-role')) ?? '',
      colSpan: Number(await el.getAttribute('data-col-span')),
    });
  }
  return tiles;
}

test.describe('city-feed bento — /discover/location', () => {
  test.beforeEach(async ({ page }) => {
    await mockBentoEndpoints(page);
    await page.goto(`${BASE_URL}/discover/location/kyoto`, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    await expect(page.getByTestId('city-feed')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('bento-section-gion')).toBeVisible();
    await expect(page.getByTestId('bento-section-arashiyama')).toBeVisible();
  });

  test('1. order preserved — non-anchor tiles render in ascending stream order per neighbourhood', async ({ page }) => {
    for (const slug of ['gion', 'arashiyama']) {
      const tiles = await bentoTiles(page, slug);
      expect(tiles.length).toBeGreaterThan(0);
      // Exactly one anchor per section.
      expect(tiles.filter((t) => t.role === 'anchor')).toHaveLength(1);
      // Every non-anchor tile keeps its stream position: strictly increasing data-order.
      const nonAnchorOrders = tiles.filter((t) => t.role === 'tile').map((t) => t.order);
      const sorted = [...nonAnchorOrders].sort((a, b) => a - b);
      expect(nonAnchorOrders).toEqual(sorted);
      // No duplicate orders — membership is 1:1 with the run.
      expect(new Set(tiles.map((t) => t.order)).size).toBe(tiles.length);
    }
  });

  test('2. rec tiles stay keyed on their engine position (feed-card-rec-N unchanged)', async ({ page }) => {
    // The one platform recommendation candidate is engine index 0 → feed-card-rec-0,
    // living in Gion's bento; the bento never renumbers it.
    const rec = page.locator('[data-testid^="feed-card-rec-"]');
    await expect(rec).toHaveCount(1);
    await expect(page.getByTestId('feed-card-rec-0')).toBeVisible();
    await expect(
      page.locator('[data-testid="bento-section-gion"] [data-testid="feed-card-rec-0"]'),
    ).toHaveCount(1);
  });

  test('3. anchor rule — expert anchors the neighbourhood that has one; ready-made anchors the one that does not', async ({ page }) => {
    // Gion HAS a lead local expert → the anchor tile is the dark-gradient ExpertCard.
    const gionAnchor = page.locator('[data-testid="bento-section-gion"] [data-bento-role="anchor"]');
    await expect(gionAnchor.locator('[data-testid^="card-expert-"]')).toHaveCount(1);
    await expect(gionAnchor.locator('[data-expert-variant="anchor"]')).toHaveCount(1);

    // Arashiyama has NO lead expert → the anchor is the top ready-made tile.
    const araAnchor = page.locator('[data-testid="bento-section-arashiyama"] [data-bento-role="anchor"]');
    await expect(araAnchor.locator('[data-testid^="feed-card-package-"]')).toHaveCount(1);
    await expect(araAnchor.locator('[data-testid^="card-expert-"]')).toHaveCount(0);
  });

  test('4. partner tile has no storefront link (only a partner label)', async ({ page }) => {
    const partner = page.getByTestId('external-stub-stub-1');
    await expect(partner).toBeVisible();
    // No /s/ storefront and no /experts/ profile anchor on a partner tile.
    await expect(partner.locator('a[href^="/s/"]')).toHaveCount(0);
    await expect(partner.locator('a[href^="/experts/"]')).toHaveCount(0);
    // It carries the honest inventory-class label instead of a booking link.
    await expect(partner).toContainText('From the web');
  });

  test('5. span rules — no tile stretches past col-span-2; only the expert anchor is row-span-2', async ({ page }) => {
    // Phase 2d: a short last row is honest; what is FORBIDDEN is a stretched
    // tile (any col-span > 2) and a tall anchor that is not the lead expert.
    for (const slug of ['gion', 'arashiyama']) {
      const loc = page.locator(`[data-testid="bento-section-${slug}"] [data-testid^="bento-tile-"]`);
      const n = await loc.count();
      expect(n).toBeGreaterThan(0);
      for (let i = 0; i < n; i++) {
        const el = loc.nth(i);
        const colSpan = Number(await el.getAttribute('data-col-span'));
        const rowSpan = Number(await el.getAttribute('data-row-span'));
        const role = await el.getAttribute('data-bento-role');
        expect(colSpan).toBeLessThanOrEqual(2);
        if (role === 'anchor') expect(colSpan).toBe(2);
        if (rowSpan === 2) expect(role).toBe('anchor');
      }
    }
    // Gion's anchor is the lead EXPERT → row-span-2 (full-section-height lead);
    // Arashiyama's fallback ready-made anchor stays 2×1.
    await expect(
      page.locator('[data-testid="bento-section-gion"] [data-bento-role="anchor"]'),
    ).toHaveAttribute('data-row-span', '2');
    await expect(
      page.locator('[data-testid="bento-section-arashiyama"] [data-bento-role="anchor"]'),
    ).toHaveAttribute('data-row-span', '1');
  });

  test('6. preserved testids + Phase 2c/2d surface — single rendering, chip rail, jump list', async ({ page }) => {
    await expect(page.getByTestId('section-hero')).toBeVisible();
    // Phase 2d: no ← Back and no stats row — the rail/browser cover back, and
    // crowd level + counts live in the band eyebrow and the chips.
    await expect(page.getByTestId('btn-back')).not.toBeAttached();
    await expect(page.getByTestId('stats-row')).not.toBeAttached();
    await expect(page.getByTestId('input-search')).toBeVisible();
    await expect(page.getByTestId('input-location')).toBeVisible();
    await expect(page.getByTestId('city-feed')).toBeVisible();
    // Converged / extracted panels keep their testids.
    await expect(page.getByTestId('feed-card-earn')).toBeVisible();
    await expect(page.getByTestId('section-recruitment-gion')).toBeVisible();
    // Phase 2d: a wanted slot renders inside the neighbourhood it NAMES.
    await expect(
      page.locator('[data-testid="bento-section-gion"] [data-testid="section-recruitment-gion"]'),
    ).toHaveCount(1);
    await expect(page.getByTestId('feed-card-vendor-svc-svc-1')).toBeVisible();
    await expect(page.getByTestId('feed-card-package-tmpl-1')).toBeVisible();
    // Phase 2c: ONE rendering per neighbourhood — the legacy container and its
    // "IN {nb}" list are gone; the neighbourhood's gems are bento tiles now,
    // each carrying the Hidden gem tag.
    await expect(page.getByTestId('neighborhood-container-gion')).not.toBeAttached();
    await expect(
      page.locator('[data-testid="bento-section-gion"] [data-testid="feed-card-gem-g-gion-1"]'),
    ).toHaveCount(1);
    await expect(page.getByTestId('gem-hidden-tag-g-gion-1')).toBeVisible();
    // Phase 2c: the spine chips are the VISIBLE rail (out of the popover), with
    // "All gems" active by default; the neighbourhood chips are gone and the
    // mono jump list stands above the first section.
    await expect(page.getByTestId('spine-filter-bar')).toBeVisible();
    await expect(page.getByTestId('spine-chip-all')).toBeVisible();
    await expect(page.getByTestId('spine-chip-eat')).toBeVisible();
    await expect(page.getByTestId('neighbourhood-chips')).not.toBeAttached();
    await expect(page.getByTestId('neighbourhood-jump-list')).toBeVisible();
    await expect(page.getByTestId('jump-gion')).toBeVisible();
    await expect(page.getByTestId('jump-arashiyama')).toBeVisible();
    // Popover holds only price and sort now.
    await page.getByTestId('button-filters').click();
    await expect(page.getByTestId('popover-filters')).toBeVisible();
    await expect(page.getByTestId('price-option-any')).toBeVisible();
    await expect(page.getByTestId('sort-option-recommended')).toBeVisible();
    await expect(page.getByTestId('popover-filters').locator('[data-testid^="spine-chip-"]')).toHaveCount(0);
    await page.keyboard.press('Escape');
    // Trip complements + request footer still render.
    await expect(page.getByTestId('trip-complements-strip')).toBeVisible();
    await expect(page.getByTestId('section-service-request')).toBeVisible();
  });

  test('7. chip filter — every bento filters to the chip kind and empty neighbourhoods drop out', async ({ page }) => {
    // Fixture differential: gion has exactly ONE eat gem (g-gion-3, restaurant);
    // arashiyama has none. The Eat chip must keep gion (filtered to that one
    // tile) and drop arashiyama entirely.
    await page.getByTestId('spine-chip-eat').click();
    await expect(page.getByTestId('bento-section-gion')).toBeVisible();
    await expect(page.getByTestId('bento-section-arashiyama')).not.toBeAttached();
    const gionTiles = page.locator('[data-testid="bento-section-gion"] [data-testid^="bento-tile-"]');
    await expect(gionTiles).toHaveCount(1);
    await expect(
      page.locator('[data-testid="bento-section-gion"] [data-testid="feed-card-gem-g-gion-3"]'),
    ).toHaveCount(1);
    // Non-matching kinds are filtered OUT of the surviving bento.
    await expect(
      page.locator('[data-testid="bento-section-gion"] [data-testid^="feed-card-vendor-svc-"]'),
    ).toHaveCount(0);
    // Back to All gems: both sections return.
    await page.getByTestId('spine-chip-all').click();
    await expect(page.getByTestId('bento-section-gion')).toBeVisible();
    await expect(page.getByTestId('bento-section-arashiyama')).toBeVisible();
  });
});
