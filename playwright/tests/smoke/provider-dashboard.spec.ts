/**
 * PRVD-01–16: Provider Dashboard & Services
 * Tests auth guards, dashboard shape, services CRUD, analytics, availability, E2E
 */
import { test, expect } from "@playwright/test";
import { loginAs, logout } from "../helpers/auth";

// ─── Auth Guards ─────────────────────────────────────────────────────────────

test("PRVD-01: GET /api/provider/dashboard → 401 when not logged in", async ({ page }) => {
  const resp = await page.request.get("/api/provider/dashboard");
  console.log("PRVD-01:", resp.status());
  expect(resp.status()).toBe(401);
});

test("PRVD-02: GET /api/provider/services → 401 when not logged in", async ({ page }) => {
  const resp = await page.request.get("/api/provider/services");
  console.log("PRVD-02:", resp.status());
  expect(resp.status()).toBe(401);
});

test("PRVD-03: GET /api/provider/bookings → 401 when not logged in", async ({ page }) => {
  const resp = await page.request.get("/api/provider/bookings");
  console.log("PRVD-03:", resp.status());
  expect(resp.status()).toBe(401);
});

// ─── Dashboard Shape ──────────────────────────────────────────────────────────

test("PRVD-04: GET /api/provider/dashboard → {summary, services} as provider", async ({ page }) => {
  await loginAs(page, "provider");
  const resp = await page.request.get("/api/provider/dashboard");
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  expect(body).toHaveProperty("summary");
  expect(body).toHaveProperty("services");
  expect(body.summary).toHaveProperty("totalRevenue");
  expect(body.summary).toHaveProperty("totalBookings");
  expect(Array.isArray(body.services)).toBe(true);
  console.log("PRVD-04: dashboard ok — services:", body.services.length, "revenue:", body.summary.totalRevenue);
});

test("PRVD-05: GET /api/provider/analytics/dashboard → analytics shape as provider", async ({ page }) => {
  await loginAs(page, "provider");
  const resp = await page.request.get("/api/provider/analytics/dashboard");
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  expect(body).toHaveProperty("summary");
  expect(body).toHaveProperty("monthlyRevenue");
  expect(body).toHaveProperty("servicePerformance");
  expect(Array.isArray(body.monthlyRevenue)).toBe(true);
  console.log("PRVD-05: analytics ok — monthly periods:", body.monthlyRevenue.length);
});

test("PRVD-06: GET /api/provider/bookings → returns array as provider", async ({ page }) => {
  await loginAs(page, "provider");
  const resp = await page.request.get("/api/provider/bookings");
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  expect(Array.isArray(body)).toBe(true);
  console.log("PRVD-06: provider bookings:", body.length);
});

test("PRVD-07: GET /api/provider/services → returns array as provider", async ({ page }) => {
  await loginAs(page, "provider");
  const resp = await page.request.get("/api/provider/services");
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  expect(Array.isArray(body)).toBe(true);
  console.log("PRVD-07: provider services:", body.length);
});

// ─── Service CRUD ─────────────────────────────────────────────────────────────

test("PRVD-08: POST /api/provider/services → creates service, returns 201", async ({ page }) => {
  await loginAs(page, "provider");
  const resp = await page.request.post("/api/provider/services", {
    data: {
      serviceName: "Test E2E Service",
      description: "A test service for E2E testing",
      basePrice: 99.99,
      currency: "USD",
      duration: "2 hours",
      maxCapacity: 10,
    },
  });
  console.log("PRVD-08:", resp.status());
  expect([200, 201]).toContain(resp.status());
  const body = await resp.json();
  expect(body).toHaveProperty("id");
  console.log("PRVD-08: service created:", body.id, body.serviceName);
});

test("PRVD-09: POST /api/provider/services → 400 missing required fields", async ({ page }) => {
  await loginAs(page, "provider");
  const resp = await page.request.post("/api/provider/services", {
    data: {},
  });
  console.log("PRVD-09:", resp.status());
  expect([400, 422]).toContain(resp.status());
  console.log("PRVD-09: validation rejected missing fields ✓");
});

// ─── Earnings ────────────────────────────────────────────────────────────────

test("PRVD-10: GET /api/provider/earnings → returns array as provider", async ({ page }) => {
  await loginAs(page, "provider");
  const resp = await page.request.get("/api/provider/earnings");
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  expect(Array.isArray(body)).toBe(true);
  console.log("PRVD-10: earnings records:", body.length);
});

