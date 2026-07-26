import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

/**
 * TripStrip count accuracy — Suite: cart mutations
 *
 * Regression guard for Task 942 which fixed two slug-scoped React-Query
 * invalidations in cart.tsx.  Before that fix:
 *
 *   convertToItineraryMutation.onSuccess → invalidateQueries({ queryKey: ["/api/cart", experienceSlug] })
 *   checkoutMutation.onSuccess           → invalidateQueries({ queryKey: ["/api/cart", experienceSlug] })
 *
 * The TripStrip uses the BARE key ["/api/cart"] (no slug), so the slug-qualified
 * invalidations left the chip count stale after both actions.
 *
 * Tests
 * ──────
 * A  Static  — convertToItineraryMutation.onSuccess uses the bare /api/cart key
 * B  Static  — checkoutMutation.onSuccess uses the bare /api/cart key
 * C  Browser — TripStrip chip disappears (no page reload) after convert-to-itinerary
 * D  Browser — TripStrip chip disappears (no page reload) after checkout
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.BASE_URL || "http://localhost:5000";

function uid(prefix = "") {
  return prefix + crypto.randomUUID().replace(/-/g, "").slice(0, 10);
}

const CART_FILE = path.resolve(__dirname, "../../client/src/pages/cart.tsx");

// ── Shared API helpers ─────────────────────────────────────────────────────

async function registerFreshUser(page: import("@playwright/test").Page) {
  const email = `e2e-tripstrip-${uid()}@example.com`;
  const res = await page.request.post(`${BASE_URL}/api/auth/register`, {
    data: {
      email,
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
  return email;
}

/** Add a content-type cart item (activity) via the authenticated API. */
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
 * Seed a minimal trip context in localStorage so TripStrip renders even
 * when no trip id is set (destination alone satisfies hasContext).
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

      // Capture the convertToItineraryMutation block up to (and including)
      // the setLocation call that signals the mutation completed.
      const convertBlock = src.match(
        /convertToItineraryMutation\s*=\s*useMutation\(\{[\s\S]*?onSuccess[\s\S]*?setLocation\(`\/trip\/\$\{/
      );
      expect(
        convertBlock,
        "convertToItineraryMutation block not found in cart.tsx — pattern may have changed"
      ).not.toBeNull();

      const block = convertBlock![0];

      // Must contain the bare-key invalidation
      expect(
        /invalidateQueries\(\s*\{\s*queryKey\s*:\s*\[\s*["']\/api\/cart["']\s*\]/.test(block),
        "convertToItineraryMutation.onSuccess must call invalidateQueries({ queryKey: [\"/api/cart\"] }) " +
          "(bare key, no slug) so TripStrip refreshes immediately after convert."
      ).toBe(true);

      // Must NOT contain a slug-qualified invalidation
      expect(
        /invalidateQueries\(\s*\{\s*queryKey\s*:\s*\[\s*["']\/api\/cart["']\s*,\s*experience/.test(
          block
        ),
        "convertToItineraryMutation.onSuccess must NOT pass a slug to invalidateQueries — " +
          "slug-qualified invalidation leaves TripStrip (bare key) stale."
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
        /invalidateQueries\(\s*\{\s*queryKey\s*:\s*\[\s*["']\/api\/cart["']\s*,\s*experience/.test(
          block
        ),
        "checkoutMutation.onSuccess must NOT pass a slug to invalidateQueries — that leaves TripStrip stale."
      ).toBe(false);

      console.log(
        "[tripstrip-count] PASS B — checkoutMutation invalidates bare /api/cart key"
      );
    }
  );

  // ── C. Browser: convert-to-itinerary → chip disappears without reload ────

  test(
    "C — browser: TripStrip chip disappears (no page reload) within 1 s after convert-to-itinerary UI action",
    async ({ page }) => {
      // 1. Register + authenticate
      await registerFreshUser(page);

      // 2. Add a content item (activity) — this makes the "Start Planning"
      //    button visible and populates the planning dialog checkbox list.
      await addContentItemToCart(page);

      // 3. Navigate to /cart and seed trip context so TripStrip renders.
      await page.goto(`${BASE_URL}/cart`);
      await seedTripContext(page);

      // 4. Reload once to pick up the seeded context.  No interceptors yet
      //    so the real /api/cart returns 1 item.
      await page.reload();
      await page.waitForLoadState("networkidle");

      // 5. Confirm TripStrip chip shows ≥ 1 item before the action.
      await expect(
        page.locator('[data-testid="trip-strip-cart"]'),
        "TripStrip cart chip should show ≥ 1 item before convert-to-itinerary"
      ).toBeVisible({ timeout: 8_000 });

      const chipBefore = await page
        .locator('[data-testid="trip-strip-cart"]')
        .textContent();
      console.log(`[tripstrip-count] chip before convert: "${chipBefore?.trim()}"`);

      // 6. Set up network interception AFTER confirming the chip is visible.
      //
      //    a) Mock POST /api/cart/convert-to-itinerary so it succeeds instantly.
      const fakeTripId = `fake-trip-${uid()}`;
      await page.route("**/api/cart/convert-to-itinerary", (route) => {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ tripId: fakeTripId, convertedCount: 1 }),
        });
      });

      //    b) From this point on, every GET /api/cart returns an empty cart.
      //       This simulates the server state after items are moved to the trip.
      //       React-Query will call this immediately after invalidateQueries.
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

      // 7. Click "Start Planning" to open the dialog.
      await page.locator('[data-testid="button-start-planning"]').click();
      await expect(
        page.locator('[data-testid="dialog-start-planning"]'),
        "Planning dialog should open"
      ).toBeVisible({ timeout: 5_000 });

      // 8. Switch to "New trip" mode.
      await page.locator('[data-testid="button-mode-new"]').click();

      // 9. Fill in a trip name (required for the mutation to fire).
      await page
        .locator('[data-testid="input-new-trip-name"]')
        .fill("E2E TripStrip Test Trip");

      // 10. Click "Add items to trip" — this fires convertToItineraryMutation.
      //     onSuccess calls invalidateQueries({ queryKey: ["/api/cart"] }),
      //     which triggers a refetch → our interceptor returns itemCount: 0.
      await page.locator('[data-testid="button-confirm-planning"]').click();

      // 11. Without any page reload, the TripStrip chip must disappear within 1 s
      //     because React-Query refetched the bare /api/cart key and got 0 items.
      await expect(
        page.locator('[data-testid="trip-strip-cart"]'),
        "TripStrip cart chip must disappear within 1 s after convert-to-itinerary " +
          "(React-Query invalidated bare /api/cart → refetch → itemCount = 0)"
      ).not.toBeVisible({ timeout: 1_000 });

      console.log(
        "[tripstrip-count] PASS C — chip hidden after convert-to-itinerary (no page reload)"
      );
    }
  );

  // ── D. Browser: checkout → chip disappears without reload ────────────────

  test(
    "D — browser: TripStrip chip disappears (no page reload) within 1 s after checkout UI action",
    async ({ page }) => {
      // 1. Register + authenticate
      await registerFreshUser(page);

      // 2. Add a content item to the cart.
      await addContentItemToCart(page);

      // 3. Navigate to /cart and seed trip context.
      await page.goto(`${BASE_URL}/cart`);
      await seedTripContext(page);

      // 4. Reload to pick up the seeded context. No interceptors — real /api/cart.
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

      // 6. Click "Proceed to Payment" to advance to the payment step.
      //    This button is visible when cart.items.length > 0 (our item qualifies).
      //    It calls setFlowStep("payment") — a client-side state change, no network.
      await page.locator('[data-testid="button-skip-to-payment"]').click();

      // 7. Set up network interception AFTER reaching the payment step.
      //
      //    a) Mock POST /api/checkout — return a booking-only response with no
      //       paymentIntent so cart.tsx takes the no-Stripe branch (toast + navigate).
      await page.route("**/api/checkout", (route) => {
        if (route.request().method() === "POST") {
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              bookings: [{ id: `booking-${uid()}` }],
              // No paymentIntent → cart.tsx calls setLocation("/bookings")
              // after invalidating the cart.
            }),
          });
        } else {
          route.continue();
        }
      });

      //    b) Every subsequent GET /api/cart returns an empty cart so the
      //       TripStrip chip disappears after React-Query's invalidation refetch.
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

      // 8. Click "Complete Booking" — this fires checkoutMutation.mutate().
      //    onSuccess calls invalidateQueries({ queryKey: ["/api/cart"] }),
      //    which triggers a refetch → our interceptor returns itemCount: 0.
      await expect(
        page.locator('[data-testid="button-complete-booking"]'),
        "Complete Booking button must be visible on the payment step"
      ).toBeVisible({ timeout: 5_000 });
      await page.locator('[data-testid="button-complete-booking"]').click();

      // 9. Without any page reload, the TripStrip chip must disappear within 1 s.
      await expect(
        page.locator('[data-testid="trip-strip-cart"]'),
        "TripStrip cart chip must disappear within 1 s after checkout " +
          "(React-Query invalidated bare /api/cart → refetch → itemCount = 0)"
      ).not.toBeVisible({ timeout: 1_000 });

      console.log(
        "[tripstrip-count] PASS D — chip hidden after checkout (no page reload)"
      );
    }
  );
});
