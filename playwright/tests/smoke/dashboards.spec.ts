/**
 * Expert & Provider Dashboard Tests — DASH-01 through DASH-16
 *
 * Covers:
 *  - API auth guards (expert/provider dashboard + analytics endpoints)
 *  - API response shape validation for expert and provider roles
 *  - Role-based access control: regular users and wrong-role users are denied
 *  - Admin bypass: admins can access any role-protected page
 *  - Expert dashboard UI: welcome heading, stat cards, quick-action buttons
 *  - Provider dashboard UI: welcome heading, stat cards, quick-action buttons
 *
 * Test accounts:
 *   user     → testuser@traveloure.test / TestPass123!
 *   expert   → expert_test_001@traveloure.test / TestPass123!
 *   provider → test-provider@traveloure.test / TestPass123!
 *   admin    → admin@traveloure.test / AdminPass123!
 */

import { test, expect, type Page } from "@playwright/test";
import { loginAs, logout } from "../helpers/auth";

// ─────────────────────────────────────────────────────────────────────────────
// DASH-01 to DASH-04: API auth guards
// ─────────────────────────────────────────────────────────────────────────────

test("DASH-01: GET /api/expert/dashboard → 401 when not logged in", async ({ page }) => {
  await logout(page);
  const resp = await page.request.get("/api/expert/dashboard");
  expect(resp.status()).toBe(401);
  console.log("DASH-01:", resp.status());
});

test("DASH-02: GET /api/expert/analytics/dashboard → 401 when not logged in", async ({ page }) => {
  await logout(page);
  const resp = await page.request.get("/api/expert/analytics/dashboard");
  expect(resp.status()).toBe(401);
  console.log("DASH-02:", resp.status());
});

test("DASH-03: GET /api/provider/dashboard → 401 when not logged in", async ({ page }) => {
  await logout(page);
  const resp = await page.request.get("/api/provider/dashboard");
  expect(resp.status()).toBe(401);
  console.log("DASH-03:", resp.status());
});

test("DASH-04: GET /api/provider/analytics/dashboard → 401 when not logged in", async ({ page }) => {
  await logout(page);
  const resp = await page.request.get("/api/provider/analytics/dashboard");
  expect(resp.status()).toBe(401);
  console.log("DASH-04:", resp.status());
});

// ─────────────────────────────────────────────────────────────────────────────
// DASH-05 to DASH-07: Expert API responses — shape validation
// ─────────────────────────────────────────────────────────────────────────────

test("DASH-05: GET /api/expert/dashboard → 200 with correct shape for expert", async ({ page }) => {
  await loginAs(page, "expert");
  const resp = await page.request.get("/api/expert/dashboard");
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  console.log("DASH-05 keys:", Object.keys(body));
  // Required top-level fields
  expect(body).toHaveProperty("summary");
  expect(body).toHaveProperty("services");
  expect(body).toHaveProperty("recentEarnings");
  // Summary sub-fields
  expect(body.summary).toHaveProperty("totalRevenue");
  expect(body.summary).toHaveProperty("totalBookings");
  expect(body.summary).toHaveProperty("completedBookings");
  expect(body.summary).toHaveProperty("pendingBookings");
  expect(Array.isArray(body.services)).toBe(true);
  expect(Array.isArray(body.recentEarnings)).toBe(true);
  console.log("DASH-05 summary:", JSON.stringify(body.summary));
});

test("DASH-06: GET /api/expert/analytics/dashboard → 200 with analytics shape", async ({ page }) => {
  await loginAs(page, "expert");
  const resp = await page.request.get("/api/expert/analytics/dashboard");
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  console.log("DASH-06 keys:", Object.keys(body));
  expect(body).toHaveProperty("summary");
  expect(body.summary).toHaveProperty("totalRevenue");
  expect(body.summary).toHaveProperty("totalBookings");
  expect(body.summary).toHaveProperty("avgRating");
  console.log("DASH-06 analytics summary:", JSON.stringify(body.summary));
});

test("DASH-07: GET /api/expert/bookings → 200 array for expert", async ({ page }) => {
  await loginAs(page, "expert");
  const resp = await page.request.get("/api/expert/bookings");
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  expect(Array.isArray(body)).toBe(true);
  console.log("DASH-07 expert bookings count:", body.length);
});

// ─────────────────────────────────────────────────────────────────────────────
// DASH-08 to DASH-10: Provider API responses — shape validation
// ─────────────────────────────────────────────────────────────────────────────

