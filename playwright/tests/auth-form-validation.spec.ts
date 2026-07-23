/**
 * auth-form-validation.spec.ts
 *
 * Regression guard for the schema-layer validation fixes surfaced by the
 * 50-case form reliability audit (2026-07-23).
 *
 * THREE BUGS CAUGHT & FIXED:
 *
 *   I5  — spaces-only password ("   ") was forwarded to the DB (401) instead
 *          of being rejected at the schema layer (400).
 *          Fix: loginSchema.password → z.string().trim().min(1)
 *
 *   B9  — trailing whitespace appended to email ("user@email.com   ") produced
 *          an invalid email string that reached the lookup, returning 401.
 *          Zod .email() now correctly returns 400.
 *
 *   B10 — leading whitespace in email ("   user@email.com") had the same failure
 *          mode as B9.
 *
 * Two test layers:
 *
 *   API layer  — page.request.post() with malformed payloads.
 *                Checks HTTP status + Zod error shape. Fast; no browser.
 *                These are the canonical regression guards (run on every PR).
 *
 *   UI layer   — full browser interaction against the SignInModal and /signup
 *                page. Verifies that errors surface visibly to the user and
 *                that no successful navigation occurs on bad input.
 *
 * No storageState / globalSetup required. All tests run as unauthenticated
 * guest. Safe to run in parallel with other suites.
 */

import { test, expect } from "@playwright/test";
import crypto from "crypto";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:5000";

