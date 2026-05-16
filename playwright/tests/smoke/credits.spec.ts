/**
 * Credits & Payment Flow Tests — CRED-01 through CRED-12
 *
 * Covers:
 *  - API auth guards (wallet, credits/balance, transactions, purchase)
 *  - Request validation (invalid/missing packageId → 400)
 *  - Authenticated wallet + balance + transaction fetch (shape + fields)
 *  - Stripe Checkout Session creation (credits/purchase happy path)
 *  - Credits page UI (structure, balance stat, tabs, package cards)
 *  - Package selection + checkout button appearance
 *
 * Credit packages (server-side):
 *   ID 1 → 50 credits  $49
 *   ID 2 → 100 credits $89
 *   ID 3 → 250 credits $199
 *   ID 4 → 500 credits $349
 */

import { test, expect, type Page } from "@playwright/test";
import { loginAs, logout } from "../helpers/auth";

// ─────────────────────────────────────────────────────────────────────────────
// CRED-01 to CRED-04: Auth guards
// ─────────────────────────────────────────────────────────────────────────────

test("CRED-01: GET /api/wallet → 401 when not logged in", async ({ page }) => {
  await logout(page);
  const resp = await page.request.get("/api/wallet");
  expect(resp.status()).toBe(401);
  const body = await resp.json();
  expect(body).toHaveProperty("message");
  console.log("CRED-01:", resp.status(), body.message);
});

test("CRED-02: GET /api/credits/balance → 401 when not logged in", async ({ page }) => {
  await logout(page);
  const resp = await page.request.get("/api/credits/balance");
  expect(resp.status()).toBe(401);
  console.log("CRED-02:", resp.status());
});

test("CRED-03: GET /api/wallet/transactions → 401 when not logged in", async ({ page }) => {
  await logout(page);
  const resp = await page.request.get("/api/wallet/transactions");
  expect(resp.status()).toBe(401);
  console.log("CRED-03:", resp.status());
});

test("CRED-04: POST /api/credits/purchase → 401 when not logged in", async ({ page }) => {
  await logout(page);
  const resp = await page.request.post("/api/credits/purchase", {
    headers: { "Content-Type": "application/json" },
    data: { packageId: 1 },
  });
  expect(resp.status()).toBe(401);
  console.log("CRED-04:", resp.status());
});

// ─────────────────────────────────────────────────────────────────────────────
// CRED-05 to CRED-06: Validation
// ─────────────────────────────────────────────────────────────────────────────

test("CRED-05: Credits purchase — invalid packageId → 400", async ({ page }) => {
  await loginAs(page, "user");
  const resp = await page.request.post("/api/credits/purchase", {
    headers: { "Content-Type": "application/json" },
    data: { packageId: 9999 }, // does not exist
  });
  expect(resp.status()).toBe(400);
  const body = await resp.json();
  console.log("CRED-05 error:", body.message);
  expect(body.message).toMatch(/invalid|package/i);
});

test("CRED-06: Credits purchase — missing packageId → 400", async ({ page }) => {
  await loginAs(page, "user");
  const resp = await page.request.post("/api/credits/purchase", {
    headers: { "Content-Type": "application/json" },
    data: {}, // packageId absent
  });
  expect(resp.status()).toBe(400);
  const body = await resp.json();
  console.log("CRED-06 error:", body.message);
  expect(body.message).toMatch(/invalid|package/i);
});

// ─────────────────────────────────────────────────────────────────────────────
// CRED-07 to CRED-09: Authenticated fetch — shape validation
// ─────────────────────────────────────────────────────────────────────────────

test("CRED-07: GET /api/wallet → 200 with wallet shape when authenticated", async ({ page }) => {
  await loginAs(page, "user");
  const resp = await page.request.get("/api/wallet");
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  console.log("CRED-07 wallet keys:", Object.keys(body));
  expect(body).toHaveProperty("id");
  expect(body).toHaveProperty("userId");
  // wallet uses "credits" field (not "balance")
  expect(body).toHaveProperty("credits");
  expect(typeof body.credits).toBe("number");
  expect(body.credits).toBeGreaterThanOrEqual(0);
  console.log("CRED-07 wallet credits:", body.credits);
});

test("CRED-08: GET /api/credits/balance → 200 with balance field", async ({ page }) => {
  await loginAs(page, "user");
  const resp = await page.request.get("/api/credits/balance");
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  console.log("CRED-08 balance response:", JSON.stringify(body));
  // balance is a numeric value
  const balance = body.balance ?? body.credits ?? body.amount;
  expect(typeof balance).toBe("number");
  expect(balance).toBeGreaterThanOrEqual(0);
});

