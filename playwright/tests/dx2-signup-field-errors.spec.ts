/**
 * DX-2: the server's field messages show under the sign-up fields.
 *
 * Real endpoint: `not-an-email` returns 400 and creates nothing.
 * The other three cases stub the 400 so the placement rules are deterministic.
 */
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:5000";
const CAPTURES = path.resolve("playwright/dx2-captures");
fs.mkdirSync(CAPTURES, { recursive: true });

const FIELD_ERROR = '[data-testid^="error-signup-"]';
const BANNER_TEXT = "Validation failed";

async function openSignup(page: import("@playwright/test").Page) {
  await page.goto(`${BASE_URL}/signup`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector('[data-testid="signup-fields"]', { timeout: 30_000 });
}

async function fillForm(page: import("@playwright/test").Page, email: string) {
  await page.fill('[data-testid="input-first-name"]', "DX2");
  await page.fill('[data-testid="input-last-name"]', "Tester");
  await page.fill('[data-testid="input-email"]', email);
  await page.fill('[data-testid="input-password"]', "TestPass123!");
  await page.click('[data-testid="checkbox-signup-consent"]');
}

async function submit(page: import("@playwright/test").Page) {
  await page.click('[data-testid="button-create-account"]');
}

async function stubRegister(page: import("@playwright/test").Page, body: unknown) {
  await page.route("**/api/auth/register", (route) =>
    route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify(body),
    }),
  );
}

test("DX-2 sign-up field errors", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });

  // ── [dx2-email] the real endpoint ────────────────────────────────────────────
  let posted = 0;
  const countRegister = (request: import("@playwright/test").Request) => {
    if (request.url().includes("/api/auth/register")) posted += 1;
  };
  page.on("request", countRegister);

  await openSignup(page);
  await fillForm(page, "not-an-email");
  const realResponse = page.waitForResponse((response) => response.url().includes("/api/auth/register"), {
    timeout: 30_000,
  });
  await submit(page);
  const response = await realResponse;
  page.off("request", countRegister);

  await expect(page.locator('[data-testid="error-signup-email"]')).toHaveText("Invalid email address");
  const emailError = await page.locator('[data-testid="error-signup-email"]').innerText();
  const emailAriaInvalid = await page.locator("#signup-email").getAttribute("aria-invalid");
  const emailBanner = await page.getByText(BANNER_TEXT, { exact: true }).count();
  console.log(
    `[dx2-email]     posted=${posted} status=${response.status()} error_email="${emailError}" banner=${emailBanner} aria_invalid=${emailAriaInvalid === "true"}`,
  );

  // ── [dx2-two] stubbed 400 with two issues ───────────────────────────────────
  await page.unroute("**/api/auth/register").catch(() => {});
  await stubRegister(page, {
    message: BANNER_TEXT,
    errors: [
      { path: ["email"], message: "Invalid email address" },
      { path: ["firstName"], message: "First name is required" },
    ],
  });
  await openSignup(page);
  await fillForm(page, "dx2-two@example.com");
  await submit(page);
  await expect(page.locator('[data-testid="error-signup-email"]')).toHaveCount(1);
  await expect(page.locator('[data-testid="error-signup-firstName"]')).toHaveCount(1);
  const twoEmail = await page.locator('[data-testid="error-signup-email"]').count();
  const twoFirst = await page.locator('[data-testid="error-signup-firstName"]').count();
  const twoBanner = await page.getByText(BANNER_TEXT, { exact: true }).count();
  await page.screenshot({ path: path.join(CAPTURES, "dx2-signup-errors-1280.png"), fullPage: true });
  console.log(`[dx2-two]       error_email=${twoEmail} error_firstName=${twoFirst} banner=${twoBanner}`);

  // ── [dx2-unplaced] the only issue is not one of the five fields ─────────────
  await page.unroute("**/api/auth/register").catch(() => {});
  await stubRegister(page, {
    message: BANNER_TEXT,
    errors: [{ path: ["provider", "city"], message: "City is required" }],
  });
  await openSignup(page);
  await fillForm(page, "dx2-unplaced@example.com");
  await submit(page);
  await expect(page.getByText(BANNER_TEXT, { exact: true })).toHaveCount(1);
  const unplacedFields = await page.locator(FIELD_ERROR).count();
  const unplacedBanner = await page.getByText(BANNER_TEXT, { exact: true }).innerText();
  console.log(`[dx2-unplaced]  field_errors=${unplacedFields} banner="${unplacedBanner}"`);

  // ── [dx2-noerrors] 400 with no errors[] ─────────────────────────────────────
  await page.unroute("**/api/auth/register").catch(() => {});
  await stubRegister(page, { message: "Registration unavailable" });
  await openSignup(page);
  await fillForm(page, "dx2-noerrors@example.com");
  await submit(page);
  await expect(page.getByText("Registration unavailable", { exact: true })).toHaveCount(1);
  const noErrorsFields = await page.locator(FIELD_ERROR).count();
  const noErrorsBanner = await page.getByText("Registration unavailable", { exact: true }).innerText();
  console.log(`[dx2-noerrors]  field_errors=${noErrorsFields} banner="${noErrorsBanner}"`);

  // ── 390 capture of the two-issue form ───────────────────────────────────────
  await page.unroute("**/api/auth/register").catch(() => {});
  await stubRegister(page, {
    message: BANNER_TEXT,
    errors: [
      { path: ["email"], message: "Invalid email address" },
      { path: ["firstName"], message: "First name is required" },
    ],
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await openSignup(page);
  await fillForm(page, "dx2-two@example.com");
  await submit(page);
  await expect(page.locator('[data-testid="error-signup-email"]')).toHaveCount(1);
  await page.screenshot({ path: path.join(CAPTURES, "dx2-signup-errors-390.png"), fullPage: true });

  // ── [dx2-clear] typing in Email clears only that field's error ──────────────
  await page.fill('[data-testid="input-email"]', "dx2-clear@example.com");
  await expect(page.locator('[data-testid="error-signup-email"]')).toHaveCount(0);
  const clearedEmail = await page.locator('[data-testid="error-signup-email"]').count();
  console.log(`[dx2-clear]     after typing in Email: error_email=${clearedEmail}`);
});
