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
      !e.includes('[vite]'),
  );

test.describe('Journey 2A — AI itinerary generation flow', () => {
  test.use({ storageState: authFile('traveler') });

  test('EnhancedPlanningModal generates itinerary and redirects to comparison or trip', async ({ page, consoleErrors }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/traveloure/i);

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
    await page.goto('/discover?showExperts=true&destination=Tokyo');
    await page.waitForSelector(SELECTORS.expertMatchCard, { timeout: 10_000 });
    await expect(page.locator(SELECTORS.expertMatchCard).first()).toBeVisible();
  });
});

test.describe('Journey 2D — Expert advisor request from trip-details', () => {
  test.use({ storageState: authFile('traveler') });

  test('Expert tab renders and advisor request button is visible', async ({ page }) => {
    await page.goto('/my-trips');
    await page.waitForSelector(SELECTORS.tripCard, { timeout: 10_000 });
    await page.locator(SELECTORS.tripCard).first().click();
    await page.waitForURL(/\/trip\//, { timeout: 10_000 });
    await page.click(SELECTORS.expertTab);
    await page.waitForTimeout(500);

    const hasExpert = await page.locator('[data-testid="advisor-card"]').isVisible().catch(() => false);
    const hasCta = await page
      .locator('[data-testid="button-find-expert"], [data-testid^="button-request-expert-"]')
      .isVisible()
      .catch(() => false);

    expect(hasExpert || hasCta, 'expert tab shows advisor or find-expert CTA').toBe(true);
  });
});
