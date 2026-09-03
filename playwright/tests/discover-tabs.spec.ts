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
    const planNowButtons = page.locator('[data-testid^="button-plan-now-"]');
    await expect(planNowButtons.first()).toBeVisible();
    await expect(page.getByTestId('city-grid').locator('svg.lucide-plane')).toHaveCount(0);
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
    await expect(page.locator('[data-testid^="button-plan-now-"]')).toHaveCount(0);
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
  // Case-insensitive: the city-match fix 301s a mis-cased page URL to the canonical
  // casing, so the SPA may request /api/discover/location/Kyoto (title case). A regex
  // route matches either casing, keeping this suite independent of the redirect.
  await page.route(/\/api\/discover\/location\/kyoto/i, (route) => route.fulfill(json(BENTO_FIX.locationView)));
  // Admin-configurable composition knobs — pinned so the interleave is deterministic.
  await page.route('**/api/feed-composition-config', (route) => route.fulfill(json(BENTO_FIX.feedConfig)));
  // Wanted-slot vocabulary.
  await page.route('**/api/offering-types/experts', (route) => route.fulfill(json(BENTO_FIX.offeringTypes)));
  // Experts for the market (the lead-expert source).
  await page.route('**/api/experts?location=**', (route) => route.fulfill(json(BENTO_FIX.experts)));
  // The ready-made tile source (GET /api/expert-templates) and its expert_package candidate
  // RETIRED with that lane — ledger 2026-09-03-expert-templates-consumer-sunset. The city feed
  // has no ready-made source until the surviving `ready_made_trips` lane is wired into it, so
  // this suite's package-tile proofs retire with their subject.
  // Engine slate (POST): an affiliate rec (rank 0) and a platform rec (rank 1), both
  // rendering as rec tiles — in Gion's and Arashiyama's cadence windows respectively.
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
    // Canonical casing so the city-match 301 does not fire mid-suite (kept hermetic).
    await page.goto(`${BASE_URL}/discover/location/Kyoto`, {
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
      // Gion has an eligible local anchor; Arashiyama deliberately has no
      // eligible expert, so it renders anchorless.
      const expectedAnchors = slug === 'gion' ? 1 : 0;
      expect(tiles.filter((t) => t.role === 'anchor')).toHaveLength(expectedAnchors);
      // §3.2 may pull one ready-made to the leading slot in an anchorless
      // section. Every other non-anchor tile keeps its stream position.
      const nonAnchorOrders = tiles
        .filter((t, index) => t.role === 'tile' && !(index === 0 && t.testid.includes('package-')))
        .map((t) => t.order);
      const sorted = [...nonAnchorOrders].sort((a, b) => a - b);
      expect(nonAnchorOrders).toEqual(sorted);
      // No duplicate orders — membership is 1:1 with the run.
      expect(new Set(tiles.map((t) => t.order)).size).toBe(tiles.length);
    }
  });

  // Tests 2, 3, 3a and 3b RETIRED with their subject (ledger
  // 2026-09-03-expert-templates-consumer-sunset). Each proved a packer rule ABOUT the
  // ready-made 2×1 tile — that it survives beside a tall expert anchor, that it leads an
  // anchorless section, and that the one city-wide fill lands in exactly one package-less
  // neighbourhood. Those tiles came from `expert_templates`, which no longer has a feed, a
  // detail page or a purchase path; there is no honest fixture for them until the surviving
  // `ready_made_trips` lane is wired into the city feed. Restore them with that change — the
  // packer code itself (client/src/lib/bento-anchor.ts, feed-composition.ts) is untouched here.

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
    // Gion's anchor is the lead EXPERT → row-span-2 (full-section-height lead).
    // Arashiyama has no anchor at all (the ready-made lead retired with its lane).
    await expect(
      page.locator('[data-testid="bento-section-gion"] [data-bento-role="anchor"]'),
    ).toHaveAttribute('data-row-span', '2');
    await expect(
      page.locator('[data-testid="bento-section-arashiyama"] [data-bento-role="anchor"]'),
    ).toHaveCount(0);
  });

  test('5a. §3 rows use minmax(0, auto) and compact badges/actions remain inside their tiles', async ({ page }) => {
    for (const viewport of [
      { width: 1280, height: 900 },
      { width: 768, height: 900 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);

      for (const slug of ['gion', 'arashiyama']) {
        const grid = page.getByTestId(`bento-grid-${slug}`);
        await expect(grid).toBeVisible();
        if (viewport.width >= 1000) {
          await expect
            .poll(() => grid.evaluate((element) => getComputedStyle(element).gridAutoRows))
            .toMatch(/minmax\(0px,\s*auto\)/);
        }

        const containment = await grid.locator('[data-testid^="bento-tile-"]').evaluateAll((tiles) =>
          tiles.flatMap((tile) => {
            const tileBox = tile.getBoundingClientRect();
            return Array.from(tile.querySelectorAll("button, a, span")).map((content) => {
              const contentBox = content.getBoundingClientRect();
              return {
                tile: tile.getAttribute("data-testid"),
                content: content.textContent?.trim() ?? "",
                contained:
                  contentBox.left >= tileBox.left - 1 &&
                  contentBox.right <= tileBox.right + 1 &&
                  contentBox.top >= tileBox.top - 1 &&
                  contentBox.bottom <= tileBox.bottom + 1,
              };
            });
          }),
        );

        expect(containment).not.toHaveLength(0);
        expect(containment.filter((entry) => !entry.contained)).toEqual([]);

        // The embedded-shell proof (card border 0px inside a 1px tile) was asserted on the
        // ready-made card; it retired with that lane (ledger
        // 2026-09-03-expert-templates-consumer-sunset).
      }
    }
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

  test('8. See-all is a filter — one section, jump-list state, gem chip composes, back restores (2026-08-26-see-all-is-filter)', async ({ page }) => {
    // Click "See all in Gion →": the URL gains ?neighborhood=gion, the feed
    // renders ONLY Gion, and the jump list flips to filter mode.
    await page.getByTestId('bento-see-all-gion').click();
    await expect(page).toHaveURL(/[?&]neighborhood=gion(&|$)/);
    await expect(page.getByTestId('bento-section-gion')).toBeVisible();
    await expect(page.getByTestId('bento-section-arashiyama')).not.toBeAttached();
    // Jump-list state: gion active, an "All neighbourhoods" restore link present.
    await expect(page.getByTestId('jump-all-neighbourhoods')).toBeVisible();
    await expect(page.getByTestId('jump-gion')).toHaveAttribute('data-active', 'true');
    // Gem chip STILL composes within the filtered section: Eat → the one eat gem.
    await page.getByTestId('spine-chip-eat').click();
    await expect(page.getByTestId('bento-section-gion')).toBeVisible();
    await expect(
      page.locator('[data-testid="bento-section-gion"] [data-testid="feed-card-gem-g-gion-3"]'),
    ).toHaveCount(1);
    await page.getByTestId('spine-chip-all').click();
    // Browser back clears the neighbourhood filter → both sections return. The
    // gem-chip clicks are LOCAL state (no history entry), so the ONE See-all
    // navigation is the only history step to unwind.
    await page.goBack();
    await expect(page).not.toHaveURL(/neighborhood=/);
    await expect(page.getByTestId('bento-section-gion')).toBeVisible();
    await expect(page.getByTestId('bento-section-arashiyama')).toBeVisible();
    await expect(page.getByTestId('jump-all-neighbourhoods')).not.toBeAttached();
  });

  test('9. behavior matrix — the fixture-provable rows (Phase 2e Part C)', async ({ page }) => {
    // Jump list item scrolls to the section anchor (href = the section id).
    await expect(page.getByTestId('jump-gion')).toHaveAttribute('href', '#bento-nb-gion');
    // View profile → /experts/:id (the anchor lead expert; button wrapped in a Link).
    await expect(
      page.locator('[data-bento-role="anchor"] a[href="/experts/exp-gion-1"]'),
    ).not.toHaveCount(0);
    // The "Get this trip" route-by-source proof retired with the expert-template lane
    // (ledger 2026-09-03-expert-templates-consumer-sunset): the card now has ONE
    // destination, /ready-made/:id, because `ready_made_trips` is the only source that
    // can reach it. No package tile renders from this fixture any more.
    // Offer this → recruitment deep-link carrying city + neighbourhood + offering.
    const offerHref = await page.getByTestId('link-wanted-apply').first().getAttribute('href');
    expect(offerHref).toContain('/become-expert');
    expect(offerHref).toContain('city=');
    expect(offerHref).toContain('neighborhood=');
    // Earn routes → /earn.
    await expect(page.getByTestId('btn-earn-expert')).toHaveAttribute('href', '/earn');
    await expect(page.getByTestId('btn-earn-provider')).toHaveAttribute('href', '/earn');
    // §4a: every tappable compact tile has exactly one passive Info cue in its
    // photo band. Bodiless panels carry a single mono link instead, never both.
    const tappableCompactTiles = page.locator('[data-bento-role="tile"] > [role="link"]');
    await expect(tappableCompactTiles).not.toHaveCount(0);
    await expect
      .poll(async () =>
        tappableCompactTiles.evaluateAll((tiles) =>
          tiles.every((tile) => {
            const cue = tile.querySelector<HTMLElement>('[data-testid^="info-cue-"]');
            const band = cue?.parentElement;
            if (!cue || !band || tile.querySelectorAll('[data-testid^="info-cue-"]').length !== 1) return false;

            const cueRect = cue.getBoundingClientRect();
            const bandRect = band.getBoundingClientRect();
            return (
              getComputedStyle(cue).pointerEvents === "none" &&
              Math.round(cueRect.width) === 14 &&
              cueRect.top >= bandRect.top &&
              cueRect.right <= bandRect.right + 1
            );
          }),
        ),
      )
      .toBe(true);
    // Compact action rows never gain a third button. (Ready-made/external rows
    // legitimately have one; every other compact card has its state-driven pair.)
    await expect
      .poll(async () =>
        tappableCompactTiles.evaluateAll((tiles) =>
          tiles.every((tile) => tile.querySelectorAll('button').length <= 2),
        ),
      )
      .toBe(true);
    // §4a color note: green is status-only, never a button or link treatment.
    await expect
      .poll(async () =>
        page.locator('[data-testid^="bento-section-"] button, [data-testid^="bento-section-"] a').evaluateAll((controls) =>
          controls.every((control) => {
            const className = typeof control.className === "string" ? control.className : "";
            return !className.includes("green") && !(control.getAttribute("style") ?? "").includes("--earn-green");
          }),
        ),
      )
      .toBe(true);
    const wanted = page.getByTestId('section-recruitment-gion');
    await expect(wanted.getByTestId('link-wanted-more-info-gion')).toHaveAttribute('href', '/how-it-works');
    await expect(wanted.locator('[data-testid^="info-cue-"]')).toHaveCount(0);
    const earn = page.getByTestId('feed-card-earn');
    await expect(earn.getByTestId('link-earn-more-info')).toHaveAttribute('href', '/how-it-works');
    await expect(earn.locator('[data-testid^="info-cue-"]')).toHaveCount(0);
    // View source → NO storefront/profile link on a partner tile; the source control
    // is present (its outbound rel="noopener,noreferrer" lives in the window.open call).
    const stub = page.getByTestId('external-stub-stub-1');
    await expect(stub.locator('a[href^="/s/"]')).toHaveCount(0);
    await expect(stub.locator('a[href^="/experts/"]')).toHaveCount(0);
    await expect(stub.getByTestId('external-stub-source-stub-1')).toBeVisible();
    // Two-field search NEVER writes trip context: the where field is read-only.
    await expect(page.getByTestId('input-location')).toHaveAttribute('readonly', '');
    // Candidates land one per window in ranked order. The recIndex is the
    // candidate's own rank (feed-composition.ts consumes recs strictly
    // recIndex-sequentially), so with the expert_package candidate retired
    // (ledger 2026-09-03-expert-templates-consumer-sunset) the affiliate is
    // rank 0 and the platform recommendation rank 1 — landing in the FIRST TWO
    // cadence windows, Gion and Arashiyama. Nishiki's window has no candidate
    // left to receive, so it holds none.
    const recTiles = page.locator('[data-testid^="feed-card-rec-"]');
    await expect(recTiles).toHaveCount(2);
    await expect(page.getByTestId('feed-card-rec-0')).toBeVisible();
    await expect(page.getByTestId('feed-card-rec-1')).toBeVisible();
    await expect(
      page.locator('[data-testid="bento-section-gion"] [data-testid="feed-card-rec-0"]'),
    ).toHaveCount(1);
    await expect(
      page.locator('[data-testid="bento-section-arashiyama"] [data-testid="feed-card-rec-1"]'),
    ).toHaveCount(1);
    await expect(
      page.locator('[data-testid="bento-section-nishiki"] [data-testid^="feed-card-rec-"]'),
    ).toHaveCount(0);

    // Card-is-link vs button propagation: clicking the card BODY opens the gem's
    // details sheet; clicking a button STOPS propagation, so only that button's
    // own dialog opens — never also the sheet (dialog count stays 1).
    const gem = page.getByTestId('feed-card-gem-g-gion-1');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await gem.locator('h3').click();                 // body → the details sheet
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await gem.getByTestId('btn-add-gem-g-gion-1').click(); // button → ONE dialog only
    await expect(page.getByTestId('dialog-add-to-experience')).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(1);
  });

  test('10. recommendation impression is once-per-mount — a re-render does not re-fire (money-adjacent — Phase 2g)', async ({ page }) => {
    // The rec tile fires POST /api/upsell/impression once per MOUNT (impressionFiredRef,
    // city-feed-card-recommendation.tsx) — the money-adjacent attribution side effect.
    // The stable, build-independent guarantee is that a RE-RENDER never fires another
    // impression (raw mount counts differ dev↔prod: React StrictMode double-invokes mount
    // effects on the dev server, the production bundle fires once). So: snapshot the count
    // once the tile has mounted, force a re-render that does NOT unmount the rec tile
    // (open + close the filters popover — a pure overlay, no feed membership change), and
    // assert the count did not grow.
    let impressions = 0;
    await page.route('**/api/upsell/impression', (route) => {
      impressions++;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    });
    await page.reload();
    await expect(page.getByTestId('city-feed')).toBeVisible({ timeout: 15_000 });
    await expect(
      page.locator('[data-testid="bento-section-arashiyama"] [data-testid="feed-card-rec-1"]'),
    ).toBeVisible();
    // Let the mount-time impression(s) settle, then snapshot.
    await expect.poll(() => impressions, { timeout: 5_000 }).toBeGreaterThanOrEqual(1);
    await page.waitForTimeout(300);
    const afterMount = impressions;
    // Re-render without remounting the rec tile → no additional impression.
    await page.getByTestId('button-filters').click();
    await expect(page.getByTestId('popover-filters')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    expect(impressions).toBe(afterMount);
  });

  test('11. compact book actions use the ratified channel colors', async ({ page }) => {
    // Compare against the page's resolved design tokens instead of hard-coded
    // RGB values, so the proof survives a palette adjustment.
    const usesToken = async (
      control: import('@playwright/test').Locator,
      token: '--earn-teal' | '--earn-gold-ink' | '--earn-navy',
    ) =>
      control.evaluate((element, cssToken) => {
        const probe = document.createElement('span');
        probe.style.backgroundColor = `var(${cssToken})`;
        document.body.appendChild(probe);
        const matches = getComputedStyle(element).backgroundColor === getComputedStyle(probe).backgroundColor;
        probe.remove();
        return matches;
      }, token);

    // Platform service → teal Book now.
    const serviceBook = page.getByTestId('btn-book-svc-svc-1');
    await expect(serviceBook).toHaveText('Book now');
    expect(await usesToken(serviceBook, '--earn-teal')).toBe(true);
    expect(await usesToken(serviceBook, '--earn-navy')).toBe(false);

    // The ready-made "Get this trip" channel-colour assertion retired with its tile
    // (ledger 2026-09-03-expert-templates-consumer-sunset).

    // Affiliate/partner → gold Book on {Partner}. Rank 0 since the
    // expert_package candidate retired (2026-09-03-expert-templates-consumer-sunset).
    const affiliateBook = page.getByTestId('btn-book-rec-0');
    await expect(affiliateBook).toHaveText(/^Book on .+/);
    expect(await usesToken(affiliateBook, '--earn-gold-ink')).toBe(true);
    expect(await usesToken(affiliateBook, '--earn-teal')).toBe(false);
    expect(await usesToken(affiliateBook, '--earn-navy')).toBe(false);
  });

  test('12. platform rec Book now carries the feed city into /services as ?location (Commit B)', async ({ page }) => {
    // handleBookRecommendation (discover-location.tsx) must carry the FEED's city so
    // the services surface opens scoped to where the traveller was browsing, not a
    // bare catalog. It navigates to /services?categoryKey=…&location=<city>&upsellSource=…
    // The click also fires the (now-validating) upsell click beacon, mocked in
    // mockBentoEndpoints so it never 400s the test.
    // The platform_provider candidate is rank 1 post-sunset (see test 9).
    await page.getByTestId('btn-book-rec-1').click();
    await expect.poll(() => page.url(), { timeout: 10_000 }).toContain('/services?');
    const url = new URL(page.url());
    expect(url.searchParams.get('location')).toBe('Kyoto');
    expect(url.searchParams.get('categoryKey')).toBeTruthy();
    expect(url.searchParams.get('upsellSource')).toBe('discover_location');
  });

  test('13. gem byline + Ask targeting — attribution renders only from server-resolved curatedBy (2026-08-29 audit rulings 1+2)', async ({ page }) => {
    // g-gion-1 carries curatedBy (Yuki Tanaka) in the fixture; g-gion-2 does not.
    // Ruling 1: the byline renders ONLY from the resolved attribution — an
    // unattributed gem shows no byline fragment and no curator name anywhere.
    const attributed = page.getByTestId('feed-card-gem-g-gion-1');
    const unattributed = page.getByTestId('feed-card-gem-g-gion-2');

    await expect(attributed.getByTestId('gem-facts-g-gion-1')).toContainText('curated by Yuki');
    await expect(unattributed.getByTestId('gem-facts-g-gion-2')).not.toContainText('curated by');

    // Ruling 2: the attributed gem's Ask CTA names the curator; the
    // unattributed gem keeps the honest generic label (city-resolution fallback).
    await expect(attributed.getByTestId('btn-ask-gem-g-gion-1')).toHaveText('Ask Yuki');
    await expect(unattributed.getByTestId('btn-ask-gem-g-gion-2')).toHaveText('Ask an expert');

    // The details sheet carries the full byline for the attributed gem only.
    await attributed.locator('h3').click();
    await expect(page.getByTestId('gem-curated-by-g-gion-1')).toHaveText('Curated by Yuki Tanaka');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await unattributed.locator('h3').click();
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await expect(page.getByTestId('gem-curated-by-g-gion-2')).toHaveCount(0);
    await page.keyboard.press('Escape');
  });

  test('14. thin gem detail — the ruled teaser set only; deep fields never render even when present in the payload (2026-08-29 audit ruling 3)', async ({ page }) => {
    // g-gion-2 deliberately carries every removed family in the fixture
    // (address, tourist/local mentions + localRating, daysUntilMainstream,
    // discoveryStatus) — simulating a stale or hand-built payload. The server
    // projection (shared/gem-teaser.ts, pinned by gem-teaser.test.ts) strips
    // them; this proves the CLIENT never resurrects them either.
    await page.getByTestId('feed-card-gem-g-gion-2').locator('h3').click();
    const sheet = page.getByRole('dialog');
    await expect(sheet).toHaveCount(1);

    // Teaser content renders.
    await expect(sheet).toContainText('A tiny stone bridge over the Shirakawa canal.');
    await expect(sheet).toContainText('A quiet canal-side frame locals adore.');

    // The four removed families do not.
    await expect(page.getByTestId('link-gem-address')).toHaveCount(0);
    await expect(sheet).not.toContainText('SHOULD-NEVER-RENDER');
    await expect(sheet).not.toContainText(/Locals \d+%/);
    await expect(sheet).not.toContainText(/Tourists \d+%/);
    await expect(sheet).not.toContainText('Goes mainstream');
    await page.keyboard.press('Escape');
  });
});
