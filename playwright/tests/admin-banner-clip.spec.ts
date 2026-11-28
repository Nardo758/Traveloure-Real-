/**
 * The admin email-verification banner must start 24px past the sidebar's actual width
 * (expanded or collapsed), and fit at 390.
 */
import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:5000";
const ROOT = path.resolve("playwright/admin-banner-captures");
const DIR = process.env.CAPTURE_DIR === "before" ? "before" : "after";

async function blankEmails(page: Page) {
  await page.evaluate(() => {
    const email = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    while (walker.nextNode()) nodes.push(walker.currentNode as Text);
    for (const node of nodes) {
      if (email.test(node.nodeValue ?? "")) node.nodeValue = (node.nodeValue ?? "").replace(email, "");
    }
  });
}

test("admin verify banner is not clipped by the sidebar", async ({ page }) => {
  test.setTimeout(90_000);
  fs.mkdirSync(path.join(ROOT, "before"), { recursive: true });
  fs.mkdirSync(path.join(ROOT, "after"), { recursive: true });
  await page.route("**/api/auth/user", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      id: "banner-admin", email: "banner-admin@example.com", firstName: "Banner", lastName: "Admin",
      role: "admin", emailVerified: null,
      termsAcceptedAt: new Date().toISOString(), privacyAcceptedAt: new Date().toISOString(),
    }),
  }));
  await page.route("**/api/admin/notifications", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.route(/\/api\/admin\/waitlist(\?.*)?$/, (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ travelers: { total: 0, consented: 0, byTripType: [], bySource: [] }, providers: { total: 0, consented: 0, byServiceType: [] }, qaExcluded: 0, byMarket: [], referrers: [] }),
  }));
  await page.route("**/api/admin/waitlist/entries**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ rows: [] }) }));

  const shot = async (dir: "before" | "after", width: number) => {
    await page.setViewportSize({ width, height: 500 });
    await page.goto(`${BASE_URL}/admin/waitlist`, { waitUntil: "domcontentloaded" });
    const banner = page.locator('[data-testid="banner-verify-email"]');
    await expect(banner).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(500);
    await blankEmails(page);
    await page.screenshot({ path: path.join(ROOT, dir, `admin-banner-${width}.png`) });
    const text = await banner.locator("span").first().boundingBox();
    const button = await page.locator('[data-testid="button-verify-email-resend"]').boundingBox();
    expect(text).not.toBeNull();
    expect(button).not.toBeNull();
    if (process.env.CAPTURE_DIR !== "before") {
      if (width >= 1024) expect(text!.x).toBeGreaterThanOrEqual(244);
      expect(text!.x + text!.width).toBeLessThanOrEqual(width);
      expect(button!.x + button!.width).toBeLessThanOrEqual(width);
    }
    return { x: Math.round(text!.x), buttonRight: Math.round(button!.x + button!.width) };
  };

  const d1280 = await shot(DIR, 1280);
  const d390 = await shot(DIR, 390);
  let collapsed = "";
  if (DIR === "after") {
    await page.setViewportSize({ width: 1280, height: 500 });
    await page.goto(`${BASE_URL}/admin/waitlist`, { waitUntil: "domcontentloaded" });
    await expect(page.locator('[data-testid="banner-verify-email"]')).toBeVisible({ timeout: 30_000 });
    await page.locator('[data-testid="button-admin-sidebar-toggle"]').click();
    await page.waitForTimeout(500);
    await blankEmails(page);
    await page.screenshot({ path: path.join(ROOT, "after", "admin-banner-1280-collapsed.png") });
    const text = await page.locator('[data-testid="banner-verify-email"] span').first().boundingBox();
    const button = await page.locator('[data-testid="button-verify-email-resend"]').boundingBox();
    expect(text).not.toBeNull();
    expect(button).not.toBeNull();
    expect(text!.x).toBeGreaterThanOrEqual(80);
    expect(text!.x + text!.width).toBeLessThanOrEqual(1280);
    expect(button!.x + button!.width).toBeLessThanOrEqual(1280);
    collapsed = ` collapsed_text_x=${Math.round(text!.x)}`;
  }
  console.log(`[admin-banner] 1280 text_x=${d1280.x} button_right=${d1280.buttonRight} 390 text_x=${d390.x} button_right=${d390.buttonRight}${collapsed}`);
});
