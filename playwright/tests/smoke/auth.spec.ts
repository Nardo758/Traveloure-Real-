import { test, expect } from "@playwright/test";
import { loginAs, logout, TEST_ACCOUNTS } from "../helpers/auth";

test.describe("Phase 1 - Auth Smoke Tests", () => {
  test("wrong password shows error", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");
    await page.fill('input[type="email"]', TEST_ACCOUNTS.user.email);
    await page.fill('input[type="password"]', "WrongPassword999!");
    await page.click('button[type="submit"]');
    await expect(
      page.locator("text=/invalid|incorrect|wrong|error/i").first()
    ).toBeVisible({ timeout: 8000 });
  });

  test("user login and dashboard access", async ({ page }) => {
    await loginAs(page, "user");
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.locator("[data-testid='dashboard'], main").first()).toBeVisible();
  });

  test("logout clears session and redirects home", async ({ page }) => {
    await loginAs(page, "user");
    await page.goto("/dashboard");
    await page.waitForLoadState("domcontentloaded");

    // Click the sidebar/header logout button
    const logoutBtn = page.locator(
      "[data-testid='button-logout'], [data-testid='button-sidebar-logout']"
    ).first();
    await expect(logoutBtn).toBeVisible({ timeout: 8000 });
    await logoutBtn.click();

    // Should redirect away from dashboard (home or login)
    await expect(page).not.toHaveURL(/\/dashboard/, { timeout: 15000 });

    // Attempting to visit a protected route should redirect away
    await page.goto("/dashboard");
    await page.waitForLoadState("domcontentloaded");
    // Give the SPA redirect a moment to settle
    await page.waitForTimeout(2000);
    await expect(page).not.toHaveURL(/\/dashboard/);
  });

  test("unauthenticated user cannot access protected route", async ({ page }) => {
    await logout(page);
    await page.goto("/dashboard");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);
    await expect(page).not.toHaveURL(/\/dashboard/);
  });

  test("admin login and admin dashboard access", async ({ page }) => {
    await loginAs(page, "admin");
    await page.goto("/admin/dashboard");
    await page.waitForLoadState("domcontentloaded");
    await expect(
      page.locator("[data-testid='admin-sidebar'], [data-testid='admin-dashboard']").first()
    ).toBeVisible({ timeout: 10000 });
  });
});
