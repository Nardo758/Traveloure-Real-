/**
 * G1: a city card and a deal card with no photo. Both keep their existing tinted band.
 * Screenshots are card-only so they can sit beside the Revision 3 crop in review.
 */
import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:5000";
const OUT = path.resolve("playwright/g1-captures");
fs.mkdirSync(OUT, { recursive: true });

async function mask(page: Page) {
  await page.addStyleTag({ content: 'input[type="email"], [data-testid="sidebar-user-email"] { color: transparent !important; }' });
}

test("G1 city card with no photo", async ({ page }) => {
  test.setTimeout(90_000);
  await page.route("**/api/travelpulse/cities", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({
      cities: [{
        id: "g1-city", cityName: "Kyoto", country: "Japan", imageUrl: null,
        pulseScore: 82, activeTravelers: 120, totalAlerts: 0, trendingScore: 70, vibeTags: ["culture"],
        avgHotelPrice: 180, crowdLevel: "balanced", dealAlert: null,
        totalTrendingSpots: 4, totalHiddenGems: 7,
      }],
      count: 1,
    }),
  }));
  await page.route("**/api/public/market-status**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ settings: {} }) }));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${BASE_URL}/destinations`, { waitUntil: "domcontentloaded" });
  const card = page.locator('[data-testid="card-city-kyoto"]');
  await expect(card).toBeVisible({ timeout: 30_000 });
  await mask(page);
  await card.screenshot({ path: path.join(OUT, "city-card-no-photo-1280.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  await mask(page);
  await card.screenshot({ path: path.join(OUT, "city-card-no-photo-390.png") });
  console.log(`[g1-city] photo=0 tinted_band=1`);
});

test("G1 deal card with no photo", async ({ page }) => {
  test.setTimeout(90_000);
  await page.route("**/api/deals**", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({
      total: 1,
      deals: [{
        id: "g1-deal", title: "G1 no-photo deal", type: "experiences", destination: "Kyoto",
        description: "A deal with no photo.", price: 120, currency: "USD", imageUrl: null,
        rating: null, reviewCount: null, provider: "g1", providerLabel: "G1", featured: false,
      }],
    }),
  }));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${BASE_URL}/deals`, { waitUntil: "domcontentloaded" });
  const title = page.locator('[data-testid="text-deal-title-g1-deal"]');
  await expect(title).toBeVisible({ timeout: 30_000 });
  const card = title.locator("xpath=ancestor::div[contains(@class,'shadcn-card')][1]");
  await mask(page);
  await card.screenshot({ path: path.join(OUT, "deal-card-no-photo-1280.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  await mask(page);
  await card.screenshot({ path: path.join(OUT, "deal-card-no-photo-390.png") });
  console.log(`[g1-deal] photo=0 tinted_band=1`);
});
