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

const filterJsErrors = (errs: string[]) =>
  errs.filter(
    (e) =>
      !e.includes('Failed to load resource') &&
      !e.includes('ERR_') &&
      !e.includes('net::') &&
      !e.includes('[vite]') &&
      !e.includes('Warning:') &&
      !e.includes('ResizeObserver') &&
      !e.includes('Non-Error'),
  );

const SELECTORS = {
  // Landing
  navLogo: '[data-testid="link-logo"]',
  heroSearch: '[data-testid="hero-search-input"]',
  heroCta: '[data-testid="hero-search-btn"]',
  discoverLink: 'a[href="/discover"]',

  // Discover
  servicesTab: '[data-testid="tab-services"]',
  serviceCard: '[data-testid^="card-service-"]',
  addToCartBtn: '[data-testid^="button-add-to-cart-"]',
  smartRec: '[data-testid^="service-rec-"]',
  expertMatchCard: '[data-testid^="card-expert-match-"]',
  escalationCta: '[data-testid="plancard-escalation-cta"]',

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
  // Navigate directly to the services tab so cards are pre-loaded — avoids a
  // click-then-wait race on the Replit dev server.
  await page.goto('/discover?tab=services', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(SELECTORS.serviceCard, { timeout: 30_000 });
  const card = page.locator(SELECTORS.serviceCard).first();
  await card.click();
  await page.waitForSelector(SELECTORS.addToCartBtn, { timeout: 10_000 });
  await page.click(SELECTORS.addToCartBtn);
  // Wait for success toast or cart indicator update
  await page.waitForTimeout(500); // toast animation
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
    // 1. Landing page renders.
    // domcontentloaded avoids blocking on Google Fonts.  We check for the nav
    // logo rather than document.title because React's SEOHead transiently clears
    // the static title during hydration on the Replit dev server.
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector(SELECTORS.navLogo, { timeout: 20_000 });
    expect(filterJsErrors(consoleErrors)).toHaveLength(0);

    // 2. Navigate to discover
    await page.click(SELECTORS.discoverLink);
    await page.waitForURL(/\/discover/, { timeout: 10_000 });
    await expect(page.locator(SELECTORS.servicesTab)).toBeVisible();

    // 3. Verify SmartServiceRecommendations surfaced for authed user.
    // Scroll to the bottom to trigger any intersection-observer-gated components.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(page.locator(SELECTORS.smartRec).first()).toBeVisible({ timeout: 40_000 });

    // 4. Add service to cart (navigates to /discover?tab=services internally)
    await addFirstServiceToCart(page);

    // 5. Go to cart, verify item present
    await page.goto('/cart');
    await page.waitForSelector(SELECTORS.cartItem, { timeout: 10_000 });
    const total = page.locator(SELECTORS.cartTotal);
    await expect(total).toContainText('$');

    // 6. Resolve trip (POST /api/cart/resolve-trip)
    await page.click(SELECTORS.resolveTripBtn);
    await page.waitForTimeout(1_000); // wait for trip resolution
    // After resolve-trip, cart should show trip context
    await expect(page.locator(SELECTORS.cartItem).first()).toBeVisible();

    // 7. Checkout
    await page.click(SELECTORS.checkoutBtn);
    await page.waitForURL(/\/checkout|\/payment/, { timeout: 15_000 });

    // 8. Stripe payment (test mode)
    // In Stripe test mode, card input is deterministic
    const cardFrame = page.frameLocator('iframe').first();
    await cardFrame.locator('[placeholder="Card number"]').fill('4242424242424242');
    await cardFrame.locator('[placeholder="MM / YY"]').fill('12/30');
    await cardFrame.locator('[placeholder="CVC"]').fill('123');
    await cardFrame.locator('[placeholder="ZIP"]').fill('12345');

    await page.click(SELECTORS.payBtn);

    // 9. Confirmation
    await page.waitForSelector(SELECTORS.bookingConfirm, { timeout: 30_000 });
    await expect(page.locator(SELECTORS.bookingRef)).toBeVisible();

    // 10. No JS errors across the entire flow (network noise filtered)
    expect(filterJsErrors(consoleErrors), 'no JS errors in Journey 1A').toHaveLength(0);
  });
});

// ─── Flow B: Guest → sign in → cart migrate → checkout ────────────────────

