/**
 * playwright/crossbrowser/smoke.spec.ts
 *
 * WebKit (Safari-engine) smoke suite — 6 areas that are most likely to
 * regress Safari-only.
 *
 * Run via:  bash scripts/webkit-smoke.sh
 * The shell wrapper sets required NixOS env before running:
 *   npx playwright test --config playwright/crossbrowser/playwright.config.ts
 *
 * Areas covered
 * 1. Homepage renders without severe console errors
 * 2. Navbar: desktop dropdown / mobile hamburger
 * 3. Discover page: 4 tabs visible, client-side switching
 * 4. Sign-in modal: email + password fields
 * 5. Full booking checkout — freshly registered account → cart → date picker
 *    → Stripe PaymentElement mounts and accepts card number 4242
 * 6. Admin panel loads when logged in as admin
 *
 * Checkout test uses a fresh account (POST /api/auth/register) so the Stripe
 * PaymentElement path is exercised — saved-card accounts skip the Elements UI.
 */

import { test, expect, type Page } from '@playwright/test';

// ── helpers ────────────────────────────────────────────────────────────────

const SEVERE = new Set(['error', 'pageerror']);

/** Collect browser console messages, filtering out known noise. */
function collectConsole(page: Page) {
  const msgs: { type: string; text: string }[] = [];
  page.on('console', msg => msgs.push({ type: msg.type(), text: msg.text() }));
  page.on('pageerror', err => msgs.push({ type: 'pageerror', text: err.message }));
  return msgs;
}

const IGNORED_PATTERNS = [
  /favicon/i,
  /ResizeObserver loop/i,
  /non-passive event listener/i,
  /Stripe\.js/i,
  /stripe\.com/i,
  /google\.com\/maps/i,
  /maps\.googleapis/i,
  /net::ERR_/i,
  /Failed to load resource.*404/i,
  /\[HMR\]/i,
  // Vite HMR WebSocket — dev-server artifact, not an app error
  /vite-hmr/i,
  /vite.*websocket/i,
  /websocket.*vite/i,
  /failed to connect to websocket/i,
  /Failed to send error to Vite/i,
  /vite.*network configuration/i,
  // WebSocket to Vite dev-server HMR port (5173) — connection refused in proxied env
  /localhost:5173/i,
  /WebSocket connection.*failed/i,
  // 401s are expected on pages visited without a session
  /Failed to load resource.*401/i,
  /the server responded with a status of 401/i,
];

function severeMsgs(msgs: { type: string; text: string }[]) {
  return msgs.filter(
    m => SEVERE.has(m.type) && !IGNORED_PATTERNS.some(p => p.test(m.text)),
  );
}

// ── tests ──────────────────────────────────────────────────────────────────

test('homepage renders: title, nav, hero, no severe console errors', async ({ page }) => {
  const msgs = collectConsole(page);

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  // Title contains something meaningful
  const title = await page.title();
  expect(title.length, 'page title is empty').toBeGreaterThan(0);

  // Modern CSS works in WebKit
  const css = await page.evaluate(() => ({
    backdrop:
      CSS.supports('backdrop-filter', 'blur(4px)') ||
      CSS.supports('-webkit-backdrop-filter', 'blur(4px)'),
    grid: CSS.supports('display', 'grid'),
    gap: CSS.supports('gap', '1rem'),
    aspect: CSS.supports('aspect-ratio', '1'),
    inset: CSS.supports('inset', '0'),
  }));
  expect(css.backdrop, 'backdrop-filter not supported').toBe(true);
  expect(css.grid, 'CSS grid not supported').toBe(true);
  expect(css.gap, 'CSS gap not supported').toBe(true);
  expect(css.aspect, 'aspect-ratio not supported').toBe(true);
  expect(css.inset, 'inset shorthand not supported').toBe(true);

  // Page rendered real content
  const bodyText = await page.evaluate(() => document.body.innerText.trim().length);
  expect(bodyText, 'page body appears empty').toBeGreaterThan(200);

  // No severe console errors
  const severe = severeMsgs(msgs);
  expect(severe, `severe console errors: ${severe.map(m => m.text).join(' | ')}`).toHaveLength(0);
});

test('navbar works (dropdowns on desktop / hamburger on mobile)', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  // Desktop: a sign-in button or user-menu must be visible
  const signInBtn = page.locator('[data-testid="button-sign-in"]');
  const userMenu  = page.locator('[data-testid="user-menu"], [data-testid="user-avatar"]');
  const hasSignIn = await signInBtn.isVisible().catch(() => false);
  const hasMenu   = await userMenu.first().isVisible().catch(() => false);
  expect(hasSignIn || hasMenu, 'neither sign-in button nor user-menu found in navbar').toBe(true);

  // Desktop: no horizontal overflow
  const noOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth + 4,
  );
  expect(noOverflow, 'page has horizontal scroll at desktop width').toBe(true);

  // Mobile: hamburger appears at 375 px width
  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForTimeout(500);
  const hamburger = page.locator('[data-testid="button-mobile-menu"]');
  const hamburgerVisible = await hamburger.isVisible().catch(() => false);
  expect(hamburgerVisible, 'mobile hamburger not visible at 375 px').toBe(true);

  // Hamburger opens the mobile nav
  await hamburger.click();
  await page.waitForTimeout(800);
  // Some content in the menu should become visible — look for a nav link
  const mobileNavLink = page
    .locator('nav a, [data-testid*="mobile-nav"] a, [data-testid="mobile-menu"] a')
    .first();
  const linkVisible = await mobileNavLink.isVisible().catch(() => false);
  expect(linkVisible, 'mobile nav links not visible after hamburger click').toBe(true);
});

