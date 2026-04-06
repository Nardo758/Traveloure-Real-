// Debug the auth utility with our fixture
import { test, expect } from '@playwright/test';
import { loginAs } from '../utils/auth';

test('Debug auth utility', async ({ page }) => {
  console.log('Debugging auth utility...');
  
  // Test 1: Try admin (should work)
  console.log('Test 1: Admin login');
  try {
    await loginAs(page, 'admin@traveloure.test', 'AdminPass123!');
    console.log('Admin login SUCCESS');
    console.log('URL after login:', page.url());
  } catch (error: any) {
    console.log('Admin login FAILED:', error.message);
  }
  
  // Go back to login page
  await page.goto('/login');
  await page.waitForTimeout(1000);
  
  // Test 2: Try NYC expert
  console.log('\nTest 2: NYC expert login');
  try {
    await loginAs(page, 'nyc-art@traveloure.test', 'TestPass123!');
    console.log('NYC expert login SUCCESS');
    console.log('URL after login:', page.url());
  } catch (error: any) {
    console.log('NYC expert login FAILED:', error.message);
  }
  
  // Test 3: Check if we can access dashboard
  console.log('\nTest 3: Dashboard access');
  await page.goto('/dashboard');
  console.log('Dashboard URL:', page.url());
  
  if (!page.url().includes('/login')) {
    console.log('SUCCESS: Can access dashboard');
    
    // Check user info
    await page.goto('/api/auth/user');
    const userText = await page.textContent('body');
    console.log('User info:', userText?.substring(0, 200));
  } else {
    console.log('FAILED: Redirected to login');
  }
});