import { test, expect, type Page } from '@playwright/test';

/**
 * P462 reconcile — selection controls DOM gate, REPOINTED by step 8b-2.
 *
 * This gate used to drive the old experience-template page's per-tab filter panels at
 * `/experiences/<slug>?destination=…`. Step 8b-2 (D5, item 20; ledger `2026-10-06-step8b2-map-layout`;
 * sanctioned edit, ruling 12) re-routed those URLs: they now render the START PAGE with that occasion
 * picked, and Browse's filters live on the plan's map. So this gate now pins the selection controls
 * those same URLs show:
 *
 *   · the occasion arrives PICKED (its group pressed, its tile pressed under "More specific"), and a
 *     `?destination=` naming one of the eight cities arrives picked too, so Start a plan is ready (E3);
 *   · a slug that is not an occasion picks nothing — the trip group stays the default, never a nearest one;
 *   · choosing a different group narrows the picker to that group's occasions, and "See all" restores
 *     every occasion;
 *   · a visit writes nothing (the old page rewrote the plan context on every filter change), and no
 *     console errors.
 *
 * Runs against the deployed app (BASE_URL).
 */

async function gotoSlug(page: Page, slug: string, destination: string | null = 'Kyoto') {
  const qs = destination ? `?destination=${encodeURIComponent(destination)}` : '';
  await page.goto(`/experiences/${slug}${qs}`);
  await expect(page.getByRole('heading', { name: /Plan around…/i })).toBeVisible({ timeout: 15_000 });
}

test.describe('Selection controls (P462) — the /experiences/<slug> start page', () => {
  // E3 (ledger `2026-10-09-e3-experiences-inline`; sanctioned rewrite of :25-69): the page mounts PlanEntry
  // inline. A deep link with a city and an occasion lands on Step 2 with Start a plan ready — one click,
  // and a visit writes nothing. The occasion grid is PlanEntry's "More specific".
  test('wedding?destination=Kyoto: the occasion and the city arrive picked; Start a plan is ready', async ({ page }) => {
    await gotoSlug(page, 'wedding');
    await expect(page.getByTestId('plan-entry-step-occasion')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('plan-entry-group-hosted_events')).toHaveAttribute('aria-pressed', 'true', { timeout: 15_000 });
    await expect(page.getByTestId('plan-entry-summary')).toContainText('Kyoto');
    await page.getByTestId('plan-entry-more-specific').click();
    await expect(page.getByTestId('option-occasion-wedding')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('button-plan-entry-start')).toBeEnabled();
  });

  test('a slug that is not an occasion picks nothing; the trip group stays the default', async ({ page }) => {
    await gotoSlug(page, 'photo');
    await expect(page.getByTestId('plan-entry-group-trips')).toHaveAttribute('aria-pressed', 'true', { timeout: 15_000 });
    await page.getByTestId('plan-entry-more-specific').click();
    await expect(page.getByTestId('occasion-picker')).toBeVisible();
    await expect(page.locator('[data-testid^="option-occasion-"][aria-pressed="true"]')).toHaveCount(0);
  });

  test('a group narrows the picker; See all restores every occasion', async ({ page }) => {
    await gotoSlug(page, 'travel', null);
    await page.getByTestId('city-card-kyoto').click({ timeout: 15_000 });
    await page.getByTestId('plan-entry-more-specific').click();
    await expect(page.getByTestId('option-occasion-travel')).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('occasion-group-hosted_events').click();
    await expect(page.getByTestId('option-occasion-wedding')).toBeVisible();
    await expect(page.getByTestId('option-occasion-travel')).toHaveCount(0);
    await page.getByTestId('occasion-see-all').click();
    await expect(page.getByTestId('option-occasion-travel')).toBeVisible();
    await expect(page.getByTestId('option-occasion-wedding')).toBeVisible();
  });

  test('a visit writes nothing, and interacting raises no console errors', async ({ page }) => {
    const errors: string[] = [];
    const writes: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    page.on('request', (r) => {
      if (r.method() !== 'GET' && r.url().includes('/api/trip-context')) writes.push(`${r.method()} ${r.url()}`);
    });
    page.on('request', (r) => {
      if (r.method() === 'POST' && /\/api\/trips(\?|$)/.test(new URL(r.url()).pathname)) writes.push(`${r.method()} ${r.url()}`);
    });
    await gotoSlug(page, 'travel');
    await page.getByTestId('plan-entry-more-specific').click({ timeout: 15_000 });
    await page.getByTestId('occasion-group-moments').click();
    await page.getByTestId('occasion-see-all').click();
    await page.getByTestId('occasion-search').fill('wed');
    await page.getByTestId('button-plan-entry-back').click();
    await page.getByTestId('city-card-porto').click();
    await page.waitForTimeout(500);
    expect(writes, 'the start page writes no plan context and starts no plan').toEqual([]);
    // Resource-load lines (a guest's 401 on the session read, a blocked third-party font) are network
    // events, not page errors; everything else the page logs is.
    expect(errors.filter((e) => !/favicon|ResizeObserver|Failed to load resource/i.test(e))).toEqual([]);
  });
});
