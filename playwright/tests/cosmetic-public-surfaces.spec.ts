/**
 * Behavioral pass conditions for COSMETIC_PUBLIC_SURFACES_DISPATCH.md.
 * Location in repo: playwright/tests/cosmetic-public-surfaces.spec.ts
 * Run:  BASE_URL=http://localhost:5000 npx playwright test cosmetic-public-surfaces
 *
 * All tests are logged-out and read-only. Every test is expected to FAIL on
 * 32b0d6e and PASS after its lane lands. Do not loosen a threshold to get green.
 */
import { test, expect, type Page } from '@playwright/test';

// Authorised spec edit (dispatch §3, Lane A row): once R2 lands, the desktop nav breakpoint
// moves from `lg` (1024px) to `xl` (1280px) — the hamburger now owns 1024 and 1100, so the
// "no wrap, no overlap" desktop-nav assertions only apply where the desktop nav actually
// renders. 1024/1100 get their own assertion below (button-mobile-menu visible there) instead
// of being silently dropped from the file.
const DESKTOP_WIDTHS = [1280, 1440];
const HAMBURGER_WIDTHS = [1024, 1100];
const MOBILE = { width: 390, height: 844 };

async function settle(page: Page, path: string) {
  await page.goto(path, { waitUntil: 'networkidle' });
  await page.evaluate(() => (document as any).fonts?.ready);
}

test.describe('Lane A — header', () => {
  for (const width of DESKTOP_WIDTHS) {
    test(`A1/A2 @${width}px: no nav item wraps, none overlap`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await settle(page, '/');
      const result = await page.evaluate(() => {
        const nav = document.querySelector('nav')!;
        const items = [...nav.querySelectorAll<HTMLElement>('a,button')]
          .map((el) => ({ el, r: el.getBoundingClientRect(), t: (el.innerText || '').trim() }))
          .filter((i) => i.r.width > 0 && i.r.height > 0 && i.r.top < 70);
        const wrapped = items.filter((i) => i.t && i.r.height > 44).map((i) => i.t);
        const overlaps: string[] = [];
        for (let a = 0; a < items.length; a++)
          for (let b = a + 1; b < items.length; b++) {
            const A = items[a], B = items[b];
            if (A.el.contains(B.el) || B.el.contains(A.el)) continue;
            const x = Math.min(A.r.right, B.r.right) - Math.max(A.r.left, B.r.left);
            const y = Math.min(A.r.bottom, B.r.bottom) - Math.max(A.r.top, B.r.top);
            if (x > 1 && y > 1) overlaps.push(`${A.t || '[icon]'} × ${B.t || '[icon]'}`);
          }
        return { wrapped, overlaps };
      });
      expect(result.wrapped, 'nav labels rendering on more than one line').toEqual([]);
      expect(result.overlaps, 'nav items whose boxes intersect').toEqual([]);
    });
  }

  test('A3: Experiences mega-menu labels are not truncated', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await settle(page, '/');
    await page.getByRole('button', { name: 'Experiences' }).first().click();
    const cut = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('.truncate')]
        .filter((e) => e.getBoundingClientRect().width > 0 && e.scrollWidth > e.clientWidth + 1)
        .map((e) => e.innerText.trim()),
    );
    expect(cut).toEqual([]);
  });

  for (const width of HAMBURGER_WIDTHS) {
    test(`A1/A2 @${width}px: hamburger owns this width (button-mobile-menu visible)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await settle(page, '/');
      await expect(page.getByTestId('button-mobile-menu')).toBeVisible();
    });
  }

  test('A6: mobile menu opens at scrollTop 0', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await settle(page, '/');
    await page.getByTestId('button-mobile-menu').click();
    await page.waitForTimeout(500);
    const top = await page.evaluate(
      () => document.querySelector<HTMLElement>('nav .overflow-y-auto')?.scrollTop ?? -1,
    );
    expect(top).toBe(0);
  });
});

test.describe('Lane B — mobile planner', () => {
  for (const slug of ['wedding', 'travel', 'date-night']) {
    test(`B1 /experiences/${slug} @390px: desktop PanelGroup is not rendered`, async ({ page }) => {
      await page.setViewportSize(MOBILE);
      await settle(page, `/experiences/${slug}`);
      const display = await page.evaluate(() => {
        const g = document.querySelector<HTMLElement>('[data-panel-group]');
        if (!g) return 'absent';
        // walk up: hidden anywhere in the chain counts as not rendered
        for (let e: HTMLElement | null = g; e; e = e.parentElement)
          if (getComputedStyle(e).display === 'none') return 'none';
        return getComputedStyle(g).display;
      });
      expect(['absent', 'none']).toContain(display);
    });
  }
});

test.describe('Lane C — discover cards + sheet', () => {
  test('C1: compact action row fits its card (all four card kinds)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await settle(page, '/discover/location/Kyoto');
    const offenders = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('[data-testid^="btn-ask-"],[data-testid^="btn-add-"]')]
        .map((b) => {
          const row = b.parentElement!;
          return { id: b.dataset.testid!, over: row.scrollWidth - row.clientWidth };
        })
        .filter((r) => r.over > 0),
    );
    expect(offenders, 'action rows wider than their container').toEqual([]);
  });

  test('C3: desktop details sheet is a side panel, not a full-width bottom drawer', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await settle(page, '/discover/location/Kyoto');
    await page.locator('[data-testid^="btn-add-gem-"]').first().locator('xpath=ancestor::*[contains(@class,"cursor-pointer")][1]').click({ position: { x: 20, y: 20 } });
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const box = (await dialog.boundingBox())!;
    expect(box.width).toBeLessThanOrEqual(560);
  });

  test('C4: sheet never prints the same paragraph under two headings', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await settle(page, '/discover/location/Kyoto');
    await page.locator('[data-testid^="btn-add-gem-"]').first().locator('xpath=ancestor::*[contains(@class,"cursor-pointer")][1]').click({ position: { x: 20, y: 20 } });
    const paras = await page.getByRole('dialog').locator('p.text-muted-foreground').allInnerTexts();
    expect(new Set(paras).size).toBe(paras.length);
  });
});

test.describe('Lane D — landing ticker', () => {
  for (const vp of [{ width: 1440, height: 900 }, MOBILE]) {
    test(`D1 @${vp.width}px: cities ticker does not hard-clip labels`, async ({ page }) => {
      await page.setViewportSize(vp);
      await settle(page, '/');
      const t = page.getByTestId('cities-ticker');
      const clipped = await t.evaluate((el: HTMLElement) => {
        const s = getComputedStyle(el);
        const scrolls = /(auto|scroll)/.test(s.overflowX) || el.getAnimations({ subtree: true }).length > 0;
        return !scrolls && el.scrollWidth > el.clientWidth + 1;
      });
      expect(clipped).toBe(false);
    });
  }
});

test.describe('Lane E — services card', () => {
  test('E1: no raw enum tokens in rendered card text', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await settle(page, '/services');
    const body = await page.locator('main, body').first().innerText();
    expect(body).not.toMatch(/\b(in_person|pdf)\b/);
    expect(body).not.toMatch(/\\u[0-9a-fA-F]{4}/);
  });
});
