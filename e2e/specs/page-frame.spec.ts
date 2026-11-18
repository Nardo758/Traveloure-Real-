// e2e/specs/page-frame.spec.ts
// UI brief 1 (page frame), commit 6 - the structural proof, in the suite that already boots the app and signs
// in an owner on a plan (`journey-suite.yml`).
//
// Cases (Leon, Nov 18 2026):
//   owner, list          two buttons in the action row; exactly one expert door; none of the four removed
//                        controls; the Finalize button's box is not intersected by any other element
//   expert viewer, list  sees Ask and the foot's Finalize
//   owner, map           no Ask, no slip-foot, and the Trip Card banner's Finalize as on main
//
// Shots: the owner's list and map views at both widths, into test-results/shots/2049/ (CI artifact; never
// committed - the pack keeps the copies).

import type { Page } from '@playwright/test';
import { test, expect, authFile } from '../fixtures/roles';

const SHOTS = 'test-results/shots/2049';
const REMOVED = ['slip-add-local-expert', 'slip-get-help-note-button', 'expert-door-card', 'slip-bottom-bar'];

/** The first plan in My Plans, or null. The frame needs no fixture beyond a plan that exists. */
async function openFirstPlan(page: Page): Promise<boolean> {
  await page.goto('/my-trips');
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
  const link = page.locator('a[href^="/plans/"]').first();
  if ((await link.count()) === 0) return false;
  await link.click();
  await page.waitForURL(/\/plans\//, { timeout: 30_000 });
  await page.waitForSelector('[data-testid="slip-action-row"], [data-testid="slip-map-view"]', { timeout: 30_000 });
  return true;
}

/** The Finalize control: the foot's own button, whichever testid the card gives it. */
const finalize = (page: Page) => page.locator('[data-testid="slip-foot"] button').last();

/**
 * Not intersected: every element under a 3x3 grid of points inside the Finalize button is the button, a
 * descendant of it, or one of its ancestors - never a sibling overlay.
 */
async function expectNotIntersected(page: Page) {
  const box = await finalize(page).boundingBox();
  expect(box, 'Finalize has a box').not.toBeNull();
  const hits = await page.evaluate(({ x, y, w, h }) => {
    const points: Array<{ px: number; py: number }> = [];
    for (const fx of [0.15, 0.5, 0.85]) for (const fy of [0.15, 0.5, 0.85]) points.push({ px: x + w * fx, py: y + h * fy });
    const own = document.elementFromPoint(x + w / 2, y + h / 2);
    const inside = (el: Element | null) => !!el && !!own && (own.contains(el) || el.contains(own));
    return points
      .map((p) => document.elementsFromPoint(p.px, p.py)[0] ?? null)
      .filter((el) => !inside(el))
      .map((el) => (el as Element).getAttribute('data-testid') ?? (el as Element).tagName);
  }, { x: box!.x, y: box!.y, w: box!.width, h: box!.height });
  expect(hits, 'nothing may sit over the Finalize button').toEqual([]);
}

for (const width of [1280, 390] as const) {
  test.describe(`frame at ${width}px`, () => {
    test.use({ storageState: authFile('owner'), viewport: { width, height: width === 390 ? 844 : 900 } });

    test(`owner, list: two actions, one door, no removed controls, Finalize unobstructed`, async ({ page }) => {
      test.skip(!(await openFirstPlan(page)), 'no plan for the owner');
      await page.screenshot({ path: `${SHOTS}/owner-list-${width}.png` });

      const row = page.locator('[data-testid="slip-action-row"]');
      await expect(row).toBeVisible();
      await expect(row.locator('button')).toHaveCount(2);
      await expect(page.locator('[data-testid="button-slip-expert-help"]')).toHaveCount(1);
      for (const id of REMOVED) await expect(page.locator(`[data-testid="${id}"]`)).toHaveCount(0);

      await expectNotIntersected(page);
    });
  });

  test.describe(`map at ${width}px`, () => {
    test.use({ storageState: authFile('owner'), viewport: { width, height: width === 390 ? 844 : 900 } });

    test(`owner, map: no Ask, no foot, the banner's Finalize`, async ({ page }) => {
      test.skip(!(await openFirstPlan(page)), 'no plan for the owner');
      await page.locator('[data-testid="button-slip-view-map"]').click();
      await page.waitForSelector('[data-testid="slip-map-view"]', { timeout: 30_000 });
      await page.screenshot({ path: `${SHOTS}/owner-map-${width}.png` });

      await expect(page.locator('[data-testid="slip-tools-row"]')).toHaveCount(0);
      await expect(page.locator('[data-testid="slip-foot"]')).toHaveCount(0);
      await expect(page.locator('[data-testid="trip-card-banner"]')).toHaveCount(1);
    });
  });
}

test.describe('expert viewer, list', () => {
  test.use({ storageState: authFile('expert') });

  test('sees Ask and the foot Finalize', async ({ page }) => {
    test.skip(!(await openFirstPlan(page)), 'no plan for the expert viewer');
    await expect(page.locator('[data-testid="slip-tools-row"]')).toBeVisible();
    await expect(page.locator('[data-testid="slip-action-ask-ai"]')).toHaveCount(1);
    await expect(page.locator('[data-testid="slip-foot"]')).toBeVisible();
  });
});
