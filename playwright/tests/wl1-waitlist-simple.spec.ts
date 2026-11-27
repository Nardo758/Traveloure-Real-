/**
 * WL-1: the three simplified forms and the one admin city action.
 */
import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:5000";
const CAPTURES = path.resolve("playwright/wl1-captures");
fs.mkdirSync(CAPTURES, { recursive: true });

async function mask(page: Page) {
  await page.addStyleTag({ content: 'input[type="email"], [data-testid="input-waitlist-email"], [data-testid="input-provider-email"], [data-testid="input-expert-email"], [data-testid="sidebar-user-email"] { color: transparent !important; caret-color: transparent !important; }' });
}

test("WL-1 three forms at 1280 and 390", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${BASE_URL}/waitlist/kyoto`, { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-testid="form-waitlist"]')).toBeVisible({ timeout: 30_000 });

  const traveler = page.locator('[data-testid="form-waitlist"]');
  await expect(traveler.locator('[data-testid="input-waitlist-name"]')).toBeVisible();
  await expect(traveler.locator('[data-testid="radio-trip-type-proposal"]')).toHaveCount(0);
  await expect(traveler.locator('[data-testid="select-waitlist-month"]')).toHaveCount(0);
  await expect(traveler.locator('[data-testid="input-waitlist-worry"]')).toHaveCount(0);
  await mask(page);
  await traveler.screenshot({ path: path.join(CAPTURES, "form-traveler-1280.png") });

  const provider = page.locator('[data-testid="form-provider-waitlist"]');
  await expect(provider.locator('[data-testid="input-provider-name"]')).toBeVisible();
  await expect(provider.locator('[data-testid="input-provider-business"]')).toHaveCount(0);
  await expect(provider.locator('[data-testid="radio-service-type-guide_planner"]')).toBeVisible();
  await provider.screenshot({ path: path.join(CAPTURES, "form-provider-1280.png") });

  const expert = page.locator('[data-testid="form-expert-waitlist"]');
  await expect(expert.locator('[data-testid="input-expert-name"]')).toBeVisible();
  await expect(expert.locator('[data-testid="input-expert-languages"]')).toHaveCount(0);
  await expect(expert.locator('[data-testid="input-expert-link"]')).toHaveCount(0);
  await expert.screenshot({ path: path.join(CAPTURES, "form-expert-1280.png") });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  await mask(page);
  await traveler.screenshot({ path: path.join(CAPTURES, "form-traveler-390.png") });
  await provider.screenshot({ path: path.join(CAPTURES, "form-provider-390.png") });
  await expert.screenshot({ path: path.join(CAPTURES, "form-expert-390.png") });
  console.log(`[wl1-forms] traveler_name=1 trip_type=0 month=0 worry=0 provider_business=0 expert_languages=0 expert_link=0`);
});

test("WL-1 admin one city action at 1280 and 390", async ({ page }) => {
  test.setTimeout(90_000);
  await page.route("**/api/auth/user", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ id: "wl1-admin", email: "wl1-admin@example.com", firstName: "WL1", lastName: "Admin", role: "admin", termsAcceptedAt: new Date().toISOString(), privacyAcceptedAt: new Date().toISOString() }),
  }));
  await page.route("**/api/public/live-markets", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ markets: [] }) }));
  await page.route("**/api/admin/waitlist/entries**", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ rows: [
      { id: "a", email: "a@example.com", role: "traveler", marketSlug: "kyoto", source: null, contactName: "A", businessName: null, serviceType: null, applicationStatus: null, createdAt: null, isQa: false },
      { id: "b", email: "b@example.com", role: "expert", marketSlug: "kyoto", source: null, contactName: "B", businessName: null, serviceType: null, applicationStatus: "pending", createdAt: null, isQa: false },
      { id: "c", email: "c@example.com", role: "provider", marketSlug: "kyoto", source: null, contactName: "C", businessName: null, serviceType: "guide_planner", applicationStatus: null, createdAt: null, isQa: false },
    ] }),
  }));
  await page.route(/\/api\/admin\/waitlist(\?.*)?$/, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ travelers: { total: 1, consented: 1, byTripType: [], bySource: [] }, providers: { total: 1, consented: 1, byServiceType: [] }, qaExcluded: 0, byMarket: [], referrers: [] }) }));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${BASE_URL}/admin/waitlist`, { waitUntil: "domcontentloaded" });
  const card = page.locator('[data-testid="card-waitlist-market-opened-all"]');
  await expect(card).toBeVisible({ timeout: 30_000 });
  await card.locator('[data-testid="select-market-opened-all-market"]').selectOption("kyoto");
  await expect(card.locator('[data-testid="text-market-opened-all-counts"]')).toContainText("1 travelers · 1 experts · 1 providers");
  await mask(page);
  await card.screenshot({ path: path.join(CAPTURES, "admin-card-1280.png") });
  await card.locator('[data-testid="button-market-opened-all"]').click();
  await expect(page.locator('[data-testid="text-market-opened-all-confirm"]')).toContainText("Email 1 travelers, 1 experts and 1 providers that Kyoto is open?");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  await mask(page);
  await page.screenshot({ path: path.join(CAPTURES, "admin-card-390.png"), fullPage: true });
  console.log(`[wl1-admin] one_city_action=1 counts_per_role=1 confirm=1`);
});
