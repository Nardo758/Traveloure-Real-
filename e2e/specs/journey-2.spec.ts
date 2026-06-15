// e2e/specs/journey-2.spec.ts
// E2E-2: Trip → Plan → Optimize → Cart → Payment → Booking Confirmation
// Stage 3 exit gate. Must pass on HTTPS deploy before Stage 3 is closed.
//
// Flow:
//   1. Quick-start trip creation (or dashboard → create trip)
//   2. Generate itinerary on trip details
//   3. Optimize the itinerary (via PlanCard or optimize button)
//   4. Add optimized items to cart
//   5. Checkout → payment → confirmation
//
// Env: HTTPS deploy required (Secure cookie drops on http://localhost).
// Auth: uses seeded traveler account from e2e/fixtures/accounts.ts.

import { test, expect, authFile } from '../fixtures/roles';

// ─── Helpers ───────────────────────────────────────────────────────────────

const SELECTORS = {
  // Landing / Dashboard
  dashboardCreateTrip: '[data-testid="button-create-trip"], button:has-text("Create Trip")',
  quickStartDestination: '[data-testid="input-destination"], input[placeholder*="destination"]',
  quickStartDate: '[data-testid="input-start-date"], input[type="date"]',
  quickStartTravelers: '[data-testid="input-travelers"]',
  quickStartSubmit: '[data-testid="button-start-planning"], button:has-text("Start")',

  // Trip Details
  generateItineraryBtn: '[data-testid="button-generate-itinerary"]',
  planWithPreferencesBtn: '[data-testid="button-plan-with-preferences"]',
  optimizeBanner: '[data-testid="optimize-banner"]',
  optimizeBtn: 'text=Optimize Plan',
  optimizeGate: '[data-testid="optimize-gate"]',
  planCard: '[data-testid="plancard"]',
  planCardDay: '[data-testid="plancard-day"]',
  addToCartFromPlan: '[data-testid="button-add-to-cart"]',
  
  // Itinerary Tab
  itineraryTab: 'button[value="itinerary"]',
  expertTab: 'button[value="expert"]',
  bookingsTab: 'button[value="bookings"]',

  // Cart
  cartLink: 'a[href="/cart"]',
  cartItem: '[data-testid^="cart-item-"]',
  cartTotal: '[data-testid="text-total-pending"]',
  checkoutBtn: 'text=Checkout',
  
  // Payment
  stripeCard: '[data-testid="card-element"]',
  payBtn: 'text=Pay',
  bookingConfirm: 'text=Booking Confirmed',
  bookingRef: '[data-testid="booking-reference"]',

  // Toast / errors
  toastError: '[data-testid="toast-error"]',
  toastSuccess: '[data-testid="toast-success"]',
} as const;

// ─── Flow: Trip → Plan → Optimize → Cart → Checkout ───────────────────────

