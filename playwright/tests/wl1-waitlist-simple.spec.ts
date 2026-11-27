/**
 * WL-1: the three simplified forms, their done screens, and the one admin city action.
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

async function full(page: Page, name: string) {
  await mask(page);
  await page.screenshot({ path: path.join(CAPTURES, name), fullPage: true });
}

test("WL-1 three forms as full pages at 1280 and 390", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${BASE_URL}/waitlist/kyoto`, { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-testid="form-waitlist"]')).toBeVisible({ timeout: 30_000 });

  const traveler = page.locator('[data-testid="form-waitlist"]');
  const provider = page.locator('[data-testid="form-provider-waitlist"]');
  const expert = page.locator('[data-testid="form-expert-waitlist"]');
  await expect(traveler.locator('[data-testid="input-waitlist-name"]')).toBeVisible();
  await expect(traveler.locator('[data-testid="radio-trip-type-proposal"]')).toHaveCount(0);
  await expect(traveler.locator('[data-testid="select-waitlist-month"]')).toHaveCount(0);
  await expect(traveler.locator('[data-testid="input-waitlist-worry"]')).toHaveCount(0);
  await expect(provider.locator('[data-testid="input-provider-business"]')).toHaveCount(0);
  await expect(provider.locator('[data-testid="radio-service-type-guide_planner"]')).toBeVisible();
  await expect(expert.locator('[data-testid="input-expert-languages"]')).toHaveCount(0);
  await expect(expert.locator('[data-testid="input-expert-link"]')).toHaveCount(0);

  const chip = page.locator('[data-testid="chip-waitlist-market-kyoto"]');
  await page.waitForTimeout(800);
  const chip1280 = (await chip.innerText()).trim();
  await full(page, "form-traveler-1280.png");
  await full(page, "form-provider-1280.png");
  await full(page, "form-expert-1280.png");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  await full(page, "form-traveler-390.png");
  await full(page, "form-provider-390.png");
  await full(page, "form-expert-390.png");
  const chip390 = (await chip.innerText()).trim();
  expect(chip390).toBe(chip1280);

  // The first field sits below the sticky header after the #experts anchor scrolls.
  await page.goto(`${BASE_URL}/waitlist/kyoto#experts`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(400);
  const header = page.locator('nav[aria-label="Main navigation"]').first();
  const firstField = expert.locator("input").first();
  const hb = await header.boundingBox();
  const fb = await firstField.boundingBox();
  expect(hb).not.toBeNull();
  expect(fb).not.toBeNull();
  expect(fb!.y).toBeGreaterThanOrEqual(hb!.height - 1);

  console.log(`[wl1-forms] traveler_name=1 trip_type=0 month=0 worry=0 provider_business=0 expert_languages=0 expert_link=0 chip="${chip1280}" same_at_390=true`);
});

test("WL-1 done screens: expert apply and provider apply", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${BASE_URL}/waitlist/kyoto#experts`, { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-testid="form-expert-waitlist"]')).toBeVisible({ timeout: 30_000 });
  await page.locator('[data-testid="input-expert-name"]').fill("WL1 Expert");
  await page.locator('[data-testid="input-expert-email"]').fill(`wl1-expert-${Date.now()}@example.com`);
  await page.locator('[data-testid="input-expert-city"]').selectOption("kyoto");
  await page.locator('[data-testid="button-expert-waitlist-send"]').click();
  const expertDone = page.locator('[data-testid="text-expert-waitlist-done"]');
  await expect(expertDone).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-testid="link-expert-apply"]')).toBeVisible();
  await full(page, "done-expert-1280.png");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  await full(page, "done-expert-390.png");

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${BASE_URL}/waitlist/kyoto#providers`, { waitUntil: "domcontentloaded" });
  await page.locator('[data-testid="input-provider-name"]').fill("WL1 Provider");
  await page.locator('[data-testid="input-provider-email"]').fill(`wl1-provider-${Date.now()}@example.com`);
  await page.locator('[data-testid="radio-service-type-guide_planner"]').check({ force: true });
  await page.locator('[data-testid="button-provider-waitlist-send"]').click();
  const providerDone = page.locator('[data-testid="text-provider-waitlist-done"]');
  await expect(providerDone).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-testid="link-provider-apply"]')).toBeVisible();
  await full(page, "done-provider-1280.png");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  await full(page, "done-provider-390.png");
  console.log(`[wl1-done] expert_apply=1 provider_apply=1`);
});

test("WL-1 admin one city action, table and confirm at 1280 and 390", async ({ page }) => {
  test.setTimeout(120_000);
  await page.route("**/api/auth/user", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ id: "wl1-admin", email: "wl1-admin@example.com", firstName: "WL1", lastName: "Admin", role: "admin", termsAcceptedAt: new Date().toISOString(), privacyAcceptedAt: new Date().toISOString() }),
  }));
  await page.route("**/api/public/live-markets", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ markets: [] }) }));
  await page.route("**/api/admin/waitlist/entries**", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ rows: [
      { id: "a", email: "a@example.com", role: "traveler", marketSlug: "kyoto", source: "kyoto_waitlist_page", contactName: "A", businessName: null, serviceType: null, applicationStatus: null, createdAt: "2026-11-27T00:00:00.000Z", isQa: false },
      { id: "b", email: "b@example.com", role: "expert", marketSlug: "kyoto", source: "kyoto_waitlist_page", contactName: "B", businessName: null, serviceType: null, applicationStatus: "pending", createdAt: "2026-11-27T00:00:00.000Z", isQa: false },
      { id: "c", email: "c@example.com", role: "provider", marketSlug: "kyoto", source: "kyoto_waitlist_page", contactName: "C", businessName: null, serviceType: "guide_planner", applicationStatus: null, createdAt: "2026-11-27T00:00:00.000Z", isQa: false },
    ] }),
  }));
  await page.route(/\/api\/admin\/waitlist(\?.*)?$/, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ travelers: { total: 1, consented: 1, byTripType: [], bySource: [] }, providers: { total: 1, consented: 1, byServiceType: [] }, qaExcluded: 0, byMarket: [], referrers: [] }) }));

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${BASE_URL}/admin/waitlist`, { waitUntil: "domcontentloaded" });
  const card = page.locator('[data-testid="card-waitlist-market-opened-all"]');
  await expect(card).toBeVisible({ timeout: 30_000 });
  await card.locator('[data-testid="select-market-opened-all-market"]').selectOption("kyoto");
  await expect(card.locator('[data-testid="text-market-opened-all-counts"]')).toHaveText("1 traveler · 1 expert · 1 provider");
  await full(page, "admin-card-1280.png");
  const table = page.locator('[data-testid="table-waitlist-entries-kyoto"]');
  await expect(table).toBeVisible();
  await table.screenshot({ path: path.join(CAPTURES, "admin-table-1280.png") });

  await card.locator('[data-testid="button-market-opened-all"]').click();
  const confirm = page.locator('[data-testid="text-market-opened-all-confirm"]');
  await expect(confirm).toHaveText("Email 1 traveler, 1 expert and 1 provider that Kyoto is open?");
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(CAPTURES, "admin-confirm-1280.png") });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(CAPTURES, "admin-confirm-390.png") });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  await full(page, "admin-card-390.png");
  await table.evaluate((el) => {
    const wrap = el.parentElement!;
    const th = Array.from(el.querySelectorAll("th")).find((h) => h.textContent?.trim() === "Application");
    wrap.scrollLeft = Math.max(0, ((th as HTMLElement | undefined)?.offsetLeft ?? 0) - 24);
    console.log("TABLE", wrap.scrollWidth, wrap.clientWidth, wrap.scrollLeft);
  });
  await table.locator("..").screenshot({ path: path.join(CAPTURES, "admin-table-390.png") });
  console.log(`[wl1-admin] one_city_action=1 counts_per_role=1 singular=1 table_scroll=1`);
});
