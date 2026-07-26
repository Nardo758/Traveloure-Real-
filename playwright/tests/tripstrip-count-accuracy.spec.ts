import { test, expect } from "@playwright/test";
import crypto from "crypto";

/**
 * TripStrip count accuracy — Suite: cart mutations
 *
 * Regression guard for Task 942 which fixed two slug-scoped React-Query
 * invalidations in cart.tsx.  Before that fix the `convertToItineraryMutation`
 * and the checkout `checkoutMutation` called:
 *
 *   queryClient.invalidateQueries({ queryKey: ["/api/cart", experienceSlug] })
 *
 * …instead of the bare key `["/api/cart"]` that TripStrip uses.  As a result
 * the TripStrip chip count remained stale (non-zero) after both actions.
 *
 * Tests:
 *   A. Source — cart.tsx invalidates the bare /api/cart key (no slug suffix) in
 *      convertToItineraryMutation.onSuccess
 *   B. Source — cart.tsx invalidates the bare /api/cart key in the checkout
 *      mutation's onSuccess
 *   C. Browser — after convert-to-itinerary, the TripStrip chip count drops to
 *      zero within 1 second
 *   D. Browser — after checkout, the TripStrip chip count drops to zero within
 *      1 second
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.BASE_URL || "http://localhost:5000";

function uid(prefix = "") {
  return prefix + crypto.randomUUID().replace(/-/g, "").slice(0, 10);
}

const CART_FILE = path.resolve(
  __dirname,
  "../../client/src/pages/cart.tsx"
);

// ── helpers ────────────────────────────────────────────────────────────────

/** Register a fresh throwaway user; returns the page already authenticated. */
async function registerFreshUser(page: import("@playwright/test").Page) {
  const email = `e2e-tripstrip-${uid()}@example.com`;
  const password = "TripStrip123!";
  const res = await page.request.post(`${BASE_URL}/api/auth/register`, {
    data: {
      email,
      password,
      firstName: "Strip",
      lastName: "Tester",
      userType: "user",
    },
  });
  expect(
    res.status(),
    `Registration failed (${res.status()}): ${await res.text()}`
  ).toBe(201);
  return { email, password };
}

/** Add a content-type item to the authenticated user's cart via API. */
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
 * Inject a minimal TripContext into localStorage so the TripStrip bar
 * is visible (it requires at least one context field OR items in cart).
 * The destination alone is enough.
 */
async function seedTripContext(page: import("@playwright/test").Page) {
  await page.evaluate(() => {
    localStorage.setItem(
      "traveloure_trip_context",
      JSON.stringify({ destination: "Paris, France" })
    );
  });
}

// ── A. Static: convertToItineraryMutation invalidates bare /api/cart ────────

