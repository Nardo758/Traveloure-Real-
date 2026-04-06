import { test, expect } from '@playwright/test';

test('debug login page', async ({ page }) => {
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
    console.log(`[REQUEST] ${request.method()} ${request.url()}`);
  });

  page.on('response', response => {
    if (response.status() >= 400) {
      console.log(`[RESPONSE ERROR] ${response.status()} ${response.url()}`);
    }
  });

  console.log('Navigating to /login...');
  await page.goto('/login');
  
  console.log('Page URL:', page.url());
  console.log('Page title:', await page.title());
  
  // Wait a bit for any dynamic content
  await page.waitForLoadState('networkidle');
  
  // Take screenshot
  await page.screenshot({ path: 'debug-login.png', fullPage: true });
  
  // Get page HTML
  const html = await page.content();
  console.log('HTML length:', html.length);
  
  // Check for email field
  const emailField = page.locator('#email');
  const emailVisible = await emailField.isVisible().catch(() => false);
  console.log('Email field visible:', emailVisible);
  
  // Check for password field
  const passwordField = page.locator('#password');
  const passwordVisible = await passwordField.isVisible().catch(() => false);
  console.log('Password field visible:', passwordVisible);
  
  // Check for submit button
  const submitButton = page.locator('[data-testid="button-sign-in-submit"]');
  const submitVisible = await submitButton.isVisible().catch(() => false);
  console.log('Submit button visible:', submitVisible);
  
  // List all input fields
  const inputs = await page.locator('input').count();
  console.log('Total input elements:', inputs);
  
  // Output first few lines of body
  const bodyText = await page.locator('body').innerText();
  console.log('Body text (first 500 chars):', bodyText.substring(0, 500));
});