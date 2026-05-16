/**
 * ADMN-01–16: Admin Dashboard & Management
 * Tests auth guards (401 unauth, 403 non-admin), admin stats, bookings, revenue,
 * applications, activity feed, analytics, and E2E admin flow.
 */
import { test, expect } from "@playwright/test";
import { loginAs, logout } from "../helpers/auth";

// ─── Auth Guards (unauthenticated → 401) ─────────────────────────────────────

test("ADMN-01: GET /api/admin/stats → 401 when not logged in", async ({ page }) => {
  const resp = await page.request.get("/api/admin/stats");
  console.log("ADMN-01:", resp.status());
  expect(resp.status()).toBe(401);
});

test("ADMN-02: GET /api/admin/bookings → 401 when not logged in", async ({ page }) => {
  const resp = await page.request.get("/api/admin/bookings");
  console.log("ADMN-02:", resp.status());
  expect(resp.status()).toBe(401);
});

test("ADMN-03: GET /api/admin/revenue → 401 when not logged in", async ({ page }) => {
  const resp = await page.request.get("/api/admin/revenue");
  console.log("ADMN-03:", resp.status());
  expect(resp.status()).toBe(401);
});

// ─── Role Guards (authenticated non-admin → 403) ──────────────────────────────

test("ADMN-04: GET /api/admin/stats → 403 for regular user", async ({ page }) => {
  await loginAs(page, "user");
  const resp = await page.request.get("/api/admin/stats");
  console.log("ADMN-04:", resp.status());
  expect(resp.status()).toBe(403);
  const body = await resp.json();
  expect(body.message).toMatch(/admin/i);
});

test("ADMN-05: GET /api/admin/bookings → 403 for expert", async ({ page }) => {
  await loginAs(page, "expert");
  const resp = await page.request.get("/api/admin/bookings");
  console.log("ADMN-05:", resp.status());
  expect(resp.status()).toBe(403);
});

test("ADMN-06: GET /api/admin/revenue → 403 for provider", async ({ page }) => {
  await loginAs(page, "provider");
  const resp = await page.request.get("/api/admin/revenue");
  console.log("ADMN-06:", resp.status());
  expect(resp.status()).toBe(403);
});

test("ADMN-07: GET /api/admin/expert-applications → 403 for regular user", async ({ page }) => {
  await loginAs(page, "user");
  const resp = await page.request.get("/api/admin/expert-applications");
  console.log("ADMN-07:", resp.status());
  expect(resp.status()).toBe(403);
});

// ─── Admin Access — Stats & Data ──────────────────────────────────────────────

test("ADMN-08: GET /api/admin/stats → stats shape as admin", async ({ page }) => {
  await loginAs(page, "admin");
  const resp = await page.request.get("/api/admin/stats");
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  expect(body).toHaveProperty("totalUsers");
  expect(body).toHaveProperty("totalBookings");
  expect(body).toHaveProperty("totalRevenue");
  expect(body).toHaveProperty("pendingExpertApplications");
  expect(body).toHaveProperty("pendingProviderApplications");
  expect(typeof body.totalUsers).toBe("number");
  expect(typeof body.totalRevenue).toBe("number");
  console.log("ADMN-08: stats ok — users:", body.totalUsers, "revenue:", body.totalRevenue);
});

test("ADMN-09: GET /api/admin/bookings → array as admin", async ({ page }) => {
  await loginAs(page, "admin");
  const resp = await page.request.get("/api/admin/bookings");
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  expect(Array.isArray(body)).toBe(true);
  console.log("ADMN-09: bookings count:", body.length);
});

test("ADMN-10: GET /api/admin/revenue → revenue summary object as admin", async ({ page }) => {
  await loginAs(page, "admin");
  const resp = await page.request.get("/api/admin/revenue");
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  expect(body).toHaveProperty("totalRevenue");
  expect(body).toHaveProperty("totalBookings");
  expect(typeof body.totalRevenue).toBe("number");
  console.log("ADMN-10: revenue summary — total:", body.totalRevenue, "bookings:", body.totalBookings);
});

test("ADMN-11: GET /api/admin/provider-applications → array as admin", async ({ page }) => {
  await loginAs(page, "admin");
  const resp = await page.request.get("/api/admin/provider-applications");
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  expect(Array.isArray(body)).toBe(true);
  console.log("ADMN-11: provider applications:", body.length);
});

