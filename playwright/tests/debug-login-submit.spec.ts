import { test, expect } from '@playwright/test';

test('debug login submit', async ({ page }) => {
  // Capture console logs
  page.on('console', msg => {
    console.log(`[CONSOLE] ${msg.type()}: ${msg.text()}`);
  });

  // Capture page errors
  page.on('pageerror', error => {
    console.log(`[PAGE ERROR] ${error.message}`);
  });

  // Capture network requests
  page.on('request', request => {
    if (request.url().includes('/api/auth/login')) {
      console.log(`[REQUEST] ${request.method()} ${request.url()}`, request.postData());
    }
  });

  page.on('response', response => {
    if (response.url().includes('/api/auth/login')) {
      console.log(`[RESPONSE] ${response.status()} ${response.url()}`);
      response.text().then(text => {
        console.log(`[RESPONSE BODY] ${text.substring(0, 200)}`);
      }).catch(() => {});
    }
  });

  await page.goto('/');
  await page.locator('[data-testid="button-sign-in"]').click();
  await page.locator('#email').waitFor({ state: 'visible' });
  await page.fill('#email', 'nyc-art@traveloure.test');
  await page.fill('#password', 'TestPass123!');
  
  // Take screenshot before submit
  await page.screenshot({ path: 'debug-before-submit.png', fullPage: true });
  
  await page.locator('[data-testid="button-auth-submit"]').click();
  
  // Wait for any response or error
  await page.waitForTimeout(3000);
  
  // Take screenshot after submit
  await page.screenshot({ path: 'debug-after-submit.png', fullPage: true });
  
  // Check for error message
  const errorElement = page.locator('.text-destructive, [data-testid="error-message"]');
  if (await errorElement.isVisible().catch(() => false)) {
    const errorText = await errorElement.innerText();
    console.log(`[ERROR] ${errorText}`);
  }
  
  // Check if modal is still open
  const modal = page.locator('[data-testid="modal-sign-in"]');
  console.log(`Modal visible: ${await modal.isVisible().catch(() => false)}`);
  
  // Check URL
  console.log(`Current URL: ${page.url()}`);
});