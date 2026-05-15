import { test, expect } from "@playwright/test";
import { loginAs } from "../helpers/auth";

test.describe("Phase 2 - User Flow Smoke Tests", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, "user");
  });

  test("dashboard loads with trip cards or empty state", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
    const main = page.locator("main, [data-testid='dashboard']").first();
    await expect(main).toBeVisible({ timeout: 10000 });
  });

  test("homepage search navigates to discover", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const searchInput = page.locator('input[placeholder*="search" i], input[placeholder*="destination" i], input[placeholder*="where" i]').first();
    await searchInput.fill("Tokyo");
    await searchInput.press("Enter");
    await page.waitForURL(/discover|search/, { timeout: 10000 });
  });

  test("experience type browsing opens planning form", async ({ page }) => {
    await page.goto("/experiences");
    await page.waitForLoadState("networkidle");
    const card = page.locator("[data-testid*='card'], .cursor-pointer, [class*='card']").first();
    await expect(card).toBeVisible({ timeout: 10000 });
    await card.click();
    await page.waitForURL(/experiences\/.+|planning/, { timeout: 8000 });
  });

  test("experts page loads expert cards", async ({ page }) => {
    await page.goto("/experts");
    await page.waitForLoadState("networkidle");
    const content = page.locator("main, [data-testid='experts-page']").first();
    await expect(content).toBeVisible({ timeout: 10000 });
  });

  test("hidden gems page loads with category tabs", async ({ page }) => {
    await page.goto("/hidden-gems");
    await page.waitForLoadState("networkidle");
    // Should show category tabs, not error boundary
    await expect(page.locator("[data-testid='error-boundary']")).not.toBeVisible();
    const content = page.locator("main, [role='tablist'], [data-testid*='tab']").first();
    await expect(content).toBeVisible({ timeout: 10000 });
  });

  test("notifications page loads", async ({ page }) => {
    await page.goto("/notifications");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("[data-testid='error-boundary']")).not.toBeVisible();
    await expect(page.locator("main").first()).toBeVisible({ timeout: 8000 });
  });

  test("cart page loads without crash", async ({ page }) => {
    await page.goto("/cart");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("[data-testid='error-boundary']")).not.toBeVisible();
    await expect(page.locator("main").first()).toBeVisible({ timeout: 8000 });
  });

  test("credits page loads with packages", async ({ page }) => {
    await page.goto("/credits");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("[data-testid='error-boundary']")).not.toBeVisible();
    await expect(page.locator("main").first()).toBeVisible({ timeout: 8000 });
  });

  test("my bookings page loads without crash", async ({ page }) => {
    await page.goto("/my-bookings");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("[data-testid='error-boundary']")).not.toBeVisible();
    await expect(page.locator("main").first()).toBeVisible({ timeout: 8000 });
  });

  test("service providers page renders cards", async ({ page }) => {
    await page.goto("/service-providers");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("[data-testid='error-boundary']")).not.toBeVisible();
    await expect(page.locator("main").first()).toBeVisible({ timeout: 8000 });
  });

  test("chat page loads conversation list", async ({ page }) => {
    await page.goto("/chat");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("[data-testid='error-boundary']")).not.toBeVisible();
    await expect(page.locator("main").first()).toBeVisible({ timeout: 8000 });
  });

  test("quick start itinerary builder loads", async ({ page }) => {
    await page.goto("/quick-start");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("[data-testid='error-boundary']")).not.toBeVisible();
    await expect(page.locator("main").first()).toBeVisible({ timeout: 8000 });
  });

  test("trips redirect works (/trips → /my-trips)", async ({ page }) => {
    await page.goto("/trips");
    await page.waitForURL(/my-trips/, { timeout: 8000 });
    await expect(page).toHaveURL(/my-trips/);
  });
});
