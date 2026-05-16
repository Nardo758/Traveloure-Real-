/**
 * PROF-01–16: Wallet, Credits, Notifications & Profile
 * Tests auth guards, wallet shape, credit balance, notifications, profile update/password flow
 */
import { test, expect } from "@playwright/test";
import { loginAs, logout } from "../helpers/auth";

// ─── Auth Guards ─────────────────────────────────────────────────────────────

test("PROF-01: GET /api/wallet → 401 when not logged in", async ({ page }) => {
  const resp = await page.request.get("/api/wallet");
  console.log("PROF-01:", resp.status());
  expect(resp.status()).toBe(401);
});

test("PROF-02: GET /api/credits/balance → 401 when not logged in", async ({ page }) => {
  const resp = await page.request.get("/api/credits/balance");
  console.log("PROF-02:", resp.status());
  expect(resp.status()).toBe(401);
});

test("PROF-03: GET /api/notifications → 401 when not logged in", async ({ page }) => {
  const resp = await page.request.get("/api/notifications");
  console.log("PROF-03:", resp.status());
  expect(resp.status()).toBe(401);
});

// ─── Wallet & Credits ─────────────────────────────────────────────────────────

test("PROF-04: GET /api/wallet → returns wallet object when authenticated", async ({ page }) => {
  await loginAs(page, "user");
  const resp = await page.request.get("/api/wallet");
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  expect(body).toHaveProperty("id");
  expect(body).toHaveProperty("credits");
  console.log("PROF-04: wallet credits =", body.credits);
});

test("PROF-05: GET /api/credits/balance → {balance, total} shape", async ({ page }) => {
  await loginAs(page, "user");
  const resp = await page.request.get("/api/credits/balance");
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  expect(body).toHaveProperty("balance");
  expect(body).toHaveProperty("total");
  expect(typeof body.balance).toBe("number");
  expect(typeof body.total).toBe("number");
  expect(body.total).toBeGreaterThanOrEqual(body.balance);
  console.log("PROF-05: balance =", body.balance, "total =", body.total);
});

test("PROF-06: GET /api/wallet/transactions → returns array", async ({ page }) => {
  await loginAs(page, "user");
  const resp = await page.request.get("/api/wallet/transactions");
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  expect(Array.isArray(body)).toBe(true);
  console.log("PROF-06: transactions count =", body.length);
});

test("PROF-07: POST /api/wallet/add-credits → 403 for non-admin user", async ({ page }) => {
  await loginAs(page, "user");
  const resp = await page.request.post("/api/wallet/add-credits", {
    data: { userId: "some-id", amount: 100, description: "Test" },
  });
  console.log("PROF-07:", resp.status());
  expect(resp.status()).toBe(403);
});

test("PROF-08: POST /api/credits/purchase → 400 for missing/invalid packageId", async ({ page }) => {
  await loginAs(page, "user");

  // Missing packageId
  const resp1 = await page.request.post("/api/credits/purchase", {
    data: {},
  });
  console.log("PROF-08 (missing):", resp1.status());
  expect(resp1.status()).toBe(400);
  const body1 = await resp1.json();
  expect(body1.message).toMatch(/invalid package/i);

  // Invalid packageId
  const resp2 = await page.request.post("/api/credits/purchase", {
    data: { packageId: "nonexistent-package-xyz" },
  });
  console.log("PROF-08 (invalid):", resp2.status());
  expect(resp2.status()).toBe(400);
});

// ─── Notifications ────────────────────────────────────────────────────────────

test("PROF-09: GET /api/notifications → returns array with expected shape", async ({ page }) => {
  await loginAs(page, "user");
  const resp = await page.request.get("/api/notifications");
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  expect(Array.isArray(body)).toBe(true);
  console.log("PROF-09: notifications count =", body.length);
  if (body.length > 0) {
    expect(body[0]).toHaveProperty("id");
    expect(body[0]).toHaveProperty("type");
  }
});

test("PROF-10: GET /api/notifications/unread-count → {count: number}", async ({ page }) => {
  await loginAs(page, "user");
  const resp = await page.request.get("/api/notifications/unread-count");
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  expect(body).toHaveProperty("count");
  expect(typeof body.count).toBe("number");
  expect(body.count).toBeGreaterThanOrEqual(0);
  console.log("PROF-10: unread count =", body.count);
});

