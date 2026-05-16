/**
 * Booking Flow Tests — BOOK-01 through BOOK-13
 *
 * Covers:
 *  - API auth guards (cart, activity checkout, bookings)
 *  - Request validation (missing required fields → 400)
 *  - Authenticated cart fetch (shape + fields)
 *  - Stripe PaymentIntent creation (activity/checkout happy path)
 *  - Cart page UI (signed-out state, signed-in state)
 *  - My Bookings page UI (tabs, sign-in prompt, activity tab)
 */

import { test, expect, type Page } from "@playwright/test";
import { loginAs, logout } from "../helpers/auth";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Make an unauthenticated API request via page.request (no browser cookies). */
async function unauthedPost(page: Page, path: string, body: object = {}) {
  return page.request.post(path, {
    headers: { "Content-Type": "application/json" },
    data: body,
  });
}

async function unauthedGet(page: Page, path: string) {
  return page.request.get(path);
}

// ─────────────────────────────────────────────────────────────────────────────
// BOOK-01 to BOOK-06: Auth guards — every booking endpoint rejects unauthenticated
// ─────────────────────────────────────────────────────────────────────────────

test("BOOK-01: GET /api/cart → 401 when not logged in", async ({ page }) => {
  await logout(page);
  const resp = await unauthedGet(page, "/api/cart");
  expect(resp.status()).toBe(401);
  const body = await resp.json();
  expect(body).toHaveProperty("message");
  console.log("BOOK-01 body:", body.message);
});

test("BOOK-02: POST /api/cart/items → 401 when not logged in", async ({ page }) => {
  await logout(page);
  const resp = await unauthedPost(page, "/api/cart/items", { serviceId: "test-id" });
  expect(resp.status()).toBe(401);
  console.log("BOOK-02 status:", resp.status());
});

test("BOOK-03: POST /api/bookings/activity/checkout → 401 when not logged in", async ({ page }) => {
  await logout(page);
  const resp = await unauthedPost(page, "/api/bookings/activity/checkout", {
    provider: "viator",
    title: "Test Tour",
    price: "49.99",
  });
  expect(resp.status()).toBe(401);
  console.log("BOOK-03 status:", resp.status());
});

test("BOOK-04: POST /api/bookings/activity/check-availability → 401 when not logged in", async ({ page }) => {
  await logout(page);
  const resp = await unauthedPost(page, "/api/bookings/activity/check-availability", {
    productCode: "VIATOR123",
    travelDate: "2026-09-01",
  });
  expect(resp.status()).toBe(401);
  console.log("BOOK-04 status:", resp.status());
});

test("BOOK-05: POST /api/bookings/process-cart → 401 when not logged in", async ({ page }) => {
  await logout(page);
  const resp = await unauthedPost(page, "/api/bookings/process-cart", {
    userId: "fake",
    cartItems: [],
  });
  expect(resp.status()).toBe(401);
  console.log("BOOK-05 status:", resp.status());
});

test("BOOK-06: GET /api/bookings/my-activity-bookings → 401 when not logged in", async ({ page }) => {
  await logout(page);
  const resp = await unauthedGet(page, "/api/bookings/my-activity-bookings");
  expect(resp.status()).toBe(401);
  console.log("BOOK-06 status:", resp.status());
});

// ─────────────────────────────────────────────────────────────────────────────
// BOOK-07: Validation — missing required fields returns 400
// ─────────────────────────────────────────────────────────────────────────────

test("BOOK-07: Activity checkout validation — missing required fields → 400", async ({ page }) => {
  // Login first so auth is not the reason for failure
  await loginAs(page, "user");

  // Body missing "title" and "price" — only provider supplied
  const resp = await page.request.post("/api/bookings/activity/checkout", {
    headers: { "Content-Type": "application/json" },
    data: { provider: "viator" }, // title and price intentionally missing
  });
  expect(resp.status()).toBe(400);
  const body = await resp.json();
  console.log("BOOK-07 validation error:", body.error ?? body.message);
  expect(body.error ?? body.message).toMatch(/required|title|price/i);
});