function uid(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 10);
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** POST JSON to an auth endpoint and return {status, body}. */
async function authPost(
  request: import("@playwright/test").APIRequestContext,
  path: "/api/auth/login" | "/api/auth/register" | "/api/auth/forgot-password",
  payload: Record<string, string>,
) {
  const res = await request.post(`${BASE_URL}${path}`, {
    data: payload,
    headers: { "Content-Type": "application/json" },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status(), body };
}

/** Open the SignInModal by clicking the desktop "Sign In" nav button. */
async function openSignInModal(page: import("@playwright/test").Page) {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForTimeout(1_000);

  const btn = page.locator('[data-testid="button-sign-in"]');
  await btn.waitFor({ state: "visible", timeout: 10_000 });
  await btn.click();

  const modal = page.locator('[data-testid="modal-sign-in"]');
  await modal.waitFor({ state: "visible", timeout: 8_000 });
  return modal;
}

// ─────────────────────────────────────────────────────────────────────────────
// API-layer tests  (no browser, page.request only)
// These are the canonical regression guards — they test the server schema
// directly and are immune to UI layout changes.
// ─────────────────────────────────────────────────────────────────────────────

test.describe("I5 — spaces-only password: schema rejection (API)", () => {
  test("POST /api/auth/login with password='   ' returns 400, not 401", async ({
    request,
  }) => {
    const { status, body } = await authPost(request, "/api/auth/login", {
      email: "test@example.com",
      password: "   ",
    });

    expect(
      status,
      `Expected 400 (schema rejection) but got ${status}. ` +
        `A 401 means the trimmed-empty string reached the DB — the .trim() fix is not active.\n` +
        `Body: ${JSON.stringify(body)}`,
    ).toBe(400);

    // Zod must name the failing field
    const errors: Array<{ path: string[] }> = body.errors ?? [];
    const passwordErr = errors.find((e) => e.path?.includes("password"));
    expect(
      passwordErr,
      `Expected a Zod validation error on field "password". Got: ${JSON.stringify(errors)}`,
    ).toBeTruthy();

    console.log("[I5-API] PASS — spaces-only password → HTTP 400 at schema layer");
  });

  test("POST /api/auth/login with password='\\t\\t\\t' (tabs only) returns 400", async ({
    request,
  }) => {
    const { status } = await authPost(request, "/api/auth/login", {
      email: "test@example.com",
      password: "\t\t\t",
    });
    expect(status).toBe(400);
    console.log("[I5-API] PASS — tabs-only password → HTTP 400");
  });

  test("POST /api/auth/login with password='\\n\\r\\n' (newlines only) returns 400", async ({
    request,
  }) => {
    const { status } = await authPost(request, "/api/auth/login", {
      email: "test@example.com",
      password: "\n\r\n",
    });
    expect(status).toBe(400);
    console.log("[I5-API] PASS — newlines-only password → HTTP 400");
  });
});

test.describe("B9 — trailing whitespace in email: schema rejection (API)", () => {
  test("POST /api/auth/login with trailing-space email returns 400", async ({
    request,
  }) => {
    const { status, body } = await authPost(request, "/api/auth/login", {
      email: "valid@example.com   ",
      password: "ValidPass1!",
    });

    expect(
      status,
      `Expected 400 for trailing-space email. Got ${status}.\nBody: ${JSON.stringify(body)}`,
    ).toBe(400);

    console.log("[B9-API] PASS — trailing whitespace email → HTTP 400");
  });

  test("POST /api/auth/register with trailing-space email returns 400", async ({
    request,
  }) => {
    const { status } = await authPost(request, "/api/auth/register", {
      email: `b9reg.${uid()}@example.com   `,
      password: "ValidPass1!",
      firstName: "B9",
      lastName: "Test",
    });

    expect(status).toBe(400);
    console.log("[B9-API] PASS — register: trailing whitespace email → HTTP 400");
  });

  test("POST /api/auth/forgot-password with trailing-space email returns 200 (anti-enum)", async ({
    request,
  }) => {
    // forgot-password always returns 200 regardless of email validity —
    // this prevents account enumeration. Confirm it doesn't crash (500).
    const { status } = await authPost(request, "/api/auth/forgot-password", {
      email: "b9forgot@example.com   ",
    });
    expect(status).toBe(200);
    console.log("[B9-API] PASS — forgot-password: trailing whitespace email → 200 (anti-enum)");
  });
});

test.describe("B10 — leading whitespace in email: schema rejection (API)", () => {
  test("POST /api/auth/login with leading-space email returns 400", async ({
    request,
  }) => {
    const { status, body } = await authPost(request, "/api/auth/login", {
      email: "   valid@example.com",
      password: "ValidPass1!",
    });

    expect(
      status,
      `Expected 400 for leading-space email. Got ${status}.\nBody: ${JSON.stringify(body)}`,
    ).toBe(400);

    console.log("[B10-API] PASS — leading whitespace email → HTTP 400");
  });

  test("POST /api/auth/register with leading-space email returns 400", async ({
    request,
  }) => {
    const { status } = await authPost(request, "/api/auth/register", {
      email: `   b10reg.${uid()}@example.com`,
      password: "ValidPass1!",
      firstName: "B10",
      lastName: "Test",
    });

    expect(status).toBe(400);
    console.log("[B10-API] PASS — register: leading whitespace email → HTTP 400");
  });

  test("POST /api/auth/forgot-password with leading-space email returns 200 (anti-enum)", async ({
    request,
  }) => {
    const { status } = await authPost(request, "/api/auth/forgot-password", {
      email: "   b10forgot@example.com",
    });
    expect(status).toBe(200);
    console.log("[B10-API] PASS — forgot-password: leading whitespace email → 200 (anti-enum)");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Additional schema regression guards (bonus cases from the audit)
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Schema regression — additional invalid inputs (API)", () => {
  test("POST /api/auth/login with blank email and blank password returns 400", async ({
    request,
  }) => {
    const { status } = await authPost(request, "/api/auth/login", {
      email: "",
      password: "",
    });
    expect(status).toBe(400);
  });

  test("POST /api/auth/login with missing @ in email returns 400", async ({
    request,
  }) => {
    const { status } = await authPost(request, "/api/auth/login", {
      email: "notanemail",
      password: "ValidPass1!",
    });
    expect(status).toBe(400);
  });

  test("POST /api/auth/register with 7-char password (below min-8) returns 400", async ({
    request,
  }) => {
    const { status, body } = await authPost(request, "/api/auth/register", {
      email: `short.${uid()}@example.com`,
      password: "Short1!",
      firstName: "Short",
      lastName: "Pass",
    });
    expect(status).toBe(400);
    const errors: Array<{ path: string[] }> = body.errors ?? [];
    const passwordErr = errors.find((e) => e.path?.includes("password"));
    expect(passwordErr).toBeTruthy();
  });

  test("POST /api/auth/register with blank firstName returns 400", async ({
    request,
  }) => {
    const { status } = await authPost(request, "/api/auth/register", {
      email: `nofirst.${uid()}@example.com`,
      password: "ValidPass1!",
      firstName: "",
      lastName: "Test",
    });
    expect(status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// UI-layer tests — SignInModal (browser)
// ─────────────────────────────────────────────────────────────────────────────

test.describe("I5 — spaces-only password: UI error feedback (SignInModal)", () => {
  test("submitting spaces-only password stays on page and shows error", async ({
    page,
  }) => {
    await openSignInModal(page);

    await page.locator('[data-testid="input-email"]').fill("test@example.com");
    await page.locator('[data-testid="input-password"]').fill("   ");
    await page.locator('[data-testid="button-auth-submit"]').click();

    // The modal must stay visible — a successful login closes it
    await expect(
      page.locator('[data-testid="modal-sign-in"]'),
      "Modal should remain open after rejected login",
    ).toBeVisible({ timeout: 5_000 });

    // An error toast or inline message must appear
    const errorSignals = page.locator(
      '[data-testid="toast-error"], ' +
        '[role="alert"], ' +
        '.text-destructive, ' +
        '[class*="destructive"]',
    );
    await expect(
      errorSignals.first(),
      "Expected a visible error signal after submitting spaces-only password",
    ).toBeVisible({ timeout: 6_000 });

    console.log("[I5-UI] PASS — spaces-only password: modal stays open + error shown");
  });
});

test.describe("B9/B10 — whitespace-wrapped email: UI error feedback (SignInModal)", () => {
  test("B9: trailing whitespace in email stays on page and shows error", async ({
    page,
  }) => {
    await openSignInModal(page);

    // type() is used to insert literal spaces that .fill() trims in some browsers
    const emailInput = page.locator('[data-testid="input-email"]');
    await emailInput.fill("test@example.com   ");
    await page.locator('[data-testid="input-password"]').fill("ValidPass1!");
    await page.locator('[data-testid="button-auth-submit"]').click();

    await expect(
      page.locator('[data-testid="modal-sign-in"]'),
      "Modal should remain open after rejected login (B9 trailing space)",
    ).toBeVisible({ timeout: 5_000 });

    const errorSignals = page.locator(
      '[data-testid="toast-error"], ' +
        '[role="alert"], ' +
        '.text-destructive, ' +
        '[class*="destructive"]',
    );
    await expect(
      errorSignals.first(),
      "Expected a visible error after submitting trailing-space email",
    ).toBeVisible({ timeout: 6_000 });

    console.log("[B9-UI] PASS — trailing whitespace email: modal stays open + error shown");
  });

  test("B10: leading whitespace in email stays on page and shows error", async ({
    page,
  }) => {
    await openSignInModal(page);

    const emailInput = page.locator('[data-testid="input-email"]');
    await emailInput.fill("   test@example.com");
    await page.locator('[data-testid="input-password"]').fill("ValidPass1!");
    await page.locator('[data-testid="button-auth-submit"]').click();

    await expect(
      page.locator('[data-testid="modal-sign-in"]'),
      "Modal should remain open after rejected login (B10 leading space)",
    ).toBeVisible({ timeout: 5_000 });

    const errorSignals = page.locator(
      '[data-testid="toast-error"], ' +
        '[role="alert"], ' +
        '.text-destructive, ' +
        '[class*="destructive"]',
    );
    await expect(
      errorSignals.first(),
      "Expected a visible error after submitting leading-space email",
    ).toBeVisible({ timeout: 6_000 });

    console.log("[B10-UI] PASS — leading whitespace email: modal stays open + error shown");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// UI-layer tests — /signup page (browser)
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Signup page — form structure and validation (UI)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/signup`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
  });

  test("renders all required form fields", async ({ page }) => {
    await expect(page.locator('[data-testid="input-name"]')).toBeVisible();
    await expect(page.locator('[data-testid="input-email"]')).toBeVisible();
    await expect(page.locator('[data-testid="input-password"]')).toBeVisible();
    await expect(page.locator('[data-testid="button-create-account"]')).toBeVisible();
    console.log("[signup-UI] PASS — all form fields present");
  });

  test("submitting with blank fields shows an error, does not navigate away", async ({
    page,
  }) => {
    const urlBefore = page.url();

    await page.locator('[data-testid="button-create-account"]').click();
    await page.waitForTimeout(2_000);

    // Still on /signup (or at most the same page — not /dashboard)
    const urlAfter = page.url();
    expect(
      urlAfter,
      "Should not navigate away from /signup after submitting blank form",
    ).not.toContain("/dashboard");

    // The page title "Create your Traveloure account" must still be visible
    await expect(
      page.locator('h1:has-text("Create your Traveloure account")'),
    ).toBeVisible({ timeout: 3_000 });

    console.log("[signup-UI] PASS — blank submit stays on page, no navigation");
    void urlBefore;
  });

  test("I5: spaces-only password on /signup — stays on page and shows error", async ({
    page,
  }) => {
    await page.locator('[data-testid="input-name"]').fill("QA Test");
    await page.locator('[data-testid="input-email"]').fill(`i5.signup.${uid()}@example.com`);
    await page.locator('[data-testid="input-password"]').fill("   ");

    await page.locator('[data-testid="button-create-account"]').click();
    await page.waitForTimeout(3_000);

    // Must not land on dashboard
    expect(page.url()).not.toContain("/dashboard");

    // Error message visible on the page
    const errorEl = page.locator(".bg-red-50, .text-red-700, [class*='red']").first();
    await expect(errorEl).toBeVisible({ timeout: 5_000 });

    console.log("[I5-signup-UI] PASS — spaces-only password on /signup shows error");
  });

  test("valid data successfully navigates away from /signup", async ({ page }) => {
    const email = `valid.signup.${uid()}@example.com`;

    await page.locator('[data-testid="input-name"]').fill("Valid User");
    await page.locator('[data-testid="input-email"]').fill(email);
    await page.locator('[data-testid="input-password"]').fill("ValidPass1!");

    await page.locator('[data-testid="button-create-account"]').click();

    // Should redirect away from /signup on success
    await page.waitForURL((url) => !url.toString().includes("/signup"), {
      timeout: 15_000,
    });

    expect(page.url()).not.toContain("/signup");
    console.log(`[signup-UI] PASS — valid signup navigated to ${page.url()}`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// UI-layer tests — SignInModal structure
// ─────────────────────────────────────────────────────────────────────────────

test.describe("SignInModal — structure and mode switching", () => {
  test("modal opens with email + password fields and Sign In button", async ({
    page,
  }) => {
    await openSignInModal(page);

    await expect(page.locator('[data-testid="input-email"]')).toBeVisible();
    await expect(page.locator('[data-testid="input-password"]')).toBeVisible();
    await expect(page.locator('[data-testid="button-auth-submit"]')).toBeVisible();
    await expect(page.locator('[data-testid="link-forgot-password"]')).toBeVisible();
    await expect(page.locator('[data-testid="link-switch-signup"]')).toBeVisible();

    console.log("[modal-UI] PASS — sign-in mode has all expected fields");
  });

  test("switching to signup mode shows first-name, last-name, terms, privacy fields", async ({
    page,
  }) => {
    await openSignInModal(page);

    await page.locator('[data-testid="link-switch-signup"]').click();
    await page.waitForTimeout(500);

    await expect(page.locator('[data-testid="input-first-name"]')).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.locator('[data-testid="input-last-name"]')).toBeVisible();
    await expect(page.locator('[data-testid="checkbox-signup-terms"]')).toBeVisible();
    await expect(page.locator('[data-testid="checkbox-signup-privacy"]')).toBeVisible();

    console.log("[modal-UI] PASS — signup mode shows all expected fields");
  });

  test("forgot-password mode shows reset link button and hides password field", async ({
    page,
  }) => {
    await openSignInModal(page);

    await page.locator('[data-testid="link-forgot-password"]').click();
    await page.waitForTimeout(500);

    // Password field should be hidden in reset mode
    await expect(page.locator('[data-testid="input-password"]')).not.toBeVisible({
      timeout: 3_000,
    });

    // Submit button should say "Send reset link"
    await expect(page.locator('[data-testid="button-auth-submit"]')).toContainText(
      /send reset link/i,
      { timeout: 3_000 },
    );

    // Back to Sign In link must appear
    await expect(page.locator('[data-testid="link-back-signin"]')).toBeVisible();

    console.log("[modal-UI] PASS — reset mode hides password + shows reset button");
  });
});
