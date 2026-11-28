/**
 * F2: /events and the landing strip at 1280 and 390, including each event's add.
 * CI artifact only; no assertions beyond the surfaces rendering.
 */
import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:5000";
const OUT = path.resolve("playwright/f2-captures");
fs.mkdirSync(OUT, { recursive: true });

async function mask(page: Page) {
  await page.addStyleTag({ content: 'input[type="email"], [data-testid="sidebar-user-email"] { color: transparent !important; }' });
}

for (const width of [1280, 390] as const) {
  test(`F2 /events at ${width}`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.goto(`${BASE_URL}/events`, { waitUntil: "domcontentloaded" });
    await expect(page.locator('[data-testid="global-calendar"]')).toBeVisible({ timeout: 45_000 });
    await page.waitForTimeout(800);
    await mask(page);
    await page.screenshot({ path: path.join(OUT, `events-${width}.png`), fullPage: true });
    console.log(`[f2-events] width=${width} add_buttons=${await page.locator('[data-testid^="events-add-"]').count()}`);
  });

  test(`F2 landing strip at ${width}`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
    const strip = page.locator('[data-testid="section-city-events"]');
    await expect(strip).toBeVisible({ timeout: 45_000 });
    await strip.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await mask(page);
    await strip.screenshot({ path: path.join(OUT, `landing-strip-${width}.png`) });
    console.log(`[f2-strip] width=${width} add_buttons=${await strip.locator('[data-testid^="city-event-add-"]').count()}`);
  });
}
