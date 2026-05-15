import { test, expect } from "@playwright/test";
import { loginAs } from "../helpers/auth";

test.describe("Phase 4 - Expert Flow Smoke Tests", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, "expert");
  });

  test("expert dashboard loads", async ({ page }) => {
    await page.goto("/expert/dashboard");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("[data-testid='error-boundary']")).not.toBeVisible();
    await expect(
      page.locator("[data-testid='expert-dashboard'], main").first()
    ).toBeVisible({ timeout: 10000 });
  });

  test("expert services loads", async ({ page }) => {
    await page.goto("/expert/services");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("[data-testid='error-boundary']")).not.toBeVisible();
    await expect(page.locator("main").first()).toBeVisible({ timeout: 8000 });
  });

  test("expert analytics loads", async ({ page }) => {
    await page.goto("/expert/analytics");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("[data-testid='error-boundary']")).not.toBeVisible();
    await expect(page.locator("main").first()).toBeVisible({ timeout: 8000 });
  });

  test("expert earnings page loads with Stripe Connect section", async ({ page }) => {
    await page.goto("/expert/earnings");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("[data-testid='error-boundary']")).not.toBeVisible();
    await expect(page.locator("main").first()).toBeVisible({ timeout: 8000 });
    // Stripe Connect section should appear
    await expect(
      page.locator("text=/stripe connect|connect.*stripe|payout/i").first()
    ).toBeVisible({ timeout: 8000 });
  });

  test("expert leaderboard loads", async ({ page }) => {
    await page.goto("/expert/leaderboard");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("[data-testid='error-boundary']")).not.toBeVisible();
    await expect(page.locator("main").first()).toBeVisible({ timeout: 8000 });
  });

  test("expert content studio loads", async ({ page }) => {
    await page.goto("/expert/content-studio");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("[data-testid='error-boundary']")).not.toBeVisible();
    await expect(page.locator("main").first()).toBeVisible({ timeout: 8000 });
  });

  test("expert templates loads", async ({ page }) => {
    await page.goto("/expert/templates");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("[data-testid='error-boundary']")).not.toBeVisible();
    await expect(page.locator("main").first()).toBeVisible({ timeout: 8000 });
  });

  test("expert AI assistant loads", async ({ page }) => {
    await page.goto("/expert/ai-assistant");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("[data-testid='error-boundary']")).not.toBeVisible();
    await expect(page.locator("main").first()).toBeVisible({ timeout: 8000 });
  });

  test("expert clients loads", async ({ page }) => {
    await page.goto("/expert/clients");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("[data-testid='error-boundary']")).not.toBeVisible();
    await expect(page.locator("main").first()).toBeVisible({ timeout: 8000 });
  });

  test("expert revenue optimization loads", async ({ page }) => {
    await page.goto("/expert/revenue-optimization");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("[data-testid='error-boundary']")).not.toBeVisible();
    await expect(page.locator("main").first()).toBeVisible({ timeout: 8000 });
  });

  test("expert logout works", async ({ page }) => {
    await page.goto("/expert/dashboard");
    await page.waitForLoadState("networkidle");
    const logoutBtn = page.locator("[data-testid='button-expert-logout']").first();
    await logoutBtn.click();
    await page.waitForURL(/\/$|\/login/, { timeout: 10000 });
    // Verify session is gone
    await page.goto("/expert/dashboard");
    await page.waitForURL(/\/$|\/login/, { timeout: 8000 });
    await expect(page).not.toHaveURL(/\/expert\/dashboard/);
  });
});
