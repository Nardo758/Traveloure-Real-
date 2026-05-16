import { Page } from "@playwright/test";

export const TEST_ACCOUNTS = {
  user: { email: "testuser@traveloure.test", password: "TestPass123!" },
  admin: { email: "admin@traveloure.test", password: "AdminPass123!" },
  expert: { email: "expert_test_001@traveloure.test", password: "TestPass123!" },
  provider: { email: "test-provider@traveloure.test", password: "TestPass123!" },
};

export async function loginAs(page: Page, role: keyof typeof TEST_ACCOUNTS) {
  const { email, password } = TEST_ACCOUNTS[role];
  await page.goto("/login");
  await page.waitForLoadState("domcontentloaded");
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(dashboard|expert|provider|admin)/, { timeout: 20000 });
}

export async function logout(page: Page) {
  // Ensure we're on a real page before calling fetch
  const url = page.url();
  if (!url || url === "about:blank") {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
  }
  // Use page.request to hit the logout endpoint (avoids relative URL issues)
  await page.request.post("/api/auth/logout");
  await page.goto("/");
  await page.waitForLoadState("domcontentloaded");
}
