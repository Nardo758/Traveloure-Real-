/**
 * breakpoint-hamburger.spec.ts
 *
 * Responsive navbar behaviour across viewport breakpoints.
 *
 * Layout breakpoint: `lg` = 1024 px.
 *   < 1024 px  → hamburger button visible, desktop nav hidden, mobile panel
 *               renders on click (AnimatePresence motion.div)
 *   ≥ 1024 px  → hamburger hidden, desktop nav links visible
 *
 * Key data-testids (layout.tsx):
 *   button-mobile-menu         — hamburger toggle (div.flex.items-center.lg:hidden)
 *   button-mobile-sign-in      — sign-in CTA in mobile menu footer (unauthenticated)
 *   button-mobile-logout       — logout button inside mobile menu (authenticated)
 *   link-mobile-{name}         — each top-level nav item rendered as a link
 *   link-mobile-ways-to-earn   — "Ways to earn" leaf link
 *   button-nav-dropdown-{slug} — desktop dropdown triggers (hidden < lg)
 *
 * Tests are grouped into:
 *   A. Visibility — what shows / hides at each breakpoint
 *   B. Toggle     — open ↔ close behaviour of the mobile panel
 *   C. Content    — expected items inside the open mobile menu
 *   D. Navigation — tapping a link closes the menu and changes the URL
 */

import { test, expect, type Page } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5000';

// ── Viewport presets ──────────────────────────────────────────────────────────

const MOBILE_375  = { width: 375,  height: 667  };  // iPhone SE/8 portrait
const MOBILE_320  = { width: 320,  height: 568  };  // smallest common phone
const TABLET_768  = { width: 768,  height: 1024 };  // iPad portrait  (< lg)
const DESKTOP_1280 = { width: 1280, height: 800  };  // standard desktop (≥ lg)
const LG_BOUNDARY = { width: 1024, height: 768  };  // exact breakpoint edge

// ── Helpers ───────────────────────────────────────────────────────────────────

async function gotoHome(page: Page) {
  await page.goto(`${BASE_URL}/`, {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  });
  await page.waitForTimeout(1_500);
}

async function openMobileMenu(page: Page) {
  const btn = page.getByTestId('button-mobile-menu');
  await btn.waitFor({ state: 'visible', timeout: 8_000 });
  await btn.click();
  // Allow AnimatePresence to mount the panel
  await page.waitForTimeout(600);
}

// ─────────────────────────────────────────────────────────────────────────────
// Section A — Visibility per breakpoint
// ─────────────────────────────────────────────────────────────────────────────

