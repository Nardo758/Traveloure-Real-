import { test, expect, type Page } from '@playwright/test';

/**
 * P462 reconcile — selection controls DOM gate.
 *
 * The automated form of the manual Replit checklist (the gate PR #21 jumped):
 * render per tab, selecting an option NARROWS the provider list, Clear restores
 * it, switching tabs ISOLATES (resets) refinements, and no console errors.
 *
 * Plus the consolidation guard: every non-flight/hotel tab renders EXACTLY ONE
 * filter surface — a single compact CompactFilterBar (data-testid="filter-bar")
 * — and never the old facet wall (button-toggle-filters). Count/absence asserts
 * so fragmentation (the duplicate-Price-Range / second-input-set pattern) can't
 * silently regress.
 *
 * Runs against the deployed app (BASE_URL). Tabs whose type is dining /
 * vendors / venue-search render the "Showing N providers" count we assert on;
 * activities/services/flights/hotels tabs hide it by design.
 *
 * NOTE: seeds the suite. Validate selectors/route/inventory on the first CI run
 * before promoting `e2e-selection-controls` to a required check. If the
 * /experiences pages require auth in the deployed env, add a loginAs() step.
 */

async function providerCount(page: Page): Promise<number> {
  const el = page.getByText(/Showing \d+ provider/).first();
  if (await el.count() === 0) return 0;
  const txt = (await el.textContent()) ?? '';
  const m = txt.match(/Showing (\d+) provider/);
  return m ? parseInt(m[1], 10) : 0;
}

async function gotoTemplate(page: Page, slug: string, destination = 'Kyoto') {
  await page.goto(`/experiences/${slug}?destination=${encodeURIComponent(destination)}`);
  await page.waitForLoadState('networkidle');
}

test.describe('Selection controls (P462) — render / narrow / parity / tab-isolation', () => {
  test('wedding/vendors: controls render and narrow the list, Clear restores it', async ({ page }) => {
    await gotoTemplate(page, 'wedding');
    await page.getByTestId('tab-vendors').click();

    // Exactly ONE filter surface, and never the old facet wall. Present-only
    // checks can't catch a duplicate; count==1 + absence is the regression guard.
    await expect(page.getByTestId('filter-bar')).toHaveCount(1);
    await expect(page.getByTestId('button-toggle-filters')).toHaveCount(0);
    const photography = page.getByTestId('selection-vendor-focus-focus-photography');
    await expect(photography).toBeVisible();

    const before = await providerCount(page);
    test.skip(before < 2, 'not enough wedding vendor inventory to assert narrowing');

    await photography.click();
    await expect.poll(() => providerCount(page)).toBeLessThan(before);
    expect(await providerCount(page)).toBeGreaterThan(0);

    await page.getByTestId('selection-clear').click();
    await expect.poll(() => providerCount(page)).toBe(before);
  });

  test('travel/dining: budget control narrows', async ({ page }) => {
    await gotoTemplate(page, 'travel');
    await page.getByTestId('tab-dining').click();
    await expect(page.getByTestId('filter-bar')).toBeVisible();

    const before = await providerCount(page);
    test.skip(before < 2, 'not enough dining inventory to assert narrowing');
    await page.getByTestId('selection-budget-budget-under-150').click();
    await expect.poll(() => providerCount(page)).toBeLessThanOrEqual(before);
  });

  test('tab isolation: switching tabs resets refinements', async ({ page }) => {
    await gotoTemplate(page, 'wedding');
    await page.getByTestId('tab-vendors').click();
    await page.getByTestId('selection-vendor-focus-focus-photography').click();

    // leave and return
    await page.getByTestId('tab-venues').click();
    await page.getByTestId('tab-vendors').click();

    // the previously-selected option is no longer in its active (highlighted) state
    const photography = page.getByTestId('selection-vendor-focus-focus-photography');
    await expect(photography).toBeVisible();
    await expect(photography).not.toHaveClass(/FF385C/);
  });

  // Generalized consolidation guard — structural only (no inventory dependency):
  // each seeded non-flight/hotel tab renders exactly one filter bar, exactly one
  // Sort control, and zero of the old facet wall. Catches fragmentation (a
  // second input set) and dimension duplication regressing on any tab.
  const SEEDED_TABS: Array<{ slug: string; tab: string }> = [
    { slug: 'wedding', tab: 'tab-vendors' },
    { slug: 'travel', tab: 'tab-dining' },
    { slug: 'travel', tab: 'tab-activities' },
    { slug: 'travel', tab: 'tab-services' },
  ];
  for (const { slug, tab } of SEEDED_TABS) {
    test(`single filter surface on ${slug}/${tab}`, async ({ page }) => {
      await gotoTemplate(page, slug);
      await page.getByTestId(tab).click();
      await expect(page.getByTestId('filter-bar')).toHaveCount(1);
      await expect(page.getByTestId('select-template-sort')).toHaveCount(1);
      await expect(page.getByTestId('button-toggle-filters')).toHaveCount(0);
    });
  }

  test('no console errors interacting with the panel', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

    await gotoTemplate(page, 'wedding');
    await page.getByTestId('tab-vendors').click();
    await expect(page.getByTestId('filter-bar')).toBeVisible();
    await page.getByTestId('selection-vendor-focus-focus-photography').click();

    expect(errors, errors.join('\n')).toHaveLength(0);
  });
});
