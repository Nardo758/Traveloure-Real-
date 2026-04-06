import { test, expect } from '@playwright/test';

test('debug login page elements', async ({ page }) => {
  // Capture console logs
  page.on('console', msg => {
    console.log(`[CONSOLE] ${msg.type()}: ${msg.text()}`);
  });

  // Capture page errors
  page.on('pageerror', error => {
    console.log(`[PAGE ERROR] ${error.message}`);
  });

  console.log('Navigating to /login...');
  await page.goto('/login');
  
  console.log('Current URL:', page.url());
  console.log('Page title:', await page.title());
  
  // Wait for page to load
  await page.waitForLoadState('networkidle');
  
  // Take screenshot
  await page.screenshot({ path: 'debug-login-page.png', fullPage: true });
  
  // Check for email field with various selectors
  const emailSelectors = [
    '#email',
    'input[type="email"]',
    'input[placeholder*="email"]',
    'input[placeholder*="Email"]',
    'input[placeholder="you@example.com"]'
  ];
  
  for (const selector of emailSelectors) {
    const element = page.locator(selector);
    const count = await element.count();
    console.log(`Selector "${selector}": ${count} elements`);
    if (count > 0) {
      const visible = await element.first().isVisible().catch(() => false);
      console.log(`  First element visible: ${visible}`);
      if (visible) {
        const placeholder = await element.first().getAttribute('placeholder').catch(() => 'no placeholder');
        const id = await element.first().getAttribute('id').catch(() => 'no id');
        console.log(`  placeholder: ${placeholder}, id: ${id}`);
      }
    }
  }
  
  // Check for password field
  const passwordSelectors = [
    '#password',
    'input[type="password"]',
    'input[placeholder*="password"]',
    'input[placeholder*="Password"]',
    'input[placeholder="••••••••"]'
  ];
  
  for (const selector of passwordSelectors) {
    const element = page.locator(selector);
    const count = await element.count();
    console.log(`Selector "${selector}": ${count} elements`);
    if (count > 0) {
      const visible = await element.first().isVisible().catch(() => false);
      console.log(`  First element visible: ${visible}`);
      if (visible) {
        const placeholder = await element.first().getAttribute('placeholder').catch(() => 'no placeholder');
        const id = await element.first().getAttribute('id').catch(() => 'no id');
        console.log(`  placeholder: ${placeholder}, id: ${id}`);
      }
    }
  }
  
  // Check for submit buttons
  const submitSelectors = [
    '[data-testid="button-sign-in-submit"]',
    '[data-testid="button-auth-submit"]',
    'button[type="submit"]',
    'button:has-text("Sign In")',
    'button:has-text("Sign in")'
  ];
  
  for (const selector of submitSelectors) {
    const element = page.locator(selector);
    const count = await element.count();
    console.log(`Selector "${selector}": ${count} elements`);
    if (count > 0) {
      const visible = await element.first().isVisible().catch(() => false);
      console.log(`  First element visible: ${visible}`);
      if (visible) {
        const text = await element.first().innerText().catch(() => 'no text');
        const testid = await element.first().getAttribute('data-testid').catch(() => 'no testid');
        console.log(`  text: "${text}", data-testid: ${testid}`);
      }
    }
  }
  
  // Check for modals
  const modalSelectors = [
    '[role="dialog"]',
    '[data-state="open"]',
    '.modal',
    '[data-testid="modal-sign-in"]'
  ];
  
  for (const selector of modalSelectors) {
    const element = page.locator(selector);
    const count = await element.count();
    console.log(`Selector "${selector}": ${count} elements`);
    if (count > 0) {
      const visible = await element.first().isVisible().catch(() => false);
      console.log(`  First element visible: ${visible}`);
    }
  }
  
  // Check for overlay/backdrop
  const overlaySelectors = [
    '[data-state="open"][aria-hidden="true"]',
    '.backdrop',
    '.overlay',
    '[aria-hidden="true"]'
  ];
  
  for (const selector of overlaySelectors) {
    const element = page.locator(selector);
    const count = await element.count();
    console.log(`Selector "${selector}": ${count} elements`);
    if (count > 0) {
      const visible = await element.first().isVisible().catch(() => false);
      console.log(`  First element visible: ${visible}`);
      if (visible) {
        const html = await element.first().evaluate(el => el.outerHTML).catch(() => 'no html');
        console.log(`  HTML (first 200 chars): ${html.substring(0, 200)}`);
      }
    }
  }
  
  // Get body text for context
  const bodyText = await page.locator('body').innerText().catch(() => 'Could not get body text');
  console.log('Body text (first 500 chars):', bodyText.substring(0, 500));
});