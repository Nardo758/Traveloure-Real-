import { test, expect } from '@playwright/test';
import { loginAs } from '../utils/auth';

test('Debug NYC expert login', async ({ page }) => {
  console.log('Testing NYC expert login...');
  
  const expertEmail = 'nyc-art@traveloure.test';
  
  // First, let's check if we can access the login page
  await page.goto('/login');
  console.log('Login page loaded');
  
  // Check page content
  const pageText = await page.textContent('body');
  console.log('Page has text:', pageText?.substring(0, 200));
  
  // Try to login
  console.log(`Attempting login as ${expertEmail}`);
  
  try {
    await loginAs(page, expertEmail, 'TestPass123!');
    console.log('Login function completed');
    
    // Check URL
    console.log('Current URL:', page.url());
    
    if (page.url().includes('/dashboard')) {
      console.log('SUCCESS: Redirected to dashboard');
      
      // Check if we can get user info
      await page.goto('/api/auth/user');
      const userText = await page.textContent('body');
      console.log('User API response:', userText);
    } else {
      console.log('NOT on dashboard, checking for error messages...');
      
      // Look for error messages
      const errorElements = await page.locator('.text-red-500, .text-destructive, [data-testid="error-message"]').all();
      for (const elem of errorElements) {
        const errorText = await elem.textContent();
        console.log('Error found:', errorText);
      }
      
      // Take screenshot
      await page.screenshot({ path: 'debug-nyc-login.png' });
    }
    
  } catch (error: any) {
    console.log('Login failed with error:', error.message);
    await page.screenshot({ path: 'debug-nyc-login-error.png' });
  }
});