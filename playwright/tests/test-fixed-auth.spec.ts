// Test the fixed auth utility
import { test, expect } from '@playwright/test';
import { loginAs } from '../utils/auth-fixed';

test('Test provider login with fixed auth utility', async ({ page }) => {
  console.log('Testing provider login with fixed auth utility...');
  
  try {
    await loginAs(page, 'nyc-transport@traveloure.test', 'TestPass123!');
    console.log('Auth utility completed successfully');
    console.log('Current URL:', page.url());
    
    // Should be on dashboard
    expect(page.url()).toContain('/dashboard');
    console.log('SUCCESS: On dashboard');
    
  } catch (error: any) {
    console.log('Auth utility failed:', error.message);
    console.log('Current URL on error:', page.url());
    
    // Take screenshot for debugging
    await page.screenshot({ path: 'fixed-auth-test-failed.png' });
    
    // Check page content
    const bodyText = await page.textContent('body');
    console.log('Page body (first 500 chars):', bodyText?.substring(0, 500));
    
    throw error;
  }
});