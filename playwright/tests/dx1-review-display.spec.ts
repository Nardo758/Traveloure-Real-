/**
 * DX-1: the Review step wraps long answers and shows service names while still submitting ids.
 */
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:5000";
const CAPTURES = path.resolve("playwright/dx1-captures");
fs.mkdirSync(CAPTURES, { recursive: true });

const PASSWORD = "TestPass123!";
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

async function signInFresh(page: import("@playwright/test").Page) {
  const email = `dx1-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const reg = await page.request.post(`${BASE_URL}/api/auth/register`, {
    data: { email, password: PASSWORD, firstName: "DX1", lastName: "Review", consent: true },
  });
  expect([200, 201, 202]).toContain(reg.status());
  const login = await page.request.post(`${BASE_URL}/api/auth/login`, {
    data: { email, password: PASSWORD },
  });
  expect(login.status()).toBe(200);
  return email;
}

async function next(page: import("@playwright/test").Page) {
  const btn = page.locator('[data-testid="button-next-step"]');
  await expect(btn).toBeEnabled();
  await btn.click();
  await page.waitForTimeout(650);
}

async function overflow(locator: import("@playwright/test").Locator) {
  return locator.evaluate((el) => el.scrollWidth > el.clientWidth);
}

test("DX-1 review wraps and shows offering names; submit still sends ids", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const email = await signInFresh(page);

  let submittedBody: any = null;
  await page.route("**/api/expert-application", async (route) => {
    submittedBody = route.request().postDataJSON();
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ id: "dx1-stub", neighborhoodClaims: { saved: 0, failed: 0 } }),
    });
  });

  await page.goto(`${BASE_URL}/expert/apply?type=local_expert`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="input-first-name"]', { timeout: 30_000 });

  // Step 1 — Basic
  await page.fill('[data-testid="input-first-name"]', "DX1");
  await page.fill('[data-testid="input-last-name"]', "Review");
  await page.fill('[data-testid="input-email"]', email);
  await page.fill('[data-testid="input-country"]', "Japan");
  await page.fill('[data-testid="input-city"]', "Kyoto");
  await next(page);

  // Step 2 — Your Locality
  await page.fill('[data-testid="input-local-city"]', "Kyoto");
  const neighborhood = page.locator('[data-testid^="badge-neighborhood-"]').first();
  await expect(neighborhood).toBeVisible({ timeout: 30_000 });
  await neighborhood.click();
  await page.locator('[data-testid="button-locality-born_raised"]').click();
  await page.locator('[data-testid="badge-language-english"]').click();
  await next(page);

  // Step 3 — Knowledge Proof: the first answer is 320 characters with no spaces.
  await page.fill('[data-testid="textarea-knowledge-proof-0"]', "X".repeat(320));
  await page.fill('[data-testid="textarea-knowledge-proof-1"]', "Y".repeat(260));
  await page.fill('[data-testid="textarea-knowledge-proof-2"]', "Z".repeat(260));
  await next(page);

  // Step 4 — Specialties
  await page.locator('[data-testid^="button-local-specialty-"]').first().click();
  await next(page);

  // Step 5 — Services: one offering, record the name the picker shows.
  const serviceBadge = page.locator('[data-testid^="badge-service-"]').first();
  await expect(serviceBadge).toBeVisible({ timeout: 30_000 });
  const serviceTestId = (await serviceBadge.getAttribute("data-testid"))!;
  const serviceId = serviceTestId.replace("badge-service-", "");
  const serviceRaw = (await serviceBadge.innerText()).trim();
  const serviceName = serviceRaw.replace(/\s+-\s+\$[\d.,]+$/, "").trim();
  expect(serviceId).toMatch(UUID);
  expect(serviceName.length).toBeGreaterThan(0);
  await serviceBadge.click();
  await next(page);

  // Step 6 — Availability
  await page.locator('[data-testid="select-availability"]').click();
  await page.locator('[role="option"]').first().click();
  await page.waitForTimeout(250);
  await page.locator('[data-testid="select-response-time"]').click();
  await page.locator('[role="option"]').first().click();
  await page.waitForTimeout(250);
  await page.fill('[data-testid="input-hourly-rate"]', "120");
  await next(page);

  // Step 7 — Review
  const heading = page.getByText("Review Your Application", { exact: true });
  await expect(heading).toBeVisible({ timeout: 20_000 });
  const reviewCard = heading.locator("xpath=ancestor::div[contains(@class,'rounded-2xl')][1]");
  const answerPara = page.locator("p").filter({ hasText: "X".repeat(120) }).first();
  await expect(answerPara).toBeVisible();

  const servicesBlock = page.getByText("Services Offered:", { exact: true }).locator("..");
  const servicesText = await servicesBlock.innerText();
  expect(servicesText).toContain(serviceName);
  const hasUuid = UUID.test(servicesText);

  const card1280 = await overflow(reviewCard);
  const para1280 = await overflow(answerPara);
  const page1280 = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  await page.screenshot({ path: path.join(CAPTURES, "dx1-review-1280.png"), fullPage: true });
  console.log(`[dx1-review-1280]  card_overflow=${card1280} para_overflow=${para1280} page_hscroll=${page1280}`);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  const card390 = await overflow(reviewCard);
  const para390 = await overflow(answerPara);
  const page390 = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  await page.screenshot({ path: path.join(CAPTURES, "dx1-review-390.png"), fullPage: true });
  console.log(`[dx1-review-390]   card_overflow=${card390} para_overflow=${para390} page_hscroll=${page390}`);
  console.log(`[dx1-services]     shown="${serviceName}" has_uuid=${hasUuid}`);

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForTimeout(250);
  await page.locator('[data-testid="checkbox-terms"]').click();
  await next(page);

  // Step 8 — submit through a stub; nothing is created.
  const requestPromise = page.waitForRequest((request) =>
    request.url().includes("/api/expert-application") && request.method() === "POST",
  );
  await page.locator('[data-testid="button-submit"]').click();
  await requestPromise;
  await page.waitForTimeout(600);

  const ids = Array.isArray(submittedBody?.selectedServices) ? submittedBody.selectedServices : [];
  const selectedServicesIsIds = ids.length === 1 && ids[0] === serviceId;
  console.log(`[dx1-submit]       selectedServices_is_ids=${selectedServicesIsIds}`);

  expect(card1280).toBe(false);
  expect(para1280).toBe(false);
  expect(page1280).toBe(false);
  expect(card390).toBe(false);
  expect(para390).toBe(false);
  expect(page390).toBe(false);
  expect(hasUuid).toBe(false);
  expect(selectedServicesIsIds).toBe(true);
});
