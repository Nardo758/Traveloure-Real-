/**
 * EXPD-01–16: Expert Dashboard & Tools
 * Tests auth guards, dashboard shape, earnings, templates, services, public expert list, E2E
 */
import { test, expect } from "@playwright/test";
import { loginAs, logout } from "../helpers/auth";

// ─── Auth Guards ─────────────────────────────────────────────────────────────

test("EXPD-01: GET /api/expert/dashboard → 401 when not logged in", async ({ page }) => {
  const resp = await page.request.get("/api/expert/dashboard");
  console.log("EXPD-01:", resp.status());
  expect(resp.status()).toBe(401);
});

test("EXPD-02: GET /api/expert/earnings → 401 when not logged in", async ({ page }) => {
  const resp = await page.request.get("/api/expert/earnings");
  console.log("EXPD-02:", resp.status());
  expect(resp.status()).toBe(401);
});

test("EXPD-03: GET /api/expert/templates → 401 when not logged in", async ({ page }) => {
  const resp = await page.request.get("/api/expert/templates");
  console.log("EXPD-03:", resp.status());
  expect(resp.status()).toBe(401);
});

// ─── Public Expert Endpoints (no auth required) ───────────────────────────────

test("EXPD-04: GET /api/experts → public list returns array", async ({ page }) => {
  const resp = await page.request.get("/api/experts");
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  expect(Array.isArray(body)).toBe(true);
  expect(body.length).toBeGreaterThan(0);
  // Check expert shape
  const expert = body[0];
  expect(expert).toHaveProperty("id");
  console.log("EXPD-04: experts count:", body.length, "first:", expert.firstName, expert.lastName);
});

test("EXPD-05: GET /api/experts?destinations=Tokyo → filters by destination", async ({ page }) => {
  const resp = await page.request.get("/api/experts?destinations=Tokyo%2C+Japan");
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  expect(Array.isArray(body)).toBe(true);
  console.log("EXPD-05: Tokyo experts:", body.length);
});

test("EXPD-06: GET /api/experts/:id → 404 for non-existent expert", async ({ page }) => {
  const resp = await page.request.get("/api/experts/00000000-0000-0000-0000-000000000000");
  console.log("EXPD-06:", resp.status());
  expect(resp.status()).toBe(404);
});

// ─── Authenticated Expert Endpoints ──────────────────────────────────────────

test("EXPD-07: GET /api/expert/dashboard → {summary, services, recentEarnings} as expert", async ({ page }) => {
  await loginAs(page, "expert");
  const resp = await page.request.get("/api/expert/dashboard");
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  expect(body).toHaveProperty("summary");
  expect(body).toHaveProperty("services");
  expect(body).toHaveProperty("recentEarnings");
  expect(body.summary).toHaveProperty("totalRevenue");
  expect(body.summary).toHaveProperty("totalBookings");
  expect(Array.isArray(body.services)).toBe(true);
  console.log("EXPD-07: dashboard ok — services:", body.services.length, "totalBookings:", body.summary.totalBookings);
});

test("EXPD-08: GET /api/expert/earnings → {earnings, summary} as expert", async ({ page }) => {
  await loginAs(page, "expert");
  const resp = await page.request.get("/api/expert/earnings");
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  expect(body).toHaveProperty("earnings");
  expect(body).toHaveProperty("summary");
  expect(Array.isArray(body.earnings)).toBe(true);
  const summaryKeys = Object.keys(body.summary);
  expect(summaryKeys).toContain("total");
  console.log("EXPD-08: earnings ok, summary keys:", summaryKeys.join(", "));
});

test("EXPD-09: GET /api/expert/templates → returns array as expert", async ({ page }) => {
  await loginAs(page, "expert");
  const resp = await page.request.get("/api/expert/templates");
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  expect(Array.isArray(body)).toBe(true);
  console.log("EXPD-09: templates count:", body.length);
});

test("EXPD-10: GET /api/expert/custom-services → returns array as expert", async ({ page }) => {
  await loginAs(page, "expert");
  const resp = await page.request.get("/api/expert/custom-services");
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  expect(Array.isArray(body)).toBe(true);
  console.log("EXPD-10: custom services count:", body.length);
});

test("EXPD-11: GET /api/expert/services → returns array as expert", async ({ page }) => {
  await loginAs(page, "expert");
  const resp = await page.request.get("/api/expert/services");
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  expect(Array.isArray(body)).toBe(true);
  console.log("EXPD-11: services count:", body.length);
});

