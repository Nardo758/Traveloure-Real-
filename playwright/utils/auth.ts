import { Page } from '@playwright/test';

/**
 * Login to the platform with email and password
 */
export async function loginAs(page: Page, email: string, password: string) {
  // Navigate to login page
  await page.goto('/login');

  // Fill email
  await page.fill('input[type="email"]', email);

  // Fill password
  await page.fill('input[type="password"]', password);

  // Submit form
  await page.click('button[type="submit"]');

  // Wait for navigation to complete and page to load
  await page.waitForURL((url) => !url.toString().includes('/login'));

  // Accept terms if modal appears
  const termsButton = await page.locator('button:has-text("Accept")').first();
  if (await termsButton.isVisible().catch(() => false)) {
    await termsButton.click();
    await page.waitForNavigation();
  }
}

/**
 * Logout from the platform
 */
export async function logout(page: Page) {
  // Click profile menu or logout button
  // This may vary depending on implementation
  const profileButton = page.locator('[data-testid="profile-menu"]').first();

  if (await profileButton.isVisible().catch(() => false)) {
    await profileButton.click();
    await page.click('text=Logout');
    await page.waitForURL((url) => !url.toString().includes('/dashboard'));
  }
}

/**
 * Check if user is logged in by checking for dashboard elements
 */
export async function isLoggedIn(page: Page): Promise<boolean> {
  try {
    const url = page.url();
    // If we're on login page, not logged in
    if (url.includes('/login')) return false;

    // Check for common authenticated elements
    const dashboardElement = page.locator('[data-testid="dashboard"]').first();
    return await dashboardElement.isVisible().catch(() => false);
  } catch {
    return false;
  }
}

/**
 * Accept terms and conditions if modal appears
 */
export async function acceptTerms(page: Page) {
  try {
    const acceptButton = page.locator('button:has-text("Accept")').first();
    if (await acceptButton.isVisible()) {
      await acceptButton.click();
      await page.waitForNavigation().catch(() => null);
    }
  } catch {
    // Terms may not appear, that's ok
  }
}

/**
 * Wait for authentication to complete
 */
export async function waitForAuth(page: Page, timeout = 10000) {
  try {
    await page.waitForURL((url) => !url.toString().includes('/login'), { timeout });
  } catch {
    // May already be logged in
  }
}
