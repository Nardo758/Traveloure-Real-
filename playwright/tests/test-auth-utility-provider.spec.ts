// Test auth utility with provider
import { test, expect } from '@playwright/test';
import { loginAs } from '../utils/auth';

test('Test auth utility with provider', async ({ page }) => {
  console.log('Testing auth utility with provider...');
  
  try {
    await loginAs(page, 'nyc-transport@traveloure.test', 'TestPass123!');
    console.log('Auth utility SUCCESS');
    console.log('URL:', page.url());
  } catch (error: any) {
    console.log('Auth utility FAILED:', error.message);
    
    // Check current state
    console.log('Current URL after failure:', page.url());
    
    // Check for any messages
    const bodyText = await page.textContent('body');
    console.log('Body text (first 500 chars):', bodyText?.substring(0, 500));
    
    // Take screenshot
    await page.screenshot({ path: 'auth-utility-failed.png' });
    
    throw error;
  }
});