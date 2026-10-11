// e2e/specs/journey-1.spec.ts
// E2E-1: Landing → Discover → Cart → Payment → Booking Confirmation
// Stage 1 exit gate.
//
// Timeouts: Replit Vite dev server needs up to ~50 s to cold-start compile the
// JS bundle. All link-logo / page-element waits use 90 s to be safe. Data-
// dependent journey steps (services, trips) use conditional test.skip() so they
// show as "skipped" rather than "failed" when the DB isn't seeded.

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
  navLogo: '[data-testid="link-logo"]',
  discoverLink: 'a[href="/discover"]',
  servicesTab: '[data-testid="tab-services"]',
  serviceCard: '[data-testid^="card-service-"]',
  addToCartBtn: '[data-testid^="button-add-to-cart-"]',
  smartRec: '[data-testid^="service-rec-"]',
  expertMatchCard: '[data-testid^="card-expert-match-"]',
  escalationCta: '[data-testid="plancard-escalation-cta"]',
  cartLink: 'a[href="/cart"]',
  cartItem: '[data-testid^="cart-item-"]',
  cartTotal: '[data-testid="text-total"]',
  resolveTripBtn: 'text=Prepare Trip',
  guestSignInPrompt: 'text=Sign in to book',
  signInEmail: 'input[type="email"]',
  signInPassword: 'input[type="password"]',
  signInSubmit: 'button[type="submit"]',
  checkoutBtn: 'text=Checkout',
  payBtn: 'text=Pay',
  bookingConfirm: 'text=Booking Confirmed',
  bookingRef: '[data-testid="booking-reference"]',
  tripCard: '[data-testid^="trip-card-"]',
  expertTab: '[data-testid="tab-expert"]',
  roleSwitcher: '[data-testid="role-switcher"]',
} as const;

/** Wait for the nav logo with a generous cold-start budget. */
async function waitForNav(page) {
  await page.waitForSelector(SELECTORS.navLogo, { timeout: 90_000 });
}

/** Check whether a selector resolves within a short window; return count. */
async function countVisible(page, selector: string, ms = 5_000): Promise<number> {
  try {
    await page.waitForSelector(selector, { timeout: ms });
    return await page.locator(selector).count();
  } catch {
    return 0;
  }
}

// ─── Flow A: Authed traveler ────────────────────────────────────────────────

// ─── Flow B: Guest → sign in → cart migrate → checkout ────────────────────

// ─── Component wiring assertions (Stage 1) ────────────────────────────────