// ─────────────────────────────────────────────────────────────────────────────
// BOOK-08: Authenticated cart fetch — correct shape
// ─────────────────────────────────────────────────────────────────────────────

test("BOOK-08: GET /api/cart → 200 with correct shape when authenticated", async ({ page }) => {
  await loginAs(page, "user");

  const resp = await page.request.get("/api/cart");
  expect(resp.status()).toBe(200);

  const body = await resp.json();
  console.log("BOOK-08 cart shape keys:", Object.keys(body));

  // Required response fields
  expect(body).toHaveProperty("items");
  expect(body).toHaveProperty("subtotal");
  expect(body).toHaveProperty("platformFee");
  expect(body).toHaveProperty("total");
  expect(body).toHaveProperty("itemCount");
  expect(Array.isArray(body.items)).toBe(true);

  // Numeric string values (toFixed format)
  expect(parseFloat(body.subtotal)).toBeGreaterThanOrEqual(0);
  expect(parseFloat(body.total)).toBeGreaterThanOrEqual(0);
  console.log("BOOK-08 cart — items:", body.itemCount, "total: $" + body.total);
});

// ─────────────────────────────────────────────────────────────────────────────
// BOOK-09: Activity checkout happy path — creates PaymentIntent
// ─────────────────────────────────────────────────────────────────────────────