test.describe('A — Hamburger visibility across breakpoints', () => {
  // ── A1: Mobile 375 ───────────────────────────────────────────────────────

  test('A1a: at 375 px hamburger button is visible', async ({ page }) => {
    await page.setViewportSize(MOBILE_375);
    await gotoHome(page);
    await expect(page.getByTestId('button-mobile-menu')).toBeVisible();
  });

  test('A1b: at 375 px desktop nav dropdown triggers are hidden', async ({ page }) => {
    await page.setViewportSize(MOBILE_375);
    await gotoHome(page);

    // Desktop dropdowns are wrapped in div.hidden.lg:flex — none should be visible
    const desktopDiscoverTrigger = page.getByTestId('button-nav-dropdown-discover');
    await expect(desktopDiscoverTrigger).not.toBeVisible();
  });

  // ── A2: Mobile 320 ───────────────────────────────────────────────────────

  test('A2: at 320 px hamburger button is visible and has non-zero size', async ({ page }) => {
    await page.setViewportSize(MOBILE_320);
    await gotoHome(page);

    const btn = page.getByTestId('button-mobile-menu');
    await expect(btn).toBeVisible();

    // Minimum tappable area check
    const box = await btn.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      expect(box.width).toBeGreaterThanOrEqual(36);
      expect(box.height).toBeGreaterThanOrEqual(36);
    }
  });

  // ── A3: Tablet 768 (still < lg) ─────────────────────────────────────────

  test('A3: at 768 px (tablet) hamburger is still visible — below lg breakpoint', async ({ page }) => {
    await page.setViewportSize(TABLET_768);
    await gotoHome(page);
    await expect(page.getByTestId('button-mobile-menu')).toBeVisible();
  });

  // ── A4: Desktop 1280 (≥ lg) ─────────────────────────────────────────────

  test('A4a: at 1280 px hamburger button is NOT visible', async ({ page }) => {
    await page.setViewportSize(DESKTOP_1280);
    await gotoHome(page);
    await expect(page.getByTestId('button-mobile-menu')).not.toBeVisible();
  });

  test('A4b: at 1280 px desktop nav dropdown triggers ARE visible', async ({ page }) => {
    await page.setViewportSize(DESKTOP_1280);
    await gotoHome(page);
    await expect(page.getByTestId('button-nav-dropdown-discover')).toBeVisible();
  });

  // ── A5: Exact lg boundary ────────────────────────────────────────────────

  test('A5: at exactly 1024 px hamburger is NOT visible (lg:hidden kicks in at ≥ lg)', async ({ page }) => {
    await page.setViewportSize(LG_BOUNDARY);
    await gotoHome(page);
    // Tailwind lg: starts at 1024 px (inclusive), so hamburger becomes hidden
    await expect(page.getByTestId('button-mobile-menu')).not.toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section B — Toggle open / close
// ─────────────────────────────────────────────────────────────────────────────

test.describe('B — Hamburger toggle behaviour', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(MOBILE_375);
  });

  test('B1: mobile menu panel is NOT in DOM before first click', async ({ page }) => {
    await gotoHome(page);

    // The panel mounts only via AnimatePresence; before click it is absent
    await expect(page.getByTestId('button-mobile-sign-in')).not.toBeAttached();
  });

  test('B2: clicking hamburger mounts and reveals the mobile menu panel', async ({ page }) => {
    await gotoHome(page);
    await openMobileMenu(page);

    // Sign-in CTA in the mobile menu footer confirms panel is open
    await expect(page.getByTestId('button-mobile-sign-in')).toBeVisible();
  });

  test('B3: clicking hamburger a second time closes (removes) the mobile menu panel', async ({ page }) => {
    await gotoHome(page);
    await openMobileMenu(page);

    // Confirm open
    await expect(page.getByTestId('button-mobile-sign-in')).toBeVisible();

    // Close
    await page.getByTestId('button-mobile-menu').click();
    await page.waitForTimeout(600); // AnimatePresence exit animation

    await expect(page.getByTestId('button-mobile-sign-in')).not.toBeAttached();
  });

  test('B4: hamburger icon switches from Menu to X (and back) on toggle', async ({ page }) => {
    await gotoHome(page);

    const btn = page.getByTestId('button-mobile-menu');

    // Before open: Menu icon — its svg aria role or the absence of X
    // The button renders either <Menu> or <X> from lucide-react.
    // We check CSS class 'block' on each icon via the icon wrapper.
    // Simplest reliable check: aria-label or accessible name change is not set,
    // so we compare the inner HTML size as a proxy for icon swap.
    const htmlBefore = await btn.innerHTML();

    await btn.click();
    await page.waitForTimeout(300);

    const htmlAfter = await btn.innerHTML();
    // The SVG path data changes when the icon swaps — the HTML strings must differ
    expect(htmlBefore).not.toEqual(htmlAfter);

    // Close again — should revert
    await btn.click();
    await page.waitForTimeout(300);
    const htmlReverted = await btn.innerHTML();
    expect(htmlReverted).toEqual(htmlBefore);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section C — Mobile menu content (unauthenticated)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('C — Mobile menu content for unauthenticated users', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(MOBILE_375);
    await gotoHome(page);
    await openMobileMenu(page);
  });

  test('C1: "Ways to earn" nav link is present in mobile menu', async ({ page }) => {
    await expect(page.getByTestId('link-mobile-ways-to-earn')).toBeVisible();
  });

  test('C2: sign-in CTA button is visible in mobile menu footer', async ({ page }) => {
    await expect(page.getByTestId('button-mobile-sign-in')).toBeVisible();
  });

  test('C3: partner role buttons are rendered in mobile menu footer', async ({ page }) => {
    // "Local Expert" partner CTA is generated from the partner array
    await expect(page.getByTestId('button-mobile-local-expert')).toBeVisible();
  });

  test('C4: mobile menu does not overflow viewport width at 375 px', async ({ page }) => {
    const menuPanel = page.locator('.lg\\:hidden.border-t.border-border.bg-background');
    const box = await menuPanel.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      // Panel must not spill beyond the viewport right edge
      expect(box.x + box.width).toBeLessThanOrEqual(375 + 2); // 2px tolerance
    }
  });

  test('C5: mobile menu is vertically scrollable when content exceeds viewport', async ({ page }) => {
    // The menu container has overflow-y-auto — confirm it has a scroll container
    const menuPanel = page.locator('.lg\\:hidden.border-t.border-border.bg-background');
    const overflowY = await menuPanel.evaluate(el =>
      window.getComputedStyle(el).overflowY,
    );
    // Should be 'auto' or 'scroll' for scrollability
    expect(['auto', 'scroll']).toContain(overflowY);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section D — Navigation from mobile menu
// ─────────────────────────────────────────────────────────────────────────────

test.describe('D — Tapping a mobile menu link navigates and closes the panel', () => {
  test('D1: tapping "Ways to earn" link navigates to /earn and closes menu', async ({ page }) => {
    await page.setViewportSize(MOBILE_375);
    await gotoHome(page);
    await openMobileMenu(page);

    await page.getByTestId('link-mobile-ways-to-earn').click();
    // Allow navigation
    await page.waitForTimeout(1_200);

    // URL changed to /earn
    expect(page.url()).toContain('/earn');

    // Mobile menu is now closed (panel unmounted by onClick handler)
    await expect(page.getByTestId('button-mobile-sign-in')).not.toBeAttached();
  });

  test('D2: at 320 px hamburger tap, menu open, link tap — all work correctly', async ({ page }) => {
    await page.setViewportSize(MOBILE_320);
    await gotoHome(page);
    await openMobileMenu(page);

    // Menu content visible at 320 px
    await expect(page.getByTestId('button-mobile-sign-in')).toBeVisible();

    // Navigate via menu
    await page.getByTestId('link-mobile-ways-to-earn').click();
    await page.waitForTimeout(1_200);
    expect(page.url()).toContain('/earn');
  });
});
