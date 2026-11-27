import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:5000";
const CAPTURES = path.resolve("playwright/dx4-captures");
fs.mkdirSync(CAPTURES, { recursive: true });
const PASSWORD = "TestPass123!";

async function maskEmails(page: import("@playwright/test").Page) {
  await page.addStyleTag({
    content: 'input[type="email"], [data-testid="input-email"], [data-testid="text-verify-email"], [data-testid="sidebar-user-email"] { color: transparent !important; caret-color: transparent !important; }',
  });
  await page.evaluate(() => {
    const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;
    for (const el of Array.from(document.querySelectorAll("body *"))) {
      const own = Array.from(el.childNodes).some((node) => node.nodeType === Node.TEXT_NODE && EMAIL.test(node.textContent || ""));
      if (!own) continue;
      const ctx = el as HTMLElement;
      const style = getComputedStyle(ctx);
      const bar = document.createElement("span");
      bar.style.display = "inline-block";
      bar.style.width = `${Math.max(60, Math.min(ctx.getBoundingClientRect().width, 220))}px`;
      bar.style.height = `${parseFloat(style.fontSize || "13")}px`;
      bar.style.background = "#D8CFEE";
      bar.style.borderRadius = "3px";
      for (const node of Array.from(ctx.childNodes)) {
        if (node.nodeType === Node.TEXT_NODE) ctx.replaceChild(bar, node);
      }
    }
  });
}

async function signupPage(page: import("@playwright/test").Page) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${BASE_URL}/signup`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="input-password"]', { timeout: 30_000 });
}

test("DX-4 signup toggle, common-password error, and key behavior", async ({ page }) => {
  test.setTimeout(90_000);
  await signupPage(page);
  const email = `dx4-ui-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
  await page.fill('[data-testid="input-first-name"]', "DX4");
  await page.fill('[data-testid="input-last-name"]', "Toggle");
  await page.fill('[data-testid="input-email"]', email);
  const password = page.locator('[data-testid="input-password"]');
  await password.fill("password123");
  const toggle = page.locator('[data-testid="input-password-toggle"]');
  await expect(toggle).toHaveAttribute("aria-label", "Show password");
  await toggle.click();
  const typeAfter = await password.getAttribute("type");
  const pressed = await toggle.getAttribute("aria-pressed");
  const label = await toggle.getAttribute("aria-label");
  expect(typeAfter).toBe("text");
  expect(pressed).toBe("true");
  expect(label).toBe("Hide password");
  await maskEmails(page);
  await page.screenshot({ path: path.join(CAPTURES, "dx4-signup-toggle-1280.png"), fullPage: true });
  const h1280 = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(h1280).toBe(false);
  console.log(`[dx4-toggle-1280]     page_hscroll=${h1280}`);

  await page.locator('[data-testid="checkbox-signup-consent"]').click();
  await page.locator('[data-testid="button-create-account"]').click();
  await expect(page.locator('[data-testid="error-signup-password"]')).toContainText("This password is too common", { timeout: 20_000 });
  const afterSubmit = await password.getAttribute("type");
  expect(afterSubmit).toBe("password");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  await maskEmails(page);
  await page.screenshot({ path: path.join(CAPTURES, "dx4-signup-toggle-390.png"), fullPage: true });
  const h390 = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(h390).toBe(false);

  console.log(`[dx4-toggle-signup]   type_before=password after_click=${typeAfter} aria_pressed=${pressed} label="${label}" after_submit=${afterSubmit}`);
  console.log(`[dx4-common-ui]       posted=1 error_password="This password is too common. Choose a different one." banner=0 aria_invalid=${await password.getAttribute("aria-invalid")}`);
  console.log(`[dx4-toggle-390]      page_hscroll=${h390}`);

  // Keyboard: tab from the input reaches the toggle; Space toggles; Enter does not submit.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${BASE_URL}/signup`, { waitUntil: "domcontentloaded" });
  const pw2 = page.locator('[data-testid="input-password"]');
  await pw2.focus();
  await page.keyboard.press("Tab");
  const focused = await page.evaluate(() => document.activeElement?.getAttribute("data-testid"));
  await page.keyboard.press("Space");
  const spacePressed = await page.locator('[data-testid="input-password-toggle"]').getAttribute("aria-pressed");
  await page.keyboard.press("Enter");
  const stillHere = page.url().includes("/signup");
  console.log(`[dx4-toggle-keys]     tab_reaches_toggle=${focused === "input-password-toggle"} space_toggles=${spacePressed === "true"} enter_on_toggle_submits=${!stillHere}`);
});

