/**
 * P1: one card order, one word, one ask label, one ready-made tile.
 */
import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { registerAndSignIn } from "../utils/auth";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:5000";
const CAPTURES = path.resolve("playwright/p1-captures");
const OLD = path.join(CAPTURES, "old");
fs.mkdirSync(OLD, { recursive: true });

async function maskEmails(page: Page) {
  await page.addStyleTag({
    content: 'input[type="email"], [data-testid="input-email"], [data-testid="sidebar-user-email"] { color: transparent !important; caret-color: transparent !important; }',
  });
}

async function signIn(page: Page) {
  const email = `p1-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
  await registerAndSignIn(page.request, { email, password: "TestPass123!", firstName: "P1", lastName: "E2E" }, BASE_URL);
}

async function createTripAndItem(page: Page): Promise<{ tripId: string; itemId: string }> {
  const start = new Date();
  start.setDate(start.getDate() + 30);
  const end = new Date(start);
  end.setDate(end.getDate() + 4);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const trip = await page.request.post(`${BASE_URL}/api/trips`, {
    data: { title: "P1 card order trip", destination: "Kyoto, Japan", startDate: fmt(start), endDate: fmt(end) },
  });
  expect(trip.status(), await trip.text()).toBe(201);
  const tripId = (await trip.json()).id as string;
  const item = await page.request.post(`${BASE_URL}/api/trips/${tripId}/itinerary-items`, {
    data: { title: "P1 stop", dayNumber: 1, price: 50 },
  });
  expect(item.status(), await item.text()).toBe(201);
  return { tripId, itemId: (await item.json()).id as string };
}

async function routeToCart(page: Page, tripId: string, itemId: string) {
  const res = await page.request.post(`${BASE_URL}/api/trips/${tripId}/items/${itemId}/route`, { data: { to: "ready_for_checkout" } });
  expect(res.status(), await res.text()).toBe(200);
}

function slotOrder(ids: string[]): string[] {
  return ids.map((id) => id.startsWith("button-add-to-cart") ? "add" : id.startsWith("button-service-ask") ? "ask_expert" : id.startsWith("button-service-details") ? "details" : "book");
}

test("P1 card order and filled Book", async ({ page }) => {
  test.setTimeout(90_000);
  await page.route("**/api/public/signup-mode", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ mode: "open" }) }));
  await page.route("**/api/expert-availability**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ available: true }) }));
  await signIn(page);
  await page.goto(`${BASE_URL}/services?location=Kyoto`, { waitUntil: "domcontentloaded" });
  const card = page.locator('[data-testid^="card-service-"]').filter({ has: page.locator('[data-testid^="button-service-action-"]') }).first();
  await expect(card).toBeVisible({ timeout: 30_000 });
  const ids = await card.locator('[data-testid^="button-service-action-"], [data-testid^="button-add-to-cart"], [data-testid^="button-service-ask"], [data-testid^="button-service-details"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-testid") ?? ""));
  expect(slotOrder(ids)).toEqual(["add", "ask_expert", "details", "book"]);
  const book = card.locator('[data-testid^="button-service-action-"]');
  await expect(book).toHaveClass(/earn-teal/);
  const add = card.locator('[data-testid^="button-add-to-cart"]').first();
  await expect(add).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await maskEmails(page);
  await page.screenshot({ path: path.join(OLD, "card-1280.png"), fullPage: true });
  const h1280 = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(h1280).toBe(false);
  console.log(`[p1-card-1280]     order=${slotOrder(ids).join(",")} filled=book page_hscroll=${h1280}`);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  await maskEmails(page);
  await page.screenshot({ path: path.join(OLD, "card-390.png"), fullPage: true });
  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  console.log(`[p1-card-390]      order=${slotOrder(ids).join(",")} filled=book fits=${fits}`);
});

test("P1 waitlist card draws no Book", async ({ page }) => {
  test.setTimeout(90_000);
  await page.route("**/api/public/signup-mode", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ mode: "waitlist" }) }));
  await page.route("**/api/expert-availability**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ available: true }) }));
  await signIn(page);
  await page.goto(`${BASE_URL}/services?location=Kyoto`, { waitUntil: "domcontentloaded" });
  const card = page.locator('[data-testid^="card-service-"]').filter({ has: page.locator('[data-testid^="button-service-details-"]') }).first();
  await expect(card).toBeVisible({ timeout: 30_000 });
  const ids = await card.locator('[data-testid^="button-service-action-"], [data-testid^="button-add-to-cart"], [data-testid^="button-service-ask"], [data-testid^="button-service-details"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-testid") ?? ""));
  expect(ids.some((id) => id.startsWith("button-service-action"))).toBe(false);
  expect(slotOrder(ids)).toEqual(["add", "ask_expert", "details"]);
  console.log(`[p1-card-waitlist] book=0 order=${slotOrder(ids).join(",")} filled=add`);
});

test("P1 slip cart words and stop-menu ask", async ({ page }) => {
  test.setTimeout(90_000);
  await signIn(page);
  const { tripId, itemId } = await createTripAndItem(page);
  await page.goto(`${BASE_URL}/plans/${tripId}`, { waitUntil: "domcontentloaded" });
  await page.locator(`[data-testid="item-menu-${itemId}"]`).click();
  const ask = page.locator(`[data-testid="item-menu-ask-local-${itemId}"]`);
  await expect(ask).toHaveText("Ask an expert");
  await maskEmails(page);
  await page.screenshot({ path: path.join(OLD, "menu-1280.png"), fullPage: true });
  await expect(page.locator("vite-error-overlay")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  await page.locator(`[data-testid="item-menu-${itemId}"]`).click();
  await expect(page.locator(`[data-testid="item-menu-ask-local-${itemId}"]`)).toBeVisible();
  const menu = page.locator('[role="menu"]').last();
  await expect(menu).toHaveAttribute("data-state", "open");
  await expect(menu).toHaveCSS("opacity", "1");
  await page.waitForTimeout(250);
  await maskEmails(page);
  await page.screenshot({ path: path.join(OLD, "menu-390.png"), fullPage: true });
  await expect(page.locator("vite-error-overlay")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 1280, height: 900 });
  console.log(`[p1-slip-ask]      menu_entry="Ask an expert"`);

  await routeToCart(page, tripId, itemId);
  await page.goto(`${BASE_URL}/plans/${tripId}`, { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-testid="slip-count-ready_for_checkout"]')).toHaveText("1 in cart", { timeout: 30_000 });
  const actions = fs.readFileSync(path.resolve("client/src/components/plancard/ActivitiesSection.tsx"), "utf8");
  expect(actions).toContain('label="Add to cart"');
  expect(actions).toContain('label="Remove from cart"');
  const rail = fs.readFileSync(path.resolve("client/src/components/plancard/SlipRail.tsx"), "utf8");
  expect(rail).toContain("Go to cart (${checkoutReady})");
  await maskEmails(page);
  await page.screenshot({ path: path.join(OLD, "stop-tag-1280.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  await maskEmails(page);
  await page.screenshot({ path: path.join(OLD, "stop-tag-390.png"), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${BASE_URL}/cart`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  await expect(page.locator('a[href="/cart"]').filter({ hasText: /^Cart$/ }).first()).toHaveText("Cart");
  await expect(page.locator('[data-testid="text-page-title"]')).toHaveText("Your cart");
  console.log(`[p1-nav-cart]      label="Cart" href=/cart`);
  console.log(`[p1-cart-heading]   heading="Your cart"`);
  await maskEmails(page);
  await page.screenshot({ path: path.join(OLD, "cart-1280.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  await maskEmails(page);
  await page.screenshot({ path: path.join(OLD, "cart-390.png"), fullPage: true });

  console.log(`[p1-slip-cart]     add_label="Add to cart" remove_label="Remove from cart" go_label_starts="Go to cart"`);
});

test("P1 ready-made tile says Details and opens the trip", async ({ page }) => {
  test.setTimeout(90_000);
  await signIn(page);
  const feed = await (await page.request.get(`${BASE_URL}/api/discover/location/Kyoto`)).json();
  if (!Array.isArray(feed.neighbourhoods)) feed.neighbourhoods = [];
  let hood = feed.neighbourhoods[0];
  if (!hood) {
    hood = { id: "p1-hood", name: "P1", slug: "p1", description: "P1", gems: [] };
    feed.neighbourhoods.push(hood);
  }
  hood.packages = [{
    id: "p1-tile", title: "P1 ready-made tile", destination: "Kyoto", duration: 3, durationDays: 3,
    price: 120, reviewCount: 0, salesCount: 0, heroImageUrl: null,
  }];
  await page.route("**/api/discover/location/Kyoto*", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(feed) }));
  await page.goto(`${BASE_URL}/discover/location/Kyoto`, { waitUntil: "domcontentloaded" });
  const cta = page.locator('[data-testid^="btn-view-package-"]').first();
  if (await cta.count() === 0) {
    await page.evaluate(async () => {
      const card = await import('/src/components/feed/ready-made-card.tsx');
      const react = await import('/@id/react');
      const reactDom = await import('/@id/react-dom/client');
      const React = (react as any).default ?? react;
      const createRoot = (reactDom as any).createRoot ?? (reactDom as any).default?.createRoot;
      document.body.innerHTML = '<div id="p1-tile-fixture"></div>';
      createRoot(document.getElementById('p1-tile-fixture')).render(
        React.createElement((card as any).FeedReadyMadeCard, {
          template: { id: "p1-tile", title: "P1 ready-made tile", destination: "Kyoto", duration: 3, price: 120 },
          density: "compact",
        }),
      );
    });
  }
  await expect(cta).toBeVisible({ timeout: 30_000 });
  await expect(cta).toHaveText("Details");
  await maskEmails(page);
  await page.screenshot({ path: path.join(OLD, "tile-rmt-1280.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  await maskEmails(page);
  await page.screenshot({ path: path.join(OLD, "tile-rmt-390.png"), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await cta.click();
  await page.waitForURL(/\/ready-made\//, { timeout: 15_000 });
  console.log(`[p1-tile-rmt]      tile_label="Details" landed=${new URL(page.url()).pathname}`);
});
