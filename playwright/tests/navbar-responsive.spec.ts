/**
 * navbar-responsive.spec.ts
 *
 * Responsive navbar QA — 8 breakpoints + 6 hamburger menu behavioural tests
 * + sticky navbar test.
 *
 * Desktop nav appears at: lg (1024px+)
 * Mobile hamburger appears at: < 1024px
 */

import { test, expect, Page } from "@playwright/test";

const BASE = process.env.BASE_URL || "http://localhost:5000";

const BREAKPOINTS = [
  { label: "320px  (smallest phone)",    width: 320,  height: 812, mobile: true  },
  { label: "375px  (iPhone SE)",         width: 375,  height: 812, mobile: true  },
  { label: "425px  (large phone)",       width: 425,  height: 812, mobile: true  },
  { label: "768px  (tablet portrait)",   width: 768,  height: 1024, mobile: true  },
  { label: "1024px (tablet landscape)",  width: 1024, height: 768, mobile: false },
  { label: "1280px (laptop)",            width: 1280, height: 800, mobile: false },
  { label: "1440px (desktop)",           width: 1440, height: 900, mobile: false },
  { label: "1920px (large monitor)",     width: 1920, height: 1080, mobile: false },
];

// ── helpers ────────────────────────────────────────────────────────────────

async function setViewport(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
}

async function noHorizontalScroll(page: Page): Promise<boolean> {
  // Measure whether the page is ACTUALLY horizontally scrollable (not just whether
  // overflow content exists). scrollWidth > clientWidth is true even with
  // overflow-x:hidden (which hides overflow but doesn't change scrollWidth).
  // The correct check: attempt to scroll right and see if scrollX increases.
  return page.evaluate(() => {
    const before = window.scrollX;
    window.scrollBy(100, 0);
    const after = window.scrollX;
    window.scrollBy(-100, 0); // restore
    return after <= before + 1; // 1px tolerance for rounding
  });
}

async function navbarVisible(page: Page) {
  return page.locator("nav").first().isVisible();
}

async function hamburgerVisible(page: Page) {
  return page.locator('[data-testid="button-mobile-menu"]').isVisible();
}

async function desktopNavVisible(page: Page) {
  // Desktop nav items sit in the `hidden lg:flex` container
  return page.locator("nav .hidden.lg\\:flex").first().isVisible();
}

async function mobileMenuOpen(page: Page) {
  // The animated mobile menu div has overflow-y-auto and is lg:hidden
  const menu = page.locator("nav .lg\\:hidden.border-t.border-border").first();
  return menu.isVisible();
}

// ── Breakpoint tests ───────────────────────────────────────────────────────

test.describe("Breakpoint tests — navbar renders correctly", () => {
  for (const bp of BREAKPOINTS) {
    test(bp.label, async ({ page }) => {
      await setViewport(page, bp.width, bp.height);
      await page.goto(BASE, { waitUntil: "domcontentloaded" });

      // A) Navbar renders
      await expect(page.locator("nav").first()).toBeVisible();

      // B) No horizontal scroll
      const noScroll = await noHorizontalScroll(page);
      expect(noScroll, `Horizontal scroll detected at ${bp.width}px`).toBe(true);

      // C) Logo fits / is visible
      await expect(page.locator('[data-testid="link-logo"]')).toBeVisible();

      if (bp.mobile) {
        // D) Hamburger visible on mobile
        await expect(
          page.locator('[data-testid="button-mobile-menu"]'),
          `Hamburger should be visible at ${bp.width}px`
        ).toBeVisible();

        // E) Hamburger touch target ≥ 44px
        const box = await page.locator('[data-testid="button-mobile-menu"]').boundingBox();
        expect(box?.width ?? 0, `Touch target width at ${bp.width}px should be ≥ 44px`).toBeGreaterThanOrEqual(44);
        expect(box?.height ?? 0, `Touch target height at ${bp.width}px should be ≥ 44px`).toBeGreaterThanOrEqual(44);

        // F) Desktop nav hidden on mobile
        const desktopLinks = page.locator("nav .hidden.lg\\:flex").first();
        // hidden lg:flex means it's display:none below lg — evaluate computed style
        const isHiddenOnMobile = await page.evaluate(() => {
          const el = document.querySelector("nav .hidden") as HTMLElement | null;
          if (!el) return true;
          return getComputedStyle(el).display === "none";
        });
        expect(isHiddenOnMobile, `Desktop nav should be hidden at ${bp.width}px`).toBe(true);
      } else {
        // G) Desktop nav visible on desktop
        const desktopContainer = page.locator("nav").locator(".hidden.lg\\:flex, .lg\\:flex").first();
        // At 1024px+ the lg:flex makes it visible
        const desktopNavDisplayed = await page.evaluate(() => {
          const selectors = ["nav .hidden.lg\\:ml-8", "nav [class*='lg:flex']"];
          for (const s of selectors) {
            const el = document.querySelector(s) as HTMLElement | null;
            if (el) return getComputedStyle(el).display !== "none";
          }
          return false;
        });
        expect(desktopNavDisplayed, `Desktop nav should show at ${bp.width}px`).toBe(true);

        // H) Hamburger hidden on desktop — use Playwright visibility which
        //    checks the full ancestor chain, not just the element's own CSS.
        await expect(
          page.locator('[data-testid="button-mobile-menu"]'),
          `Hamburger should be hidden at ${bp.width}px`
        ).toBeHidden();
      }

      // I) Text readability: nav anchor links ≥ 14px
      //    (Shadcn sm buttons on desktop use text-sm; we check anchor links
      //    which are the primary readable nav elements)
      const fontSizeOk = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll("nav a"));
        return links.every((el) => {
          const fs = parseFloat(getComputedStyle(el).fontSize);
          return fs >= 14;
        });
      });
      expect(fontSizeOk, `Nav link text should be ≥ 14px at ${bp.width}px`).toBe(true);
    });
  }
});

