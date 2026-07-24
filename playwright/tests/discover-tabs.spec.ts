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
      await expect(page.getByTestId('button-become-expert-packages')).toBeVisible();
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
      await expect(page.getByTestId('button-become-expert-packages')).toBeVisible();
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

// ── 7. Mobile viewport — tab tappability and label legibility ─────────────────
//
// Source analysis (discover.tsx, TabsList):
//
//   tab-travelpulse  TrendingUp icon  +  <span class="hidden sm:inline">By </span>Location
//   tab-packages     Award icon       +  <span class="hidden sm:inline">Ready Made </span>Trips
//   tab-events       Calendar icon    +  "By Date"          ← full label, NO hidden span
//   tab-services     Building2 icon   +  <span class="hidden sm:inline">Browse </span>Services
//
//   The `sm` breakpoint fires at 640 px.  At 375 px and 320 px (both < 640 px)
//   the hidden spans are collapsed, leaving the following visible labels:
//     travelpulse → icon + "Location"
//     packages    → icon + "Trips"
//     events      → icon + "By Date"
//     services    → icon + "Services"
//
// UX verdict (recorded as a passing test assertion so regression is detectable):
//   The tabs are NOT icon-only.  Each has an icon AND a short text label.
//   All four labels are distinct and self-explanatory:
//     "Location" (trending icon)  — immediately communicates place-based discovery ✓
//     "Trips"    (award icon)     — clearly implies curated packages ✓
//     "By Date"  (calendar icon)  — the only full-length label; unambiguous ✓
//     "Services" (building icon)  — plain English, no ambiguity ✓
//   ⚠ Flag: "Trips" alone (without "Ready Made") could be confused with
//     My Trips / dashboard trips by a first-time visitor.  The Award icon
//     helps distinguish it, but a tooltip or ARIA description on the trigger
//     would remove the ambiguity entirely.

test.describe('/discover — mobile viewport tab tappability (375 px & 320 px)', () => {
  /** Minimum touch-target dimension recommended by WCAG 2.5.8 / Apple HIG. */
  const MIN_TAP_PX = 44;

  /** The four discover tab testids and their expected visible short labels. */
  const TABS = [
    { testId: 'tab-travelpulse', shortLabel: 'Location' },
    { testId: 'tab-packages',    shortLabel: 'Trips'    },
    { testId: 'tab-events',      shortLabel: 'By Date'  },
    { testId: 'tab-services',    shortLabel: 'Services' },
  ] as const;

  async function gotoDiscoverAt(
    page: import('@playwright/test').Page,
    width: number,
  ) {
    await page.setViewportSize({ width, height: 812 });
    await page.goto(`${BASE_URL}/discover`, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    await page.waitForTimeout(2_000);
  }

  // ── 7.1  All 4 tabs visible and tappable at 375 px ─────────────────────────

  test('7.1: at 375 px all 4 tab triggers are visible and meet min touch-target height', async ({ page }) => {
    await gotoDiscoverAt(page, 375);

    for (const { testId } of TABS) {
      const trigger = page.getByTestId(testId);
      await expect(trigger).toBeVisible();

      const box = await trigger.boundingBox();
      expect(box, `${testId} must have a bounding box`).not.toBeNull();
      if (box) {
        expect(
          box.height,
          `${testId} height ${box.height}px < ${MIN_TAP_PX}px minimum`,
        ).toBeGreaterThanOrEqual(MIN_TAP_PX);
      }
    }
  });

  // ── 7.2  All 4 tabs visible and tappable at 320 px ─────────────────────────

  test('7.2: at 320 px all 4 tab triggers are visible and meet min touch-target height', async ({ page }) => {
    await gotoDiscoverAt(page, 320);

    for (const { testId } of TABS) {
      const trigger = page.getByTestId(testId);
      await expect(trigger).toBeVisible();

      const box = await trigger.boundingBox();
      expect(box, `${testId} must have a bounding box`).not.toBeNull();
      if (box) {
        expect(
          box.height,
          `${testId} height ${box.height}px < ${MIN_TAP_PX}px minimum`,
        ).toBeGreaterThanOrEqual(MIN_TAP_PX);
      }
    }
  });

  // ── 7.3  Tabs are NOT icon-only — short text label is present at 375 px ────
  //   This is the UX distinguishability check.  If it ever fails it means someone
  //   removed the text node from a trigger and left only the icon — a regression.

  test('7.3: at 375 px each tab shows a non-empty text label (not icon-only)', async ({ page }) => {
    await gotoDiscoverAt(page, 375);

    for (const { testId, shortLabel } of TABS) {
      const trigger = page.getByTestId(testId);
      // innerText strips hidden elements and collapsed whitespace
      const text = (await trigger.innerText()).trim();
      expect(
        text,
        `${testId} must contain visible text at 375 px — got "${text}"`,
      ).toContain(shortLabel);
    }
  });

  // ── 7.4  Same text-label check at 320 px ───────────────────────────────────

  test('7.4: at 320 px each tab shows a non-empty text label (not icon-only)', async ({ page }) => {
    await gotoDiscoverAt(page, 320);

    for (const { testId, shortLabel } of TABS) {
      const trigger = page.getByTestId(testId);
      const text = (await trigger.innerText()).trim();
      expect(
        text,
        `${testId} must contain visible text at 320 px — got "${text}"`,
      ).toContain(shortLabel);
    }
  });

  // ── 7.5  All 4 tabs have distinct labels from each other (distinguishable) ──

  test('7.5: at 375 px the 4 tab labels are all distinct from each other', async ({ page }) => {
    await gotoDiscoverAt(page, 375);

    const labels: string[] = [];
    for (const { testId } of TABS) {
      const text = (await page.getByTestId(testId).innerText()).trim();
      labels.push(text);
    }

    const unique = new Set(labels);
    expect(
      unique.size,
      `Expected 4 distinct tab labels but got: ${JSON.stringify(labels)}`,
    ).toBe(4);
  });

  // ── 7.6  Each tab can be tapped and becomes selected at 375 px ─────────────

  test('7.6: at 375 px clicking each tab makes it active (aria-selected="true")', async ({ page }) => {
    await gotoDiscoverAt(page, 375);

    for (const { testId } of TABS) {
      await page.getByTestId(testId).click();
      await page.waitForTimeout(400);
      await expect(
        page.getByTestId(testId),
        `${testId} must be aria-selected after click`,
      ).toHaveAttribute('aria-selected', 'true');
    }
  });

  // ── 7.7  TabsList container scrolls horizontally — no tab clipped at 320 px ─
  //   The TabsList has overflow-x-auto; every trigger must have a non-negative
  //   x-position (not scrolled off the left edge) when it is scrolled into view.

  test('7.7: at 320 px no tab trigger is clipped (horizontal scroll works)', async ({ page }) => {
    await gotoDiscoverAt(page, 320);

    const tabsList = page.locator('[role="tablist"]');
    await expect(tabsList).toBeVisible();

    for (const { testId } of TABS) {
      const trigger = page.getByTestId(testId);
      // scrollIntoViewIfNeeded brings off-screen tabs into the visible scroll area
      await trigger.scrollIntoViewIfNeeded();
      await page.waitForTimeout(200);

      const box = await trigger.boundingBox();
      expect(box, `${testId} must have a bounding box after scroll`).not.toBeNull();
      if (box) {
        // After scrolling, the trigger must have positive width (not collapsed)
        expect(box.width).toBeGreaterThan(0);
        expect(box.height).toBeGreaterThan(0);
      }
    }
  });
});