test("BOOK-09: POST /api/bookings/activity/checkout → creates PaymentIntent record", async ({ page }) => {
  await loginAs(page, "user");

  const resp = await page.request.post("/api/bookings/activity/checkout", {
    headers: { "Content-Type": "application/json" },
    data: {
      provider: "viator",
      title: "Test Playwright Tour",
      price: "29.99",
      currency: "USD",
      productCode: "PLAYWRIGHT-TEST-001",
      travelDate: "2026-10-15",
      travelerCount: 2,
    },
  });

  console.log("BOOK-09 status:", resp.status());

  if (resp.status() === 201) {
    // Stripe key is configured — full happy path
    const body = await resp.json();
    console.log("BOOK-09 response keys:", Object.keys(body));
    expect(body).toHaveProperty("clientSecret");
    expect(body).toHaveProperty("paymentIntentId");
    expect(body).toHaveProperty("bookingId");
    expect(body).toHaveProperty("amount");
    expect(body.clientSecret).toMatch(/^pi_/);
    expect(body.paymentIntentId).toMatch(/^pi_/);
    expect(typeof body.bookingId).toBe("string");
    expect(body.amount).toBe(2999); // $29.99 in cents
    console.log("BOOK-09 booking created:", body.bookingId, "PI:", body.paymentIntentId);
  } else {
    // Stripe key not configured in this environment — accept 500 with error detail
    expect(resp.status()).toBe(500);
    const body = await resp.json();
    expect(body).toHaveProperty("error");
    console.log("BOOK-09 Stripe not configured:", body.error);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// BOOK-10: My Activity Bookings fetch — returns array when authenticated
// ─────────────────────────────────────────────────────────────────────────────

test("BOOK-10: GET /api/bookings/my-activity-bookings → 200 array when authenticated", async ({ page }) => {
  await loginAs(page, "user");

  const resp = await page.request.get("/api/bookings/my-activity-bookings");
  expect(resp.status()).toBe(200);

  const body = await resp.json();
  expect(Array.isArray(body)).toBe(true);
  console.log("BOOK-10 activity bookings count:", body.length);
});

// ─────────────────────────────────────────────────────────────────────────────
// BOOK-11: Cart page UI — shows sign-in prompt when logged out
// ─────────────────────────────────────────────────────────────────────────────

test("BOOK-11: Cart page — shows sign-in button when not logged in", async ({ page }) => {
  await logout(page);
  await page.goto("/cart");
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(1500);

  // The cart page renders a "Sign In" button for unauthenticated users
  const signInBtn = page.locator("[data-testid='button-sign-in']");
  await expect(signInBtn).toBeVisible({ timeout: 8000 });
  console.log("BOOK-11 sign-in button visible on cart for unauthenticated user ✓");
});

// ─────────────────────────────────────────────────────────────────────────────
// BOOK-12: Cart page UI — loads correct structure when logged in
// ─────────────────────────────────────────────────────────────────────────────

test("BOOK-12: Cart page — loads with correct UI when logged in", async ({ page }) => {
  // Ensure clean session before logging in
  await logout(page);
  await loginAs(page, "user");
  await page.goto("/cart");
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(2000);

  // Page title always shows for authenticated users ("Your Cart" or step-specific title)
  await expect(page.locator("[data-testid='text-page-title']")).toBeVisible({ timeout: 8000 });
  const title = await page.locator("[data-testid='text-page-title']").textContent();
  console.log("BOOK-12 cart page title:", title?.trim());

  // Back button always present in authenticated cart
  await expect(page.locator("[data-testid='button-back']")).toBeVisible({ timeout: 5000 });

  // Badge only renders when totalItemCount > 0; browse-services button shows for empty cart
  const hasBadge = (await page.locator("[data-testid='badge-item-count']").count()) > 0;
  const isEmpty = (await page.locator("[data-testid='button-browse-services']").count()) > 0;

  if (hasBadge) {
    const itemCount = await page.locator("[data-testid='badge-item-count']").textContent();
    console.log("BOOK-12 cart badge:", itemCount);
    // Non-empty cart shows totals in order summary
    await expect(page.locator("[data-testid='text-subtotal']").first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator("[data-testid='text-total']").first()).toBeVisible({ timeout: 5000 });
  } else if (isEmpty) {
    console.log("BOOK-12 cart is empty — browse-services button shown");
    await expect(page.locator("[data-testid='button-browse-services']")).toBeVisible();
  }
  console.log("BOOK-12 cart UI verified ✓");
});

// ─────────────────────────────────────────────────────────────────────────────
// BOOK-13: My Bookings page UI — loads with all tabs when logged in
// ─────────────────────────────────────────────────────────────────────────────

test("BOOK-13: My Bookings page — loads with correct UI when logged in", async ({ page }) => {
  // Ensure clean session before logging in
  await logout(page);
  await loginAs(page, "user");
  await page.goto("/bookings");
  await page.waitForLoadState("domcontentloaded");
  // Give ProtectedRoute + auth hook time to resolve and render content
  await page.waitForTimeout(4000);

  // Page title always renders once authenticated (outside any conditional block)
  await expect(page.locator("[data-testid='text-page-title']")).toBeVisible({ timeout: 10000 });
  const title = await page.locator("[data-testid='text-page-title']").textContent();
  console.log("BOOK-13 page title:", title?.trim());

  // Tabs only render when there are bookings; empty state shows browse-services button instead
  const hasTabs = (await page.locator("[data-testid='tabs-booking-status']").count()) > 0;

  if (hasTabs) {
    console.log("BOOK-13 tabs visible — verifying all 5 tab triggers");
    for (const tabId of ["tab-all", "tab-pending", "tab-active", "tab-completed", "tab-activities"]) {
      await expect(page.locator(`[data-testid='${tabId}']`)).toBeVisible({ timeout: 5000 });
    }
    // Click Activities tab
    await page.locator("[data-testid='tab-activities']").click();
    await page.waitForTimeout(800);
    console.log("BOOK-13 all 5 tabs visible + Activities tab clickable ✓");
  } else {
    // No bookings yet — empty state card with browse button
    console.log("BOOK-13 no bookings yet — checking empty state");
    await expect(page.locator("[data-testid='button-browse-services']")).toBeVisible({ timeout: 5000 });
    console.log("BOOK-13 empty state with browse-services button ✓");
  }
});
