import { test, expect } from '@playwright/test';

/**
 * Catalog integrity smoke test for the /earn page.
 *
 * Guards against migrations silently deactivating or deleting the
 * service_provider rows in service_offering_types. When those rows go missing
 * the /earn page renders "No offerings published yet." — an empty state that
 * looks like content to a human reviewer but is actually a silent break.
 *
 * Root cause: task migrations deleted/deactivated these rows twice.
 * Migration 095 restored them; this test ensures they stay active.
 *
 * Runs in service-offering-types-gate.yml (earn-page-smoke job) against a
 * locally-built server with migrations applied. Uses playwright.config.ts
 * (testDir: ./playwright/tests) — no globalSetup / auth required; /earn is
 * a public page.
 *
 * This is the DOM-level complement to scripts/verify-service-offering-types.ts:
 * it proves the frontend actually renders the cards the API returns, catching
 * any mismatch between the API count and the visible UI.
 */

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5000';

/**
 * Minimum number of offering cards that must be visible in the Service Provider
 * catalog. Migration 095 seeds 47 active rows; this floor catches any bulk
 * deactivation while tolerating deliberate future pruning of individual rows.
 * Keep in sync with MIN_ACTIVE_SERVICE_PROVIDER_OFFERINGS in
 * scripts/verify-service-offering-types.ts.
 */
const MIN_VISIBLE_OFFERINGS = 10;

test.describe('/earn Service Provider catalog integrity', () => {
  test('Service Provider catalog renders at least MIN_VISIBLE_OFFERINGS cards', async ({
    page,
  }) => {
    // /earn defaults to service_provider; pass role= explicitly for clarity.
    await page.goto(`${BASE_URL}/earn?role=service_provider`, {
      waitUntil: 'domcontentloaded',
    });

    // Wait for the catalog container — proves data loaded (not loading/error state).
    // 30 s: Vite cold-start on CI can be slow.
    const catalog = page.locator('[data-testid="earn-catalog"]');
    await expect(catalog).toBeVisible({ timeout: 30_000 });

    // Assert the title says "Service Provider" (confirms role selection is correct).
    const title = page.locator('[data-testid="earn-catalog-title"]');
    await expect(title).toContainText('Service Provider', { timeout: 5_000 });

    // Count rendered offering rows.
    const offeringCards = page.locator('[data-testid^="earn-offering-"]');
    const count = await offeringCards.count();

    // Fail loudly if the count falls below the floor.
    // "No offerings published yet." renders when rows are absent — catalog is
    // NOT visible and the test already fails at the assertion above. This count
    // guard catches partial deactivation (some rows gone but not all).
    expect(count).toBeGreaterThanOrEqual(MIN_VISIBLE_OFFERINGS);

    console.log(
      `[earn-smoke] PASS — ${count} Service Provider offering card(s) visible ≥ ${MIN_VISIBLE_OFFERINGS}.`
    );
  });

  test('/earn page renders without JS errors', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') jsErrors.push(msg.text());
    });
    page.on('pageerror', (err) => jsErrors.push(err.message));

    await page.goto(`${BASE_URL}/earn?role=service_provider`, {
      waitUntil: 'domcontentloaded',
    });

    // Wait for the hero to render (proves page compiled and mounted).
    await page.locator('[data-testid="earn-hero"]').waitFor({ timeout: 30_000 });

    const filteredErrors = jsErrors.filter(
      (e) =>
        !e.includes('Failed to load resource') &&
        !e.includes('ERR_') &&
        !e.includes('net::') &&
        !e.includes('[vite]') &&
        !e.includes('Warning:') &&
        !e.includes('ResizeObserver') &&
        !e.includes('Non-Error') &&
        !e.includes('favicon')
    );

    expect(filteredErrors, 'no JS errors on /earn').toHaveLength(0);
  });
});
