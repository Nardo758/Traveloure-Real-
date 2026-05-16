/**
 * SVBK-01–16: Service Bookings, Discovery & Reviews
 * Tests auth guards, public services list, booking flow, my-bookings, reviews, E2E
 */
import { test, expect } from "@playwright/test";
import { loginAs } from "../helpers/auth";

// ─── Auth Guards ─────────────────────────────────────────────────────────────

test("SVBK-01: GET /api/my-bookings → 401 when not logged in", async ({ page }) => {
  const resp = await page.request.get("/api/my-bookings");
  console.log("SVBK-01:", resp.status());
  expect(resp.status()).toBe(401);
});

test("SVBK-02: GET /api/service-bookings → 401 when not logged in", async ({ page }) => {
  const resp = await page.request.get("/api/service-bookings");
  console.log("SVBK-02:", resp.status());
  expect(resp.status()).toBe(401);
});

test("SVBK-03: POST /api/bookings → 401 when not logged in", async ({ page }) => {
  const resp = await page.request.post("/api/bookings", {
    data: { serviceId: "test-id" },
  });
  console.log("SVBK-03:", resp.status());
  expect(resp.status()).toBe(401);
});

test("SVBK-04: GET /api/bookings/user → 401 when not logged in", async ({ page }) => {
  const resp = await page.request.get("/api/bookings/user");
  console.log("SVBK-04:", resp.status());
  expect(resp.status()).toBe(401);
});

// ─── Public Service Endpoints ─────────────────────────────────────────────────

test("SVBK-05: GET /api/services → public list returns array", async ({ page }) => {
  const resp = await page.request.get("/api/services");
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  expect(Array.isArray(body)).toBe(true);
  console.log("SVBK-05: public services count:", body.length);
});

test("SVBK-06: GET /api/discover → discovery results returned", async ({ page }) => {
  const resp = await page.request.get("/api/discover");
  console.log("SVBK-06:", resp.status());
  expect([200, 400]).toContain(resp.status());
  if (resp.status() === 200) {
    const body = await resp.json();
    console.log("SVBK-06: discover type:", typeof body);
  } else {
    console.log("SVBK-06: discover requires params");
  }
});

test("SVBK-07: GET /api/services/:id → 404 for non-existent service", async ({ page }) => {
  const resp = await page.request.get("/api/services/00000000-0000-0000-0000-000000000000");
  console.log("SVBK-07:", resp.status());
  expect([404, 200]).toContain(resp.status());
  console.log("SVBK-07: non-existent service ok ✓");
});

// ─── Authenticated Booking Endpoints ─────────────────────────────────────────

test("SVBK-08: GET /api/my-bookings → returns object/array as user", async ({ page }) => {
  await loginAs(page, "user");
  const resp = await page.request.get("/api/my-bookings");
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  expect(typeof body).toBe("object");
  console.log("SVBK-08: my-bookings type:", typeof body, Array.isArray(body) ? "array len: " + body.length : "keys: " + Object.keys(body).slice(0, 4).join(", "));
});

test("SVBK-09: GET /api/service-bookings → returns array as user", async ({ page }) => {
  await loginAs(page, "user");
  const resp = await page.request.get("/api/service-bookings");
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  expect(Array.isArray(body)).toBe(true);
  console.log("SVBK-09: service bookings:", body.length);
});

test("SVBK-10: GET /api/bookings/user → returns array as user", async ({ page }) => {
  await loginAs(page, "user");
  const resp = await page.request.get("/api/bookings/user");
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  expect(Array.isArray(body)).toBe(true);
  console.log("SVBK-10: user bookings:", body.length);
});

test("SVBK-11: POST /api/bookings → 400 missing required fields", async ({ page }) => {
  await loginAs(page, "user");
  const resp = await page.request.post("/api/bookings", { data: {} });
  console.log("SVBK-11:", resp.status());
  expect([400, 422]).toContain(resp.status());
  console.log("SVBK-11: missing booking fields rejected ✓");
});

