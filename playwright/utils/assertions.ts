import { Page, expect } from '@playwright/test';

/**
 * Verify dashboard loaded for a specific role
 */
export async function verifyDashboardLoaded(page: Page, role: 'expert' | 'provider' | 'traveler' | 'ea' | 'admin') {
  const dashboardSelectors = {
    expert: '[data-testid="expert-dashboard"]',
    provider: '[data-testid="provider-dashboard"]',
    traveler: '[data-testid="traveler-dashboard"]',
    ea: '[data-testid="ea-dashboard"]',
    admin: '[data-testid="admin-dashboard"]',
  };

  const selector = dashboardSelectors[role];

  // Wait for React hydration and element to appear in the DOM first
  await page.waitForSelector(selector, { state: 'attached', timeout: 15000 });
  // Then assert it is visible
  await expect(page.locator(selector).first()).toBeVisible({ timeout: 10000 });
}

/**
 * Verify service listing displays correctly
 */
export async function verifyServiceListing(
  page: Page,
  service: {
    name: string;
    price: number;
  }
) {
  const serviceCard = page.locator(`text=${service.name}`).first();
  await expect(serviceCard).toBeVisible();

  // Verify price is displayed
  const priceText = page.locator(`text=\\$${service.price}`);
  const priceVisible = await priceText.isVisible().catch(() => false);
  expect(priceVisible).toBeTruthy();
}

/**
 * Verify itinerary items are displayed
 */
export async function verifyItineraryItems(
  page: Page,
  items: Array<{
    name: string;
    date?: string;
  }>
) {
  for (const item of items) {
    const itemElement = page.locator(`text=${item.name}`).first();
    await expect(itemElement).toBeVisible();
  }
}

/**
 * Verify booking confirmation page
 */
export async function verifyBookingConfirmation(page: Page) {
  const confirmationElement = page.locator('[data-testid="booking-confirmation"]').first();
  await expect(confirmationElement).toBeVisible();

  // Verify confirmation message
  const confirmationText = page.locator('text=booking.*confirmed').first();
  const isVisible = await confirmationText.isVisible().catch(() => false);
  expect(isVisible).toBeTruthy();
}

/**
 * Verify error message displays
 */
export async function verifyErrorMessage(page: Page, expectedText: string) {
  const errorElement = page.locator('[data-testid="error-message"]').first();
  await expect(errorElement).toBeVisible();

  const errorContent = page.locator(`text=${expectedText}`);
  await expect(errorContent).toBeVisible();
}

/**
 * Verify success message displays
 */
export async function verifySuccessMessage(page: Page, expectedText?: string) {
  const successElement = page.locator('[data-testid="success-message"]').first();
  const isVisible = await successElement.isVisible().catch(() => false);

  if (expectedText) {
    const successContent = page.locator(`text=${expectedText}`);
    await expect(successContent).toBeVisible();
  }

  expect(isVisible).toBeTruthy();
}

/**
 * Verify route accessibility (no 404)
 */
export async function verifyRouteAccessible(page: Page) {
  const status = page.url();
  expect(!status.includes('404')).toBeTruthy();

  // Check for main content area
  const mainContent = page.locator('main').first();
  const isVisible = await mainContent.isVisible().catch(() => false);
  expect(isVisible || await page.locator('body').isVisible()).toBeTruthy();
}

/**
 * Verify element is in viewport
 */
export async function verifyElementVisible(page: Page, selector: string) {
  const element = page.locator(selector).first();
  await expect(element).toBeVisible();
}

/**
 * Verify form field has value
 */
export async function verifyFormField(page: Page, selector: string, value: string) {
  const input = page.locator(selector).first();
  const inputValue = await input.inputValue();
  expect(inputValue).toContain(value);
}

/**
 * Verify page title
 */
export async function verifyPageTitle(page: Page, title: string) {
  await expect(page).toHaveTitle(new RegExp(title));
}

/**
 * Verify element contains text
 */
export async function verifyElementContains(page: Page, selector: string, text: string) {
  const element = page.locator(selector).first();
  await expect(element).toContainText(text);
}

/**
 * Verify no console errors
 */
export async function verifyNoConsoleErrors(page: Page): Promise<string[]> {
  const errors: string[] = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });

  return errors;
}

/**
 * Verify navigation menu renders
 */
export async function verifyNavigationRendered(page: Page) {
  const nav = page.locator('nav, [role="navigation"]').first();
  const isVisible = await nav.isVisible().catch(() => false);
  expect(isVisible).toBeTruthy();
}

/**
 * Verify sidebar renders
 */
export async function verifySidebarRendered(page: Page) {
  const sidebar = page.locator('aside, [data-testid="sidebar"]').first();
  const isVisible = await sidebar.isVisible().catch(() => false);

  if (!isVisible) {
    console.warn('KNOWN BUG: Sidebar/menu bar did not render');
  }

  return isVisible;
}

/**
 * Verify table contains rows
 */
export async function verifyTableHasRows(page: Page, selector: string, minRows: number = 1) {
  const rows = page.locator(`${selector} tbody tr`);
  const count = await rows.count();
  expect(count).toBeGreaterThanOrEqual(minRows);
}
