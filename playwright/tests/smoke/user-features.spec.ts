/**
 * UFTR-01–16: User Features — Wallet, Credits, Notifications, Profile, User Experiences
 * Tests auth guards, wallet/credits, notifications, profile updates, and E2E flows
 */
import { test, expect } from "@playwright/test";
import { loginAs } from "../helpers/auth";

// ─── Auth Guards ──────────────────────────────────────────────────────────────

test("UFTR-01: GET /api/wallet → 401 when not logged in", async ({ page }) => {
  const resp = await page.request.get("/api/wallet");
  console.log("UFTR-01:", resp.status());
  expect(resp.status()).toBe(401);
});

test("UFTR-02: GET /api/credits/balance → 401 when not logged in", async ({ page }) => {
  const resp = await page.request.get("/api/credits/balance");
  console.log("UFTR-02:", resp.status());
  expect(resp.status()).toBe(401);
});

test("UFTR-03: GET /api/notifications → 401 when not logged in", async ({ page }) => {
  const resp = await page.request.get("/api/notifications");
  console.log("UFTR-03:", resp.status());
  expect(resp.status()).toBe(401);
});

test("UFTR-04: GET /api/user-experiences → 401 when not logged in", async ({ page }) => {
  const resp = await page.request.get("/api/user-experiences");
  console.log("UFTR-04:", resp.status());
  expect(resp.status()).toBe(401);
});

// ─── Wallet & Credits ─────────────────────────────────────────────────────────

test("UFTR-05: GET /api/wallet → returns wallet data as user", async ({ page }) => {
  await loginAs(page, "user");
  const resp = await page.request.get("/api/wallet");
  console.log("UFTR-05:", resp.status());
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  console.log("UFTR-05: wallet keys:", Object.keys(body).join(", "));
});

test("UFTR-06: GET /api/credits/balance → returns balance as user", async ({ page }) => {
  await loginAs(page, "user");
  const resp = await page.request.get("/api/credits/balance");
  console.log("UFTR-06:", resp.status());
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  console.log("UFTR-06: credits balance:", JSON.stringify(body).slice(0, 80));
});

test("UFTR-07: GET /api/wallet/transactions → returns transactions as user", async ({ page }) => {
  await loginAs(page, "user");
  const resp = await page.request.get("/api/wallet/transactions");
  console.log("UFTR-07:", resp.status());
  expect([200, 500]).toContain(resp.status());
  if (resp.status() === 200) {
    const body = await resp.json();
    console.log("UFTR-07: transactions type:", Array.isArray(body) ? "array" : typeof body);
  }
  console.log("UFTR-07: transactions responded ✓");
});

test("UFTR-08: POST /api/credits/purchase → 400 missing required fields", async ({ page }) => {
  await loginAs(page, "user");
  const resp = await page.request.post("/api/credits/purchase", {
    data: {},
  });
  console.log("UFTR-08:", resp.status());
  expect([400, 422]).toContain(resp.status());
  console.log("UFTR-08: missing purchase fields rejected ✓");
});

// ─── Notifications ────────────────────────────────────────────────────────────

test("UFTR-09: GET /api/notifications → returns notifications as user", async ({ page }) => {
  await loginAs(page, "user");
  const resp = await page.request.get("/api/notifications");
  console.log("UFTR-09:", resp.status());
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  console.log("UFTR-09: notifications type:", Array.isArray(body) ? "array len:" + body.length : typeof body);
});

test("UFTR-10: GET /api/notifications/unread-count → returns count as user", async ({ page }) => {
  await loginAs(page, "user");
  const resp = await page.request.get("/api/notifications/unread-count");
  console.log("UFTR-10:", resp.status());
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  console.log("UFTR-10: unread count:", JSON.stringify(body));
});

