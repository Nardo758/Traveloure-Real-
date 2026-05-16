import { test, expect } from "@playwright/test";
import { loginAs } from "../helpers/auth";

test.describe("Phase 3 - Admin Flow Smoke Tests", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, "admin");
  });

  test("admin dashboard loads", async ({ page }) => {
    await page.goto("/admin/dashboard");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("[data-testid='error-boundary']")).not.toBeVisible();
    await expect(
      page.locator("[data-testid='admin-sidebar'], [data-testid='admin-dashboard']").first()
    ).toBeVisible({ timeout: 10000 });
  });

  test("user management loads and is searchable", async ({ page }) => {
    await page.goto("/admin/users");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("[data-testid='error-boundary']")).not.toBeVisible();
    // Search box should exist
    const searchInput = page.locator('input[placeholder*="search" i], input[type="search"]').first();
    await expect(searchInput).toBeVisible({ timeout: 8000 });
    await searchInput.fill("test");
    // List should update
    await page.waitForTimeout(500);
    await expect(page.locator("main").first()).toBeVisible();
  });

  test("expert management loads", async ({ page }) => {
    await page.goto("/admin/experts");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("[data-testid='error-boundary']")).not.toBeVisible();
    await expect(page.locator("main").first()).toBeVisible({ timeout: 8000 });
  });

  test("provider management loads", async ({ page }) => {
    await page.goto("/admin/providers");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("[data-testid='error-boundary']")).not.toBeVisible();
    await expect(page.locator("main").first()).toBeVisible({ timeout: 8000 });
  });

  test("admin bookings loads", async ({ page }) => {
    await page.goto("/admin/bookings");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("[data-testid='error-boundary']")).not.toBeVisible();
    await expect(page.locator("main").first()).toBeVisible({ timeout: 8000 });
  });

  test("admin analytics loads", async ({ page }) => {
    await page.goto("/admin/analytics");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("[data-testid='error-boundary']")).not.toBeVisible();
    await expect(page.locator("main").first()).toBeVisible({ timeout: 8000 });
  });

  test("admin revenue loads", async ({ page }) => {
    await page.goto("/admin/revenue");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("[data-testid='error-boundary']")).not.toBeVisible();
    await expect(page.locator("main").first()).toBeVisible({ timeout: 8000 });
  });

  test("admin payouts loads without 500 error", async ({ page }) => {
    await page.goto("/admin/payouts");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("[data-testid='error-boundary']")).not.toBeVisible();
    // Should show empty state or list, not a crash
    await expect(page.locator("main").first()).toBeVisible({ timeout: 8000 });
  });

  test("admin AI costs loads", async ({ page }) => {
    await page.goto("/admin/ai-costs");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("[data-testid='error-boundary']")).not.toBeVisible();
    await expect(page.locator("main").first()).toBeVisible({ timeout: 8000 });
  });

  test("admin content management loads", async ({ page }) => {
    await page.goto("/admin/content");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("[data-testid='error-boundary']")).not.toBeVisible();
    await expect(page.locator("main").first()).toBeVisible({ timeout: 8000 });
  });

  test("admin system health loads", async ({ page }) => {
    await page.goto("/admin/system");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("[data-testid='error-boundary']")).not.toBeVisible();
    await expect(page.locator("main").first()).toBeVisible({ timeout: 8000 });
  });

  test("admin logout works", async ({ page }) => {
    await page.goto("/admin/dashboard");
    await page.waitForLoadState("domcontentloaded");
    const logoutBtn = page.locator("[data-testid='button-logout']").first();
    await expect(logoutBtn).toBeVisible({ timeout: 8000 });
    await logoutBtn.click();
    // Wait for navigation away from admin dashboard
    await expect(page).not.toHaveURL(/\/admin\/dashboard/, { timeout: 15000 });
    // Confirm session gone — admin dashboard should redirect away
    await page.goto("/admin/dashboard");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);
    await expect(page).not.toHaveURL(/\/admin\/dashboard/);
  });
});
