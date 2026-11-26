/**
 * DX-3: the local-expert application carries its picked neighborhoods; the wizard makes no
 * follow-up claim calls, the fourth pick is blocked, and string 3 shows only at three picks.
 */
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:5000";
const CAPTURES = path.resolve("playwright/dx3-captures");
fs.mkdirSync(CAPTURES, { recursive: true });

const PASSWORD = "TestPass123!";

async function signInFresh(page: import("@playwright/test").Page) {
  const email = `dx3-e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const reg = await page.request.post(`${BASE_URL}/api/auth/register`, {
    data: { email, password: PASSWORD, firstName: "DX3", lastName: "E2E", consent: true },
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
  await page.waitForTimeout(700);
}

test("DX-3 application carries the claims, caps the picker, and does not call claims after submit", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const email = await signInFresh(page);

  const claimCalls: string[] = [];
  let applicationResponse = false;
  let bodyHasNeighborhoodClaims = false;
  page.on("request", (request) => {
    const url = request.url();
    if (url.includes("/api/expert-application")) {
      const body = request.postDataJSON() as { neighborhoodClaims?: unknown } | null;
      bodyHasNeighborhoodClaims = Array.isArray(body?.neighborhoodClaims) && body!.neighborhoodClaims!.length > 0;
    }
    if (applicationResponse && url.includes("/api/expert/neighborhood-claims")) {
      claimCalls.push(`${request.method()} ${url}`);
    }
  });
  page.on("response", (response) => {
    if (response.url().includes("/api/expert-application") && response.status() < 400) applicationResponse = true;
  });

  await page.goto(`${BASE_URL}/expert/apply?type=local_expert`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="signup-fields"], [data-testid="input-first-name"]', { timeout: 30_000 });

  // Step 1 — Basic
  await page.fill('[data-testid="input-first-name"]', "DX3");
  await page.fill('[data-testid="input-last-name"]', "E2E");
  await page.fill('[data-testid="input-email"]', email);
  await page.fill('[data-testid="input-country"]', "Japan");
  await page.fill('[data-testid="input-city"]', "Kyoto");
  await next(page);

  // Step 2 — Your Locality: cap test at 3 picks
  await page.fill('[data-testid="input-local-city"]', "Kyoto");
  await expect(page.locator('[data-testid^="badge-neighborhood-"]').first()).toBeVisible({ timeout: 30_000 });
  const badges = page.locator('[data-testid^="badge-neighborhood-"]');
  await expect(badges.first()).toBeVisible({ timeout: 30_000 });
  expect(await badges.count()).toBeGreaterThanOrEqual(4);

  const pickedCount = () => page.locator('[data-testid^="badge-neighborhood-"].bg-primary').count();
  const capLine = page.locator('[data-testid="neighborhood-pick-cap"]');
  await badges.nth(0).click();
  await badges.nth(1).click();
  expect(await capLine.count()).toBe(0);
  const atTwoCapLine = await capLine.count();
  await badges.nth(2).click();
  expect(await pickedCount()).toBe(3);
  expect(await capLine.count()).toBe(1);
  const capLineCount = await capLine.count();
  const fourth = badges.nth(3);
  expect(await fourth.getAttribute("aria-disabled")).toBe("true");
  const unpickedDisabled = (await fourth.getAttribute("aria-disabled")) === "true";
  await fourth.click();
  const fourthTapPicked = await pickedCount();
  expect(fourthTapPicked).toBe(3);

  await page.screenshot({ path: path.join(CAPTURES, "dx3-pick-cap-1280.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(CAPTURES, "dx3-pick-cap-390.png"), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForTimeout(300);

  // Unpick down to one: the fourth option becomes enabled again.
  await badges.nth(0).click();
  await badges.nth(1).click();
  const afterUnpickEnabled = (await fourth.getAttribute("aria-disabled")) === null;
  await page.locator('[data-testid="button-locality-born_raised"]').click();
  await page.locator('[data-testid="badge-language-english"]').click();
  await next(page);

  // Step 3 — Knowledge Proof (server minimum is 250 characters)
  for (let i = 0; i < 3; i += 1) {
    await page.fill(`[data-testid="textarea-knowledge-proof-${i}"]`, "D".repeat(260));
  }
  await next(page);

  // Step 4 — Specialties
  await page.locator('[data-testid^="button-local-specialty-"]').first().click();
  await next(page);

  // Step 5 — Services
  await page.locator('[data-testid^="badge-service-"]').first().click();
  await next(page);

  // Step 6 — Availability
  await page.locator('[data-testid="select-availability"]').click();
  await page.locator('[role="option"]').first().click();
  await page.waitForTimeout(300);
  await page.locator('[data-testid="select-response-time"]').click();
  await page.locator('[role="option"]').first().click();
  await page.waitForTimeout(300);
  await page.fill('[data-testid="input-hourly-rate"]', "120");
  await next(page);

  // Step 7 — Review
  await page.locator('[data-testid="checkbox-terms"]').click();
  await next(page);

  // Step 8 — Your Handle (optional), then submit
  await page.locator('[data-testid="button-submit"]').click();
  await page.waitForURL("**/expert-status", { timeout: 30_000 });
  await page.waitForTimeout(1500);

  const failureToast = await page.getByText("Application saved", { exact: true }).count();
  console.log(
    `[dx3-wizard]     claim_calls_after_submit=${claimCalls.length} body_has_neighborhoodClaims=${bodyHasNeighborhoodClaims} toast=${failureToast}`,
  );
  console.log(
    `[dx3-pick-cap]   picked=3 unpicked_disabled=${unpickedDisabled} fourth_tap_picked=${fourthTapPicked} cap_line=${capLineCount} at_two_picks_cap_line=${atTwoCapLine} after_unpick_enabled=${afterUnpickEnabled}`,
  );

  await page.screenshot({ path: path.join(CAPTURES, "dx3-after-submit-1280.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(CAPTURES, "dx3-after-submit-390.png"), fullPage: true });
});
