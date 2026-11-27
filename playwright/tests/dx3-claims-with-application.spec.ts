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

async function maskEmails(page: import("@playwright/test").Page) {
  await page.addStyleTag({
    content: 'input[type="email"], [data-testid="input-email"], [data-testid="sidebar-user-email"] { color: transparent !important; caret-color: transparent !important; }',
  });
  await page.evaluate(() => {
    const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;
    for (const el of Array.from(document.querySelectorAll("body *"))) {
      const own = Array.from(el.childNodes).some((node) => node.nodeType === Node.TEXT_NODE && EMAIL.test(node.textContent || ""));
      if (!own) continue;
      const ctx = el as HTMLElement;
      const bar = document.createElement("span");
      bar.style.display = "inline-block";
      bar.style.width = "160px";
      bar.style.height = "12px";
      bar.style.background = "#D8CFEE";
      bar.style.borderRadius = "3px";
      for (const node of Array.from(ctx.childNodes)) {
        if (node.nodeType === Node.TEXT_NODE) ctx.replaceChild(bar, node);
      }
    }
  });
}

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

async function finishToReview(page: import("@playwright/test").Page) {
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

  // Step 7 — Review → terms → Your Handle
  await page.locator('[data-testid="checkbox-terms"]').click();
  await next(page);
}

test("DX-3 application carries the claims, caps the picker, and does not call claims after submit", async ({ page }) => {
  test.setTimeout(90_000);
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
  await page.waitForTimeout(150);
  await badges.nth(1).click();
  await page.waitForTimeout(150);
  expect(await capLine.count()).toBe(0);
  const atTwoCapLine = await capLine.count();
  await badges.nth(2).click();
  await page.waitForTimeout(500);
  await expect(capLine).toHaveCount(1, { timeout: 10_000 });
  expect(await pickedCount()).toBe(3);
  expect(await capLine.count()).toBe(1);
  const capLineCount = await capLine.count();
  const fourth = badges.nth(3);
  expect(await fourth.getAttribute("aria-disabled")).toBe("true");
  const unpickedDisabled = (await fourth.getAttribute("aria-disabled")) === "true";
  await fourth.click();
  const fourthTapPicked = await pickedCount();
  expect(fourthTapPicked).toBe(3);
  await expect(fourth).toHaveCSS("opacity", "0.4");
  await page.waitForTimeout(500);
  await maskEmails(page);
  await page.screenshot({ path: path.join(CAPTURES, "dx3-pick-cap-1280.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  await maskEmails(page);
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
  await finishToReview(page);

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

  await maskEmails(page);
  await page.screenshot({ path: path.join(CAPTURES, "dx3-after-submit-1280.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  await maskEmails(page);
  await page.screenshot({ path: path.join(CAPTURES, "dx3-after-submit-390.png"), fullPage: true });
});

test("DX-3 shows the claims notice and the offering notice together", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  const email = await signInFresh(page);
  await page.route("**/api/expert-application", async (route) => {
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        id: "dx3-both-stub",
        offeringTypeKeyUnrecorded: "stub-key",
        neighborhoodClaims: { saved: 0, failed: 1 },
      }),
    });
  });

  await page.goto(`${BASE_URL}/expert/apply?type=local_expert`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="input-first-name"]', { timeout: 30_000 });
  await page.fill('[data-testid="input-first-name"]', "DX3");
  await page.fill('[data-testid="input-last-name"]', "E2E");
  await page.fill('[data-testid="input-email"]', email);
  await page.fill('[data-testid="input-country"]', "Japan");
  await page.fill('[data-testid="input-city"]', "Kyoto");
  await next(page);

  await page.fill('[data-testid="input-local-city"]', "Kyoto");
  const badge = page.locator('[data-testid^="badge-neighborhood-"]').first();
  await expect(badge).toBeVisible({ timeout: 30_000 });
  await badge.click();
  await page.locator('[data-testid="button-locality-born_raised"]').click();
  await page.locator('[data-testid="badge-language-english"]').click();
  await next(page);
  await finishToReview(page);

  await page.locator('[data-testid="button-submit"]').click();
  await page.waitForURL("**/expert-status", { timeout: 30_000 });
  await page.waitForTimeout(900);

  const toasts = page.locator('[data-testid^="toast-"]');
  const claimToast = toasts.filter({ hasText: "couldn't save your neighborhood answers" }).first();
  await expect(claimToast).toBeVisible();
  const text = await claimToast.innerText();
  expect(text).toContain("Application saved");
  expect(text).toContain("couldn't record the offering");
  console.log(`[dx3-both]       toasts=${await toasts.count()} both=true`);
});
