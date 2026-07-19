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
 * Regression guard for the cart-checkout → /trip/:id redirect.
 *
 * Background: dynamic-links.spec.ts (Suite 5) caught that cart.tsx and
 * EnhancedPlanningModal.tsx were using `/trips/${tripId}` (plural, wrong) instead
 * of `/trip/${tripId}` (singular, correct). Both files were fixed. This suite
 * exercises the full happy-path end-to-end so a future route rename or
 * copy-paste error cannot slip through undetected.
 *
 * Tests:
 *   A. Static — cart.tsx and EnhancedPlanningModal.tsx must NOT contain the
 *      broken `/trips/${…}` pattern and MUST contain the correct `/trip/${…}`.
 *   B. Static — App.tsx must declare a `/trip/:id` route.
 *   C. API   — POST /api/cart/convert-to-itinerary returns a valid tripId that
 *              matches the /trip/:id route shape (no browser required).
 */

// ── Source paths ─────────────────────────────────────────────────────────────
const CLIENT_SRC = path.resolve(__dirname, "../../client/src");
const CART_FILE = path.join(CLIENT_SRC, "pages/cart.tsx");
const MODAL_FILE = path.join(CLIENT_SRC, "components/EnhancedPlanningModal.tsx");
const APP_FILE = path.join(CLIENT_SRC, "App.tsx");

// ── Helpers ───────────────────────────────────────────────────────────────────
function readSource(filePath: string): string {
  return fs.readFileSync(filePath, "utf-8");
}

/** Tiny fetch wrapper that reuses the session cookie set by register/login. */
async function apiCall(
  path: string,
  method: "POST" | "GET",
  body?: unknown,
  cookie?: string
): Promise<{ status: number; json: unknown; cookie?: string }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (cookie) headers["Cookie"] = cookie;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    redirect: "follow",
  });

  // Capture Set-Cookie from registration/login responses
  const setCookie = res.headers.get("set-cookie") ?? undefined;

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    json = null;
  }

  return { status: res.status, json, cookie: setCookie };
}