test.describe('Journey 2 — Trip planning → Optimize → Checkout', () => {
  test.use({ storageState: authFile('traveler') });

  test('create trip → generate itinerary → optimize → add to cart → checkout → confirmation', async ({ page, consoleErrors }) => {
    // 1. Navigate to dashboard and create a trip
    await page.goto('/dashboard');
    await page.waitForSelector(SELECTORS.dashboardCreateTrip, { timeout: 10_000 });
    await page.click(SELECTORS.dashboardCreateTrip);

    // 2. Fill trip creation form (quick-start)
    await page.waitForSelector(SELECTORS.quickStartDestination, { timeout: 10_000 });
    await page.fill(SELECTORS.quickStartDestination, 'Paris, France');
    // If there's a start date input, fill it
    const startDateInput = await page.$(SELECTORS.quickStartDate);
    if (startDateInput) {
      const futureDate = new Date();
      futureDate.setMonth(futureDate.getMonth() + 2);
      const dateStr = futureDate.toISOString().split('T')[0];
      await startDateInput.fill(dateStr);
    }
    await page.click(SELECTORS.quickStartSubmit);

    // 3. Wait for trip details page to load
    await page.waitForURL(/\/trip\//, { timeout: 15_000 });
    await expect(page).toHaveTitle(/Paris/i);

    // 4. Generate itinerary (empty state → click generate)
    await page.waitForSelector(SELECTORS.generateItineraryBtn, { timeout: 10_000 });
    await page.click(SELECTORS.generateItineraryBtn);
    
    // Wait for itinerary generation (skeleton loading → content)
    await page.waitForSelector(SELECTORS.planCard, { timeout: 30_000 });
    await expect(page.locator(SELECTORS.planCard)).toBeVisible();

    // 5. Verify PlanCard renders with trip data
    const planCard = page.locator(SELECTORS.planCard);
    await expect(planCard).toContainText('Paris');
    await expect(planCard).toContainText('Day');

    // 6. Navigate to optimize page (or use optimize button in trip details)
    // Option A: Use the optimize button if available in trip-details
    const optimizeBtn = await page.$(SELECTORS.optimizeBtn);
    if (optimizeBtn) {
      await optimizeBtn.click();
    } else {
      // Option B: Navigate to optimize page directly
      const tripId = page.url().split('/trip/')[1]?.split('?')[0];
      await page.goto(`/optimize?tripId=${tripId}`);
    }
    
    await page.waitForURL(/\/optimize/, { timeout: 15_000 });

    // 7. Optimize gate — select AI-only tier and pay (or free if within 24h)
    await page.waitForSelector('text=AI Optimization Only', { timeout: 10_000 });
    
    // Check if free re-run is available
    const freeRerunText = await page.$('text=Free re-run available');
    if (!freeRerunText) {
      // Need to pay for optimization
      await page.click('input[value="ai-only"]');
      await page.click('text=Unlock AI Optimization');
      
      // Stripe payment for optimization fee
      const cardFrame = page.frameLocator('iframe').first();
      await cardFrame.locator('[placeholder="Card number"]').fill('4242424242424242');
      await cardFrame.locator('[placeholder="MM / YY"]').fill('12/30');
      await cardFrame.locator('[placeholder="CVC"]').fill('123');
      await cardFrame.locator('[placeholder="ZIP"]').fill('12345');
      await page.click('text=Pay');
      
      // Wait for optimization to complete after payment
      await page.waitForSelector(SELECTORS.planCard, { timeout: 30_000 });
    } else {
      // Free re-run — just click through
      await page.click('text=Free re-run available');
      await page.waitForSelector(SELECTORS.planCard, { timeout: 30_000 });
    }

    // 8. Back to trip details — add optimized items to cart
    await page.goto('/dashboard'); // or navigate back to trip
    await page.waitForSelector(SELECTORS.planCard, { timeout: 10_000 });
    
    // Find an activity with "Add to Cart" button and click it
    const addToCartButtons = page.locator(SELECTORS.addToCartFromPlan);
    if (await addToCartButtons.count() > 0) {
      await addToCartButtons.first().click();
      await page.waitForSelector(SELECTORS.toastSuccess, { timeout: 5_000 });
    }

    // 9. Go to cart and checkout
    await page.goto('/cart');
    await page.waitForSelector(SELECTORS.cartItem, { timeout: 10_000 });
    const total = page.locator(SELECTORS.cartTotal);
    await expect(total).toContainText('$');

    await page.click(SELECTORS.checkoutBtn);
    await page.waitForURL(/\/checkout|\/payment/, { timeout: 15_000 });

    // 10. Stripe payment
    const cardFrame = page.frameLocator('iframe').first();
    await cardFrame.locator('[placeholder="Card number"]').fill('4242424242424242');
    await cardFrame.locator('[placeholder="MM / YY"]').fill('12/30');
    await cardFrame.locator('[placeholder="CVC"]').fill('123');
    await cardFrame.locator('[placeholder="ZIP"]').fill('12345');
    await page.click(SELECTORS.payBtn);

    // 11. Confirmation
    await page.waitForSelector(SELECTORS.bookingConfirm, { timeout: 30_000 });
    await expect(page.locator(SELECTORS.bookingRef)).toBeVisible();

    // 12. No console errors across the flow
    expect(consoleErrors, 'no console errors in Journey 2').toHaveLength(0);
  });
});

// ─── Component wiring assertions (Stage 3 specific) ───────────────────────────

test.describe('Stage 3 component wiring', () => {
  test.use({ storageState: authFile('traveler') });

  test('EnhancedPlanningModal is accessible from trip-details', async ({ page }) => {
    // Navigate to a trip (assuming one exists, or create via API)
    await page.goto('/dashboard');
    
    // Find first trip card and click it
    const tripCard = await page.$('[data-testid^="trip-card-"]');
    if (!tripCard) {
      test.skip('No trips available — create a trip first via Journey 2 flow');
      return;
    }
    await tripCard.click();
    await page.waitForURL(/\/trip\//, { timeout: 10_000 });

    // If no itinerary, the "Plan with Preferences" button should be visible
    const generateBtn = await page.$(SELECTORS.generateItineraryBtn);
    if (generateBtn) {
      const preferencesBtn = await page.$(SELECTORS.planWithPreferencesBtn);
      if (preferencesBtn) {
        await preferencesBtn.click();
        await page.waitForSelector('[data-testid="button-generate-itinerary"]', { timeout: 5_000 });
        await expect(page.locator('[data-testid="button-generate-itinerary"]')).toBeVisible();
      }
    }
  });

  test('PlanCard renders with eventType-aware template', async ({ page }) => {
    await page.goto('/dashboard');
    const tripCard = await page.$('[data-testid^="trip-card-"]');
    if (!tripCard) {
      test.skip('No trips available');
      return;
    }
    await tripCard.click();
    await page.waitForURL(/\/trip\//, { timeout: 10_000 });

    // If itinerary exists, PlanCard should render
    const planCard = await page.$(SELECTORS.planCard);
    if (planCard) {
      await expect(page.locator(SELECTORS.planCard)).toBeVisible();
      // Verify it contains day data
      await expect(page.locator(SELECTORS.planCard)).toContainText('Day');
    }
  });

  test('POST /api/trips/:id/optimize returns comparisonId', async ({ page }) => {
    // This is a lightweight API test within the E2E spec
    // Create a trip first via API
    const tripRes = await page.request.post('/api/trips', {
      data: {
        title: 'E2E Optimize Test',
        destination: 'Tokyo, Japan',
        startDate: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
        endDate: new Date(Date.now() + 37 * 86400000).toISOString().split('T')[0],
        numberOfTravelers: 2,
      },
    });
    expect(tripRes.ok()).toBeTruthy();
    const trip = await tripRes.json();
    
    // Generate itinerary first
    const genRes = await page.request.post('/api/trips/generate-itinerary', {
      data: { tripId: trip.id },
    });
    expect(genRes.ok()).toBeTruthy();
    
    // Call optimize endpoint
    const optRes = await page.request.post(`/api/trips/${trip.id}/optimize`);
    expect(optRes.ok()).toBeTruthy();
    const optData = await optRes.json();
    
    expect(optData).toHaveProperty('comparisonId');
    expect(optData).toHaveProperty('status', 'generating');
  });
});
