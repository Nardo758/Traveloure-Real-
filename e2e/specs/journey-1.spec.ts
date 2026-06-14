// e2e/specs/journey-1.spec.ts
// E2E-1: Landing → Discover → Cart → Payment → Booking Confirmation
// Stage 1 exit gate. Must pass on HTTPS deploy before Stage 1 is closed.
//
// Two sub-flows:
//   A. Authed user: landing → discover → add to cart → cart → checkout → payment → confirmation
//   B. Guest user: landing → discover → add to cart (logged out) → sign in → cart/migrate → checkout → confirmation
//
// Env: HTTPS deploy required (Secure cookie drops on http://localhost).
// Auth: uses seeded traveler account from e2e/fixtures/accounts.ts.

import { test, expect, authFile } from '../fixtures/roles';

// ─── Helpers ───────────────────────────────────────────────────────────────

const SELECTORS = {
  // Landing
  heroSearch: '[data-testid="hero-search-input"]',
  heroCta: '[data-testid="hero-search-btn"]',
  discoverLink: 'a[href="/discover"]',

  // Discover
  servicesTab: '[data-testid="tab-services"]',
  serviceCard: '[data-testid^="card-service-"]',
  addToCartBtn: '[data-testid="button-add-to-cart"]',
  smartRec: '[data-testid^="service-rec-"]',
  expertMatchCard: '[data-testid^="card-plan-"]',
  escalationCta: '[data-testid="escalation-cta"]',

  // Cart
  cartLink: 'a[href="/cart"]',
  cartItem: '[data-testid^="cart-item-"]',
  cartTotal: '[data-testid="text-total-pending"]',
  cartEmpty: 'text=Cart is empty',
  resolveTripBtn: 'text=Prepare Trip',
  optimizeBtn: 'text=Optimize Plan',
  guestSignInPrompt: 'text=Sign in to book',

  // Sign-in (for guest path)
  signInEmail: 'input[type="email"]',
  signInPassword: 'input[type="password"]',
  signInSubmit: 'button[type="submit"]',

  // Checkout / Payment
  checkoutBtn: 'text=Checkout',
  stripeCard: '[data-testid="card-element"]',
  payBtn: 'text=Pay',
  bookingConfirm: 'text=Booking Confirmed',
  bookingRef: '[data-testid="booking-reference"]',

  // Toast / errors
  toastError: '[data-testid="toast-error"]',
  toastSuccess: '[data-testid="toast-success"]',
} as const;

async function addFirstServiceToCart(page) {
  await page.click(SELECTORS.servicesTab);
  await page.waitForSelector(SELECTORS.serviceCard, { timeout: 10_000 });
  const card = page.locator(SELECTORS.serviceCard).first();
  await card.click();
  await page.waitForSelector(SELECTORS.addToCartBtn, { timeout: 10_000 });
  await page.click(SELECTORS.addToCartBtn);
  await page.waitForTimeout(500);
}

async function signInAsTraveler(page) {
  const { email } = (await import('../fixtures/accounts')).ACCOUNTS.traveler;
  const { PASSWORD } = await import('../fixtures/accounts');
  await page.fill(SELECTORS.signInEmail, email);
  await page.fill(SELECTORS.signInPassword, PASSWORD);
  await page.click(SELECTORS.signInSubmit);
  await page.waitForURL(/\/dashboard|\/discover|\/cart/, { timeout: 15_000 });
}

// ─── Flow A: Authed traveler ────────────────────────────────────────────────

test.describe('Journey 1A — Authed traveler', () => {
  test.use({ storageState: authFile('traveler') });

  test('landing → discover → cart → checkout → confirmation', async ({ page, consoleErrors }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/traveloure/i);
    expect(consoleErrors).toHaveLength(0);

    await page.click(SELECTORS.discoverLink);
    await page.waitForURL(/\/discover/, { timeout: 10_000 });
    await expect(page.locator(SELECTORS.servicesTab)).toBeVisible();

    await expect(page.locator(SELECTORS.smartRec).first()).toBeVisible({ timeout: 5_000 });

    await addFirstServiceToCart(page);

    await page.goto('/cart');
    await page.waitForSelector(SELECTORS.cartItem, { timeout: 10_000 });
    const total = page.locator(SELECTORS.cartTotal);
    await expect(total).toContainText('$');

    await page.click(SELECTORS.resolveTripBtn);
    await page.waitForTimeout(1_000);
    await expect(page.locator(SELECTORS.cartItem).first()).toBeVisible();

    await page.click(SELECTORS.checkoutBtn);
    await page.waitForURL(/\/checkout|\/payment/, { timeout: 15_000 });

    const cardFrame = page.frameLocator('iframe').first();
    await cardFrame.locator('[placeholder="Card number"]').fill('4242424242424242');
    await cardFrame.locator('[placeholder="MM / YY"]').fill('12/30');
    await cardFrame.locator('[placeholder="CVC"]').fill('123');
    await cardFrame.locator('[placeholder="ZIP"]').fill('12345');

    await page.click(SELECTORS.payBtn);
    await page.waitForSelector(SELECTORS.bookingConfirm, { timeout: 30_000 });
    await expect(page.locator(SELECTORS.bookingRef)).toBeVisible();

    expect(consoleErrors, 'no console errors in Journey 1A').toHaveLength(0);
  });
});