test("PRVD-11: GET /api/provider/earnings/summary → earnings summary shape", async ({ page }) => {
  await loginAs(page, "provider");
  const resp = await page.request.get("/api/provider/earnings/summary");
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  // Should have summary data
  expect(typeof body).toBe("object");
  console.log("PRVD-11: earnings summary keys:", Object.keys(body).slice(0, 5).join(", "));
});

// ─── Availability ─────────────────────────────────────────────────────────────

test("PRVD-12: GET /api/provider/availability → {schedule, blackoutDates} as provider", async ({ page }) => {
  await loginAs(page, "provider");
  const resp = await page.request.get("/api/provider/availability");
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  expect(body).toHaveProperty("schedule");
  expect(body).toHaveProperty("blackoutDates");
  expect(Array.isArray(body.blackoutDates)).toBe(true);
  console.log("PRVD-12: availability ok — blackout dates:", body.blackoutDates.length);
});

test("PRVD-13: GET /api/provider/booking-requests → returns {requests} as provider", async ({ page }) => {
  await loginAs(page, "provider");
  const resp = await page.request.get("/api/provider/booking-requests");
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  expect(body).toHaveProperty("requests");
  expect(Array.isArray(body.requests)).toBe(true);
  console.log("PRVD-13: booking requests:", body.requests.length);
});

// ─── Provider Dashboard UI ────────────────────────────────────────────────────

test("PRVD-14: /provider/dashboard → renders as provider", async ({ page }) => {
  await loginAs(page, "provider");
  await page.goto("/provider/dashboard");
  await page.waitForLoadState("domcontentloaded");
  expect(page.url()).toContain("/provider");
  console.log("PRVD-14: URL:", page.url());
  await page.waitForTimeout(1500);
  const bodyText = await page.locator("body").innerText();
  const hasDashboard = bodyText.includes("Service") || bodyText.includes("Booking") || bodyText.includes("Revenue") || bodyText.includes("Provider");
  expect(hasDashboard).toBe(true);
  console.log("PRVD-14: provider dashboard content found ✓");
});

// ─── Public Provider Services ─────────────────────────────────────────────────

test("PRVD-15: GET /api/provider-services → public list returns array (no auth)", async ({ page }) => {
  const resp = await page.request.get("/api/provider-services");
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  expect(Array.isArray(body)).toBe(true);
  console.log("PRVD-15: public provider services:", body.length);
});

// ─── E2E Provider Flow ────────────────────────────────────────────────────────

test("PRVD-16: E2E — dashboard → services → analytics → availability → earnings", async ({ page }) => {
  await loginAs(page, "provider");

  // Step 1: Dashboard
  const dash = await page.request.get("/api/provider/dashboard");
  expect(dash.status()).toBe(200);
  const dashBody = await dash.json();
  expect(dashBody.summary).toHaveProperty("totalRevenue");
  console.log("PRVD-16 Step 1: dashboard ok ✓");

  // Step 2: Services list
  const services = await page.request.get("/api/provider/services");
  expect(services.status()).toBe(200);
  const serviceList = await services.json();
  expect(Array.isArray(serviceList)).toBe(true);
  console.log("PRVD-16 Step 2: services:", serviceList.length, "✓");

  // Step 3: Analytics
  const analytics = await page.request.get("/api/provider/analytics/dashboard");
  expect(analytics.status()).toBe(200);
  const analyticsBody = await analytics.json();
  expect(analyticsBody.summary).toHaveProperty("totalRevenue");
  console.log("PRVD-16 Step 3: analytics ok ✓");

  // Step 4: Availability
  const avail = await page.request.get("/api/provider/availability");
  expect(avail.status()).toBe(200);
  const availBody = await avail.json();
  expect(availBody).toHaveProperty("schedule");
  console.log("PRVD-16 Step 4: availability ok ✓");

  // Step 5: Earnings
  const earnings = await page.request.get("/api/provider/earnings");
  expect(earnings.status()).toBe(200);
  const earningsList = await earnings.json();
  expect(Array.isArray(earningsList)).toBe(true);
  console.log("PRVD-16 Step 5: earnings:", earningsList.length, "✓");

  // Step 6: Bookings
  const bookings = await page.request.get("/api/provider/bookings");
  expect(bookings.status()).toBe(200);
  const bookingList = await bookings.json();
  expect(Array.isArray(bookingList)).toBe(true);
  console.log("PRVD-16 Step 6: bookings:", bookingList.length, "✓");

  console.log("PRVD-16 E2E provider flow complete ✓");
});