test("DASH-08: GET /api/provider/dashboard → 200 with correct shape for provider", async ({ page }) => {
  await loginAs(page, "provider");
  const resp = await page.request.get("/api/provider/dashboard");
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  console.log("DASH-08 keys:", Object.keys(body));
  expect(body).toHaveProperty("summary");
  expect(body).toHaveProperty("services");
  expect(body.summary).toHaveProperty("totalRevenue");
  expect(body.summary).toHaveProperty("totalBookings");
  expect(body.summary).toHaveProperty("completedBookings");
  expect(body.summary).toHaveProperty("pendingBookings");
  expect(Array.isArray(body.services)).toBe(true);
  console.log("DASH-08 summary:", JSON.stringify(body.summary));
});

test("DASH-09: GET /api/provider/analytics/dashboard → 200 with analytics shape", async ({ page }) => {
  await loginAs(page, "provider");
  const resp = await page.request.get("/api/provider/analytics/dashboard");
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  console.log("DASH-09 keys:", Object.keys(body));
  expect(body).toHaveProperty("summary");
  expect(body).toHaveProperty("monthlyRevenue");
  expect(body).toHaveProperty("servicePerformance");
  expect(body).toHaveProperty("benchmarks");
  expect(Array.isArray(body.monthlyRevenue)).toBe(true);
  expect(body.monthlyRevenue.length).toBeGreaterThan(0);
  // Each monthly record has month + revenue + bookings
  const firstMonth = body.monthlyRevenue[0];
  expect(firstMonth).toHaveProperty("month");
  expect(firstMonth).toHaveProperty("revenue");
  expect(firstMonth).toHaveProperty("bookings");
  console.log("DASH-09 monthly revenue entries:", body.monthlyRevenue.length);
  console.log("DASH-09 benchmarks:", JSON.stringify(body.benchmarks));
});

test("DASH-10: GET /api/provider/bookings → 200 array for provider", async ({ page }) => {
  await loginAs(page, "provider");
  const resp = await page.request.get("/api/provider/bookings");
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  expect(Array.isArray(body)).toBe(true);
  console.log("DASH-10 provider bookings count:", body.length);
});

// ─────────────────────────────────────────────────────────────────────────────
// DASH-11 to DASH-13: Role enforcement — wrong roles see "Access Denied"
// ─────────────────────────────────────────────────────────────────────────────

test("DASH-11: Regular user visiting /expert/dashboard sees Access Denied", async ({ page }) => {
  await logout(page);
  await loginAs(page, "user");
  await page.goto("/expert/dashboard");
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(2500);

  const url = page.url();
  console.log("DASH-11 URL after nav:", url);

  // Either redirected away OR shows Access Denied message
  const deniedText = page.getByText("Access Denied");
  const isDenied = (await deniedText.count()) > 0;

  if (isDenied) {
    await expect(deniedText.first()).toBeVisible({ timeout: 5000 });
    // Should have a "Back to Dashboard" link
    const backBtn = page.getByRole("button", { name: /back to dashboard/i });
    await expect(backBtn).toBeVisible({ timeout: 5000 });
    console.log("DASH-11 Access Denied message shown ✓");
  } else {
    // Redirected away from /expert/dashboard
    expect(url).not.toMatch(/\/expert\/dashboard/);
    console.log("DASH-11 redirected to:", url, "✓");
  }
});

test("DASH-12: Regular user visiting /provider/dashboard sees Access Denied", async ({ page }) => {
  await logout(page);
  await loginAs(page, "user");
  await page.goto("/provider/dashboard");
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(2500);

  const url = page.url();
  console.log("DASH-12 URL after nav:", url);

  const deniedText = page.getByText("Access Denied");
  const isDenied = (await deniedText.count()) > 0;

  if (isDenied) {
    await expect(deniedText.first()).toBeVisible({ timeout: 5000 });
    console.log("DASH-12 Access Denied message shown ✓");
  } else {
    expect(url).not.toMatch(/\/provider\/dashboard/);
    console.log("DASH-12 redirected to:", url, "✓");
  }
});

