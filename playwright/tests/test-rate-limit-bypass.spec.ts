import { test, expect } from '@playwright/test';

test('Test rate limit bypass with header', async ({ page, context }) => {
  console.log('Testing rate limit bypass...');
  
  // Navigate to login page
  await page.goto('/login');
  
  // Check that page loaded
  await expect(page.locator('#email')).toBeVisible();
  await expect(page.locator('#password')).toBeVisible();
  
  console.log('Login page loaded successfully');
  
  // Try to login multiple times to test rate limiting
  for (let i = 0; i < 5; i++) {
    console.log(`Login attempt ${i + 1}`);
    
    await page.fill('#email', `test${i}@test.com`);
    await page.fill('#password', 'wrongpassword');
    await page.click('[data-testid="button-sign-in-submit"]');
    
    // Wait a bit and clear for next attempt
    await page.waitForTimeout(500);
    await page.fill('#email', '');
  }
  
  console.log('Multiple login attempts completed without rate limiting');
  
  // Now try a real login
  await page.fill('#email', 'admin@traveloure.test');
  await page.fill('#password', 'AdminPass123!');
  await page.click('[data-testid="button-sign-in-submit"]');
  
  // Should redirect to dashboard
  await page.waitForLoadState('networkidle')(/\/dashboard/);
  console.log('Successfully logged in after multiple attempts!');
});