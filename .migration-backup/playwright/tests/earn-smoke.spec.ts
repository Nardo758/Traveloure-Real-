import { test, expect } from '@playwright/test';

/**
 * Catalog integrity smoke test for the /earn page.
 *
 * Guards against migrations silently deactivating or deleting rows in
 * service_offering_types (service_provider + event_planner tracks) and
 * expert_offering_types (trip_planner + local_expert tracks). When those rows
 * go missing the /earn page renders "No offerings published yet." — an empty
 * state that looks like content to a human reviewer but is actually a silent break.
 *
 * Root cause: task migrations deleted/deactivated service_provider rows twice.
 * Migration 095 restored them; the event_planner and expert tracks share the
 * same tables and are equally at risk. These tests cover all four /earn tracks.
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

// ─── Floor constants ──────────────────────────────────────────────────────────
// Keep these in rough sync with the floors in verify-service-offering-types.ts.
// DOM counts may be lower than API counts when the UI applies its own filters,
// so these floors are set conservatively (half the API floor or tighter).

/**
 * Minimum offering cards visible in the Service Provider catalog.
 * Migration 038 seeds 47 active rows; migration 095 restores after regression.
 */
const MIN_SERVICE_PROVIDER_CARDS = 10;

/**
 * Minimum offering cards visible in the Event Planner catalog.
 * Migration 038 seeds ~26 rows across 10 EVENT_CATEGORY_KEYS categories.
 */
const MIN_EVENT_PLANNER_CARDS = 5;

/**
 * Minimum offering cards visible in the Trip Planner catalog.
 * Migration 039 seeds 13 rows across the planning + coordination tiers.
 */
const MIN_TRIP_PLANNER_CARDS = 5;

/**
 * Minimum offering cards visible in the Local Expert catalog.
 * Migration 039 seeds 26 rows across advisory + live_support + specialized tiers.
 */
const MIN_LOCAL_EXPERT_CARDS = 8;

// ─── Shared helpers ───────────────────────────────────────────────────────────

async function navigateAndWaitForCatalog(
  page: Parameters<Parameters<typeof test>[1]>[0]['page'],
  role: string,
  expectedTitleFragment: string,
): Promise<void> {
  await page.goto(`${BASE_URL}/earn?role=${role}`, {
    waitUntil: 'domcontentloaded',
  });

  // Wait for the catalog container — proves data loaded (not loading/error state).
  // 30 s: Vite cold-start on CI can be slow.
  const catalog = page.locator('[data-testid="earn-catalog"]');
  await expect(catalog).toBeVisible({ timeout: 30_000 });

  // Confirm the correct role tab is active.
  const title = page.locator('[data-testid="earn-catalog-title"]');
  await expect(title).toContainText(expectedTitleFragment, { timeout: 5_000 });
}

// ─── Service Provider ─────────────────────────────────────────────────────────

test.describe('/earn Service Provider catalog integrity', () => {
  test('Service Provider catalog renders at least MIN cards', async ({ page }) => {
    await navigateAndWaitForCatalog(page, 'service_provider', 'Service Provider');

    const offeringCards = page.locator('[data-testid^="earn-offering-"]');
    const count = await offeringCards.count();

    // Fail loudly if the count falls below the floor.
    // "No offerings published yet." renders when rows are absent — catalog is
    // NOT visible and the test already fails at navigateAndWaitForCatalog.
    // This count guard catches partial deactivation (some rows gone but not all).
    expect(count).toBeGreaterThanOrEqual(MIN_SERVICE_PROVIDER_CARDS);

    console.log(
      `[earn-smoke] PASS service_provider — ${count} card(s) visible ≥ ${MIN_SERVICE_PROVIDER_CARDS}.`
    );
  });
});

// ─── Event Planner ────────────────────────────────────────────────────────────

test.describe('/earn Event Planner catalog integrity', () => {
  test('Event Planner catalog renders at least MIN cards', async ({ page }) => {
    await navigateAndWaitForCatalog(page, 'event_planner', 'Event Planner');

    const offeringCards = page.locator('[data-testid^="earn-offering-"]');
    const count = await offeringCards.count();

    expect(count).toBeGreaterThanOrEqual(MIN_EVENT_PLANNER_CARDS);

    console.log(
      `[earn-smoke] PASS event_planner — ${count} card(s) visible ≥ ${MIN_EVENT_PLANNER_CARDS}.`
    );
  });
});

// ─── Trip Planner ─────────────────────────────────────────────────────────────

test.describe('/earn Trip Planner catalog integrity', () => {
  test('Trip Planner catalog renders at least MIN cards', async ({ page }) => {
    await navigateAndWaitForCatalog(page, 'trip_planner', 'Trip Planner');

    const offeringCards = page.locator('[data-testid^="earn-offering-"]');
    const count = await offeringCards.count();

    expect(count).toBeGreaterThanOrEqual(MIN_TRIP_PLANNER_CARDS);

    console.log(
      `[earn-smoke] PASS trip_planner — ${count} card(s) visible ≥ ${MIN_TRIP_PLANNER_CARDS}.`
    );
  });
});

// ─── Local Expert ─────────────────────────────────────────────────────────────

test.describe('/earn Local Expert catalog integrity', () => {
  test('Local Expert catalog renders at least MIN cards', async ({ page }) => {
    await navigateAndWaitForCatalog(page, 'local_expert', 'Local Expert');

    const offeringCards = page.locator('[data-testid^="earn-offering-"]');
    const count = await offeringCards.count();

    expect(count).toBeGreaterThanOrEqual(MIN_LOCAL_EXPERT_CARDS);

    console.log(
      `[earn-smoke] PASS local_expert — ${count} card(s) visible ≥ ${MIN_LOCAL_EXPERT_CARDS}.`
    );
  });
});

// ─── No JS errors ─────────────────────────────────────────────────────────────

test.describe('/earn page renders without JS errors', () => {
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
