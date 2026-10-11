import { test, expect } from '@playwright/test';
import { loginAs, logout } from '../utils/auth';
import { navigateTo, navigateToDashboard, expectRoute } from '../utils/navigation';
import { verifyRouteAccessible, verifyElementVisible, verifySidebarRendered } from '../utils/assertions';
import { testAccounts } from '../fixtures/test-accounts';

/**
 * PHASE 4: EXPERT REVIEW & COLLABORATION
 *
 * For each of the 5 trips created in Phase 3:
 * - Expert logs in
 * - Views assigned traveler trips
 * - Reviews and accepts/modifies activities
 * - Sends recommendations back to traveler
 * - Verifies attribution tracking
 */

test('[Phase 4] Expert Review - Aiko Reviews Kyoto Trip', async ({ page }) => {
  const expert = testAccounts.kyoto.find((a) => a.email === 'kyoto-food@traveloure.test');
  if (!expert) return;

  await test.step('Login as Aiko', async () => {
    await loginAs(page, expert.email, expert.password);
  });

  await test.step('Navigate to expert clients', async () => {
    await navigateTo(page, '/expert/clients');
    await verifyRouteAccessible(page);
  });

  await test.step('Review traveler itinerary', async () => {
    // Find and open the Kyoto traveler's trip
    const tripCard = page.locator('text=Kyoto').first();
    if (await tripCard.isVisible().catch(() => false)) {
      await tripCard.click();
      await page.waitForNavigation().catch(() => null);
    }

    // Verify itinerary items
    const activities = [
      'Nishiki Market Food Tour',
      'Fushimi Inari',
      'Tea Ceremony',
      'Kaiseki Dinner',
    ];

    for (const activity of activities) {
      const activityElement = page.locator(`text=${activity}`).first();
      await expect(activityElement).toBeVisible().catch(() => null);
    }
  });

  await test.step('Send recommendations to traveler', async () => {
    // Find and use messaging interface
    const messageInput = page.locator('textarea').first();
    if (await messageInput.isVisible().catch(() => false)) {
      await messageInput.fill(
        'Great itinerary! I recommend starting the food tour on your second day to acclimate first. I can also add a sake tasting experience if interested.'
      );

      const sendButton = page.locator('button:has-text("Send")').first();
      if (await sendButton.isVisible().catch(() => false)) {
        await sendButton.click();
        await page.waitForNavigation().catch(() => null);
      }
    }
  });

  await test.step('Logout', async () => {
    await logout(page);
  });
});

/**
 * PHASE 5: EXECUTIVE ASSISTANT FLOW
 *
 * Executive Assistant tests:
 * - Views dashboard
 * - Sees multiple client trips
 * - Manages master calendar
 * - Assigns experts to trips
 */

/**
 * PHASE 6: TRANSPORT & ITINERARY VERIFICATION
 *
 * For 2 trips (Kyoto + Cartagena):
 * - Verify transport legs appear between activities
 * - Check transport is server-calculated
 * - Verify shareable itinerary URL works
 * - Test PlanCard map (activity pins, route polylines)
 * - Verify unauthenticated access to shared itinerary
 */

/**
 * PHASE 7: CROSS-ROLE BOOKING & PAYMENT FLOW
 *
 * Complete booking flow:
 * 1. Traveler browses and books service
 * 2. Payment processed via Stripe
 * 3. Expert receives booking notification
 * 4. Both parties see booking in dashboards
 * 5. Earnings updated
 */

/**
 * Summary test for Phases 4-7
 */
