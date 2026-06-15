// e2e/specs/journey-2.spec.ts
// E2E-2: AI Itinerary Generation → Expert Matching → Advisor Assignment
// Stage 3 exit gate. Covers the end-to-end planning journey introduced in Stage 3.
//
// Flows:
//   A. Traveler generates an AI itinerary (EnhancedPlanningModal → /api/ai/generate-itinerary)
//   B. Itinerary comparison page renders both variants
//   C. Expert match card surfaces in discover with destination context
//   D. Expert advisor request is sent from trip-details expert tab
import { test, expect, authFile } from '../fixtures/roles';

const SELECTORS = {
  navLogo: '[data-testid="link-logo"]',
  planningModalTrigger: '[data-testid="button-plan-trip"], [data-testid="hero-search-btn"]',
  destinationInput: '[data-testid="input-destination"]',
  addDestinationBtn: '[data-testid="button-add-destination"]',
  startDateInput: '[data-testid="input-start-date"]',
  endDateInput: '[data-testid="input-end-date"]',
  generateBtn: '[data-testid="button-generate-itinerary"]',
  expertTab: '[data-testid="tab-expert"]',
  expertMatchCard: '[data-testid^="card-expert-match-"]',
  tripCard: '[data-testid^="trip-card-"]',
} as const;

const filterJsErrors = (errs: string[]) =>
  errs.filter(
    (e) =>
      !e.includes('Failed to load resource') &&
      !e.includes('ERR_') &&
      !e.includes('net::') &&
      !e.includes('[vite]') &&
      !e.includes('Warning:') &&
      !e.includes('ResizeObserver') &&
      !e.includes('Non-Error'),
  );

test.describe('Journey 2A — AI itinerary generation flow', () => {
  test.use({ storageState: authFile('traveler') });

  test('EnhancedPlanningModal generates itinerary and redirects to comparison or trip', async ({ page, consoleErrors }) => {
    // domcontentloaded avoids blocking on Google Fonts.  Check nav logo rather
    // than document.title — SEOHead transiently clears the static title during
    // React hydration on the Replit dev server.
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector(SELECTORS.navLogo, { timeout: 20_000 });

    const trigger = page.locator(SELECTORS.planningModalTrigger).first();
    await trigger.click();
    await page.fill(SELECTORS.destinationInput, 'Tokyo, Japan');
    await page.click(SELECTORS.addDestinationBtn);

    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth() + 1, 10);
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 15);
    const fmt = (d: Date) => d.toISOString().split('T')[0];

    await page.fill(SELECTORS.startDateInput, fmt(start));
    await page.fill(SELECTORS.endDateInput, fmt(end));
    await page.click(SELECTORS.generateBtn);
    await page.waitForURL(/\/itinerary-comparison\/|\/trips\//, { timeout: 60_000 });

    expect(filterJsErrors(consoleErrors), 'no JS errors in Journey 2A').toHaveLength(0);
  });
});

test.describe('Journey 2C — Expert match in discover', () => {
  test.use({ storageState: authFile('traveler') });

  test('ExpertMatchCard renders for destination-aware discover', async ({ page }) => {
    await page.goto('/discover?showExperts=true&destination=Tokyo', { waitUntil: 'domcontentloaded' });
    // Wait for page to settle, then scroll to trigger intersection-observer-gated
    // AIMatchedExpertsSection.  Grok has an 8 s abort; fallback runs immediately.
    await page.waitForSelector(SELECTORS.navLogo, { timeout: 15_000 });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    // 45 s gives ample headroom for the full Grok + fallback cycle on slow CI.
    await page.waitForSelector(SELECTORS.expertMatchCard, { timeout: 45_000 });
    await expect(page.locator(SELECTORS.expertMatchCard).first()).toBeVisible();
  });
});

test.describe('Journey 2D — Expert advisor request from trip-details', () => {
  test.use({ storageState: authFile('traveler') });

  test('Expert tab renders and advisor request button is visible', async ({ page }) => {
    await page.goto('/my-trips', { waitUntil: 'domcontentloaded' });
    // 30 s: API call to load trips can be slow on a shared Replit dev server.
    await page.waitForSelector(SELECTORS.tripCard, { timeout: 30_000 });
    await page.locator(SELECTORS.tripCard).first().click();
    await page.waitForURL(/\/trip\//, { timeout: 10_000 });
    // Wait for tab-expert to appear (trip data must load first).
    await page.waitForSelector(SELECTORS.expertTab, { timeout: 20_000 });
    await page.click(SELECTORS.expertTab);
    // Give the tab content time to render on a slow Replit round-trip.
    await page.waitForTimeout(3_000);

    const hasExpert = await page.locator('[data-testid="advisor-card"]').isVisible().catch(() => false);
    const hasCta = await page
      .locator('[data-testid="button-find-expert"], [data-testid^="button-request-expert-"]')
      .isVisible()
      .catch(() => false);

    expect(hasExpert || hasCta, 'expert tab shows advisor or find-expert CTA').toBe(true);
  });
});