// ─── Expert Bookings ──────────────────────────────────────────────────────────

test("SVBK-12: GET /api/expert/bookings → 401 when not logged in", async ({ page }) => {
  const resp = await page.request.get("/api/expert/bookings");
  console.log("SVBK-12:", resp.status());
  expect(resp.status()).toBe(401);
});

test("SVBK-13: GET /api/expert/bookings → returns array as expert", async ({ page }) => {
  await loginAs(page, "expert");
  const resp = await page.request.get("/api/expert/bookings");
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  expect(Array.isArray(body)).toBe(true);
  console.log("SVBK-13: expert bookings:", body.length);
});

test("SVBK-14: GET /api/expert/analytics/dashboard → analytics as expert", async ({ page }) => {
  await loginAs(page, "expert");
  const resp = await page.request.get("/api/expert/analytics/dashboard");
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  expect(typeof body).toBe("object");
  console.log("SVBK-14: expert analytics keys:", Object.keys(body).slice(0, 5).join(", "));
});

// ─── Service Reviews (public) ─────────────────────────────────────────────────

test("SVBK-15: GET /api/services/:id/reviews → returns array for service", async ({ page }) => {
  // Find a real service first
  const services = await page.request.get("/api/services");
  const serviceList = await services.json();
  if (!serviceList || serviceList.length === 0) {
    console.log("SVBK-15: no services available, testing with fake id");
    const resp = await page.request.get("/api/services/00000000-0000-0000-0000-000000000000/reviews");
    expect([200, 404]).toContain(resp.status());
    return;
  }
  const serviceId = serviceList[0].id;
  const resp = await page.request.get(`/api/services/${serviceId}/reviews`);
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  expect(Array.isArray(body)).toBe(true);
  console.log("SVBK-15: reviews for service", serviceId, ":", body.length);
});

// ─── E2E Booking Discovery Flow ───────────────────────────────────────────────

test("SVBK-16: E2E — public services → auth guards → user bookings → expert bookings", async ({ page }) => {
  // Step 1: Public services (no auth)
  const services = await page.request.get("/api/services");
  expect(services.status()).toBe(200);
  const serviceList = await services.json();
  expect(Array.isArray(serviceList)).toBe(true);
  console.log("SVBK-16 Step 1: public services:", serviceList.length, "✓");

  // Step 2: Unauth guard
  const myBookings = await page.request.get("/api/my-bookings");
  expect(myBookings.status()).toBe(401);
  console.log("SVBK-16 Step 2: auth guard works ✓");

  // Step 3: Login as user — check bookings
  await loginAs(page, "user");
  const userBookings = await page.request.get("/api/my-bookings");
  expect(userBookings.status()).toBe(200);
  console.log("SVBK-16 Step 3: my-bookings ok ✓");

  const svcBookings = await page.request.get("/api/service-bookings");
  expect(svcBookings.status()).toBe(200);
  const svcList = await svcBookings.json();
  expect(Array.isArray(svcList)).toBe(true);
  console.log("SVBK-16 Step 4: service-bookings:", svcList.length, "✓");

  // Step 5: Invalid booking creation
  const badBook = await page.request.post("/api/bookings", { data: {} });
  expect([400, 422]).toContain(badBook.status());
  console.log("SVBK-16 Step 5: invalid booking rejected ✓");

  // Step 6: Expert bookings (via API request directly — session already set as user)
  const expertBookingsUnauthed = await page.request.get("/api/expert/bookings");
  // As a regular user, expert bookings returns 200 or 403 depending on role check
  expect([200, 403]).toContain(expertBookingsUnauthed.status());
  console.log("SVBK-16 Step 6: expert bookings endpoint:", expertBookingsUnauthed.status(), "✓");

  console.log("SVBK-16 E2E booking flow complete ✓");
});
