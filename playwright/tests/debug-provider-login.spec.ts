// Debug provider login
import { test, expect } from '@playwright/test';

test('Debug provider login manually', async ({ page }) => {
  console.log('Debugging provider login...');
  
  // Go to login page
  await page.goto('/login');
  console.log('On login page');
  
  // Fill credentials
  await page.fill('#email', 'nyc-transport@traveloure.test');
  await page.fill('#password', 'TestPass123!');
  
  console.log('Filled credentials, clicking submit...');
  
  // Click submit and wait for response
  const [response] = await Promise.all([
    page.waitForResponse(resp => resp.url().includes('/api/auth/login')),
    page.click('[data-testid="button-sign-in-submit"]')
  ]);
  
  console.log('Got response:', response.status(), response.statusText());
  
  // Check response body
  try {
    const responseBody = await response.json();
    console.log('Response body:', JSON.stringify(responseBody));
  } catch {
    const responseText = await response.text();
    console.log('Response text:', responseText.substring(0, 200));
  }
  
  // Wait a bit and check URL
  await page.waitForTimeout(2000);
  console.log('Current URL after 2 seconds:', page.url());
  
  // Check for error messages on page
  const errorElements = await page.locator('.text-red-500, .text-destructive, [data-testid="error-message"], .error, .alert-error').all();
  for (const elem of errorElements) {
    const text = await elem.textContent();
    console.log('Error element found:', text);
  }
  
  // Take screenshot
  await page.screenshot({ path: 'debug-provider-login.png' });
  console.log('Screenshot saved');
});