test.describe('Stage 1 component wiring', () => {
  test.use({ storageState: authFile('traveler') });

  test('B10 retired (smoke 12 S12-5): /trip/:id draws no EscalationCTA — Trip Card or not-final notice', async ({ page }) => {
    await page.goto('/my-trips', { waitUntil: 'domcontentloaded' });
    const tripCount = await countVisible(page, SELECTORS.tripCard, 30_000);
    if (tripCount === 0) {
      console.log('EscalationCTA: no trips found — skipping');
      test.skip();
      return;
    }

    // Trip Card rebuild Phase 3b (ledger 2026-08-31-manifest-is-the-boundary): the duplicate
    // EscalationCTA on the (now removed) trip-details Expert tab is gone. B10 — the must-not-regress
    // escalation CTA — is the full-stage PlanCard's, which /trip/:id renders only once a trip is
    // FINALIZED; a not-yet-final trip renders the honest "Not final yet" notice + one action to the
    // slip (the Trip Card does not exist before Make final). Assert whichever ratified state applies.
    // The My Plans tile is FINAL-AWARE (ledger 2026-08-31-stage-a-dashboard — asserted by the very
    // next test in this file): a PRE-final plan's tile lands on /plans/:id, never /trip/:id. So
    // clicking the tile and waiting for /trip/ could only ever reach the route for a plan that is
    // already final, and it timed out on a pre-final one — a stale navigation assumption, not a
    // product regression. Address /trip/:id directly from the tile's own id; that route is what
    // Locked Decision 42 D8 rules on, and both of its ratified states are asserted below.
    const tile = page.locator(SELECTORS.tripCard).first();
    const tileTestId = await tile.getAttribute('data-testid');
    const tripId = tileTestId?.replace('trip-card-', '');
    expect(tripId, 'the My Plans tile carries a trip id').toBeTruthy();
    await page.goto(`/trip/${tripId}`, { waitUntil: 'domcontentloaded' });

    await Promise.race([
      page.waitForSelector('[data-testid="trip-card-page"]', { timeout: 30_000 }).catch(() => null),
      page.waitForSelector('[data-testid="trip-not-final-notice"]', { timeout: 30_000 }).catch(() => null),
    ]);

    // Smoke 12 S12-5 (decision-maker, Oct 6, 2026): the full-stage EscalationCTA could never render
    // here — this page passes `routingReadOnly`, which suppressed it — and is RETIRED. The one expert
    // door is the slip's handoff chooser (R324). The pin is amended to its absence, on either state.
    await expect(page.locator(SELECTORS.escalationCta)).toHaveCount(0);
    if (await page.locator('[data-testid="trip-card-page"]').isVisible().catch(() => false)) {
      return;
    }

    // Not finalized → the Trip Card doesn't exist yet; the honest notice
    // and its SINGLE action to the slip must render instead (Locked Decision 42 D8). "One action"
    // is asserted as a count, not implied by naming one testid — a second escape hatch appearing
    // beside it is the thing D8 forbids, and a bare visibility check would not see it.
    const notice = page.locator('[data-testid="trip-not-final-notice"]');
    await expect(notice).toBeVisible();
    await expect(notice.locator('a')).toHaveCount(1);
    await expect(page.locator('[data-testid="button-go-to-slip"]')).toBeVisible();
    await page.locator('[data-testid="button-go-to-slip"]').click();
    await page.waitForURL(new RegExp(`/plans/${tripId}`), { timeout: 15_000 });
  });

  test('My Plans tile is final-aware: View Trip Card (post-final) XOR Open slip (pre-final)', async ({ page }) => {
    // Trip Card rebuild Phase 4 (ledger 2026-08-31-stage-a-dashboard): each My Plans tile flips on
    // ONE fact — does a trip_finals version exist. Post-final: a green "Final · v{N}" chip + primary
    // "View Trip Card" → /trip/:id. Pre-final: primary "Open slip" → /plans/:id. Exactly one primary
    // renders per tile. Seed data may be either state, so assert whichever applies to the first tile
    // (same defensive posture as the B10 test above).
    await page.goto('/my-trips', { waitUntil: 'domcontentloaded' });
    const tripCount = await countVisible(page, SELECTORS.tripCard, 30_000);
    if (tripCount === 0) {
      console.log('My Plans final-aware: no trips found — skipping');
      test.skip();
      return;
    }

    const firstTile = page.locator(SELECTORS.tripCard).first();
    const testId = await firstTile.getAttribute('data-testid');
    const tripId = testId?.replace('trip-card-', '');
    expect(tripId, 'the tile carries a trip id').toBeTruthy();

    const viewTripCard = page.locator(`[data-testid="button-view-trip-card-${tripId}"]`);
    const openSlip = page.locator(`[data-testid="button-open-slip-${tripId}"]`);
    const hasViewTripCard = await viewTripCard.isVisible().catch(() => false);
    const hasOpenSlip = await openSlip.isVisible().catch(() => false);
    // XOR — exactly one primary action renders, never both, never neither.
    expect(hasViewTripCard).not.toBe(hasOpenSlip);

    if (hasViewTripCard) {
      // Post-final: the Final chip is present and the primary lands on the Trip Card (/trip/:id).
      await expect(page.locator(`[data-testid="chip-final-${tripId}"]`)).toBeVisible();
      await viewTripCard.click();
      await page.waitForURL(new RegExp(`/trip/${tripId}`), { timeout: 10_000 });
    } else {
      // Pre-final: no Final chip; the primary lands on the slip (/plans/:id).
      await expect(page.locator(`[data-testid="chip-final-${tripId}"]`)).toHaveCount(0);
      await openSlip.click();
      await page.waitForURL(new RegExp(`/plans/${tripId}`), { timeout: 10_000 });
    }
  });

  test('ExpertMatchCard renders in discover with showExperts', async ({ page }) => {
    await page.goto('/discover?showExperts=true&destination=Kyoto', { waitUntil: 'domcontentloaded' });
    // Wait for nav to confirm page rendered, then scroll to trigger intersection observer.
    await waitForNav(page);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    // 90 s: covers Vite cold-start + Grok 8 s abort + fallback + Replit latency.
    await page.waitForSelector(SELECTORS.expertMatchCard, { timeout: 90_000 });
    await expect(page.locator(SELECTORS.expertMatchCard).first()).toBeVisible();
  });

});
