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
  await page.waitForLoadState("networkidle");
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(dashboard|expert|provider|admin)/, { timeout: 15000 });
}

export async function logout(page: Page) {
  await page.evaluate(async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
  });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
}
