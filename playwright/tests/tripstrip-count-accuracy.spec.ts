import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

/**
 * TripStrip count accuracy — Suite: cart mutations
 *
 * Regression guard for Task 942 which fixed two slug-scoped React-Query
 * invalidations in cart.tsx.  Before the fix:
 *
 *   convertToItineraryMutation.onSuccess → invalidateQueries({ queryKey: ["/api/cart", experienceSlug] })
 *   checkoutMutation.onSuccess           → invalidateQueries({ queryKey: ["/api/cart", experienceSlug] })
 *
 * The TripStrip uses the BARE key ["/api/cart"] (no slug), so the slug-qualified
 * invalidation left the chip count stale after both actions.
 *
 * Tests
 * ──────
 * A  Static  — convertToItineraryMutation.onSuccess uses the bare /api/cart key
 * B  Static  — checkoutMutation.onSuccess uses the bare /api/cart key
 * C  Browser — after convert-to-itinerary, the chip count drops while the user
 *              is still on a Layout page (navigation blocked, TripStrip mounted)
 * D  Browser — after checkout the chip count drops while the user is still on
 *              the /cart URL (checkout mocked to return a paymentIntent so the
 *              flow stays on the payment sub-step, not navigating away)
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.BASE_URL || "http://localhost:5000";

function uid(prefix = "") {
  return prefix + crypto.randomUUID().replace(/-/g, "").slice(0, 10);
}

const CART_FILE = path.resolve(__dirname, "../../client/src/pages/cart.tsx");

// ── Shared API helpers ─────────────────────────────────────────────────────

async function registerFreshUser(page: import("@playwright/test").Page) {
  const res = await page.request.post(`${BASE_URL}/api/auth/register`, {
    data: {
      email: `e2e-tripstrip-${uid()}@example.com`,
      password: "TripStrip123!",
      firstName: "Strip",
      lastName: "Tester",
      userType: "user",
    },
  });
  expect(
    res.status(),
    `Registration failed (${res.status()}): ${await res.text()}`
  ).toBe(201);
}

/**
 * Add a content-type item (activity) to the authenticated user's cart via API.
 * Content items (contentType + contentId set) show the "Start Planning" button
 * in cart.tsx and can be converted to itinerary items.
 */
async function addContentItemToCart(page: import("@playwright/test").Page) {
  const res = await page.request.post(`${BASE_URL}/api/cart`, {
    data: {
      contentType: "activity",
      contentId: `e2e-activity-${uid()}`,
      contentMeta: {
        name: "E2E TripStrip Test Activity",
        description: "Playwright TripStrip regression",
        city: "Paris",
      },
      quantity: 1,
    },
  });
  expect(
    res.status(),
    `POST /api/cart failed (${res.status()}): ${await res.text()}`
  ).toBe(201);
  const item = await res.json();
  expect(item.id, "Cart item must have an id").toBeTruthy();
  return item as { id: string };
}

/**
 * Seed a minimal trip context in localStorage so TripStrip renders
 * (it requires at least one context field OR items in cart).
 * Must be called after page.goto() so localStorage is on the right origin.
 */
async function seedTripContext(page: import("@playwright/test").Page) {
  await page.evaluate(() => {
    localStorage.setItem(
      "traveloure_trip_context",
      JSON.stringify({ destination: "Paris, France" })
    );
  });
}

// ── A. Static: convertToItineraryMutation invalidates bare /api/cart ───────