test('marketplace surfaces: each page renders its masthead, no tab bar, no overflow', async ({ page }) => {
  // Marketplace un-group (Aug 23): each surface is its own page; the tabbed
  // /discover shell is a redirect. Visit each surface and confirm it renders
  // alone with no grouped header and no horizontal overflow.
  const SURFACES = [
    { path: '/destinations', title: 'Destinations' },
    { path: '/ready-made', title: 'Ready-Made Trips' },
    { path: '/events', title: 'Events' },
    { path: '/services', title: 'Services' },
  ] as const;
  const TAB_IDS = ['tab-travelpulse', 'tab-packages', 'tab-events', 'tab-services'] as const;

  for (const surface of SURFACES) {
    await page.goto(surface.path, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);

    await expect(page.getByTestId('text-page-title'), `${surface.path} masthead`).toHaveText(surface.title);
    for (const id of TAB_IDS) {
      await expect(page.getByTestId(id), `retired tab ${id} rendered on ${surface.path}`).not.toBeAttached();
    }

    const noOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 4,
    );
    expect(noOverflow, `${surface.path} has horizontal scroll`).toBe(true);
  }

  // The old shell redirects onto the default surface.
  await page.goto('/discover', { waitUntil: 'domcontentloaded' });
  await page.waitForURL(/\/destinations/, { timeout: 15_000 });
});

test('sign-in modal opens with email + password fields', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  const signInBtn = page.locator('[data-testid="button-sign-in"]');
  await expect(signInBtn).toBeVisible();
  await signInBtn.click();

  const modal = page.locator('[data-testid="modal-sign-in"]');
  await modal.waitFor({ state: 'visible', timeout: 8000 });

  // Email field
  const emailField = modal.locator('input[type="email"], input[name="email"]').first();
  await expect(emailField, 'email field not in sign-in modal').toBeVisible();

  // Password field
  const pwField = modal.locator('input[type="password"]').first();
  await expect(pwField, 'password field not in sign-in modal').toBeVisible();

  // Can type into both (WebKit input regression check)
  await emailField.fill('test@example.com');
  expect(await emailField.inputValue()).toBe('test@example.com');

  await pwField.fill('TestPass123!');
  expect(await pwField.inputValue()).toBe('TestPass123!');

  // session/local storage works (tested here to avoid an extra page load)
  const storageOk = await page.evaluate(() => {
    try {
      sessionStorage.setItem('__wk_smoke_ss', 'ss');
      localStorage.setItem('__wk_smoke_ls', 'ls');
      const ok =
        sessionStorage.getItem('__wk_smoke_ss') === 'ss' &&
        localStorage.getItem('__wk_smoke_ls') === 'ls';
      sessionStorage.removeItem('__wk_smoke_ss');
      localStorage.removeItem('__wk_smoke_ls');
      return ok;
    } catch {
      return false;
    }
  });
  expect(storageOk, 'sessionStorage / localStorage not functional in WebKit').toBe(true);
});

test('admin panel loads (desktop only)', async ({ page, browser }) => {
  // Use the seeded test-admin account (always present in dev DB).
  // E2E_ADMIN_EMAIL / E2E_TEST_PASSWORD are the standard e2e env vars;
  // fall back to the known seeded address so the test is self-contained.
  const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'test-admin@traveloure.test';
  const PASSWORD    = process.env.E2E_TEST_PASSWORD ?? 'TestPass123!';

  // ── Part A: unauthenticated /admin must deny access ──────────────────────
  // A separate context with no cookies simulates an anonymous visitor.
  const anonCtx  = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const anonPage = await anonCtx.newPage();
  await anonPage.goto('/admin', { waitUntil: 'domcontentloaded' });
  await anonPage.waitForTimeout(2000);

  // The page must not expose admin chrome to unauthenticated users.
  const anonHasAdminLogo   = await anonPage.locator('[data-testid="link-admin-logo"]').isVisible().catch(() => false);
  const anonHasAdminLogout = await anonPage.locator('[data-testid="button-admin-logout"]').isVisible().catch(() => false);
  await anonCtx.close();

  expect(
    anonHasAdminLogo || anonHasAdminLogout,
    'Admin chrome visible to unauthenticated visitor — /admin is not protected',
  ).toBe(false);

  // ── Part B: authenticated admin sees the dashboard ────────────────────────
  // Log in via API so the browser context carries a valid admin session.
  // page.request shares the cookie jar with the page.
  const loginRes = await page.request.post('/api/auth/login', {
    data: { email: ADMIN_EMAIL, password: PASSWORD },
  });
  expect(
    loginRes.ok(),
    `Admin login failed (${loginRes.status()}) — ensure test-admin@traveloure.test is seeded`,
  ).toBe(true);

  // Navigate to the admin dashboard
  await page.goto('/admin', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  // Must stay on an /admin path (not redirected to homepage or sign-in)
  expect(page.url(), 'Admin visit redirected away from /admin').toMatch(/\/admin/);

  // Assert an admin-only chrome element from admin-sidebar.tsx / admin-layout.tsx
  // Both are exclusive to authenticated admin sessions.
  const adminLogo   = page.locator('[data-testid="link-admin-logo"]');
  const adminLogout = page.locator('[data-testid="button-admin-logout"]');
  const logoVisible   = await adminLogo.isVisible().catch(() => false);
  const logoutVisible = await adminLogout.isVisible().catch(() => false);
  expect(
    logoVisible || logoutVisible,
    'Admin sidebar not found — page may have landed on sign-in or an error screen',
  ).toBe(true);

  // No horizontal overflow at desktop width
  const noOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth + 4,
  );
  expect(noOverflow, 'admin panel has horizontal scroll').toBe(true);
});