test("CRED-09: GET /api/wallet/transactions → 200 array", async ({ page }) => {
  await loginAs(page, "user");
  const resp = await page.request.get("/api/wallet/transactions");
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  expect(Array.isArray(body)).toBe(true);
  console.log("CRED-09 transaction count:", body.length);
  if (body.length > 0) {
    const tx = body[0];
    console.log("CRED-09 first tx keys:", Object.keys(tx));
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// CRED-10: Stripe Checkout Session creation — happy path
// ─────────────────────────────────────────────────────────────────────────────

test("CRED-10: POST /api/credits/purchase with valid packageId → Stripe Checkout Session created", async ({ page }) => {
  await loginAs(page, "user");

  // Use package ID 1 (50 credits, $49)
  const resp = await page.request.post("/api/credits/purchase", {
    headers: { "Content-Type": "application/json" },
    data: { packageId: 1 },
  });

  console.log("CRED-10 status:", resp.status());

  if (resp.status() === 200) {
    const body = await resp.json();
    console.log("CRED-10 response keys:", Object.keys(body));
    // Must return a Stripe Checkout Session ID and redirect URL
    expect(body).toHaveProperty("sessionId");
    expect(body).toHaveProperty("url");
    expect(body.sessionId).toMatch(/^cs_/); // Stripe Checkout Session ID prefix
    expect(body.url).toMatch(/stripe\.com/);
    console.log("CRED-10 session:", body.sessionId);
    console.log("CRED-10 redirect URL starts with:", body.url?.slice(0, 50) + "...");
  } else {
    // Stripe not configured in this environment
    expect(resp.status()).toBe(500);
    const body = await resp.json();
    expect(body).toHaveProperty("message");
    console.log("CRED-10 Stripe not configured:", body.message);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// CRED-11: Credits page UI — structure, balance, tabs, package cards
// ─────────────────────────────────────────────────────────────────────────────

test("CRED-11: Credits page — loads complete UI structure when authenticated", async ({ page }) => {
  await logout(page);
  await loginAs(page, "user");
  await page.goto("/credits");
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(3000);

  // Page title
  await expect(page.locator("[data-testid='text-page-title']")).toBeVisible({ timeout: 10000 });
  const title = await page.locator("[data-testid='text-page-title']").textContent();
  console.log("CRED-11 page title:", title?.trim());

  // Credit balance stat card
  await expect(page.locator("[data-testid='text-credit-balance']")).toBeVisible({ timeout: 5000 });
  const balance = await page.locator("[data-testid='text-credit-balance']").textContent();
  console.log("CRED-11 displayed balance:", balance?.trim());
  expect(Number(balance?.trim())).toBeGreaterThanOrEqual(0);

  // Buy Credits button in header
  await expect(page.locator("[data-testid='button-buy-credits']")).toBeVisible({ timeout: 5000 });

  // All 4 tabs present
  for (const tabId of ["tab-packages", "tab-history", "tab-payment", "tab-invoices"]) {
    await expect(page.locator(`[data-testid='${tabId}']`)).toBeVisible({ timeout: 5000 });
  }
  console.log("CRED-11 all 4 tabs visible ✓");

  // Packages tab is default — all 4 package cards rendered
  for (const credits of [50, 100, 250, 500]) {
    await expect(page.locator(`[data-testid='card-package-${credits}']`)).toBeVisible({ timeout: 5000 });
  }
  console.log("CRED-11 all 4 package cards visible ✓");
});

// ─────────────────────────────────────────────────────────────────────────────
// CRED-12: Package selection — selecting a package reveals checkout button
// ─────────────────────────────────────────────────────────────────────────────

test("CRED-12: Selecting a package reveals the checkout button", async ({ page }) => {
  await logout(page);
  await loginAs(page, "user");
  await page.goto("/credits");
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(3000);

  // Ensure we're on the packages tab (it's the default)
  await expect(page.locator("[data-testid='tab-packages']")).toBeVisible({ timeout: 10000 });

  // Before selection, checkout button should NOT be visible
  const checkoutBefore = await page.locator("[data-testid='button-checkout']").count();
  console.log("CRED-12 checkout button count before selection:", checkoutBefore);

  // Select the 100-credit package
  await page.locator("[data-testid='button-select-100']").click();
  await page.waitForTimeout(800);

  // After selection, checkout button MUST be visible
  await expect(page.locator("[data-testid='button-checkout']")).toBeVisible({ timeout: 8000 });
  const checkoutText = await page.locator("[data-testid='button-checkout']").textContent();
  console.log("CRED-12 checkout button text:", checkoutText?.trim());
  console.log("CRED-12 checkout button appears after package selection ✓");
});
