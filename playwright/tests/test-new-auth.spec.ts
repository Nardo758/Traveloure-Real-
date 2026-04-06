// Test the new auth utility with accept-terms handling
import { test, expect } from '@playwright/test';
import { loginAs } from '../utils/auth';

test('Test provider login with new auth utility', async ({ page }) => {
  console.log('Testing provider login with updated auth utility...');
  
  try {
    await loginAs(page, 'nyc-transport@traveloure.test', 'TestPass123!');
    console.log('Auth utility completed successfully');
    console.log('Current URL:', page.url());
    
    // Should be on dashboard or accept-terms
    expect(page.url()).toMatch(/\/(dashboard|accept-terms)/);
    console.log('SUCCESS: Redirected correctly');
    
  } catch (error: any) {
    console.log('Auth utility failed:', error.message);
    console.log('Current URL on error:', page.url());
    await page.screenshot({ path: 'new-auth-test-failed.png' });
    throw error;
  }
});