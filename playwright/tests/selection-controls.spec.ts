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
 *   · the occasion arrives PICKED (its tile pressed, under its group), and a `?destination=` naming one
 *     of the eight cities arrives picked too, so Continue is enabled;
 *   · a slug that is not an occasion picks nothing, and Continue stays disabled — never a nearest one;
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
  await expect(page.getByRole('heading', { name: /What are you planning\?/i })).toBeVisible({ timeout: 15_000 });
}

test.describe('Selection controls (P462) — the /experiences/<slug> start page', () => {
  test('wedding?destination=Kyoto: the occasion and the city arrive picked; Continue is enabled', async ({ page }) => {
    await gotoSlug(page, 'wedding');
    await expect(page.getByTestId('option-occasion-wedding')).toHaveAttribute('aria-pressed', 'true', { timeout: 15_000 });
    await expect(page.getByTestId('occasion-group-hosted_events')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('city-card-kyoto')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('button-experiences-continue')).toBeEnabled();
  });

  test('a slug that is not an occasion picks nothing; Continue stays disabled', async ({ page }) => {
    await gotoSlug(page, 'photo');
    await expect(page.getByTestId('occasion-picker')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-testid^="option-occasion-"][aria-pressed="true"]')).toHaveCount(0);
    await expect(page.getByTestId('button-experiences-continue')).toBeDisabled();
  });

  test('a group narrows the picker; See all restores every occasion', async ({ page }) => {
    await gotoSlug(page, 'travel', null);
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
    await gotoSlug(page, 'travel');
    await page.getByTestId('occasion-group-moments').click();
    await page.getByTestId('occasion-see-all').click();
    await page.getByTestId('occasion-search').fill('wed');
    await page.getByTestId('city-card-porto').click();
    await page.waitForTimeout(500);
    expect(writes, 'the start page writes no plan context').toEqual([]);
    // Resource-load lines (a guest's 401 on the session read, a blocked third-party font) are network
    // events, not page errors; everything else the page logs is.
    expect(errors.filter((e) => !/favicon|ResizeObserver|Failed to load resource/i.test(e))).toEqual([]);
  });
});
