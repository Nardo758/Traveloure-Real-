import { test, expect } from '@playwright/test';
import { loginAs } from '../utils/auth';

test('Test single expert login and dashboard access', async ({ page }) => {
  // Try to login as a Kyoto expert
  const expertEmail = 'kyoto-temple@traveloure.test';
  
  console.log(`Logging in as ${expertEmail}`);
  await loginAs(page, expertEmail, 'TestPass123!');
  
  // Check if we're redirected to expert dashboard
  const currentUrl = page.url();
  console.log(`Current URL after login: ${currentUrl}`);
  
  // Should be on expert dashboard
  if (currentUrl.includes('/expert/dashboard')) {
    console.log('SUCCESS: Redirected to expert dashboard');
  } else if (currentUrl.includes('/dashboard')) {
    console.log('On generic dashboard, checking role...');
    
    // Try to navigate to expert dashboard
    await page.goto('/expert/dashboard');
    
    // Check if we can access it
    if (!page.url().includes('/login')) {
      console.log('SUCCESS: Can access expert dashboard');
    } else {
      console.log('FAILED: Cannot access expert dashboard');
    }
  } else {
    console.log(`Unexpected URL after login: ${currentUrl}`);
  }
  
  // Take screenshot
  await page.screenshot({ path: 'single-expert-test.png' });
  console.log('Test completed');
});