/**
 * catalog-add-to-cart.spec.ts
 *
 * Verifies that the "Add to cart" button appears on live catalog cards rendered
 * by UnifiedResultCard on /discover?tab=services, and that clicking it:
 *   1. Shows the floating cart button (button-browse-cart-float) with a badge
 *      count of "1".
 *   2. Allows the sheet to be opened, where the added item appears as
 *      browse-cart-item-<id>.
 *
 * Design notes:
 *   - Catalog cards (card-result-*) are rendered by UnifiedResultGrid only when:
 *       (a) a location is typed into the filter AND
 *       (b) the user is authenticated (the /api/catalog/activities-gyg endpoint
 *           requires isAuthenticated).
 *   - The test authenticates as the seeded test-traveler account so the catalog
 *     query is eligible to fire.
 *   - Because the catalog endpoint calls an external partner API (GetYourGuide),
 *     results may be empty in environments where that key is not configured.
 *     All catalog-dependent tests self-skip gracefully via test.skip() when no
 *     cards appear — CI never hard-fails on missing partner data.
 *   - The "float button hidden before add" test does NOT need catalog data and
 *     always runs.
 *   - All selectors use data-testid exclusively.
 *
 * Seeded account (server/seeds/e2e-accounts.seed.ts):
 *   email:    test-traveler-kyoto@traveloure.test
 *   password: see E2E_TEST_PASSWORD env var (default: TestPass123!)
 *
 * Relevant source files:
 *   client/src/pages/discover.tsx              (browse-cart state, float button, sheet)
 *   client/src/components/unified-result-card.tsx (button-add-to-cart-* on catalog cards)
 *   server/routes/content.routes.ts            (/api/catalog/activities-gyg — isAuthenticated)
 */

import { test, expect, type Page } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5000';

const TRAVELER_EMAIL    = 'test-traveler-kyoto@traveloure.test';
const TRAVELER_PASSWORD = process.env.E2E_TEST_PASSWORD ?? 'TestPass123!';

/**
 * Destinations tried in order. The first one that returns catalog cards is used.
 * Keep the list short — each miss costs POLL_TIMEOUT_MS.
 */
const CANDIDATE_DESTINATIONS = ['Paris', 'Tokyo'];

/**
 * How long to wait per destination for [data-testid^="card-result-"] to appear.
 * External partner APIs respond quickly (< 2 s) when configured; this budget
 * covers both the network call and React re-render.
 */
const POLL_TIMEOUT_MS = 4_000;

// ── helpers ───────────────────────────────────────────────────────────────────

/** Authenticate via the API so the session cookie is set for all subsequent requests. */
async function loginTraveler(page: Page): Promise<void> {
  const resp = await page.request.post(`${BASE_URL}/api/auth/login`, {
    headers: { 'Content-Type': 'application/json' },
    data: { email: TRAVELER_EMAIL, password: TRAVELER_PASSWORD },
  });
  // 401 = wrong credentials; skip auth and continue unauthenticated (catalog will 401, tests skip)
  if (!resp.ok()) {
    console.warn(`[catalog-add-to-cart] login returned ${resp.status()} — tests will self-skip`);
  }
}

/** Navigate to /discover?tab=services and wait for React hydration to settle. */
async function gotoServicesTab(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/discover?tab=services`, {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  });
  await page.waitForTimeout(1_500);
}

/**
 * Type a destination into the location filter and wait up to POLL_TIMEOUT_MS for
 * catalog cards to appear.  Returns the count of visible catalog cards (0 = none).
 */
async function typeDestinationAndPoll(page: Page, destination: string): Promise<number> {
  const input = page.getByTestId('input-location');
  await input.clear();
  // Slow type so the debounced onChange fires for each character
  await input.type(destination, { delay: 40 });

  try {
    await page.waitForSelector('[data-testid^="card-result-"]', {
      state: 'visible',
      timeout: POLL_TIMEOUT_MS,
    });
  } catch {
    return 0;
  }

  return page.locator('[data-testid^="card-result-"]').count();
}

// ── suite ─────────────────────────────────────────────────────────────────────

test.describe('/discover?tab=services — catalog card Add-to-cart flow', () => {

  // ── 1. Core flow: Add → float badge "1" → sheet item present ─────────────

  test('Add button appears on catalog cards; float badge increments; sheet lists the item', async ({ page }) => {
    await loginTraveler(page);
    await gotoServicesTab(page);

    // Locate a destination that yields live catalog cards
    let catalogCardCount = 0;
    for (const dest of CANDIDATE_DESTINATIONS) {
      catalogCardCount = await typeDestinationAndPoll(page, dest);
      if (catalogCardCount > 0) break;
    }

    if (catalogCardCount === 0) {
      test.skip(true, 'No catalog cards returned for any candidate destination — partner API not configured in this environment');
      return;
    }

    // Confirm the first catalog card and its Add button are visible
    const firstCard = page.locator('[data-testid^="card-result-"]').first();
    await expect(firstCard).toBeVisible();

    const cardTestId = await firstCard.getAttribute('data-testid') ?? '';
    const resultId = cardTestId.replace('card-result-', '');
    expect(resultId, 'Could not extract result id from card testid').toBeTruthy();

    const addBtn = page.getByTestId(`button-add-to-cart-${resultId}`);
    await expect(addBtn).toBeVisible();

    // Float button must NOT be present before any item is added
    await expect(page.getByTestId('button-browse-cart-float')).not.toBeAttached();

    // Click Add — float button should appear with badge count "1"
    await addBtn.click();
    await page.waitForTimeout(400);

    const floatBtn = page.getByTestId('button-browse-cart-float');
    await expect(floatBtn).toBeVisible({ timeout: 3_000 });

    const badge = page.getByTestId('badge-browse-cart-count');
    await expect(badge).toBeVisible();
    await expect(badge).toHaveText('1');

    // Open the sheet and confirm the item is listed
    await floatBtn.click();
    await page.waitForTimeout(400);

    const cartItem = page.getByTestId(`browse-cart-item-${resultId}`);
    await expect(cartItem).toBeVisible({ timeout: 3_000 });
  });

  // ── 2. Float button absent on fresh load (no catalog data required) ───────

  test('Float button is absent on a fresh page load before any item is added', async ({ page }) => {
    await loginTraveler(page);
    await gotoServicesTab(page);

    await expect(page.getByTestId('button-browse-cart-float')).not.toBeAttached();
  });

  // ── 3. Duplicate-add guard: badge stays at "1" after two Add clicks ───────

  test('Adding the same catalog item twice does not increase the badge count beyond 1', async ({ page }) => {
    await loginTraveler(page);
    await gotoServicesTab(page);

    let catalogCardCount = 0;
    for (const dest of CANDIDATE_DESTINATIONS) {
      catalogCardCount = await typeDestinationAndPoll(page, dest);
      if (catalogCardCount > 0) break;
    }

    if (catalogCardCount === 0) {
      test.skip(true, 'No catalog cards returned — skipping duplicate-add test');
      return;
    }

    const firstCard = page.locator('[data-testid^="card-result-"]').first();
    const cardTestId = await firstCard.getAttribute('data-testid') ?? '';
    const resultId = cardTestId.replace('card-result-', '');

    const addBtn = page.getByTestId(`button-add-to-cart-${resultId}`);

    // Click Add twice in quick succession
    await addBtn.click();
    await page.waitForTimeout(200);
    await addBtn.click();
    await page.waitForTimeout(300);

    const badge = page.getByTestId('badge-browse-cart-count');
    await expect(badge).toBeVisible();
    await expect(badge).toHaveText('1');
  });
});
