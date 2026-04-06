import { Page, expect } from '@playwright/test';

/**
 * Navigate to a dashboard based on user role.
 * Uses 'load' waitUntil — networkidle is unreliable with Vite HMR WebSocket.
 */
export async function navigateToDashboard(page: Page, role: 'expert' | 'provider' | 'traveler' | 'ea' | 'admin') {
  let path = '';

  switch (role) {
    case 'expert':
      path = '/expert/dashboard';
      break;
    case 'provider':
      path = '/provider/dashboard';
      break;
    case 'traveler':
      path = '/dashboard';
      break;
    case 'ea':
      path = '/ea/dashboard';
      break;
    case 'admin':
      path = '/admin/dashboard';
      break;
  }

  await page.goto(path, { waitUntil: 'load' });
}

/**
 * Expect page to be on a specific route
 */
export async function expectRoute(page: Page, path: string) {
  const url = page.url();
  expect(url).toContain(path);
}

/**
 * Wait for route to change and match predicate
 */
export async function waitForNavigation(page: Page, predicate?: (url: URL) => boolean) {
  if (predicate) {
    await page.waitForURL(predicate, { timeout: 15000 }).catch(() => null);
  } else {
    await page.waitForLoadState('load').catch(() => null);
  }
}

/**
 * Navigate to a specific path
 */
export async function navigateTo(page: Page, path: string) {
  await page.goto(path, { waitUntil: 'load' });
}

/**
 * Wait for a page element to be visible
 */
export async function waitForElement(page: Page, selector: string, timeout = 15000) {
  await page.locator(selector).waitFor({ state: 'visible', timeout });
}

/**
 * Get current route path
 */
export function getCurrentPath(page: Page): string {
  const url = new URL(page.url());
  return url.pathname;
}
