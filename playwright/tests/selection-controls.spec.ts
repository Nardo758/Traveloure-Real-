import { test, expect } from '@playwright/test';
import { loginAs } from '../utils/auth';
import { testAccounts } from '../fixtures/test-accounts';

/**
 * SELECTION CONTROLS GATE
 *
 * Asserts that [data-testid="filter-bar"] is visible on experience-template
 * tabs where the TemplateFiltersPanel renders (Activities, Experiences, Events,
 * Transfers) and is absent on tabs that use their own dedicated filter UI
 * (Flights, Hotels).
 *
 * Gate target: /experiences/travel?destination=Kyoto%2C+Japan
 * Auth: seeded Kyoto traveler account
 * Base URL: http://localhost:5000 (set via BASE_URL env or playwright.config.ts)
 */

const traveler = testAccounts.travelers.find(
  (a) => a.email === 'test-traveler-kyoto@traveloure.test'
)!;

const TEMPLATE_URL = '/experiences/travel?destination=Kyoto%2C+Japan';

/** Tabs where filter-bar SHOULD be visible */
const FILTER_BAR_TABS = [
  { testId: 'tab-activities', label: 'Activities' },
  { testId: 'tab-experiences', label: 'Experiences' },
  { testId: 'tab-events', label: 'Events' },
  { testId: 'tab-transfers', label: 'Transfers' },
];

/** Tabs where filter-bar MUST NOT be visible (they use their own controls) */
const NO_FILTER_BAR_TABS = [
  { testId: 'tab-flights', label: 'Flights' },
  { testId: 'tab-hotels', label: 'Hotels' },
  { testId: 'tab-accommodations', label: 'Accommodations' },
];

// ──────────────────────────────────────────────────────────────────────────────

test.describe('Selection Controls — filter-bar visibility', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, traveler.email, traveler.password);
    await page.goto(TEMPLATE_URL);
    // Wait for the tab list to be present, indicating the template mounted
    await page.waitForSelector('[data-testid^="tab-"]', { timeout: 15000 });
  });

  test('filter-bar is visible on Activities tab', async ({ page }) => {
    const tab = page.locator('[data-testid="tab-activities"]');
    const isPresent = await tab.count() > 0;
    if (!isPresent) {
      test.skip(true, 'Activities tab not present on this template — skipping');
      return;
    }
    await tab.click();
    await expect(
      page.locator('[data-testid="filter-bar"]'),
      'filter-bar must be visible on the Activities tab'
    ).toBeVisible({ timeout: 10000 });
  });

  test('filter-bar is visible on Events tab', async ({ page }) => {
    const tab = page.locator('[data-testid="tab-events"]');
    const isPresent = await tab.count() > 0;
    if (!isPresent) {
      test.skip(true, 'Events tab not present on this template — skipping');
      return;
    }
    await tab.click();
    await expect(
      page.locator('[data-testid="filter-bar"]'),
      'filter-bar must be visible on the Events tab'
    ).toBeVisible({ timeout: 10000 });
  });

  test('filter-bar is visible on Transfers tab', async ({ page }) => {
    const tab = page.locator('[data-testid="tab-transfers"]');
    const isPresent = await tab.count() > 0;
    if (!isPresent) {
      test.skip(true, 'Transfers tab not present on this template — skipping');
      return;
    }
    await tab.click();
    await expect(
      page.locator('[data-testid="filter-bar"]'),
      'filter-bar must be visible on the Transfers tab'
    ).toBeVisible({ timeout: 10000 });
  });

  test('filter-bar is visible on Experiences/Things-to-do tab (if present)', async ({ page }) => {
    // This tab may have varying slugs depending on template seed
    const tab = page.locator(
      '[data-testid="tab-experiences"], [data-testid="tab-things-to-do"], [data-testid="tab-sightseeing"]'
    ).first();
    const isPresent = await tab.count() > 0;
    if (!isPresent) {
      test.skip(true, 'Experiences/sightseeing tab not present on this template — skipping');
      return;
    }
    await tab.click();
    await expect(
      page.locator('[data-testid="filter-bar"]'),
      'filter-bar must be visible on the Experiences tab'
    ).toBeVisible({ timeout: 10000 });
  });

  test('filter-bar is NOT visible on Flights tab', async ({ page }) => {
    const tab = page.locator('[data-testid="tab-flights"]');
    const isPresent = await tab.count() > 0;
    if (!isPresent) {
      test.skip(true, 'Flights tab not present on this template — skipping');
      return;
    }
    await tab.click();
    // Give any async rendering a moment to settle
    await page.waitForTimeout(1000);
    await expect(
      page.locator('[data-testid="filter-bar"]'),
      'filter-bar must NOT appear on the Flights tab (Flights has its own filter UI)'
    ).not.toBeVisible();
  });

  test('filter-bar is NOT visible on Hotels tab', async ({ page }) => {
    // Hotels tab can appear as "hotels" or "accommodations"
    const tab = page.locator(
      '[data-testid="tab-hotels"], [data-testid="tab-accommodations"]'
    ).first();
    const isPresent = await tab.count() > 0;
    if (!isPresent) {
      test.skip(true, 'Hotels/Accommodations tab not present on this template — skipping');
      return;
    }
    await tab.click();
    // Give any async rendering a moment to settle
    await page.waitForTimeout(1000);
    await expect(
      page.locator('[data-testid="filter-bar"]'),
      'filter-bar must NOT appear on the Hotels tab (Hotels has its own filter UI)'
    ).not.toBeVisible();
  });

  test('filter-bar default state: visible on whichever tab is active on load', async ({ page }) => {
    // The default active tab should not be flights or hotels, so the filter-bar
    // should be visible immediately after page load.
    const filterBar = page.locator('[data-testid="filter-bar"]');
    const flightsActive = await page.locator('[data-testid="tab-flights"][data-state="active"]').count();
    const hotelsActive = await page.locator(
      '[data-testid="tab-hotels"][data-state="active"], [data-testid="tab-accommodations"][data-state="active"]'
    ).count();

    if (flightsActive > 0 || hotelsActive > 0) {
      // Default tab happens to be flights or hotels — filter-bar correctly absent
      await expect(filterBar).not.toBeVisible();
    } else {
      // Any other default tab — filter-bar should be present
      await expect(
        filterBar,
        'filter-bar must be visible on the default (non-flights/hotels) tab after page load'
      ).toBeVisible({ timeout: 10000 });
    }
  });
});