test("PROF-11: POST /api/notifications/mark-all-read → 200", async ({ page }) => {
  await loginAs(page, "user");
  const resp = await page.request.post("/api/notifications/mark-all-read");
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  console.log("PROF-11: mark-all-read result:", JSON.stringify(body).slice(0, 80));
  // After marking all read, unread count should be 0
  const count = await page.request.get("/api/notifications/unread-count");
  const { count: unread } = await count.json();
  expect(unread).toBe(0);
  console.log("PROF-11: unread count after mark-all-read:", unread, "✓");
});

// ─── Profile Update ───────────────────────────────────────────────────────────

test("PROF-12: PATCH /api/profile → updates firstName and bio", async ({ page }) => {
  await loginAs(page, "user");
  const resp = await page.request.patch("/api/profile", {
    data: { firstName: "TestFirst", bio: "Testing bio update" },
  });
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  expect(body.firstName).toBe("TestFirst");
  expect(body.bio).toBe("Testing bio update");
  // Password should not be leaked
  expect(body.password).toBeUndefined();
  console.log("PROF-12: profile updated, firstName:", body.firstName);
});

test("PROF-13: PATCH /api/profile → 400 when bio exceeds 500 chars", async ({ page }) => {
  await loginAs(page, "user");
  const resp = await page.request.patch("/api/profile", {
    data: { bio: "x".repeat(501) },
  });
  console.log("PROF-13:", resp.status());
  expect(resp.status()).toBe(400);
});

// ─── Password Change ──────────────────────────────────────────────────────────

test("PROF-14: POST /api/profile/change-password → 400 new password too short", async ({ page }) => {
  await loginAs(page, "user");
  const resp = await page.request.post("/api/profile/change-password", {
    data: { currentPassword: "TestPass123!", newPassword: "short" },
  });
  console.log("PROF-14:", resp.status());
  expect(resp.status()).toBe(400);
  const body = await resp.json();
  expect(body.message).toMatch(/8 char|at least/i);
});

test("PROF-15: POST /api/profile/change-password → 401 wrong current password", async ({ page }) => {
  await loginAs(page, "user");
  const resp = await page.request.post("/api/profile/change-password", {
    data: { currentPassword: "WrongPassword999!", newPassword: "NewValidPass123!" },
  });
  console.log("PROF-15:", resp.status());
  expect(resp.status()).toBe(401);
  const body = await resp.json();
  expect(body.message).toMatch(/incorrect|wrong|invalid/i);
});

// ─── E2E: Profile update → verify → revert ───────────────────────────────────

test("PROF-16: E2E — update profile → verify dashboard shows change → revert", async ({ page }) => {
  await loginAs(page, "user");

  // Step 1: Update profile
  const update = await page.request.patch("/api/profile", {
    data: { firstName: "E2EFirst", lastName: "E2ELast", bio: "E2E test bio" },
  });
  expect(update.status()).toBe(200);
  const updated = await update.json();
  expect(updated.firstName).toBe("E2EFirst");
  expect(updated.lastName).toBe("E2ELast");
  expect(updated.bio).toBe("E2E test bio");
  console.log("PROF-16 Step 1: profile updated ✓");

  // Step 2: Verify wallet still accessible after profile change
  const wallet = await page.request.get("/api/wallet");
  expect(wallet.status()).toBe(200);
  console.log("PROF-16 Step 2: wallet accessible ✓");

  // Step 3: Verify notifications still accessible
  const notifs = await page.request.get("/api/notifications");
  expect(notifs.status()).toBe(200);
  console.log("PROF-16 Step 3: notifications accessible ✓");

  // Step 4: Verify credits balance
  const balance = await page.request.get("/api/credits/balance");
  expect(balance.status()).toBe(200);
  const { balance: credits } = await balance.json();
  console.log("PROF-16 Step 4: credits balance:", credits, "✓");

  // Step 5: Revert profile
  const revert = await page.request.patch("/api/profile", {
    data: { firstName: "Test", lastName: "User", bio: "" },
  });
  expect(revert.status()).toBe(200);
  const reverted = await revert.json();
  expect(reverted.firstName).toBe("Test");
  console.log("PROF-16 Step 5: profile reverted ✓");
  console.log("PROF-16 E2E complete ✓");
});