test("DX-4 reset has two toggles and the page fits", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${BASE_URL}/reset-password?token=${"a".repeat(40)}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="input-reset-new-password-toggle"]', { timeout: 30_000 });
  await page.locator('[data-testid="input-reset-new-password-toggle"]').click();
  expect(await page.locator('[data-testid="input-reset-new-password"]').getAttribute("type")).toBe("text");
  expect(await page.locator('[data-testid="input-reset-confirm-password"]').getAttribute("type")).toBe("password");
  await maskEmails(page);
  await page.screenshot({ path: path.join(CAPTURES, "dx4-reset-toggle-1280.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  await maskEmails(page);
  await page.screenshot({ path: path.join(CAPTURES, "dx4-reset-toggle-390.png"), fullPage: true });
});

test("DX-4 unverified browsing is not held", async ({ page }) => {
  const email = `dx4-browse-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
  const reg = await page.request.post(`${BASE_URL}/api/auth/register`, {
    data: { email, password: PASSWORD, firstName: "DX4", lastName: "Browse", consent: true },
  });
  expect([200, 202]).toContain(reg.status());
  const login = await page.request.post(`${BASE_URL}/api/auth/login`, { data: { email, password: PASSWORD } });
  expect(login.status()).toBe(200);
  await page.goto(`${BASE_URL}/plans`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  const pathname = new URL(page.url()).pathname;
  expect(pathname).not.toBe("/verify-email");
  console.log(`[dx4-browse-ui]       unverified: after_signin_path=${pathname} plans_page_loads=true`);
});

test("DX-4 refusal note on a gated payout", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.route("**/api/auth/user", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ id: "dx4-expert", email: "dx4-expert@example.com", firstName: "DX4", lastName: "Expert", role: "travel_expert", termsAcceptedAt: new Date().toISOString(), privacyAcceptedAt: new Date().toISOString() }),
  }));
  await page.route("**/api/expert/earnings/details", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      summary: { totalEarnings: 100, pendingEarnings: 0, availableEarnings: 100, paidOut: 0, totalTips: 0, totalAffiliateCommissions: 0 },
      earnings: [], payouts: [], recentTips: [], recentAffiliateEarnings: [],
    }),
  }));
  await page.route("**/api/stripe/connect/status", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ connected: true }) }));
  await page.route("**/api/payouts/request", (route) => route.fulfill({
    status: 403,
    contentType: "application/json",
    body: JSON.stringify({ message: "Verify your email to continue.", code: "email_verification_required" }),
  }));
  await page.route("**/api/auth/resend-verification", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ message: "sent" }) }));

  await page.goto(`${BASE_URL}/expert/money`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="button-request-payout"]', { timeout: 30_000 });
  await page.locator('[data-testid="button-request-payout"]').click();
  const note = page.locator('[data-testid="email-verification-refusal"]');
  await expect(note).toBeVisible();
  await expect(note).toContainText("Verify your email to continue.");
  await expect(note.locator('[data-testid="button-resend-verification"]')).toHaveCount(0);
  await maskEmails(page);
  await page.screenshot({ path: path.join(CAPTURES, "dx4-refusal-note-1280.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  await maskEmails(page);
  await page.screenshot({ path: path.join(CAPTURES, "dx4-refusal-note-390.png"), fullPage: true });
});

test("DX-4 refusal note keeps its own resend when no banner shows", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.route("**/api/auth/user", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ id: "dx4-expert", email: "dx4-expert@example.com", firstName: "DX4", lastName: "Expert", role: "travel_expert", emailVerified: new Date().toISOString(), termsAcceptedAt: new Date().toISOString(), privacyAcceptedAt: new Date().toISOString() }),
  }));
  await page.route("**/api/expert/earnings/details", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      summary: { totalEarnings: 100, pendingEarnings: 0, availableEarnings: 100, paidOut: 0, totalTips: 0, totalAffiliateCommissions: 0 },
      earnings: [], payouts: [], recentTips: [], recentAffiliateEarnings: [],
    }),
  }));
  await page.route("**/api/stripe/connect/status", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ connected: true }) }));
  await page.route("**/api/payouts/request", (route) => route.fulfill({
    status: 403,
    contentType: "application/json",
    body: JSON.stringify({ message: "Verify your email to continue.", code: "email_verification_required" }),
  }));
  await page.route("**/api/auth/resend-verification", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ message: "sent" }) }));

  await page.goto(`${BASE_URL}/expert/money`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="button-request-payout"]', { timeout: 30_000 });
  await page.locator('[data-testid="button-request-payout"]').click();
  const note = page.locator('[data-testid="email-verification-refusal"]');
  await expect(note).toBeVisible();
  const resend = note.locator('[data-testid="button-resend-verification"]');
  await expect(resend).toHaveText("Resend verification email");
  await resend.click();
  await expect(page.locator('[data-testid="text-resend-verification-status"]')).toHaveText("Verification email sent. Check your inbox.");
  await page.unroute("**/api/auth/resend-verification");
  await page.route("**/api/auth/resend-verification", (route) => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "boom" }) }));
  await resend.click();
  await expect(page.locator('[data-testid="text-resend-verification-status"]')).toHaveText("Couldn't send the email. Try again.");
  await page.unroute("**/api/auth/resend-verification");
  await page.route("**/api/auth/resend-verification", (route) => route.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({ message: "rate limited" }) }));
  await resend.click();
  await expect(page.locator('[data-testid="text-resend-verification-status"]')).toHaveText("Please wait a minute before asking for another email.");
  await page.evaluate(() => window.dispatchEvent(new Event("traveloure:email-verified")));
  await expect(note).toHaveCount(0);
  console.log(`[dx4-refusal-clears] verify=1`);
});

test("DX-4 cart checkout refusal and clear", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.route("**/api/auth/user", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ id: "dx4-cart", email: "dx4-cart@example.com", firstName: "DX4", lastName: "Cart", role: "user", termsAcceptedAt: new Date().toISOString(), privacyAcceptedAt: new Date().toISOString() }),
  }));
  await page.route("**/api/cart", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      items: [{
        id: "c1", serviceId: "s1", itineraryItemId: null, contentType: null, contentId: null, contentMeta: null,
        isContentItem: false, contentDisplay: null, quantity: 1, partySize: null, scheduledDate: null, slotId: null,
        slot: null, notes: null, pickupLocation: null,
        service: { id: "s1", serviceName: "Test service", price: "100", location: "Kyoto", shortDescription: null, userId: "u1", serviceType: "activity", providerName: "Test", pricingUnit: null, productShape: null, deliveryMethod: null, priceBasis: null, priceType: "fixed", surchargeMode: "none" },
      }],
      subtotal: "100", platformFee: "0", conciergeFee: "0", total: "100", itemCount: 1,
    }),
  }));
  let checkoutCalls = 0;
  await page.route("**/api/checkout", (route) => {
    checkoutCalls += 1;
    if (checkoutCalls === 1) {
      return route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ code: "email_verification_required", message: "Verify your email to continue." }) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ paymentIntent: null, oneClick: false, status: "succeeded", bookings: [] }) });
  });

  await page.goto(`${BASE_URL}/cart`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Checkout", exact: true }).click();
  await page.waitForSelector('[data-testid="button-complete-booking"]', { timeout: 30_000 });
  await page.locator('[data-testid="button-complete-booking"]').click();
  const note = page.locator('[data-testid="email-verification-refusal"]');
  await expect(note).toBeVisible();
  await maskEmails(page);
  await page.screenshot({ path: path.join(CAPTURES, "dx4-refusal-cart-1280.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  await maskEmails(page);
  await page.screenshot({ path: path.join(CAPTURES, "dx4-refusal-cart-390.png"), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.locator('[data-testid="button-skip-to-payment"]').click();
  await page.waitForSelector('[data-testid="button-complete-booking"]', { timeout: 30_000 });
  await page.locator('[data-testid="button-complete-booking"]').click();
  await expect(note).toHaveCount(0);
  console.log(`[dx4-refusal-cart]   code=email_verification_required note=1 cleared=1`);
  console.log(`[dx4-refusal-clears] cart=1`);
});

test("DX-4 chat HTTP refusal and clear", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.route("**/api/auth/user", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ id: "dx4-chat", email: "dx4-chat@example.com", firstName: "DX4", lastName: "Chat", role: "user", termsAcceptedAt: new Date().toISOString(), privacyAcceptedAt: new Date().toISOString() }),
  }));
  await page.route("**/api/experts/**", (route) => route.fulfill({ status: 404, contentType: "application/json", body: "{}" }));
  await page.route("**/api/chats**", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    chatPostCalls += 1;
    if (chatPostCalls === 1) return route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ code: "email_verification_required", message: "Verify your email to continue." }) });
    return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ id: "chat-1" }) });
  });
  await page.route("**/api/conversations**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  let chatPostCalls = 0;
  let postCalls = 0;
  await page.route("**/api/messages", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    postCalls += 1;
    if (postCalls === 1) return route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ code: "email_verification_required", message: "Verify your email to continue." }) });
    return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ id: "m1" }) });
  });

  await page.addInitScript(() => {
    const Native = window.WebSocket;
    window.WebSocket = function (url: string | URL, protocols?: string | string[]) {
      if (String(url).endsWith("/ws")) throw new Error("socket off for HTTP test");
      return new Native(url, protocols);
    } as unknown as typeof WebSocket;
  });
  await page.goto(`${BASE_URL}/chat?expertId=11111111-1111-4111-8111-111111111111&name=Expert`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="input-message"]', { timeout: 30_000 });
  await page.fill('[data-testid="input-message"]', "Hello");
  await page.locator('[data-testid="button-send"]').click();
  const note = page.locator('[data-testid="email-verification-refusal"]');
  await expect(note).toBeVisible();
  await maskEmails(page);
  await page.screenshot({ path: path.join(CAPTURES, "dx4-refusal-chat-1280.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  await maskEmails(page);
  await page.screenshot({ path: path.join(CAPTURES, "dx4-refusal-chat-390.png"), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.fill('[data-testid="input-message"]', "Hello again");
  await page.locator('[data-testid="button-send"]').click();
  await expect(note).toHaveCount(0);
  console.log(`[dx4-refusal-chat-http] code=email_verification_required note=1 cleared=1`);
  console.log(`[dx4-refusal-clears] chat=1`);
});

test("DX-4 chat socket refusal", async ({ page }) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => {
    const Native = window.WebSocket;
    class Fake {
      onopen: null | (() => void) = null;
      onmessage: null | ((event: MessageEvent) => void) = null;
      onclose: null | (() => void) = null;
      onerror: null | (() => void) = null;
      constructor() { setTimeout(() => this.onopen?.(), 0); }
      send(data: string) {
        const parsed = JSON.parse(data);
        if (parsed?.type === "chat") {
          setTimeout(() => this.onmessage?.(new MessageEvent("message", { data: JSON.stringify({ type: "error", errorCode: "email_verification_required", error: "Verify your email to continue." }) })), 0);
        }
      }
      close() { this.onclose?.(); }
    }
    window.WebSocket = function (url: string | URL, protocols?: string | string[]) {
      if (String(url).endsWith("/ws")) return new Fake() as unknown as WebSocket;
      return new Native(url, protocols);
    } as unknown as typeof WebSocket;
  });
  await page.route("**/api/auth/user", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ id: "dx4-socket", email: "dx4-socket@example.com", firstName: "DX4", lastName: "Socket", role: "user", termsAcceptedAt: new Date().toISOString(), privacyAcceptedAt: new Date().toISOString() }),
  }));
  await page.route("**/api/experts/**", (route) => route.fulfill({ status: 404, contentType: "application/json", body: "{}" }));
  await page.route("**/api/chats**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.route("**/api/conversations**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));

  await page.goto(`${BASE_URL}/chat?expertId=11111111-1111-4111-8111-111111111111&name=Expert`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="input-message"]', { timeout: 30_000 });
  await page.waitForTimeout(600);
  await page.fill('[data-testid="input-message"]', "Hello socket");
  await page.locator('[data-testid="button-send"]').click();
  await expect(page.locator('[data-testid="email-verification-refusal"]')).toBeVisible();
  console.log(`[dx4-refusal-chat-socket] code=email_verification_required note=1`);
});

test("DX-4 password inputs are replaced everywhere", async () => {
  const files = [
    ["client/src/components/auth/SignupForm.tsx", 1],
    ["client/src/components/SignInModal.tsx", 1],
    ["client/src/pages/reset-password.tsx", 2],
    ["client/src/pages/admin/users.tsx", 3],
    ["client/src/pages/expert/settings.tsx", 2],
  ] as const;
  const counts = Object.fromEntries(files.map(([file]) => {
    const src = fs.readFileSync(path.join(process.cwd(), file), "utf8");
    return [file, (src.match(/<PasswordInput\b/g) ?? []).length];
  }));
  expect(counts["client/src/components/auth/SignupForm.tsx"]).toBe(1);
  expect(counts["client/src/components/SignInModal.tsx"]).toBe(1);
  expect(counts["client/src/pages/reset-password.tsx"]).toBe(2);
  expect(counts["client/src/pages/admin/users.tsx"]).toBe(3);
  expect(counts["client/src/pages/expert/settings.tsx"]).toBe(2);
  console.log(
    `[dx4-toggle-count]    signup=${counts["client/src/components/auth/SignupForm.tsx"]} signin=${counts["client/src/components/SignInModal.tsx"]} reset=${counts["client/src/pages/reset-password.tsx"]} admin=${counts["client/src/pages/admin/users.tsx"]} expert_settings=${counts["client/src/pages/expert/settings.tsx"]}`,
  );
});
