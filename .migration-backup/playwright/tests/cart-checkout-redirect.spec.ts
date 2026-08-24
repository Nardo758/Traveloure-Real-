import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

// ESM-safe __dirname (same pattern as dynamic-links.spec.ts)
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BASE_URL = process.env.BASE_URL || "http://localhost:5000";

function uid(prefix = "") {
  return prefix + crypto.randomUUID().replace(/-/g, "").slice(0, 10);
}

/**
 * Cart Checkout Redirect — Suite 6
 *
 * Regression guard for the cart-conversion redirect target.
 *
 * Background: dynamic-links.spec.ts (Suite 5) caught that cart.tsx and
 * EnhancedPlanningModal.tsx were using `/trips/${tripId}` (plural, wrong) instead
 * of `/trip/${tripId}` (singular, correct). Both files were fixed. This suite
 * exercises the full happy-path end-to-end so a future route rename or
 * copy-paste error cannot slip through undetected.
 *
 * CONTRACT CHANGE (Console Realign R-E, ratified — docs/briefs/CONSOLE_REALIGN_BRIEF.md):
 * cart conversion now lands on the SLIP, `/plans/:tripId`, not the Trip Card page.
 * This suite guards the NEW target for cart.tsx. EnhancedPlanningModal keeps its
 * pre-existing `/trip/:id` target (untouched by the realign) and stays guarded as-is.
 *
 * Tests:
 *   A. Static — cart.tsx must redirect to /plans/${…} (not /trips/${…}, not the
 *      pre-R-E /trip/${…})
 *   B. Static — EnhancedPlanningModal.tsx must NOT use the broken /trips/${…}
 *   C. Static — App.tsx must declare /plans/:tripId (cart target) and /trip/:id
 *      (modal target)
 *   D. Browser — register user → add cart item via API → convert-to-itinerary →
 *      navigate to /plans/:tripId → confirm the slip renders, not 404 NotFound
 */

// ── Source paths ─────────────────────────────────────────────────────────────
const CLIENT_SRC = path.resolve(__dirname, "../../client/src");
const CART_FILE = path.join(CLIENT_SRC, "pages/cart.tsx");
const MODAL_FILE = path.join(CLIENT_SRC, "components/EnhancedPlanningModal.tsx");
const APP_FILE = path.join(CLIENT_SRC, "App.tsx");

function readSource(filePath: string): string {
  return fs.readFileSync(filePath, "utf-8");
}

