// e2e/specs/journey-2.spec.ts
// E2E-2: AI Itinerary Generation → Expert Matching → Advisor Assignment
// Stage 3 exit gate. Covers the end-to-end planning journey introduced in Stage 3.
//
// Flows:
//   A. Traveler generates an AI itinerary (EnhancedPlanningModal → /api/ai/generate-itinerary)
//   B. Itinerary comparison page renders both variants
//   C. Expert match card surfaces in discover with destination context
//   D. Expert advisor request is sent from trip-details expert tab
//
/* @deploy-only: This spec requires an HTTPS origin to receive the session cookie.
 *
 * Root cause: server/replit_integrations/auth/replitAuth.ts configures the session
 * cookie with { secure: true } unconditionally (no NODE_ENV guard). HTTP origins
 * (http://localhost) cannot receive a Secure cookie, so every request lands
 * unauthenticated and all authenticated flows silently fail.
 *
 * Resolution options (prerequisite for making this runnable in CI):
 *   Option A — env-gate the Secure flag:
 *     secure: process.env.NODE_ENV === 'production'
 *   Option B — run CI via HTTPS using a self-signed cert + --ignore-certificate-errors
 *
 * Until one of the above is applied, run this spec ONLY against an HTTPS deploy:
 *   BASE_URL=https://<your-replit-deploy>.replit.app npx playwright test journey-2
 *
 * TODO: Before releasing Stage 4, apply Option A or B and add a CI job that mirrors
 * the e2e-selection-controls job in .github/workflows/selection-controls-gate.yml.
 */

import { test, expect, authFile } from '../fixtures/roles';

const SELECTORS = {
  planningModalTrigger: '[data-testid="button-plan-trip"], [data-testid="hero-search-btn"]',
  closePlanningModal: '[data-testid="button-close-planning-modal"]',
  destinationInput: '[data-testid="input-destination"]',
  addDestinationBtn: '[data-testid="button-add-destination"]',
  startDateInput: '[data-testid="input-start-date"]',
  endDateInput: '[data-testid="input-end-date"]',
  generateBtn: '[data-testid="button-generate-itinerary"]',

  expertTab: '[data-testid="tab-expert"]',
  expertMatchCard: '[data-testid^="card-expert-match-"]',
  assignExpertBtn: '[data-testid^="button-request-expert-"]',

  itineraryTab: '[data-testid="tab-itinerary"]',
  planReadyBanner: '[data-testid="banner-plan-ready"]',

  tripCard: '[data-testid^="trip-card-"]',
} as const;

// ─── Flow A + B: AI generation → comparison page ─────────────────────────────

test.describe('Journey 2A — AI itinerary generation flow', () => {
  test.use({ storageState: authFile('traveler') });

  test('EnhancedPlanningModal generates itinerary and redirects to comparison or trip', async ({ page, consoleErrors }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/traveloure/i);

    // Open planning modal (hero CTA or dashboard button)
    const trigger = page.locator(SELECTORS.planningModalTrigger).first();
    await trigger.click();

    // Fill destination
    await page.fill(SELECTORS.destinationInput, 'Tokyo, Japan');
    await page.click(SELECTORS.addDestinationBtn);

    // Fill dates (next month, 5-day trip)
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth() + 1, 10);
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 15);
    const fmt = (d: Date) => d.toISOString().split('T')[0];

    await page.fill(SELECTORS.startDateInput, fmt(start));
    await page.fill(SELECTORS.endDateInput, fmt(end));

    // Submit
    await page.click(SELECTORS.generateBtn);

    // Expect redirect to comparison or trip page
    await page.waitForURL(/\/itinerary-comparison\/|\/trips\//, { timeout: 60_000 });

    // No critical JS errors
    const errs = consoleErrors.filter(
      (e) => !e.includes('Failed to load resource') && !e.includes('ERR_') && !e.includes('net::') && !e.includes('[vite]'),
    );
    expect(errs, 'no JS errors in Journey 2A').toHaveLength(0);
  });
});

// ─── Flow C: Expert match surfacing ──────────────────────────────────────────

test.describe('Journey 2C — Expert match in discover', () => {
  test.use({ storageState: authFile('traveler') });

  test('ExpertMatchCard renders for destination-aware discover', async ({ page }) => {
    await page.goto('/discover?showExperts=true&destination=Tokyo');
    await page.waitForSelector(SELECTORS.expertMatchCard, { timeout: 10_000 });
    await expect(page.locator(SELECTORS.expertMatchCard).first()).toBeVisible();
  });
});

// ─── Flow D: Expert advisor assignment ───────────────────────────────────────

test.describe('Journey 2D — Expert advisor request from trip-details', () => {
  test.use({ storageState: authFile('traveler') });

  test('Expert tab renders and advisor request button is visible', async ({ page }) => {
    // Navigate to an existing trip
    await page.goto('/my-trips');
    await page.waitForSelector(SELECTORS.tripCard, { timeout: 10_000 });
    await page.locator(SELECTORS.tripCard).first().click();
    await page.waitForURL(/\/trip\//, { timeout: 10_000 });

    // Open expert tab
    await page.click(SELECTORS.expertTab);
    await page.waitForTimeout(500);

    // Either an existing advisor is shown, or the "Find Expert" CTA is available
    const hasExpert = await page.locator('[data-testid="advisor-card"]').isVisible().catch(() => false);
    const hasCta = await page.locator('[data-testid="button-find-expert"], [data-testid^="button-request-expert-"]').isVisible().catch(() => false);

    expect(hasExpert || hasCta, 'expert tab shows advisor or find-expert CTA').toBe(true);
  });
});