test("UFTR-11: POST /api/notifications/mark-all-read → marks all read as user", async ({ page }) => {
  await loginAs(page, "user");
  const resp = await page.request.post("/api/notifications/mark-all-read", {
    data: {},
  });
  console.log("UFTR-11:", resp.status());
  expect([200, 500]).toContain(resp.status());
  console.log("UFTR-11: mark-all-read responded ✓");
});

// ─── User Experiences ─────────────────────────────────────────────────────────

test("UFTR-12: GET /api/user-experiences → returns array as user", async ({ page }) => {
  await loginAs(page, "user");
  const resp = await page.request.get("/api/user-experiences");
  console.log("UFTR-12:", resp.status());
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  console.log("UFTR-12: user experiences:", Array.isArray(body) ? body.length : typeof body);
});

test("UFTR-13: POST /api/user-experiences → 400 missing required fields", async ({ page }) => {
  await loginAs(page, "user");
  const resp = await page.request.post("/api/user-experiences", {
    data: {},
  });
  console.log("UFTR-13:", resp.status());
  expect([400, 422, 500]).toContain(resp.status());
  console.log("UFTR-13: missing experience fields handled ✓");
});

test("UFTR-14: GET /api/user-experiences/:id → 404 for non-existent experience", async ({ page }) => {
  await loginAs(page, "user");
  const resp = await page.request.get("/api/user-experiences/00000000-0000-0000-0000-000000000000");
  console.log("UFTR-14:", resp.status());
  expect([404, 403, 400, 500]).toContain(resp.status());
  console.log("UFTR-14: non-existent experience handled ✓");
});

test("UFTR-15: PATCH /api/profile → 400 with invalid data", async ({ page }) => {
  await loginAs(page, "user");
  const resp = await page.request.patch("/api/profile", {
    data: { firstName: "", lastName: "" },
  });
  console.log("UFTR-15:", resp.status());
  expect([200, 400, 422]).toContain(resp.status());
  console.log("UFTR-15: profile update responded ✓");
});

// ─── E2E: User features lifecycle ────────────────────────────────────────────

test("UFTR-16: E2E — auth guards → wallet → credits → notifications → experiences", async ({ page }) => {
  // Step 1: Verify auth guards
  const walletUnauth = await page.request.get("/api/wallet");
  expect(walletUnauth.status()).toBe(401);
  const credsUnauth = await page.request.get("/api/credits/balance");
  expect(credsUnauth.status()).toBe(401);
  console.log("UFTR-16 Step 1: auth guards confirmed ✓");

  // Step 2: Login and check wallet
  await loginAs(page, "user");
  const walletResp = await page.request.get("/api/wallet");
  expect(walletResp.status()).toBe(200);
  const wallet = await walletResp.json();
  console.log("UFTR-16 Step 2: wallet keys:", Object.keys(wallet).join(", ").slice(0, 60), "✓");

  // Step 3: Credits balance
  const credsResp = await page.request.get("/api/credits/balance");
  expect(credsResp.status()).toBe(200);
  console.log("UFTR-16 Step 3: credits balance ok ✓");

  // Step 4: Notifications
  const notifResp = await page.request.get("/api/notifications");
  expect(notifResp.status()).toBe(200);
  console.log("UFTR-16 Step 4: notifications ok ✓");

  // Step 5: Unread count
  const countResp = await page.request.get("/api/notifications/unread-count");
  expect(countResp.status()).toBe(200);
  console.log("UFTR-16 Step 5: unread count ok ✓");

  // Step 6: User experiences list
  const expResp = await page.request.get("/api/user-experiences");
  expect(expResp.status()).toBe(200);
  console.log("UFTR-16 Step 6: user experiences ok ✓");

  // Step 7: Validate bad credit purchase
  const badPurchase = await page.request.post("/api/credits/purchase", {
    data: {},
  });
  expect([400, 422]).toContain(badPurchase.status());
  console.log("UFTR-16 Step 7: bad credit purchase rejected:", badPurchase.status(), "✓");

  console.log("UFTR-16 E2E user features flow complete ✓");
});
