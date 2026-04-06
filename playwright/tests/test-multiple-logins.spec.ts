// Test multiple logins with rate limit bypass fixture
import { test, expect } from '@playwright/test';
import { loginAs } from '../utils/auth';

const testAccounts = [
  { email: 'nyc-art@traveloure.test', name: 'Marcus Chen' },
  { email: 'nyc-food@traveloure.test', name: 'Sofia Ricci' },
  { email: 'nyc-nightlife@traveloure.test', name: 'Jordan Williams' },
];

for (const account of testAccounts) {
  test(`Login test for ${account.name}`, async ({ page }) => {
    console.log(`Testing login for ${account.email}`);
    
    try {
      await loginAs(page, account.email, 'TestPass123!');
      console.log(`SUCCESS: ${account.name} logged in`);
      
      // Check we're on dashboard
      expect(page.url()).toContain('/dashboard');
      
      // Take screenshot
      await page.screenshot({ path: `login-${account.name.replace(/\s+/g, '-')}.png` });
      
      // Logout for next test
      await page.goto('/api/logout');
      await page.waitForTimeout(1000);
      
    } catch (error: any) {
      console.log(`FAILED: ${account.name} - ${error.message}`);
      await page.screenshot({ path: `login-failed-${account.name.replace(/\s+/g, '-')}.png` });
      throw error;
    }
  });
}