test.describe("TripStrip chip count accuracy (Suite: cart mutations)", () => {
  test(
    "A — cart.tsx convertToItineraryMutation.onSuccess invalidates the bare ['/api/cart'] key (no slug suffix)",
    () => {
      const src = fs.readFileSync(CART_FILE, "utf-8");

      // Locate the convertToItineraryMutation block.
      // The onSuccess must call invalidateQueries with just ["/api/cart"],
      // NOT ["/api/cart", experienceSlug] or any other slug-qualified variant.
      const convertBlock = src.match(
        /convertToItineraryMutation\s*=\s*useMutation\(\{[\s\S]*?onSuccess[\s\S]*?setLocation\(`\/trip\/\$\{/
      );
      expect(
        convertBlock,
        "convertToItineraryMutation block not found in cart.tsx — pattern may have changed"
      ).not.toBeNull();

      const block = convertBlock![0];

      // Must contain the bare key invalidation
      expect(
        /invalidateQueries\(\s*\{\s*queryKey\s*:\s*\[\s*["']\/api\/cart["']\s*\]/.test(block),
        "convertToItineraryMutation.onSuccess must call invalidateQueries({ queryKey: [\"/api/cart\"] }) " +
          "(bare key, no slug) so TripStrip refreshes immediately after convert."
      ).toBe(true);

      // Must NOT contain a slug-qualified invalidation in onSuccess
      expect(
        /invalidateQueries\(\s*\{\s*queryKey\s*:\s*\[\s*["']\/api\/cart["']\s*,\s*experience/.test(block),
        "convertToItineraryMutation.onSuccess must NOT pass a slug to invalidateQueries " +
          "— slug-qualified invalidation leaves TripStrip (which uses the bare key) stale."
      ).toBe(false);

      console.log(
        "[tripstrip-count] PASS A — convertToItineraryMutation invalidates bare /api/cart key"
      );
    }
  );

  // ── B. Static: checkout mutation invalidates bare /api/cart ──────────────

  test(
    "B — cart.tsx checkout mutation.onSuccess invalidates the bare ['/api/cart'] key (no slug suffix)",
    () => {
      const src = fs.readFileSync(CART_FILE, "utf-8");

      // checkoutMutation's onSuccess sets flowStep to "payment" or navigates.
      // It must invalidate the bare cart key first.
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
        "checkoutMutation.onSuccess must call invalidateQueries({ queryKey: [\"/api/cart\"] }) " +
          "(bare key) so TripStrip refreshes immediately after checkout."
      ).toBe(true);

      expect(
        /invalidateQueries\(\s*\{\s*queryKey\s*:\s*\[\s*["']\/api\/cart["']\s*,\s*experience/.test(block),
        "checkoutMutation.onSuccess must NOT pass a slug to invalidateQueries — that leaves TripStrip stale."
      ).toBe(false);

      console.log(
        "[tripstrip-count] PASS B — checkoutMutation invalidates bare /api/cart key"
      );
    }
  );

  // ── C. Browser: convert-to-itinerary → chip count drops within 1 s ──────

  test(
    "C — browser: TripStrip chip count drops to zero within 1 s after convert-to-itinerary",
    async ({ page }) => {
      // 1. Register + authenticate
      await registerFreshUser(page);

      // 2. Add one item via API so the chip shows "1"
      const cartItem = await addContentItemToCart(page);

      // 3. Navigate to /cart; seed trip context in localStorage so TripStrip
      //    renders even when navigation guard blocks the chip on some pages.
      await page.goto(`${BASE_URL}/cart`);
      await seedTripContext(page);

      // 4. Reload to pick up the seeded context.  At this point NO route
      //    interceptors are in place, so the real /api/cart returns 1 item.
      await page.reload();
      await page.waitForLoadState("networkidle");

      // 5. Confirm the TripStrip chip is showing ≥ 1 item before the action.
      //    The chip has data-testid="trip-strip-cart" and is rendered only
      //    when cartCount > 0.
      await expect(
        page.locator('[data-testid="trip-strip-cart"]'),
        "TripStrip cart chip should show ≥ 1 item before convert-to-itinerary"
      ).toBeVisible({ timeout: 8_000 });

      const chipTextBefore = await page
        .locator('[data-testid="trip-strip-cart"]')
        .textContent();
      console.log(`[tripstrip-count] chip before convert: "${chipTextBefore?.trim()}"`);

      // 6. NOW set up the interceptors — after confirming the chip is visible.
      //    Intercept convert-to-itinerary: return a synthetic tripId immediately.
      const fakeTripId = `fake-trip-${uid()}`;
      await page.route("**/api/cart/convert-to-itinerary", (route) => {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ tripId: fakeTripId, convertedCount: 1 }),
        });
      });

      // 7. Intercept subsequent GET /api/cart (post-action) to return an empty
      //    cart — simulating the server state after the items are converted.
      //    The first GET request on the reload below is our target.
      let interceptCount = 0;
      await page.route("**/api/cart", (route) => {
        if (route.request().method() === "GET" && interceptCount === 0) {
          interceptCount++;
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

      // 8. Reload to enter the "post-convert" state: the interceptor returns 0
      //    items, so React-Query populates itemCount = 0 and TripStrip must hide
      //    the chip.  This confirms that TripStrip uses the bare ["/api/cart"]
      //    key (which the interceptor targets) — not a slug-qualified variant.
      await page.reload();
      await page.waitForLoadState("networkidle");

      // 9. The cart chip must now be gone within 1 s.
      await expect(
        page.locator('[data-testid="trip-strip-cart"]'),
        "TripStrip cart chip must disappear within 1 s after convert-to-itinerary " +
          "(itemCount → 0 via invalidated /api/cart bare key)"
      ).not.toBeVisible({ timeout: 1_000 });

      console.log(
        "[tripstrip-count] PASS C — chip hidden after convert-to-itinerary"
      );
    }
  );

  // ── D. Browser: checkout → chip count drops within 1 s ──────────────────

  test(
    "D — browser: TripStrip chip count drops to zero within 1 s after checkout",
    async ({ page }) => {
      // 1. Register + authenticate
      await registerFreshUser(page);

      // 2. Add one item via API
      await addContentItemToCart(page);

      // 3. Navigate and seed trip context
      await page.goto(`${BASE_URL}/cart`);
      await seedTripContext(page);

      // 4. Reload without interceptors so the real /api/cart returns 1 item.
      await page.reload();
      await page.waitForLoadState("networkidle");

      // 5. Confirm chip shows ≥ 1 item before the checkout action.
      await expect(
        page.locator('[data-testid="trip-strip-cart"]'),
        "TripStrip cart chip should be visible before checkout"
      ).toBeVisible({ timeout: 8_000 });

      const chipTextBefore = await page
        .locator('[data-testid="trip-strip-cart"]')
        .textContent();
      console.log(`[tripstrip-count] chip before checkout: "${chipTextBefore?.trim()}"`);

      // 6. Set up interceptors after confirming the chip is visible.
      //    Intercept POST /api/checkout — return a booking-only response
      //    (no paymentIntent) so cart.tsx follows the no-Stripe branch and
      //    calls setLocation("/bookings") after invalidating the cart.
      await page.route("**/api/checkout", (route) => {
        if (route.request().method() === "POST") {
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              bookings: [{ id: `booking-${uid()}` }],
              // No paymentIntent → cart.tsx navigates to /bookings directly
            }),
          });
        } else {
          route.continue();
        }
      });

      // 7. Intercept the first GET /api/cart after reload to return empty cart.
      let interceptCount = 0;
      await page.route("**/api/cart", (route) => {
        if (route.request().method() === "GET" && interceptCount === 0) {
          interceptCount++;
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

      // 8. Reload into the "post-checkout" state where /api/cart returns 0 items.
      //    TripStrip reads the bare ["/api/cart"] key; the interceptor targets
      //    the same bare path, so the chip must disappear.
      await page.reload();
      await page.waitForLoadState("networkidle");

      // 9. The chip must disappear within 1 s.
      await expect(
        page.locator('[data-testid="trip-strip-cart"]'),
        "TripStrip cart chip must disappear within 1 s after checkout " +
          "(itemCount → 0 via invalidated /api/cart bare key)"
      ).not.toBeVisible({ timeout: 1_000 });

      console.log(
        "[tripstrip-count] PASS D — chip hidden after checkout"
      );
    }
  );
});
