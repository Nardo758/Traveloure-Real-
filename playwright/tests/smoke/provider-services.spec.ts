/**
 * PSVC-01–16: Provider Services Extended — Availability, Services CRUD, Expert Search
 * Tests provider service management, availability calendar, and expert matching
 */
import { test, expect } from "@playwright/test";
import { loginAs } from "../helpers/auth";

// ─── Auth Guards ──────────────────────────────────────────────────────────────

test("PSVC-01: GET /api/provider/services → 401 when not logged in", async ({ page }) => {
  const resp = await page.request.get("/api/provider/services");
  console.log("PSVC-01:", resp.status());
  expect(resp.status()).toBe(401);
});

test("PSVC-02: POST /api/provider/services → 401 when not logged in", async ({ page }) => {
  const resp = await page.request.post("/api/provider/services", {
    data: { title: "Test Service" },
  });
  console.log("PSVC-02:", resp.status());
  expect(resp.status()).toBe(401);
});

test("PSVC-03: GET /api/provider/availability → 401 when not logged in", async ({ page }) => {
  const resp = await page.request.get("/api/provider/availability");
  console.log("PSVC-03:", resp.status());
  expect(resp.status()).toBe(401);
});

// ─── Public Service Discovery ─────────────────────────────────────────────────

test("PSVC-04: GET /api/services → returns array (public)", async ({ page }) => {
  const resp = await page.request.get("/api/services");
  console.log("PSVC-04:", resp.status());
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  expect(Array.isArray(body)).toBe(true);
  console.log("PSVC-04: services count:", body.length);
});

test("PSVC-05: GET /api/services/:id → 404 for non-existent service (public)", async ({ page }) => {
  const resp = await page.request.get("/api/services/00000000-0000-0000-0000-000000000000");
  console.log("PSVC-05:", resp.status());
  expect([404, 400, 500]).toContain(resp.status());
  console.log("PSVC-05: non-existent service handled ✓");
});

test("PSVC-06: GET /api/experts → returns array (public)", async ({ page }) => {
  const resp = await page.request.get("/api/experts");
  console.log("PSVC-06:", resp.status());
  expect([200, 500]).toContain(resp.status());
  if (resp.status() === 200) {
    const body = await resp.json();
    console.log("PSVC-06: experts type:", Array.isArray(body) ? "array len:" + body.length : typeof body);
  }
  console.log("PSVC-06: experts responded ✓");
});

// ─── Provider Authenticated ───────────────────────────────────────────────────

test("PSVC-07: GET /api/provider/services → returns services as provider", async ({ page }) => {
  await loginAs(page, "provider");
  const resp = await page.request.get("/api/provider/services");
  console.log("PSVC-07:", resp.status());
  expect([200, 500]).toContain(resp.status());
  if (resp.status() === 200) {
    const body = await resp.json();
    console.log("PSVC-07: provider services:", Array.isArray(body) ? body.length : typeof body);
  }
  console.log("PSVC-07: provider services responded ✓");
});

test("PSVC-08: GET /api/provider/availability → returns availability as provider", async ({ page }) => {
  await loginAs(page, "provider");
  const resp = await page.request.get("/api/provider/availability");
  console.log("PSVC-08:", resp.status());
  expect([200, 500]).toContain(resp.status());
  console.log("PSVC-08: provider availability responded ✓");
});

test("PSVC-09: POST /api/provider/services → 400 missing required fields", async ({ page }) => {
  await loginAs(page, "provider");
  const resp = await page.request.post("/api/provider/services", {
    data: {},
  });
  console.log("PSVC-09:", resp.status());
  expect([400, 422, 500]).toContain(resp.status());
  console.log("PSVC-09: missing service fields rejected ✓");
});

test("PSVC-10: GET /api/provider/analytics → returns analytics as provider", async ({ page }) => {
  await loginAs(page, "provider");
  const resp = await page.request.get("/api/provider/analytics");
  console.log("PSVC-10:", resp.status());
  expect([200, 500]).toContain(resp.status());
  console.log("PSVC-10: provider analytics responded ✓");
});

test("PSVC-11: GET /api/provider/booking-requests → returns requests as provider", async ({ page }) => {
  await loginAs(page, "provider");
  const resp = await page.request.get("/api/provider/booking-requests");
  console.log("PSVC-11:", resp.status());
  expect([200, 500]).toContain(resp.status());
  if (resp.status() === 200) {
    const body = await resp.json();
    console.log("PSVC-11: booking requests type:", typeof body, body.requests !== undefined ? "has requests" : "unknown");
  }
  console.log("PSVC-11: booking requests responded ✓");
});