// ─── Flow B: Guest → sign in → cart migrate → checkout ────────────────────

test.describe('Journey 1B — Guest path with cart migration', () => {
  test('landing → discover → add to cart (guest) → sign in → migrate → confirmation', async ({ page, consoleErrors }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/traveloure/i);

    await page.click(SELECTORS.discoverLink);
    await page.waitForURL(/\/discover/, { timeout: 10_000 });

    await addFirstServiceToCart(page);

    await page.goto('/cart');
    await expect(page.locator(SELECTORS.guestSignInPrompt)).toBeVisible();

    await page.click('text=Sign in');
    await page.waitForURL(/\/login|\/auth/, { timeout: 10_000 });
    await signInAsTraveler(page);

    await page.goto('/cart');
    await page.waitForSelector(SELECTORS.cartItem, { timeout: 10_000 });
    await expect(page.locator(SELECTORS.cartItem).first()).toBeVisible();

    await page.click(SELECTORS.resolveTripBtn);
    await page.waitForTimeout(1_000);

    await page.click(SELECTORS.checkoutBtn);
    await page.waitForURL(/\/checkout|\/payment/, { timeout: 15_000 });

    const cardFrame = page.frameLocator('iframe').first();
    await cardFrame.locator('[placeholder="Card number"]').fill('4242424242424242');
    await cardFrame.locator('[placeholder="MM / YY"]').fill('12/30');
    await cardFrame.locator('[placeholder="CVC"]').fill('123');
    await cardFrame.locator('[placeholder="ZIP"]').fill('12345');

    await page.click(SELECTORS.payBtn);
    await page.waitForSelector(SELECTORS.bookingConfirm, { timeout: 30_000 });
    await expect(page.locator(SELECTORS.bookingRef)).toBeVisible();

    expect(consoleErrors, 'no console errors in Journey 1B').toHaveLength(0);
  });
});

// ─── Component wiring assertions (Stage 1 specific) ───────────────────────────

test.describe('Stage 1 component wiring', () => {
  test.use({ storageState: authFile('traveler') });

  test('EscalationCTA renders in trip-details expert tab', async ({ page }) => {
    await page.goto('/my-trips');
    await page.waitForSelector('[data-testid^="trip-card-"]', { timeout: 10_000 });
    await page.locator('[data-testid^="trip-card-"]').first().click();
    await page.waitForURL(/\/trip\//, { timeout: 10_000 });
    await page.click('[data-testid="tab-expert"]');
    await page.waitForSelector(SELECTORS.escalationCta, { timeout: 5_000 });
    await expect(page.locator(SELECTORS.escalationCta)).toBeVisible();
  });

  test('ExpertMatchCard renders in discover with showExperts', async ({ page }) => {
    await page.goto('/discover?showExperts=true&destination=Kyoto');
    await page.waitForSelector(SELECTORS.expertMatchCard, { timeout: 10_000 });
    await expect(page.locator(SELECTORS.expertMatchCard).first()).toBeVisible();
  });

  test('SmartServiceRecommendations renders in discover for authed user', async ({ page }) => {
    await page.goto('/discover');
    await page.waitForSelector(SELECTORS.smartRec, { timeout: 10_000 });
    await expect(page.locator(SELECTORS.smartRec).first()).toBeVisible();
  });

  test('/local-experts route renders without 404', async ({ page }) => {
    await page.goto('/local-experts');
    await expect(page).not.toHaveURL(/404/);
    await expect(page.locator('text=Experts')).toBeVisible();
  });
});