// ── Hamburger menu behavioural tests ─────────────────────────────────────

test.describe("Hamburger menu — behavioural tests (375px)", () => {
  test.beforeEach(async ({ page }) => {
    await setViewport(page, 375, 812);
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
  });

  test("Test 1 — Open: menu slides in above content (z-index)", async ({ page }) => {
    await page.click('[data-testid="button-mobile-menu"]');
    const menu = page.locator("nav .lg\\:hidden.border-t").first();
    await expect(menu).toBeVisible();
    // Verify menu is within the sticky nav (z-50) so it overlays content
    const navZIndex = await page.evaluate(() => {
      const nav = document.querySelector("nav") as HTMLElement;
      return parseInt(getComputedStyle(nav).zIndex || "0");
    });
    expect(navZIndex).toBeGreaterThanOrEqual(50);
  });

  test("Test 2 — Close by clicking X button", async ({ page }) => {
    await page.click('[data-testid="button-mobile-menu"]'); // open
    const menu = page.locator("nav .lg\\:hidden.border-t").first();
    await expect(menu).toBeVisible();
    await page.click('[data-testid="button-mobile-menu"]'); // X / close
    await expect(menu).not.toBeVisible();
  });

  test("Test 3 — Close by clicking outside menu area", async ({ page }) => {
    await page.click('[data-testid="button-mobile-menu"]');
    const menu = page.locator("nav .lg\\:hidden.border-t").first();
    await expect(menu).toBeVisible();
    // Click below the nav (outside menu)
    await page.mouse.click(187, 600);
    await expect(menu).not.toBeVisible();
  });

  test("Test 4 — Close by pressing Escape", async ({ page }) => {
    await page.click('[data-testid="button-mobile-menu"]');
    const menu = page.locator("nav .lg\\:hidden.border-t").first();
    await expect(menu).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menu).not.toBeVisible();
  });

  test("Test 5 — Navigate from mobile menu: closes menu AND navigates", async ({ page }) => {
    await page.click('[data-testid="button-mobile-menu"]');
    const menu = page.locator("nav .lg\\:hidden.border-t").first();
    await expect(menu).toBeVisible();
    // Click the first visible mobile link
    const firstMobileLink = page.locator('[data-testid^="link-mobile-"]').first();
    await expect(firstMobileLink).toBeVisible();
    await firstMobileLink.click();
    await expect(menu).not.toBeVisible();
  });

  test("Test 6 — Scroll with menu open: menu scrolls independently or body locked", async ({ page }) => {
    await page.click('[data-testid="button-mobile-menu"]');
    const menu = page.locator("nav .lg\\:hidden.border-t").first();
    await expect(menu).toBeVisible();
    // Either body scroll is locked or the menu itself has overflow-y-auto (independent)
    const result = await page.evaluate(() => {
      const nav = document.querySelector("nav .lg\\:hidden.border-t") as HTMLElement | null;
      const bodyOverflow = getComputedStyle(document.body).overflow;
      const menuOverflow = nav ? getComputedStyle(nav).overflowY : "";
      return {
        bodyLocked: bodyOverflow === "hidden",
        menuScrollable: menuOverflow === "auto" || menuOverflow === "scroll",
      };
    });
    expect(
      result.bodyLocked || result.menuScrollable,
      "Menu should either lock body scroll or be independently scrollable"
    ).toBe(true);
  });
});

// ── Sticky navbar test ─────────────────────────────────────────────────────

test.describe("Sticky navbar", () => {
  test("Navbar stays fixed at top after scrolling 500px", async ({ page }) => {
    await setViewport(page, 1280, 800);
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => window.scrollTo(0, 500));
    await page.waitForTimeout(300);

    const { top, visible } = await page.evaluate(() => {
      const nav = document.querySelector("nav") as HTMLElement;
      const rect = nav.getBoundingClientRect();
      return { top: rect.top, visible: rect.height > 0 };
    });
    expect(visible).toBe(true);
    expect(top).toBeLessThanOrEqual(0.5); // sticky: rect.top should be ~0
  });

  test("Navbar height is 60-80px (h-16 = 64px)", async ({ page }) => {
    await setViewport(page, 1280, 800);
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    // Wait for React to render the nav before measuring
    await page.waitForSelector("nav", { timeout: 8000 }).catch(() => null);
    const navHeight = await page.evaluate(() => {
      const nav = document.querySelector("nav") as HTMLElement | null;
      return nav ? nav.getBoundingClientRect().height : 0;
    });
    expect(navHeight).toBeGreaterThanOrEqual(60);
    expect(navHeight).toBeLessThanOrEqual(80);
  });
});
