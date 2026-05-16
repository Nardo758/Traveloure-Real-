import { test, expect } from "@playwright/test";
import { loginAs } from "../helpers/auth";

test.describe("Phase 5 - Provider Flow Smoke Tests", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, "provider");
  });

  test("provider dashboard loads", async ({ page }) => {
    await page.goto("/provider/dashboard");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("[data-testid='error-boundary']")).not.toBeVisible();
    await expect(page.locator("main").first()).toBeVisible({ timeout: 10000 });
  });

  test("provider services loads", async ({ page }) => {
    await page.goto("/provider/services");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("[data-testid='error-boundary']")).not.toBeVisible();
    await expect(page.locator("main").first()).toBeVisible({ timeout: 8000 });
  });

  test("provider earnings loads with Stripe Connect section", async ({ page }) => {
    await page.goto("/provider/earnings");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("[data-testid='error-boundary']")).not.toBeVisible();
    await expect(page.locator("main").first()).toBeVisible({ timeout: 8000 });
    await expect(
      page.locator("text=/stripe connect|connect.*stripe|payout/i").first()
    ).toBeVisible({ timeout: 8000 });
  });

  test("provider calendar loads", async ({ page }) => {
    await page.goto("/provider/calendar");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("[data-testid='error-boundary']")).not.toBeVisible();
    await expect(page.locator("main").first()).toBeVisible({ timeout: 8000 });
  });

  test("provider analytics loads", async ({ page }) => {
    await page.goto("/provider/analytics");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("[data-testid='error-boundary']")).not.toBeVisible();
    await expect(page.locator("main").first()).toBeVisible({ timeout: 8000 });
  });

  test("provider bookings loads", async ({ page }) => {
    await page.goto("/provider/bookings");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("[data-testid='error-boundary']")).not.toBeVisible();
    await expect(page.locator("main").first()).toBeVisible({ timeout: 8000 });
  });

  test("provider profile loads", async ({ page }) => {
    await page.goto("/provider/profile");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("[data-testid='error-boundary']")).not.toBeVisible();
    await expect(page.locator("main").first()).toBeVisible({ timeout: 8000 });
  });

  test("provider settings loads", async ({ page }) => {
    await page.goto("/provider/settings");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("[data-testid='error-boundary']")).not.toBeVisible();
    await expect(page.locator("main").first()).toBeVisible({ timeout: 8000 });
  });

  test("provider resources loads", async ({ page }) => {
    await page.goto("/provider/resources");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("[data-testid='error-boundary']")).not.toBeVisible();
    await expect(page.locator("main").first()).toBeVisible({ timeout: 8000 });
  });
});
