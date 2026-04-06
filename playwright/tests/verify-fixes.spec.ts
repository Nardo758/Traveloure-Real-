// Test to verify all fixes are working
import { test, expect } from '@playwright/test';
import { loginAs, acceptTermsViaApi } from '../utils/auth';

test('Verify provider login with fixes', async ({ page }) => {
  console.log('Testing provider login with all fixes...');
  
  // Test 1: Login with correct selectors
  await loginAs(page, 'nyc-transport@traveloure.test', 'TestPass123!');
  console.log('Login successful, URL:', page.url());
  
  // Should be on dashboard or accept-terms
  expect(page.url()).toMatch(/\/(dashboard|accept-terms)/);
  
  // If on accept-terms, test acceptTermsViaApi
  if (page.url().includes('/accept-terms')) {
    console.log('Testing acceptTermsViaApi...');
    await acceptTermsViaApi(page);
    await page.waitForLoadState('networkidle');
    
    // Should be on dashboard now
    expect(page.url()).toContain('/dashboard');
    console.log('Terms accepted via API, on dashboard');
  }
  
  console.log('All fixes verified!');
});

test('Verify expert login with fixes', async ({ page }) => {
  console.log('Testing expert login with all fixes...');
  
  await loginAs(page, 'nyc-art@traveloure.test', 'TestPass123!');
  console.log('Expert login successful, URL:', page.url());
  
  // Should be on dashboard
  expect(page.url()).toContain('/dashboard');
  console.log('Expert on dashboard');
});