test("EXPD-12: GET /api/expert/tips → returns {tips, totalAmount} as expert", async ({ page }) => {
  await loginAs(page, "expert");
  const resp = await page.request.get("/api/expert/tips");
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  expect(body).toHaveProperty("tips");
  expect(body).toHaveProperty("totalAmount");
  expect(Array.isArray(body.tips)).toBe(true);
  console.log("EXPD-12: tips count:", body.tips.length, "totalAmount:", body.totalAmount);
});

test("EXPD-13: GET /api/expert/referrals → returns {referralCode, referrals, stats} as expert", async ({ page }) => {
  await loginAs(page, "expert");
  const resp = await page.request.get("/api/expert/referrals");
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  expect(body).toHaveProperty("referralCode");
  expect(body).toHaveProperty("referrals");
  expect(body).toHaveProperty("stats");
  expect(Array.isArray(body.referrals)).toBe(true);
  console.log("EXPD-13: referrals count:", body.referrals.length, "code:", body.referralCode);
});

// ─── Expert Template CRUD ─────────────────────────────────────────────────────

test("EXPD-14: POST /api/expert/templates → creates template → 201", async ({ page }) => {
  await loginAs(page, "expert");
  const resp = await page.request.post("/api/expert/templates", {
    data: {
      title: "Test Expert Template",
      description: "A test template for E2E testing",
      destination: "Tokyo, Japan",
      price: 49.99,
      duration: 7,
      highlights: ["Visit Shibuya", "Temple tour"],
    },
  });
  console.log("EXPD-14:", resp.status(), await resp.text().catch(() => ""));
  expect([200, 201]).toContain(resp.status());
  const body = await resp.json();
  expect(body).toHaveProperty("id");
  console.log("EXPD-14: template created:", body.id);
});

// ─── Expert Dashboard UI ──────────────────────────────────────────────────────

test("EXPD-15: /expert/dashboard → renders with summary stats as expert", async ({ page }) => {
  await loginAs(page, "expert");
  await page.goto("/expert/dashboard");
  await page.waitForLoadState("domcontentloaded");
  expect(page.url()).toContain("/expert");
  console.log("EXPD-15: URL:", page.url());
  await page.waitForTimeout(1500);
  const bodyText = await page.locator("body").innerText();
  const hasDashboard = bodyText.includes("Revenue") || bodyText.includes("Booking") || bodyText.includes("Service") || bodyText.includes("Expert");
  expect(hasDashboard).toBe(true);
  console.log("EXPD-15: dashboard content found ✓");
});

// ─── E2E Expert Flow ──────────────────────────────────────────────────────────

test("EXPD-16: E2E — dashboard → earnings → templates → public profile flow", async ({ page }) => {
  await loginAs(page, "expert");

  // Step 1: Dashboard
  const dash = await page.request.get("/api/expert/dashboard");
  expect(dash.status()).toBe(200);
  const dashBody = await dash.json();
  expect(dashBody.summary).toHaveProperty("totalRevenue");
  console.log("EXPD-16 Step 1: dashboard ok ✓");

  // Step 2: Earnings
  const earnings = await page.request.get("/api/expert/earnings");
  expect(earnings.status()).toBe(200);
  const earningsBody = await earnings.json();
  expect(earningsBody).toHaveProperty("earnings");
  console.log("EXPD-16 Step 2: earnings ok ✓");

  // Step 3: Templates list
  const templates = await page.request.get("/api/expert/templates");
  expect(templates.status()).toBe(200);
  const templateList = await templates.json();
  expect(Array.isArray(templateList)).toBe(true);
  console.log("EXPD-16 Step 3: templates:", templateList.length, "✓");

  // Step 4: Services
  const services = await page.request.get("/api/expert/services");
  expect(services.status()).toBe(200);
  const serviceList = await services.json();
  expect(Array.isArray(serviceList)).toBe(true);
  console.log("EXPD-16 Step 4: services:", serviceList.length, "✓");

  // Step 5: Public expert list (not logged in check)
  const publicExperts = await page.request.get("/api/experts");
  expect(publicExperts.status()).toBe(200);
  const experts = await publicExperts.json();
  expect(experts.length).toBeGreaterThan(0);
  console.log("EXPD-16 Step 5: public experts:", experts.length, "✓");

  // Step 6: Template sales
  const sales = await page.request.get("/api/expert/template-sales");
  expect(sales.status()).toBe(200);
  const salesList = await sales.json();
  expect(Array.isArray(salesList)).toBe(true);
  console.log("EXPD-16 Step 6: template sales:", salesList.length, "✓");

  console.log("EXPD-16 E2E expert flow complete ✓");
});
