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
      // eligible expert and starts with its ready-made 2×1 tile.
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

  test('2. packer keeps a ready-made 2×1 beside a lead expert — the Gion layout (Phase 2f)', async ({ page }) => {
    // Gion carries BOTH a lead local expert (its anchor) AND a ready-made
    // (tmpl-2, @yuki-flowers). The expert anchors the section (col-span-2,
    // row-span-2); the ready-made stays a col-span-2 tile (row-span-1) — the
    // packer never DEMOTES a ready-made to 1×1, even when it is not the anchor.
    // Until Phase 2f the package span was only ever exercised as Arashiyama's
    // fallback anchor; this proves the beside-a-lead-expert path.
    const gionAnchor = page.locator('[data-testid="bento-section-gion"] [data-bento-role="anchor"]');
    await expect(gionAnchor.locator('[data-testid^="card-expert-"]')).toHaveCount(1);
    await expect(gionAnchor).toHaveAttribute('data-col-span', '2');
    await expect(gionAnchor).toHaveAttribute('data-row-span', '2');

    // The Gion ready-made tile: a NON-anchor col-span-2, row-span-1 package.
    const pkgTile = page.locator(
      '[data-testid="bento-section-gion"] [data-testid^="bento-tile-"]:has([data-testid="feed-card-package-tmpl-2"])',
    );
    await expect(pkgTile).toHaveCount(1);
    await expect(pkgTile).toHaveAttribute('data-bento-role', 'tile');
    await expect(pkgTile).toHaveAttribute('data-col-span', '2');
    await expect(pkgTile).toHaveAttribute('data-row-span', '1');
  });

  test('3. anchor rule — expert anchors its section; no eligible expert leaves the ready-made as a leading tile', async ({ page }) => {
    // Gion HAS a lead local expert → the anchor tile is the dark-gradient ExpertCard.
    const gionAnchor = page.locator('[data-testid="bento-section-gion"] [data-bento-role="anchor"]');
    await expect(gionAnchor.locator('[data-testid^="card-expert-"]')).toHaveCount(1);
    await expect(gionAnchor.locator('[data-expert-variant="anchor"]')).toHaveCount(1);

    // Arashiyama has NO eligible expert → there is no anchor; the appended
    // city-wide ready-made is pulled to the leading 2×1 slot as a normal tile.
    const ara = page.getByTestId('bento-section-arashiyama');
    await expect(ara.locator('[data-bento-role="anchor"]')).toHaveCount(0);
    const araLead = ara.locator('[data-testid^="bento-tile-"]:has([data-testid="feed-card-package-tmpl-1"])');
    await expect(araLead).toHaveAttribute('data-bento-role', 'tile');
    await expect(araLead).toHaveAttribute('data-col-span', '2');
    await expect(araLead).toHaveAttribute('data-row-span', '1');
  });

  test('3a. §2 case (d) — event planner only is never an anchor; ready-made leads 2×1', async ({ page }) => {
    // This is the explicit §10 fixture case (d): the only expert is an event
    // planner, so it must render as a normal expert tile. The existing Gion
    // ready-made becomes the leading 2×1 tile with zero bento anchors.
    await page.route('**/api/experts?location=**', (route) =>
      route.fulfill({ json: [{
        id: 'exp-event-only',
        role: 'event_planner',
        firstName: 'Rhea',
        lastName: 'Desai',
        bio: 'Event planner for Kyoto celebrations.',
        specialties: ['Events'],
        packagesCount: 0,
        averageRating: 4.8,
        reviewCount: 8,
        selectedServices: [],
      }] }),
    );
    await page.reload();
    await expect(page.getByTestId('city-feed')).toBeVisible({ timeout: 15_000 });
    const gion = page.getByTestId('bento-section-gion');
    await expect(gion.locator('[data-bento-role="anchor"]')).toHaveCount(0);
    const readyMadeLead = gion.locator(
      '[data-testid^="bento-tile-"]:has([data-testid="feed-card-package-tmpl-2"])',
    );
    await expect(readyMadeLead).toHaveAttribute('data-bento-role', 'tile');
    await expect(readyMadeLead).toHaveAttribute('data-col-span', '2');
    await expect(readyMadeLead).toHaveAttribute('data-row-span', '1');
    await expect(
      gion.locator('[data-testid^="bento-tile-"]:has([data-testid="feed-card-expert-exp-event-only"])'),
    ).toHaveAttribute('data-bento-role', 'tile');
  });

  test('3b. one city-wide ready-made fills only the first package-less neighbourhood as a 2×1 tile', async ({ page }) => {
    const ara = page.locator('[data-testid="bento-section-arashiyama"]');
    await expect(ara.getByTestId('feed-card-package-tmpl-1')).toHaveCount(1);
    await expect(ara.getByTestId('package-city-wide-tmpl-1')).toHaveText('Kyoto-wide');
    await expect(ara.locator('[data-testid^="bento-tile-"]:has([data-testid="feed-card-package-tmpl-1"])'))
      .toHaveAttribute('data-col-span', '2');
    await expect(ara.locator('[data-testid^="bento-tile-"]:has([data-testid="feed-card-package-tmpl-1"])'))
      .toHaveAttribute('data-row-span', '1');
    // This is a single-fill rule, not a per-section fill: the sole city-wide
    // listing lands in the first package-less section and is never duplicated.
    await expect(page.locator('[data-testid="feed-card-package-tmpl-1"]')).toHaveCount(1);
    await expect(page.locator('[data-testid="bento-section-gion"] [data-testid="package-city-wide-tmpl-1"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="bento-section-nishiki"] [data-testid="package-city-wide-tmpl-1"]')).toHaveCount(0);
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
    // Arashiyama has no anchor; its leading ready-made stays 2×1.
    await expect(
      page.locator('[data-testid="bento-section-gion"] [data-bento-role="anchor"]'),
    ).toHaveAttribute('data-row-span', '2');
    await expect(
      page.locator('[data-testid="bento-section-arashiyama"] [data-testid^="bento-tile-"]:has([data-testid="feed-card-package-tmpl-1"])'),
    ).toHaveAttribute('data-row-span', '1');
  });

  test('5a. §3 rows use minmax(0, auto) and compact actions remain inside their tiles', async ({ page }) => {
    for (const viewport of [
      { width: 1280, height: 900 },
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
            return Array.from(tile.querySelectorAll("button, a")).map((action) => {
              const actionBox = action.getBoundingClientRect();
              return {
                tile: tile.getAttribute("data-testid"),
                action: action.textContent?.trim() ?? "",
                contained:
                  actionBox.left >= tileBox.left - 1 &&
                  actionBox.right <= tileBox.right + 1 &&
                  actionBox.top >= tileBox.top - 1 &&
                  actionBox.bottom <= tileBox.bottom + 1,
              };
            });
          }),
        );

        expect(containment).not.toHaveLength(0);
        expect(containment.filter((entry) => !entry.contained)).toEqual([]);
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
    // Get this trip → /ready-made/:id (href SHAPE; id-resolution is a real-data row).
    await expect(page.getByTestId('btn-view-package-tmpl-1')).toHaveAttribute('href', '/ready-made/tmpl-1');
    // Offer this → recruitment deep-link carrying city + neighbourhood + offering.
    const offerHref = await page.getByTestId('link-wanted-apply').first().getAttribute('href');
    expect(offerHref).toContain('/become-expert');
    expect(offerHref).toContain('city=');
    expect(offerHref).toContain('neighborhood=');
    // Earn routes → /earn.
    await expect(page.getByTestId('btn-earn-expert')).toHaveAttribute('href', '/earn');
    await expect(page.getByTestId('btn-earn-provider')).toHaveAttribute('href', '/earn');
    // View source → NO storefront/profile link on a partner tile; the source control
    // is present (its outbound rel="noopener,noreferrer" lives in the window.open call).
    const stub = page.getByTestId('external-stub-stub-1');
    await expect(stub.locator('a[href^="/s/"]')).toHaveCount(0);
    await expect(stub.locator('a[href^="/experts/"]')).toHaveCount(0);
    await expect(stub.getByTestId('external-stub-source-stub-1')).toBeVisible();
    // Two-field search NEVER writes trip context: the where field is read-only.
    await expect(page.getByTestId('input-location')).toHaveAttribute('readonly', '');
    // Phase 2g: the third neighbourhood (Nishiki) carries the platform-recommendation
    // tile. Candidates land one per window in ranked order — rec-0 tmpl-2 → Gion and
    // rec-1 tmpl-1 → Arashiyama (both expert_package, retagged to ready-mades), rec-2
    // off-nishiki-1 (platform_provider, NOT retagged) → Nishiki. Exactly ONE rec tile
    // renders, and it lives in Nishiki. (POST-once is proven in test 10.)
    const recTiles = page.locator('[data-testid^="feed-card-rec-"]');
    await expect(recTiles).toHaveCount(1);
    await expect(page.getByTestId('feed-card-rec-2')).toBeVisible();
    await expect(
      page.locator('[data-testid="bento-section-nishiki"] [data-testid="feed-card-rec-2"]'),
    ).toHaveCount(1);

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
      page.locator('[data-testid="bento-section-nishiki"] [data-testid="feed-card-rec-2"]'),
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

  test('11. rec Book now carries the feed city into /services as ?location (Commit B)', async ({ page }) => {
    // handleBookRecommendation (discover-location.tsx) must carry the FEED's city so
    // the services surface opens scoped to where the traveller was browsing, not a
    // bare catalog. It navigates to /services?categoryKey=…&location=<city>&upsellSource=…
    // The click also fires the (now-validating) upsell click beacon, mocked in
    // mockBentoEndpoints so it never 400s the test.
    await page.getByTestId('btn-book-rec-2').click();
    await expect.poll(() => page.url(), { timeout: 10_000 }).toContain('/services?');
    const url = new URL(page.url());
    expect(url.searchParams.get('location')).toBe('Kyoto');
    expect(url.searchParams.get('categoryKey')).toBeTruthy();
    expect(url.searchParams.get('upsellSource')).toBe('discover_location');
  });
});
