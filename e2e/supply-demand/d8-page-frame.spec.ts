/**
 * d8-page-frame.spec.ts - UI brief 1 (page frame), the browser proof, in the suite that boots the app and signs in
 * its own owner (`playwright.supply-demand.config.ts`, project `demand`).
 *
 * It BUILDS EVERYTHING IT NEEDS: a fresh owner through the real /signup form, a Kyoto plan through PlanEntry
 * (`openPlanEntryFromHero` -> `fillPlanEntryToStart` -> `clickPlanStart`, the d1 sequence), and, for the expert
 * viewer case, a second account made an accepted advisor by one SQL row. NOTHING IS SKIPPED: a missing plan or a
 * missing button fails the case, because a skip is not evidence.
 *
 * Cases (Leon, Nov 18 2026):
 *   owner, list, 1280 and 390   two actions in the row; exactly one expert door; none of the removed four;
 *                               the Finalize button's box is not intersected by any other element
 *   owner, map, 1280 and 390    no Ask, no slip-foot, the Trip Card banner's Finalize
 *   expert viewer, list         sees Ask and the foot's Finalize
 *
 * Shots: owner list and owner map at both widths -> test-results/shots/2049/ (artifact `page-frame-shots-2049`).
 */
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { e2eEmail, E2E_PASSWORD } from './lib/run-id';
import { signupViaUi } from './lib/accounts';
import { fillPlanEntryToStart, clickPlanStart, openPlanEntryFromHero } from './lib/flows';
import { q, userByEmail } from './lib/db';

const SHOTS = 'test-results/shots/2049';
const REMOVED = ['slip-add-local-expert', 'slip-get-help-note-button', 'expert-door-card', 'slip-bottom-bar'];

test.describe.configure({ mode: 'serial' });

let tripId = '';

async function buildOwnerAndPlan(page: Page): Promise<string> {
  const email = e2eEmail('d8frame');
  await signupViaUi(page, { email, firstName: 'E2E', lastName: 'Frame' });

  await page.goto('/');
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
  expect(await openPlanEntryFromHero(page), 'the hero CTA opens PlanEntry').toBe(true);
  expect(await fillPlanEntryToStart(page, 'Kyoto, Japan'), 'PlanEntry reaches Start a plan').toBe(true);
  const id = await clickPlanStart(page);
  expect(id, 'Start a plan lands on /plans/:id').toBeTruthy();
  await page.waitForSelector('[data-testid="slip-action-row"]', { timeout: 30_000 });
  return id as string;
}

/** Every element under a 3x3 grid of points inside the Finalize button must be it or one of its kin. */
async function expectNotIntersected(page: Page) {
  const button = page.locator('[data-testid="slip-foot"] button').last();
  const box = await button.boundingBox();
  expect(box, 'Finalize has a box').not.toBeNull();
  const intruders = await page.evaluate(({ x, y, w, h }) => {
    const own = document.elementFromPoint(x + w / 2, y + h / 2);
    const kin = (el: Element | null) => !!el && !!own && (own.contains(el) || el.contains(own));
    const found: string[] = [];
    for (const fx of [0.15, 0.5, 0.85]) {
      for (const fy of [0.15, 0.5, 0.85]) {
        const el = document.elementsFromPoint(x + w * fx, y + h * fy)[0] ?? null;
        if (!kin(el)) found.push(el ? (el.getAttribute('data-testid') ?? el.tagName) : '<none>');
      }
    }
    return found;
  }, { x: box!.x, y: box!.y, w: box!.width, h: box!.height });
  expect(intruders, 'nothing may sit over the Finalize button').toEqual([]);
}

test('D8a: the owner builds a plan to check the frame', async ({ page }) => {
  tripId = await buildOwnerAndPlan(page);
});

for (const width of [1280, 390] as const) {
  test(`D8b owner list ${width}: two actions, one door, no removed controls, Finalize clear`, async ({ page }) => {
    expect(tripId, 'D8a built the plan').toBeTruthy();
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.goto(`/plans/${tripId}`);
    await page.waitForSelector('[data-testid="slip-action-row"]', { timeout: 30_000 });
    await page.screenshot({ path: `${SHOTS}/owner-list-${width}.png` });

    const row = page.locator('[data-testid="slip-action-row"]');
    await expect(row).toBeVisible();
    await expect(row.locator('button')).toHaveCount(2);
    await expect(page.locator('[data-testid="button-slip-expert-help"]')).toHaveCount(1);
    for (const id of REMOVED) await expect(page.locator(`[data-testid="${id}"]`)).toHaveCount(0);

    await expectNotIntersected(page);
  });

  test(`D8c owner map ${width}: no Ask, no foot, the banner Finalize`, async ({ page }) => {
    expect(tripId, 'D8a built the plan').toBeTruthy();
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.goto(`/plans/${tripId}`);
    await page.waitForSelector('[data-testid="slip-action-row"]', { timeout: 30_000 });
    await page.locator('[data-testid="button-slip-view-map"]').click();
    await page.waitForSelector('[data-testid="slip-map-view"]', { timeout: 30_000 });
    await page.screenshot({ path: `${SHOTS}/owner-map-${width}.png` });

    await expect(page.locator('[data-testid="slip-tools-row"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="slip-foot"]')).toHaveCount(0);
    // The map's Finalize is the Trip Card banner's FinishCard (`SlipView.tsx:2833` tripCardBanner) - the
    // card's own button testid, not a wrapper one.
    await expect(page.locator('[data-testid="slip-action-finalize-plan"]')).toBeVisible();
  });
}

test('D8d expert viewer sees Ask and the foot Finalize', async ({ browser }) => {
  expect(tripId, 'D8a built the plan').toBeTruthy();
  const email = e2eEmail('d8expertviewer');
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  try {
    await signupViaUi(page, { email, firstName: 'E2E', lastName: 'Viewer' });
    const user = await userByEmail(email);
    expect(user?.id, 'the expert account exists').toBeTruthy();
    await q(`UPDATE users SET role = 'expert' WHERE id = $1`, [user.id]);
    await q(
      `INSERT INTO trip_expert_advisors (trip_id, local_expert_id, status)
       VALUES ($1, $2, 'accepted')
       ON CONFLICT (trip_id, local_expert_id) DO UPDATE SET status = 'accepted'`,
      [tripId, user.id],
    );
    await page.goto(`/plans/${tripId}`);
    await page.waitForSelector('[data-testid="slip-tools-row"]', { timeout: 30_000 });
    await expect(page.locator('[data-testid="slip-action-ask-ai"]')).toHaveCount(1);
    await expect(page.locator('[data-testid="slip-foot"]')).toBeVisible();
  } finally {
    await ctx.close();
  }
});