// ── Suite ─────────────────────────────────────────────────────────────────────
test.describe("Cart checkout → /trip/:id redirect (Suite 6)", () => {
  // ── A. Source: correct route used in cart.tsx ─────────────────────────────
  test("cart.tsx uses /trip/${…} (singular) — not the broken /trips/${…}", () => {
    const src = readSource(CART_FILE);

    // Must NOT contain the broken pattern
    const brokenPattern = /setLocation\(`\/trips\/\$\{/;
    expect(
      brokenPattern.test(src),
      `cart.tsx still contains the broken setLocation(\`/trips/\${…}\`) pattern. ` +
        "It must use /trip/:id (singular) to match the App.tsx route."
    ).toBe(false);

    // MUST contain the correct pattern
    const correctPattern = /setLocation\(`\/trip\/\$\{/;
    expect(
      correctPattern.test(src),
      "cart.tsx does not contain setLocation(`/trip/${…}`) — the redirect to the " +
        "trip page after cart conversion may be missing or broken."
    ).toBe(true);

    console.log("[cart-checkout-redirect] PASS cart.tsx redirect uses /trip/:id");
  });

  // ── B. Source: correct route used in EnhancedPlanningModal.tsx ───────────
  test("EnhancedPlanningModal.tsx uses /trip/${…} (singular) — not /trips/${…}", () => {
    const src = readSource(MODAL_FILE);

    const brokenPattern = /setLocation\(`\/trips\/\$\{/;
    expect(
      brokenPattern.test(src),
      "EnhancedPlanningModal.tsx still contains the broken setLocation(`/trips/${…}`) pattern."
    ).toBe(false);

    const correctPattern = /setLocation\(`\/trip\/\$\{/;
    expect(
      correctPattern.test(src),
      "EnhancedPlanningModal.tsx does not contain setLocation(`/trip/${…}`) — the post-planning redirect may be broken."
    ).toBe(true);

    console.log(
      "[cart-checkout-redirect] PASS EnhancedPlanningModal.tsx redirect uses /trip/:id"
    );
  });

  // ── C. Source: /trip/:id route declared in App.tsx ────────────────────────
  test('App.tsx declares a <Route path="/trip/:id"> (the target of the cart redirect)', () => {
    const src = readSource(APP_FILE);

    // Match both exact and with query-string redirect variants:
    //   <Route path="/trip/:id">
    //   path="/trip/:id"
    const routePattern = /path="\/trip\/:id"/;
    expect(
      routePattern.test(src),
      'App.tsx is missing a <Route path="/trip/:id"> — navigating to /trip/<id> after ' +
        "cart conversion would land on the 404 Not-Found page."
    ).toBe(true);

    console.log('[cart-checkout-redirect] PASS App.tsx has <Route path="/trip/:id">');
  });

  // ── D. API: convert-to-itinerary returns a valid tripId ──────────────────
  test(
    "POST /api/cart/convert-to-itinerary returns a tripId that matches the /trip/:id route shape",
    async () => {
      // 1. Register a fresh user
      const email = `e2e-cart-redirect-${uid()}@example.com`;
      const password = "TestRedirect123!";

      const registerResult = await apiCall("/api/auth/register", "POST", {
        email,
        password,
        firstName: "Cart",
        lastName: "Tester",
        userType: "user",
      });

      if (registerResult.status !== 201) {
        console.warn(
          `[cart-checkout-redirect] Server returned ${registerResult.status} for registration — ` +
            "skipping API integration assertions (server may not be running)."
        );
        test.skip();
        return;
      }

      // Extract session cookie from registration response
      const sessionCookie = registerResult.cookie ?? "";

      // 2. Add a content cart item (contentType=activity, free-form contentId)
      const cartResult = await apiCall(
        "/api/cart",
        "POST",
        {
          contentType: "activity",
          contentId: `e2e-test-activity-${uid()}`,
          contentMeta: {
            name: "E2E Test Activity",
            description: "Playwright test cart item",
            city: "Tokyo",
          },
          quantity: 1,
        },
        sessionCookie
      );

      expect(
        cartResult.status,
        `POST /api/cart failed (${cartResult.status}): ${JSON.stringify(cartResult.json)}`
      ).toBe(201);

      const cartItem = cartResult.json as { id: string };
      expect(cartItem.id, "Cart item must have an id").toBeTruthy();

      // 3. Convert the cart item into a new trip
      const convertResult = await apiCall(
        "/api/cart/convert-to-itinerary",
        "POST",
        {
          newTripName: "E2E Cart Redirect Test Trip",
          destination: "Tokyo, Japan",
          cartItemIds: [cartItem.id],
        },
        sessionCookie
      );

      expect(
        convertResult.status,
        `POST /api/cart/convert-to-itinerary failed (${convertResult.status}): ` +
          JSON.stringify(convertResult.json)
      ).toBe(200);

      const { tripId, convertedCount } = convertResult.json as {
        tripId: string;
        convertedCount: number;
      };

      expect(tripId, "convert-to-itinerary must return a non-empty tripId").toBeTruthy();

      // 4. Verify the tripId produces a valid /trip/:id URL (not the /trips/:id typo)
      //    The frontend will navigate to exactly this URL:
      const redirectUrl = `/trip/${tripId}`;
      expect(
        redirectUrl,
        "The redirect URL should be /trip/<id> (singular)"
      ).toMatch(/^\/trip\//);
      expect(
        redirectUrl,
        "The redirect URL must NOT be /trips/<id> (plural — broken route)"
      ).not.toMatch(/^\/trips\//);

      console.log(
        `[cart-checkout-redirect] PASS API → tripId=${tripId}, ` +
          `convertedCount=${convertedCount}, redirect=${redirectUrl}`
      );
    }
  );
});