test.describe('Journey 1B — Guest path with cart migration', () => {
  test('landing → discover → add to cart (guest) → sign in → migrate → confirmation', async ({ page, consoleErrors, browser }) => {
    // 1. Landing page renders (no auth).
    // Check nav logo rather than title — see Journey 1A note above.
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector(SELECTORS.navLogo, { timeout: 20_000 });

    // 2. Navigate to discover
    await page.click(SELECTORS.discoverLink);
    await page.waitForURL(/\/discover/, { timeout: 10_000 });

    // 3. Add service to cart as guest
    // Guest sees sign-in prompt; cart should still work with guest session
    await addFirstServiceToCart(page);

    // 4. Guest sees sign-in prompt in cart
    await page.goto('/cart');
    await expect(page.locator(SELECTORS.guestSignInPrompt)).toBeVisible();

    // 5. Sign in — app uses a modal, not a redirect to /login
    await page.click('text=Sign in');
    // Wait for the sign-in form to appear inside the modal
    await page.waitForSelector('input[type="email"]', { timeout: 10_000 });
    await signInAsTraveler(page);

    // 6. Cart migration should have happened automatically (App.tsx:780 + SignInModal.tsx:49)
    // After sign-in, navigate to cart and verify items migrated
    await page.goto('/cart');
    await page.waitForSelector(SELECTORS.cartItem, { timeout: 10_000 });
    await expect(page.locator(SELECTORS.cartItem).first()).toBeVisible();

    // 7. Resolve trip
    await page.click(SELECTORS.resolveTripBtn);
    await page.waitForTimeout(1_000);

    // 8. Checkout → payment → confirmation
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

    // 9. No JS errors (network noise filtered)
    expect(filterJsErrors(consoleErrors), 'no JS errors in Journey 1B').toHaveLength(0);
  });
});

// ─── Component wiring assertions (Stage 1 specific) ───────────────────────────

test.describe('Stage 1 component wiring', () => {
  test.use({ storageState: authFile('traveler') });

  test('EscalationCTA renders in trip-details expert tab', async ({ page }) => {
    // Navigate to a trip with generated itinerary.
    await page.goto('/my-trips', { waitUntil: 'domcontentloaded' });
    // 30 s: API call to load trips can be slow on a shared Replit dev server.
    await page.waitForSelector('[data-testid^="trip-card-"]', { timeout: 30_000 });
    await page.locator('[data-testid^="trip-card-"]').first().click();
    await page.waitForURL(/\/trip\//, { timeout: 10_000 });
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('[data-testid="tab-expert"]', { timeout: 15_000 });

    // Click expert tab
    await page.click('[data-testid="tab-expert"]');
    // Allow the TabsContent to become active and EscalationCTA to mount.
    // 20 s covers slow CI→Replit API round-trips.
    await page.waitForSelector(SELECTORS.escalationCta, { timeout: 20_000 });
    await expect(page.locator(SELECTORS.escalationCta)).toBeVisible();
  });

  test('ExpertMatchCard renders in discover with showExperts', async ({ page }) => {
    await page.goto('/discover?showExperts=true&destination=Kyoto', { waitUntil: 'domcontentloaded' });
    // Wait for page to settle, then scroll to trigger any intersection-observer-
    // gated components (AIMatchedExpertsSection uses isVisible prop).
    await page.waitForSelector(SELECTORS.navLogo, { timeout: 15_000 });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    // Grok call has an 8 s abort; fallback populates cards within ~9 s total.
    // 45 s budget covers the full Grok + fallback cycle plus Replit latency.
    await page.waitForSelector(SELECTORS.expertMatchCard, { timeout: 45_000 });
    await expect(page.locator(SELECTORS.expertMatchCard).first()).toBeVisible();
  });

  test('SmartServiceRecommendations renders in discover for authed user', async ({ page }) => {
    await page.goto('/discover', { waitUntil: 'domcontentloaded' });
    // Scroll to bottom: SmartServiceRecommendations may be below the fold and
    // gated by an intersection observer.
    await page.waitForSelector(SELECTORS.navLogo, { timeout: 15_000 });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    // Authenticated user context loads async; 40 s covers slow Replit round-trips.
    await page.waitForSelector(SELECTORS.smartRec, { timeout: 40_000 });
    await expect(page.locator(SELECTORS.smartRec).first()).toBeVisible();
  });

  test('/local-experts route renders without 404', async ({ page }) => {
    await page.goto('/local-experts', { waitUntil: 'domcontentloaded' });
    await expect(page).not.toHaveURL(/404/);
    // Role switcher is unconditionally rendered in the hero section of ExpertsPage.
    // 40 s budget for slow CI→Replit round-trips.
    await expect(page.locator('[data-testid="role-switcher"]')).toBeVisible({ timeout: 40_000 });
  });
});
