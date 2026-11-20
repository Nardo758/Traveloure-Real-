/**
 * f1-ask-chooser.spec.ts - F1 in a real browser (Leon, Nov 19, 2026: "GO").
 *
 * The unit tests prove which buttons a card draws. Nothing pressed "Ask an expert" in a browser, and nothing
 * produced a picture of the row. This spec does both on /services:
 *
 *   C1 a listing's row draws Add, "Ask an expert" and Details, and Details is the listing's own page
 *   C2 pressing "Ask an expert" opens the chooser with the three approved options, in order - and no sign-in
 *      wall before the choice
 *   C3 a city with only a local expert offers only "Ask a local"
 *
 * It also writes four screenshots to `playwright/f1-captures/` (the row and the open chooser, at 1280 and
 * 390 wide), uploaded by the workflow as `f1-captures-<sha>`.
 *
 * Fully route-stubbed for the page's own data (the listing, the mode, who can be asked), so it needs no seed
 * and writes nothing. The stubs carry no real person: ids are fixture strings.
 */
import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const OUT_DIR = path.join(process.cwd(), "playwright", "f1-captures");
const DESKTOP = { width: 1280, height: 900 };
const PHONE = { width: 390, height: 844 };

const LISTING = {
  id: "svc-f1",
  userId: "fixture-provider",
  serviceName: "Tea ceremony in Gion",
  shortDescription: "A quiet hour with a tea master.",
  description: "A quiet hour with a tea master.",
  categoryId: "fixture-category",
  price: "40",
  location: "Kyoto",
  averageRating: "0",
  reviewCount: 0,
  status: "active",
  deliveryMethod: "in_person",
  deliveryTimeframe: "",
  providerBusinessName: "Fixture Tea House",
  buyAction: { primary: { kind: "request_to_book", label: "Request to book" }, landing: { store: "request" } },
};
const ALL_KINDS = [
  { id: "fx-local", role: "local_expert" },
  { id: "fx-planner", role: "travel_expert" },
  { id: "fx-events", role: "event_planner" },
];
const json = (body: unknown) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

async function openServices(page: Page, experts: unknown[]) {
  await page.route("**/api/public/signup-mode", (route) => route.fulfill(json({ mode: "waitlist" })));
  await page.route(/\/api\/discover\?/, (route) => route.fulfill(json({ services: [LISTING], total: 1 })));
  await page.route("**/api/expert-availability**", (route) => route.fulfill(json({ available: true })));
  await page.route("**/api/experts?location=**", (route) => route.fulfill(json(experts)));
  await page.goto("/services", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("button-service-ask-svc-f1")).toBeVisible({ timeout: 30_000 });
}

test.beforeAll(() => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
});

test("C1 the listing's row: Add, Ask an expert, Details", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await openServices(page, ALL_KINDS);
  await expect(page.getByTestId("button-add-to-cart-svc-f1")).toBeVisible();
  await expect(page.getByTestId("button-service-ask-svc-f1")).toHaveText("Ask an expert");
  const details = page.getByTestId("button-service-details-svc-f1");
  await expect(details).toHaveText("Details");
  await expect(details).toHaveAttribute("href", "/services/svc-f1");
  await expect(page.getByTestId("button-service-action-svc-f1"), "waitlist mode: no booking button").toHaveCount(0);

  await page.getByTestId("button-service-ask-svc-f1").scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(OUT_DIR, "services-row-1280.png") });
  await page.setViewportSize(PHONE);
  await page.getByTestId("button-service-ask-svc-f1").scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(OUT_DIR, "services-row-390.png") });
  // Nothing in the row is pushed off the card at phone width.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "no horizontal scroll at 390").toBeLessThanOrEqual(0);
});

test("C2 Ask an expert opens the chooser with the three approved options", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await openServices(page, ALL_KINDS);
  await page.getByTestId("button-service-ask-svc-f1").click();
  const chooser = page.getByTestId("ask-expert-chooser");
  await expect(chooser).toBeVisible({ timeout: 15_000 });
  await expect(chooser.getByRole("heading", { name: "Ask an expert" })).toBeVisible();
  const options = chooser.locator('[data-testid^="ask-expert-choice-"]');
  await expect(options).toHaveText(["Ask a local", "Ask a trip planner", "Ask an event planner"]);
  await expect(page.getByTestId("button-service-ask-svc-f1"), "the card behind is unchanged").toHaveCount(1);
  expect(new URL(page.url()).pathname, "no navigation and no sign-in wall before a choice").toBe("/services");
  await page.screenshot({ path: path.join(OUT_DIR, "ask-chooser-1280.png") });

  await page.setViewportSize(PHONE);
  await expect(chooser).toBeVisible();
  await page.screenshot({ path: path.join(OUT_DIR, "ask-chooser-390.png") });
});

test("C3 a kind the city does not have is not offered", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await openServices(page, [ALL_KINDS[0]]);
  await page.getByTestId("button-service-ask-svc-f1").click();
  const options = page.getByTestId("ask-expert-chooser").locator('[data-testid^="ask-expert-choice-"]');
  await expect(options).toHaveText(["Ask a local"]);
});