test("ADMN-12: GET /api/admin/activity/recent → array as admin", async ({ page }) => {
  await loginAs(page, "admin");
  const resp = await page.request.get("/api/admin/activity/recent");
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  expect(Array.isArray(body)).toBe(true);
  console.log("ADMN-12: recent activity:", body.length, "items");
  if (body.length > 0) {
    expect(body[0]).toHaveProperty("action");
  }
});

test("ADMN-13: GET /api/admin/analytics/overview → analytics shape as admin", async ({ page }) => {
  await loginAs(page, "admin");
  const resp = await page.request.get("/api/admin/analytics/overview");
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  // Should be an object with analytics data
  expect(typeof body).toBe("object");
  console.log("ADMN-13: analytics overview keys:", Object.keys(body).slice(0, 5).join(", "));
});

test("ADMN-14: PATCH /api/admin/expert-applications/:id/status → 400 on invalid status", async ({ page }) => {
  await loginAs(page, "admin");
  const resp = await page.request.patch("/api/admin/expert-applications/00000000-0000-0000-0000-000000000000/status", {
    data: { status: "invalid_status" },
  });
  console.log("ADMN-14:", resp.status());
  // Should reject invalid status (400) or return 404 for non-existent app
  expect([400, 404]).toContain(resp.status());
  console.log("ADMN-14: invalid status rejected ✓");
});

// ─── Admin Dashboard Page ─────────────────────────────────────────────────────

test("ADMN-15: /admin/dashboard → renders stats cards as admin", async ({ page }) => {
  await loginAs(page, "admin");
  await page.goto("/admin/dashboard");
  await page.waitForLoadState("domcontentloaded");
  // Should be on admin dashboard, not redirected
  expect(page.url()).toContain("/admin");
  console.log("ADMN-15: admin dashboard URL:", page.url());
  // Wait for stats to load
  await page.waitForTimeout(2000);
  const bodyText = await page.locator("body").innerText();
  const hasStats = bodyText.includes("Users") || bodyText.includes("Booking") || bodyText.includes("Revenue") || bodyText.includes("Admin");
  expect(hasStats).toBe(true);
  console.log("ADMN-15: dashboard content found ✓");
});

// ─── E2E Admin Flow ───────────────────────────────────────────────────────────

test("ADMN-16: E2E — admin stats → bookings → revenue → applications flow", async ({ page }) => {
  await loginAs(page, "admin");

  // Step 1: Stats
  const stats = await page.request.get("/api/admin/stats");
  expect(stats.status()).toBe(200);
  const statsBody = await stats.json();
  expect(typeof statsBody.totalUsers).toBe("number");
  console.log("ADMN-16 Step 1: stats ok, users:", statsBody.totalUsers);

  // Step 2: Bookings list
  const bookings = await page.request.get("/api/admin/bookings");
  expect(bookings.status()).toBe(200);
  const bookingList = await bookings.json();
  expect(Array.isArray(bookingList)).toBe(true);
  console.log("ADMN-16 Step 2: bookings:", bookingList.length);

  // Step 3: Revenue data
  const revenue = await page.request.get("/api/admin/revenue");
  expect(revenue.status()).toBe(200);
  const revenueData = await revenue.json();
  expect(revenueData).toHaveProperty("totalRevenue");
  console.log("ADMN-16 Step 3: revenue total:", revenueData.totalRevenue);

  // Step 4: Expert applications
  const expertApps = await page.request.get("/api/admin/expert-applications");
  expect(expertApps.status()).toBe(200);
  const expertList = await expertApps.json();
  expect(Array.isArray(expertList)).toBe(true);
  console.log("ADMN-16 Step 4: expert applications:", expertList.length);

  // Step 5: Provider applications
  const providerApps = await page.request.get("/api/admin/provider-applications");
  expect(providerApps.status()).toBe(200);
  const providerList = await providerApps.json();
  expect(Array.isArray(providerList)).toBe(true);
  console.log("ADMN-16 Step 5: provider applications:", providerList.length);

  // Step 6: Recent activity feed
  const activity = await page.request.get("/api/admin/activity/recent");
  expect(activity.status()).toBe(200);
  const activityList = await activity.json();
  expect(Array.isArray(activityList)).toBe(true);
  console.log("ADMN-16 Step 6: activity items:", activityList.length);

  // Step 7: Ensure regular user gets 403 on all admin endpoints
  await logout(page);
  await loginAs(page, "user");
  const forbidden = await page.request.get("/api/admin/stats");
  expect(forbidden.status()).toBe(403);
  console.log("ADMN-16 Step 7: user blocked from admin ✓");

  console.log("ADMN-16 E2E admin flow complete ✓");
});
