/**
 * PLAT-01–16: Platform Health, Misc Endpoints & Discovery
 * Tests health endpoints, experience types, service categories, venues, invoices, chats, E2E
 */
import { test, expect } from "@playwright/test";
import { loginAs } from "../helpers/auth";

// ─── Public Health Endpoints ─────────────────────────────────────────────────

test("PLAT-01: GET /api/health → 200 with status ok", async ({ page }) => {
  const resp = await page.request.get("/api/health");
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  expect(body.status).toBe("ok");
  console.log("PLAT-01: health ok ✓");
});

test("PLAT-02: GET /api/status → 200 with status", async ({ page }) => {
  const resp = await page.request.get("/api/status");
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  expect(body).toHaveProperty("status");
  console.log("PLAT-02: status:", body.status);
});

test("PLAT-03: GET /api/platform/stats → public platform stats", async ({ page }) => {
  const resp = await page.request.get("/api/platform/stats");
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  expect(typeof body).toBe("object");
  console.log("PLAT-03: platform stats keys:", Object.keys(body).slice(0, 6).join(", "));
});

// ─── Experience & Service Categories (public) ─────────────────────────────────

test("PLAT-04: GET /api/experience-types → returns array of experience types", async ({ page }) => {
  const resp = await page.request.get("/api/experience-types");
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  expect(Array.isArray(body)).toBe(true);
  expect(body.length).toBeGreaterThan(0);
  console.log("PLAT-04: experience types:", body.length, "first:", body[0].name || body[0].id);
});

test("PLAT-05: GET /api/expert-service-categories → returns array (public)", async ({ page }) => {
  const resp = await page.request.get("/api/expert-service-categories");
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  expect(Array.isArray(body)).toBe(true);
  console.log("PLAT-05: expert service categories:", body.length);
});

// ─── Venues (public) ──────────────────────────────────────────────────────────

test("PLAT-06: GET /api/venues/search → 400 without query params", async ({ page }) => {
  const resp = await page.request.get("/api/venues/search");
  console.log("PLAT-06:", resp.status());
  expect([400, 422]).toContain(resp.status());
  console.log("PLAT-06: missing venue search params rejected ✓");
});

// ─── Auth Guards for Private Endpoints ───────────────────────────────────────

test("PLAT-07: GET /api/invoices/my → 401 when not logged in", async ({ page }) => {
  const resp = await page.request.get("/api/invoices/my");
  console.log("PLAT-07:", resp.status());
  expect(resp.status()).toBe(401);
});

test("PLAT-08: GET /api/chats → 401 when not logged in", async ({ page }) => {
  const resp = await page.request.get("/api/chats");
  console.log("PLAT-08:", resp.status());
  expect(resp.status()).toBe(401);
});

test("PLAT-09: GET /api/notifications → 401 when not logged in", async ({ page }) => {
  const resp = await page.request.get("/api/notifications");
  console.log("PLAT-09:", resp.status());
  expect(resp.status()).toBe(401);
});

// ─── Authenticated Misc Endpoints ────────────────────────────────────────────

test("PLAT-10: GET /api/invoices/my → returns array as user", async ({ page }) => {
  await loginAs(page, "user");
  const resp = await page.request.get("/api/invoices/my");
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  expect(Array.isArray(body)).toBe(true);
  console.log("PLAT-10: invoices:", body.length);
});

test("PLAT-11: GET /api/notifications → returns array as user", async ({ page }) => {
  await loginAs(page, "user");
  const resp = await page.request.get("/api/notifications");
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  expect(Array.isArray(body)).toBe(true);
  console.log("PLAT-11: notifications:", body.length);
});

test("PLAT-12: GET /api/notifications/unread-count → returns count as user", async ({ page }) => {
  await loginAs(page, "user");
  const resp = await page.request.get("/api/notifications/unread-count");
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  expect(body).toHaveProperty("count");
  expect(typeof body.count).toBe("number");
  console.log("PLAT-12: unread notifications:", body.count);
});

test("PLAT-13: POST /api/notifications/mark-all-read → marks all read as user", async ({ page }) => {
  await loginAs(page, "user");
  const resp = await page.request.post("/api/notifications/mark-all-read");
  console.log("PLAT-13:", resp.status());
  expect([200, 204]).toContain(resp.status());
  console.log("PLAT-13: mark all read ok ✓");
});

test("PLAT-14: GET /api/chats → returns array as user", async ({ page }) => {
  await loginAs(page, "user");
  const resp = await page.request.get("/api/chats");
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  expect(Array.isArray(body)).toBe(true);
  console.log("PLAT-14: chats:", body.length);
});

// ─── User Experiences ─────────────────────────────────────────────────────────

test("PLAT-15: GET /api/user-experiences → returns array as user", async ({ page }) => {
  await loginAs(page, "user");
  const resp = await page.request.get("/api/user-experiences");
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  expect(Array.isArray(body)).toBe(true);
  console.log("PLAT-15: user experiences:", body.length);
});

// ─── E2E Platform Health Flow ─────────────────────────────────────────────────

test("PLAT-16: E2E — health → experience types → notifications → invoices flow", async ({ page }) => {
  // Step 1: Platform health (public)
  const health = await page.request.get("/api/health");
  expect(health.status()).toBe(200);
  const healthBody = await health.json();
  expect(healthBody.status).toBe("ok");
  console.log("PLAT-16 Step 1: health ok ✓");

  // Step 2: Platform stats (public)
  const stats = await page.request.get("/api/platform/stats");
  expect(stats.status()).toBe(200);
  console.log("PLAT-16 Step 2: platform stats ok ✓");

  // Step 3: Experience types (public)
  const expTypes = await page.request.get("/api/experience-types");
  expect(expTypes.status()).toBe(200);
  const typeList = await expTypes.json();
  expect(typeList.length).toBeGreaterThan(0);
  console.log("PLAT-16 Step 3: experience types:", typeList.length, "✓");

  // Step 4: Expert service categories (public)
  const cats = await page.request.get("/api/expert-service-categories");
  expect(cats.status()).toBe(200);
  console.log("PLAT-16 Step 4: service categories ok ✓");

  // Step 5: Auth-protected endpoints
  await loginAs(page, "user");

  const notifs = await page.request.get("/api/notifications");
  expect(notifs.status()).toBe(200);
  const notifList = await notifs.json();
  expect(Array.isArray(notifList)).toBe(true);
  console.log("PLAT-16 Step 5: notifications:", notifList.length, "✓");

  const unread = await page.request.get("/api/notifications/unread-count");
  expect(unread.status()).toBe(200);
  const unreadBody = await unread.json();
  expect(typeof unreadBody.count).toBe("number");
  console.log("PLAT-16 Step 6: unread count:", unreadBody.count, "✓");

  const invoices = await page.request.get("/api/invoices/my");
  expect(invoices.status()).toBe(200);
  console.log("PLAT-16 Step 7: invoices ok ✓");

  console.log("PLAT-16 E2E platform health flow complete ✓");
});