// ── Static analysis tests (no browser needed) ─────────────────────────────
test.describe("Cart conversion → /plans/:tripId redirect (Suite 6)", () => {
  // ── A. cart.tsx uses the ratified R-E slip target /plans/ ────────────────
  test("cart.tsx redirects to /plans/${…} — not /trips/${…} or the pre-R-E /trip/${…}", () => {
    const src = readSource(CART_FILE);

    expect(
      /setLocation\(`\/trips\/\$\{/.test(src),
      "cart.tsx still contains the broken setLocation(`/trips/${…}`) pattern."
    ).toBe(false);

    expect(
      /setLocation\(`\/trip\/\$\{/.test(src),
      "cart.tsx contains setLocation(`/trip/${…}`) — cart conversion must land on " +
        "the slip (/plans/:tripId) per Console Realign R-E, not the Trip Card page."
    ).toBe(false);

    expect(
      /setLocation\(`\/plans\/\$\{/.test(src),
      "cart.tsx does not contain setLocation(`/plans/${…}`) — the post-conversion " +
        "redirect to the slip may be missing or broken."
    ).toBe(true);

    console.log("[cart-checkout-redirect] PASS cart.tsx redirect uses /plans/:tripId");
  });

  // ── B. EnhancedPlanningModal.tsx uses the correct singular /trip/ route ──
  test("EnhancedPlanningModal.tsx uses /trip/${…} (singular) — not /trips/${…}", () => {
    const src = readSource(MODAL_FILE);

    expect(
      /setLocation\(`\/trips\/\$\{/.test(src),
      "EnhancedPlanningModal.tsx still contains the broken setLocation(`/trips/${…}`) pattern."
    ).toBe(false);

    expect(
      /setLocation\(`\/trip\/\$\{/.test(src),
      "EnhancedPlanningModal.tsx does not contain setLocation(`/trip/${…}`) — the post-planning redirect may be broken."
    ).toBe(true);

    console.log("[cart-checkout-redirect] PASS EnhancedPlanningModal.tsx redirect uses /trip/:id");
  });

  // ── C. App.tsx declares both targets ─────────────────────────────────────
  test('App.tsx declares /plans/:tripId (cart target) and /trip/:id (modal target)', () => {
    const src = readSource(APP_FILE);

    expect(
      /path="\/plans\/:tripId"/.test(src),
      'App.tsx is missing <Route path="/plans/:tripId"> — navigating to the slip after ' +
        "cart conversion would land on the 404 Not-Found page."
    ).toBe(true);

    expect(
      /path="\/trip\/:id"/.test(src),
      'App.tsx is missing a <Route path="/trip/:id"> — the EnhancedPlanningModal ' +
        "post-planning redirect would land on the 404 Not-Found page."
    ).toBe(true);

    console.log('[cart-checkout-redirect] PASS App.tsx has /plans/:tripId and /trip/:id');
  });

  // ── D. Browser end-to-end: cart → convert-to-itinerary → /plans/:tripId ──
  // Exercises the complete happy path that mimics what cart.tsx does after
  // a successful convert-to-itinerary call:  setLocation(`/plans/${data.tripId}`)
  test(
    "convert-to-itinerary → navigating to /plans/:tripId renders the slip, not NotFound",
    async ({ page }) => {
      const email = `e2e-cart-redirect-${uid()}@example.com`;
      const password = "TestRedirect123!";

      // 1. Register a fresh user via API (establishes session cookie automatically
      //    because page.request shares the browser cookie jar with page navigation)
      const registerRes = await page.request.post(`${BASE_URL}/api/auth/register`, {
        data: {
          email,
          password,
          firstName: "Cart",
          lastName: "Tester",
          userType: "user",
        },
      });
      expect(
        registerRes.status(),
        `User registration failed (${registerRes.status()}): ${await registerRes.text()}`
      ).toBe(201);

      // 2. Add a content item to the cart
      //    POST /api/cart accepts contentType=activity with a free-form contentId
      //    (no real DB record required for the contentId)
      const cartRes = await page.request.post(`${BASE_URL}/api/cart`, {
        data: {
          contentType: "activity",
          contentId: `e2e-activity-${uid()}`,
          contentMeta: {
            name: "E2E Test Activity",
            description: "Playwright regression test",
            city: "Tokyo",
          },
          quantity: 1,
        },
      });
      expect(
        cartRes.status(),
        `POST /api/cart failed (${cartRes.status()}): ${await cartRes.text()}`
      ).toBe(201);

      const cartItem = await cartRes.json();
      expect(cartItem.id, "Cart item must have an id").toBeTruthy();

      // 3. Convert cart → new trip (same endpoint cart.tsx calls)
      const convertRes = await page.request.post(
        `${BASE_URL}/api/cart/convert-to-itinerary`,
        {
          data: {
            newTripName: "E2E Cart Redirect Test Trip",
            destination: "Tokyo, Japan",
            cartItemIds: [cartItem.id],
          },
        }
      );
      expect(
        convertRes.status(),
        `POST /api/cart/convert-to-itinerary failed (${convertRes.status()}): ${await convertRes.text()}`
      ).toBe(200);

      const { tripId, convertedCount } = await convertRes.json();
      expect(tripId, "convert-to-itinerary must return a non-empty tripId").toBeTruthy();
      console.log(
        `[cart-checkout-redirect] API returned tripId=${tripId}, convertedCount=${convertedCount}`
      );

      // 4. Navigate the browser to exactly the URL cart.tsx produces:
      //    setLocation(`/plans/${data.tripId}`)
      await page.goto(`${BASE_URL}/plans/${tripId}`);
      await page.waitForLoadState("networkidle");

      // 5. Assert the trip-details page rendered — NOT the 404 "Lost at Sea" page.
      //    The not-found page has an h1 starting with "404".
      await expect(
        page.locator('h1').filter({ hasText: /^404/ }),
        "The browser must NOT land on the 404 Not-Found page after cart conversion"
      ).not.toBeVisible();

      await expect(
        page.locator('text="Lost at Sea"'),
        "The browser must NOT show the 404 'Lost at Sea?' message"
      ).not.toBeVisible();

      // 6. Confirm the URL stayed at /plans/<id> (not redirected to / or /login)
      const finalUrl = new URL(page.url());
      expect(
        finalUrl.pathname,
        `After navigation the URL should remain under /plans/, got: ${finalUrl.pathname}`
      ).toMatch(/^\/plans\//);

      console.log(
        `[cart-checkout-redirect] PASS — browser at ${finalUrl.pathname} with no 404`
      );
    }
  );
});