test.describe("TripStrip chip count accuracy (Suite: cart mutations)", () => {
  test(
    "A — cart.tsx convertToItineraryMutation.onSuccess invalidates the bare ['/api/cart'] key (no slug suffix)",
    () => {
      const src = fs.readFileSync(CART_FILE, "utf-8");

      // Locate the onSuccess block of convertToItineraryMutation.
      // We match from the opening of the mutation up to the setLocation call
      // that signals end of onSuccess (navigate to trip page).
      const convertBlock = src.match(
        /convertToItineraryMutation\s*=\s*useMutation\(\{[\s\S]*?onSuccess[\s\S]*?setLocation\(`\/trip\/\$\{/
      );
      expect(
        convertBlock,
        "convertToItineraryMutation block not found in cart.tsx — pattern may have changed"
      ).not.toBeNull();

      const block = convertBlock![0];

      // Must contain the bare key invalidation (no trailing slug argument)
      expect(
        /invalidateQueries\(\s*\{\s*queryKey\s*:\s*\[\s*["']\/api\/cart["']\s*\]/.test(block),
        'convertToItineraryMutation.onSuccess must call invalidateQueries({ queryKey: ["/api/cart"] }) ' +
          "(bare key, no slug) so TripStrip refreshes immediately after convert."
      ).toBe(true);

      // Must NOT contain a slug-qualified invalidation inside this block
      expect(
        /invalidateQueries\(\s*\{\s*queryKey\s*:\s*\[\s*["']\/api\/cart["']\s*,\s*experience/.test(block),
        "convertToItineraryMutation.onSuccess must NOT pass an experienceSlug argument to " +
          "invalidateQueries — slug-qualified invalidation leaves TripStrip (bare key) stale."
      ).toBe(false);

      console.log(
        "[tripstrip-count] PASS A — convertToItineraryMutation invalidates bare /api/cart key"
      );
    }
  );

  // ── B. Static: checkoutMutation invalidates bare /api/cart ───────────────

  test(
    "B — cart.tsx checkoutMutation.onSuccess invalidates the bare ['/api/cart'] key (no slug suffix)",
    () => {
      const src = fs.readFileSync(CART_FILE, "utf-8");

      // Locate the onSuccess block of checkoutMutation.
      const checkoutBlock = src.match(
        /checkoutMutation\s*=\s*useMutation\(\{[\s\S]*?onSuccess[\s\S]*?(?:setFlowStep|setLocation)/
      );
      expect(
        checkoutBlock,
        "checkoutMutation block not found in cart.tsx — pattern may have changed"
      ).not.toBeNull();

      const block = checkoutBlock![0];

      expect(
        /invalidateQueries\(\s*\{\s*queryKey\s*:\s*\[\s*["']\/api\/cart["']\s*\]/.test(block),
        'checkoutMutation.onSuccess must call invalidateQueries({ queryKey: ["/api/cart"] }) ' +
          "(bare key) so TripStrip refreshes immediately after checkout."
      ).toBe(true);

      expect(
        /invalidateQueries\(\s*\{\s*queryKey\s*:\s*\[\s*["']\/api\/cart["']\s*,\s*experience/.test(block),
        "checkoutMutation.onSuccess must NOT pass an experienceSlug argument to invalidateQueries."
      ).toBe(false);

      console.log(
        "[tripstrip-count] PASS B — checkoutMutation invalidates bare /api/cart key"
      );
    }
  );

  // ── C. Browser: convert-to-itinerary → chip drops while still on /cart ──

  test(
    "C — browser: TripStrip chip count drops while still on /cart after convert-to-itinerary (navigation blocked)",
    async ({ page }) => {
      // 1. Register + authenticate
      await registerFreshUser(page);

      // 2. Add a content item (activity type) — makes the "Start Planning"
      //    button visible in cart.tsx and populates the dialog checkbox.
      await addContentItemToCart(page);

      // 3. Navigate to /cart, seed trip context so TripStrip renders.
      await page.goto(`${BASE_URL}/cart`);
      await seedTripContext(page);

      // 4. Reload to pick up the seeded context.  No interceptors yet — the
      //    real /api/cart is called and returns 1 item.
      await page.reload();
      await page.waitForLoadState("networkidle");

      // 5. Confirm the TripStrip chip shows ≥ 1 item before the action.
      await expect(
        page.locator('[data-testid="trip-strip-cart"]'),
        "TripStrip cart chip should show ≥ 1 item before convert-to-itinerary"
      ).toBeVisible({ timeout: 8_000 });

      const chipBefore = await page
        .locator('[data-testid="trip-strip-cart"]')
        .textContent();
      console.log(`[tripstrip-count] chip before convert: "${chipBefore?.trim()}"`);

      // 6. Block Wouter's client-side navigation BEFORE triggering the action.
      //    convertToItineraryMutation.onSuccess calls setLocation(`/trip/${tripId}`)
      //    which resolves to window.history.pushState.  By intercepting pushState
      //    we keep the page on /cart so TripStrip remains mounted and we can
      //    observe the chip update that results from the invalidateQueries call
      //    (which fires BEFORE setLocation in onSuccess).
      await page.evaluate(() => {
        const orig = window.history.pushState.bind(window.history);
        (window as any).__blockedNavs = [];
        window.history.pushState = function (state, title, url) {
          const urlStr = String(url ?? "");
          if (urlStr.startsWith("/trip/")) {
            // Record the blocked navigation for assertion, but do not navigate.
            (window as any).__blockedNavs.push(urlStr);
            return;
          }
          return orig(state, title, url);
        };
      });

      // 7. Set up network interceptors AFTER confirming the chip.
      //    a) Mock POST /api/cart/convert-to-itinerary to return success.
      const fakeTripId = `fake-trip-${uid()}`;
      await page.route("**/api/cart/convert-to-itinerary", (route) => {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ tripId: fakeTripId, convertedCount: 1 }),
        });
      });

      //    b) From now on every GET /api/cart returns an empty cart.  This
      //       simulates the server state after items are converted.  React-Query
      //       calls this immediately after invalidateQueries fires.
      await page.route("**/api/cart", (route) => {
        if (route.request().method() === "GET") {
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              items: [],
              subtotal: "0",
              platformFee: "0",
              conciergeFee: "0",
              total: "0",
              itemCount: 0,
            }),
          });
        } else {
          route.continue();
        }
      });

      // 8. Open the "Start Planning" dialog.
      await page.locator('[data-testid="button-start-planning"]').click();
      await expect(
        page.locator('[data-testid="dialog-start-planning"]'),
        "Planning dialog should open"
      ).toBeVisible({ timeout: 5_000 });

      // 9. Switch to "New trip" mode and enter a name.
      await page.locator('[data-testid="button-mode-new"]').click();
      await page
        .locator('[data-testid="input-new-trip-name"]')
        .fill("E2E TripStrip Test Trip");

      // 10. Click "Add items to trip" — fires convertToItineraryMutation.
      //     onSuccess order: invalidateQueries(["/api/cart"]) → setLocation().
      //     The GET /api/cart refetch returns 0 items; setLocation is blocked.
      await page.locator('[data-testid="button-confirm-planning"]').click();

      // 11. Confirm the navigation was blocked (proves mutation fired but
      //     we stayed on /cart for the chip assertion).
      await expect
        .poll(
          () => page.evaluate(() => (window as any).__blockedNavs?.length ?? 0),
          { timeout: 5_000, message: "convertToItinerary should have attempted a /trip/ navigation" }
        )
        .toBeGreaterThanOrEqual(1);

      // 12. Current URL must still be /cart (TripStrip still mounted).
      const url = new URL(page.url());
      expect(url.pathname, "Page must remain on /cart while navigation is blocked").toBe("/cart");

      // 13. WITHOUT any page reload, the TripStrip chip must disappear because
      //     React-Query invalidated the bare ["/api/cart"] key, refetched it
      //     (getting itemCount = 0 from our interceptor), and re-rendered.
      await expect(
        page.locator('[data-testid="trip-strip-cart"]'),
        "TripStrip chip must disappear within 1 s after convert-to-itinerary " +
          "(React-Query invalidated bare /api/cart → refetch → itemCount = 0)"
      ).not.toBeVisible({ timeout: 1_000 });

      console.log(
        "[tripstrip-count] PASS C — chip hidden in-place after convert-to-itinerary (URL stayed /cart)"
      );
    }
  );

  // ── D. Browser: checkout → chip drops while still on /cart ───────────────

  test(
    "D — browser: TripStrip chip count drops while still on /cart after checkout (payment sub-step, no navigation)",
    async ({ page }) => {
      // 1. Register + authenticate
      await registerFreshUser(page);

      // 2. Add a content item to the cart.
      await addContentItemToCart(page);

      // 3. Navigate to /cart, seed trip context.
      await page.goto(`${BASE_URL}/cart`);
      await seedTripContext(page);

      // 4. Reload to pick up context.  Real /api/cart → 1 item.
      await page.reload();
      await page.waitForLoadState("networkidle");

      // 5. Confirm TripStrip chip shows ≥ 1 item before checkout.
      await expect(
        page.locator('[data-testid="trip-strip-cart"]'),
        "TripStrip cart chip should be visible before checkout"
      ).toBeVisible({ timeout: 8_000 });

      const chipBefore = await page
        .locator('[data-testid="trip-strip-cart"]')
        .textContent();
      console.log(`[tripstrip-count] chip before checkout: "${chipBefore?.trim()}"`);

      // 6. Click "Proceed to Payment" to advance to the payment sub-step.
      //    This is a client-side state change (setFlowStep("payment")); no API
      //    call and no URL change — TripStrip stays mounted at /cart.
      await page.locator('[data-testid="button-skip-to-payment"]').click();

      // Wait for the payment-step UI to appear.
      await expect(
        page.locator('[data-testid="button-complete-booking"]'),
        "Complete Booking button must appear after advancing to payment step"
      ).toBeVisible({ timeout: 5_000 });

      // 7. Set up interceptors AFTER reaching the payment step (chip still
      //    visible because nothing changed the cart yet).
      //
      //    a) Mock POST /api/checkout to return a paymentIntent response.
      //       This is crucial: cart.tsx's onSuccess branches on whether
      //       data.paymentIntent is truthy.
      //         - With paymentIntent → setFlowStep("payment") — stays on /cart
      //         - Without paymentIntent → setLocation("/bookings") — navigates away
      //       We use the paymentIntent branch to keep TripStrip mounted.
      await page.route("**/api/checkout", (route) => {
        if (route.request().method() === "POST") {
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              paymentIntent: {
                clientSecret: "pi_test_secret_placeholder",
                paymentIntentId: `pi_${uid()}`,
                amount: 0,
              },
              bookings: [{ id: `booking-${uid()}` }],
            }),
          });
        } else {
          route.continue();
        }
      });

      //    b) From now on every GET /api/cart returns an empty cart so the
      //       chip disappears once React-Query refetches after invalidateQueries.
      await page.route("**/api/cart", (route) => {
        if (route.request().method() === "GET") {
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              items: [],
              subtotal: "0",
              platformFee: "0",
              conciergeFee: "0",
              total: "0",
              itemCount: 0,
            }),
          });
        } else {
          route.continue();
        }
      });

      // 8. Click "Complete Booking" — fires checkoutMutation.mutate().
      //    onSuccess order: invalidateQueries(["/api/cart"]) → setCheckoutPaymentIntent()
      //    → setFlowStep("payment").  The GET /api/cart refetch returns 0 items.
      //    The page stays on /cart (URL unchanged) showing the Stripe UI.
      await page.locator('[data-testid="button-complete-booking"]').click();

      // 9. Current URL must still be /cart (proves the paymentIntent branch
      //    was taken and no navigation occurred).
      await expect
        .poll(() => new URL(page.url()).pathname, {
          timeout: 3_000,
          message: "URL must remain /cart after checkout with paymentIntent response",
        })
        .toBe("/cart");

      // 10. WITHOUT any page reload, the TripStrip chip must disappear because
      //     React-Query invalidated the bare ["/api/cart"] key, refetched it
      //     (getting itemCount = 0), and re-rendered.
      await expect(
        page.locator('[data-testid="trip-strip-cart"]'),
        "TripStrip chip must disappear within 1 s after checkout " +
          "(React-Query invalidated bare /api/cart → refetch → itemCount = 0)"
      ).not.toBeVisible({ timeout: 1_000 });

      console.log(
        "[tripstrip-count] PASS D — chip hidden in-place after checkout (URL stayed /cart)"
      );
    }
  );
});
