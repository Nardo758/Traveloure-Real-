import { test, expect } from "@playwright/test";

const EMAIL = "testuser123@mailinator.com";
const PASSWORD = "Test@1234";

// ────────────────────────────────────────────────────────────────────────────
// AUTH-10: Forgot Password
// ────────────────────────────────────────────────────────────────────────────
test("AUTH-10: Forgot Password — confirmation message appears", async ({ page }) => {
  await page.goto("/forgot-password");
  await page.waitForLoadState("domcontentloaded");

  await expect(page.locator("[data-testid='form-forgot-password']")).toBeVisible({ timeout: 8000 });

  await page.locator("[data-testid='input-email']").fill(EMAIL);
  await page.locator("[data-testid='button-send-reset']").click();

  // Success panel replaces the form
  await expect(page.locator("[data-testid='div-reset-success']")).toBeVisible({ timeout: 10000 });
  const successText = await page.locator("[data-testid='div-reset-success']").textContent();
  console.log("AUTH-10 success text:", successText?.trim());
});

// ────────────────────────────────────────────────────────────────────────────
// AUTH-11: Logout
// ────────────────────────────────────────────────────────────────────────────
test("AUTH-11: Logout — session cleared and redirected", async ({ page }) => {
  await page.goto("/login");
  await page.waitForLoadState("domcontentloaded");
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/dashboard/, { timeout: 20000 });
  console.log("AUTH-11 logged-in URL:", page.url());

  // Sidebar logout button
  const logoutBtn = page.locator(
    "[data-testid='button-sidebar-logout'], [data-testid='button-logout']"
  ).first();
  await expect(logoutBtn).toBeVisible({ timeout: 8000 });
  await logoutBtn.click();

  await expect(page).not.toHaveURL(/\/dashboard/, { timeout: 15000 });
  console.log("AUTH-11 after-logout URL:", page.url());

  // Confirm session is dead — revisiting /dashboard should redirect
  await page.goto("/dashboard");
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(1500);
  console.log("AUTH-11 re-visit /dashboard URL:", page.url());
  expect(page.url()).not.toMatch(/\/dashboard/);
});

// ────────────────────────────────────────────────────────────────────────────
// AUTH-12: Protected routes without login
// ────────────────────────────────────────────────────────────────────────────
test("AUTH-12a: /dashboard redirects when logged out", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("domcontentloaded");
  await page.request.post("/api/auth/logout");

  await page.goto("/dashboard");
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(2000);

  const url = page.url();
  console.log("AUTH-12a /dashboard redirected to:", url);
  expect(url).not.toMatch(/\/dashboard/);
});

test("AUTH-12b: /profile redirects when logged out", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("domcontentloaded");
  await page.request.post("/api/auth/logout");

  await page.goto("/profile");
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(2000);

  const url = page.url();
  console.log("AUTH-12b /profile redirected to:", url);
  expect(url).not.toMatch(/\/profile/);
});

// ────────────────────────────────────────────────────────────────────────────
// AUTH-13: Session persists on hard refresh
// ────────────────────────────────────────────────────────────────────────────
test("AUTH-13: Session persists after hard refresh", async ({ page }) => {
  await page.goto("/login");
  await page.waitForLoadState("domcontentloaded");
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/dashboard/, { timeout: 20000 });
  console.log("AUTH-13 URL before refresh:", page.url());

  // Hard refresh (F5 / Ctrl+R equivalent)
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);

  console.log("AUTH-13 URL after refresh:", page.url());
  expect(page.url()).toMatch(/\/dashboard/);
  expect(page.url()).not.toMatch(/\/login/);

  // Session API should still return 200
  const apiResp = await page.request.get("/api/auth/user");
  console.log("AUTH-13 /api/auth/user status:", apiResp.status());
  expect(apiResp.status()).toBe(200);

  const userData = await apiResp.json();
  console.log("AUTH-13 still logged in as:", userData?.email ?? userData?.firstName ?? JSON.stringify(userData).slice(0, 80));
});