test("DASH-13: Expert visiting /provider/dashboard sees Access Denied", async ({ page }) => {
  await logout(page);
  await loginAs(page, "expert");
  await page.goto("/provider/dashboard");
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(2500);

  const url = page.url();
  console.log("DASH-13 URL after nav:", url);

  const deniedText = page.getByText("Access Denied");
  const isDenied = (await deniedText.count()) > 0;

  if (isDenied) {
    await expect(deniedText.first()).toBeVisible({ timeout: 5000 });
    console.log("DASH-13 Expert blocked from provider dashboard ✓");
  } else {
    expect(url).not.toMatch(/\/provider\/dashboard/);
    console.log("DASH-13 Expert redirected from provider dashboard ✓");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DASH-14 to DASH-15: Dashboard UI structure
// ─────────────────────────────────────────────────────────────────────────────

test("DASH-14: Expert dashboard UI — welcome, stat cards, quick actions", async ({ page }) => {
  await logout(page);
  await loginAs(page, "expert");
  await page.goto("/expert/dashboard");
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(3000);

  // Dashboard container
  await expect(page.locator("[data-testid='expert-dashboard']")).toBeVisible({ timeout: 10000 });

  // Welcome heading
  await expect(page.locator("[data-testid='text-expert-welcome']")).toBeVisible({ timeout: 5000 });
  const welcome = await page.locator("[data-testid='text-expert-welcome']").textContent();
  console.log("DASH-14 welcome:", welcome?.trim());

  // At least the first stat card
  await expect(page.locator("[data-testid='card-stat-0']")).toBeVisible({ timeout: 5000 });
  console.log("DASH-14 first stat card visible ✓");

  // Quick-action buttons
  for (const btn of ["button-quick-messages", "button-quick-itinerary", "button-quick-content", "button-quick-ai"]) {
    await expect(page.locator(`[data-testid='${btn}']`)).toBeVisible({ timeout: 5000 });
  }
  console.log("DASH-14 all 4 quick-action buttons visible ✓");

  // Payout + analytics buttons in sidebar panels
  await expect(page.locator("[data-testid='button-request-payout']")).toBeVisible({ timeout: 5000 });
  await expect(page.locator("[data-testid='button-view-analytics']")).toBeVisible({ timeout: 5000 });
  console.log("DASH-14 expert dashboard UI fully verified ✓");
});

test("DASH-15: Provider dashboard UI — welcome, stat cards, quick actions", async ({ page }) => {
  await logout(page);
  await loginAs(page, "provider");
  await page.goto("/provider/dashboard");
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(3000);

  // Dashboard container
  await expect(page.locator("[data-testid='provider-dashboard']")).toBeVisible({ timeout: 10000 });

  // Welcome heading
  await expect(page.locator("[data-testid='text-welcome']")).toBeVisible({ timeout: 5000 });
  const welcome = await page.locator("[data-testid='text-welcome']").textContent();
  console.log("DASH-15 welcome:", welcome?.trim());

  // Quick-action buttons
  for (const btn of ["button-messages", "button-update-calendar", "button-my-services", "button-view-analytics"]) {
    await expect(page.locator(`[data-testid='${btn}']`)).toBeVisible({ timeout: 5000 });
  }
  console.log("DASH-15 all 4 quick-action buttons visible ✓");

  // Add service + payout buttons
  await expect(page.locator("[data-testid='button-add-service']")).toBeVisible({ timeout: 5000 });
  await expect(page.locator("[data-testid='button-request-payout']")).toBeVisible({ timeout: 5000 });
  console.log("DASH-15 provider dashboard UI fully verified ✓");
});

// ─────────────────────────────────────────────────────────────────────────────
// DASH-16: Admin bypass — admin can access role-protected pages
// ─────────────────────────────────────────────────────────────────────────────

test("DASH-16: Admin can access expert and provider dashboards (role bypass)", async ({ page }) => {
  await logout(page);
  await loginAs(page, "admin");

  // Admin visiting /expert/dashboard — should NOT see "Access Denied"
  await page.goto("/expert/dashboard");
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(2500);

  const expertUrl = page.url();
  const deniedOnExpert = (await page.getByText("Access Denied").count()) > 0;
  expect(deniedOnExpert).toBe(false);
  console.log("DASH-16 admin on /expert/dashboard — Access Denied shown:", deniedOnExpert, "✓");

  // Admin visiting /provider/dashboard — should NOT see "Access Denied"
  await page.goto("/provider/dashboard");
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(2500);

  const deniedOnProvider = (await page.getByText("Access Denied").count()) > 0;
  expect(deniedOnProvider).toBe(false);
  console.log("DASH-16 admin on /provider/dashboard — Access Denied shown:", deniedOnProvider, "✓");
  console.log("DASH-16 admin role bypass confirmed for both dashboards ✓");
});
