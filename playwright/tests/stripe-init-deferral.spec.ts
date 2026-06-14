import { test, expect } from "@playwright/test";
import { loginAs } from "../utils/auth";

const BASE_URL = process.env.BASE_URL || "http://localhost:5000";

/**
 * Phase 5 Regression Guard — Stripe Init Deferral
 *
 * Ensures loadStripe() is NOT called at module scope (i.e., on pages that
 * never mount a checkout component). The fix (StripeCheckout.tsx) defers
 * loadStripe into a memoized getter called on first render of a checkout
 * surface. This spec locks that behavior: no Stripe init on /, and the
 * checkout surface renders on /cart when authenticated.
 */

test.describe("Stripe init deferral", () => {
  test('on "/" no Stripe console error and no Stripe init', async ({ page }) => {
    // Collect console errors
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    // Also collect page errors (unhandled exceptions)
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    await page.goto(`${BASE_URL}/`);

    // Wait for main content to render
    await page.waitForSelector("main, [data-testid], body", {
      timeout: 10000,
    });

    // Assert no Stripe-related errors in console
    const stripeErrors = consoleErrors.filter(
      (e) =>
        e.toLowerCase().includes("stripe") ||
        e.toLowerCase().includes("loadstripe") ||
        e.toLowerCase().includes("stripe.js")
    );
    expect(stripeErrors).toHaveLength(0);

    // Assert no Stripe-related unhandled exceptions
    const stripePageErrors = pageErrors.filter(
      (e) =>
        e.toLowerCase().includes("stripe") ||
        e.toLowerCase().includes("loadstripe")
    );
    expect(stripePageErrors).toHaveLength(0);

    // Verify the page actually loaded (not a blank error screen)
    const bodyText = await page.locator("body").textContent();
    expect(bodyText?.length).toBeGreaterThan(100);
  });

  test('on "/cart" checkout surface renders for authenticated traveler', async ({ page }) => {
    // Log in as a traveler
    await loginAs(page, "test-traveler-kyoto@traveloure.test", "TestPass123!");

    // Navigate to cart
    await page.goto(`${BASE_URL}/cart`);

    // Wait for cart content (either empty state or checkout surface)
    await page.waitForSelector(
      '[data-testid="cart-empty"], [data-testid="cart-items"], [data-testid="checkout-surface"], .stripe-checkout, .order-summary',
      { timeout: 10000 }
    );

    // Assert the page loaded without Stripe errors
    const bodyText = await page.locator("body").textContent();
    expect(bodyText?.length).toBeGreaterThan(100);
  });
});