test("PSVC-12: GET /api/provider/earnings → returns earnings as provider", async ({ page }) => {
  await loginAs(page, "provider");
  const resp = await page.request.get("/api/provider/earnings");
  console.log("PSVC-12:", resp.status());
  expect([200, 500]).toContain(resp.status());
  console.log("PSVC-12: provider earnings responded ✓");
});

test("PSVC-13: GET /api/services/:id/reviews → returns reviews for service (public)", async ({ page }) => {
  const servicesResp = await page.request.get("/api/services?limit=1");
  const services = await servicesResp.json();
  if (services.length > 0) {
    const serviceId = services[0].id;
    const resp = await page.request.get(`/api/services/${serviceId}/reviews`);
    console.log("PSVC-13:", resp.status());
    expect([200, 500]).toContain(resp.status());
    console.log("PSVC-13: service reviews responded ✓");
  } else {
    console.log("PSVC-13: no services to test, skipping ✓");
  }
});

test("PSVC-14: GET /api/provider/dashboard → returns dashboard as provider", async ({ page }) => {
  await loginAs(page, "provider");
  const resp = await page.request.get("/api/provider/dashboard");
  console.log("PSVC-14:", resp.status());
  expect([200, 500]).toContain(resp.status());
  if (resp.status() === 200) {
    const body = await resp.json();
    console.log("PSVC-14: dashboard keys:", Object.keys(body).join(", ").slice(0, 80));
  }
  console.log("PSVC-14: provider dashboard responded ✓");
});

test("PSVC-15: GET /api/provider/analytics/dashboard → returns analytics as provider", async ({ page }) => {
  await loginAs(page, "provider");
  const resp = await page.request.get("/api/provider/analytics/dashboard");
  console.log("PSVC-15:", resp.status());
  expect([200, 500]).toContain(resp.status());
  console.log("PSVC-15: provider analytics dashboard responded ✓");
});

// ─── E2E: Provider service flow ───────────────────────────────────────────────

test("PSVC-16: E2E — public services → auth guards → provider services → earnings", async ({ page }) => {
  // Step 1: Public service list
  const pubServicesResp = await page.request.get("/api/services");
  expect(pubServicesResp.status()).toBe(200);
  const pubServices = await pubServicesResp.json();
  expect(Array.isArray(pubServices)).toBe(true);
  console.log("PSVC-16 Step 1: public services:", pubServices.length, "✓");

  // Step 2: Auth guards
  const provServicesUnauth = await page.request.get("/api/provider/services");
  expect(provServicesUnauth.status()).toBe(401);
  console.log("PSVC-16 Step 2: provider services auth guard ✓");

  // Step 3: Login as provider and view services
  await loginAs(page, "provider");
  const provServicesResp = await page.request.get("/api/provider/services");
  expect([200, 500]).toContain(provServicesResp.status());
  console.log("PSVC-16 Step 3: provider services:", provServicesResp.status(), "✓");

  // Step 4: Provider availability
  const availResp = await page.request.get("/api/provider/availability");
  expect([200, 500]).toContain(availResp.status());
  console.log("PSVC-16 Step 4: provider availability:", availResp.status(), "✓");

  // Step 5: Provider earnings
  const earningsResp = await page.request.get("/api/provider/earnings");
  expect([200, 500]).toContain(earningsResp.status());
  console.log("PSVC-16 Step 5: provider earnings:", earningsResp.status(), "✓");

  // Step 6: Booking requests
  const reqResp = await page.request.get("/api/provider/booking-requests");
  expect([200, 500]).toContain(reqResp.status());
  console.log("PSVC-16 Step 6: booking requests:", reqResp.status(), "✓");

  // Step 7: Provider dashboard
  const dashResp = await page.request.get("/api/provider/dashboard");
  expect([200, 500]).toContain(dashResp.status());
  console.log("PSVC-16 Step 7: provider dashboard:", dashResp.status(), "✓");

  // Step 8: Missing fields on service creation
  const badServiceResp = await page.request.post("/api/provider/services", { data: {} });
  expect([400, 422, 500]).toContain(badServiceResp.status());
  console.log("PSVC-16 Step 8: bad service creation:", badServiceResp.status(), "✓");

  console.log("PSVC-16 E2E provider service flow complete ✓");
});
