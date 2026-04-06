// Batch 2: Single user flow tests
import { test, expect } from '@playwright/test';
import { loginAs } from '../utils/auth';

test('Expert flow - NYC Art Expert', async ({ page }) => {
  console.log('Testing expert flow...');
  
  // Login as NYC art expert
  await loginAs(page, 'nyc-art@traveloure.test', 'TestPass123!');
  
  // Should be on dashboard (or accept-terms then dashboard)
  expect(page.url()).toContain('/dashboard');
  console.log('Expert logged in successfully');
  
  // Try to access expert dashboard
  await page.goto('/expert/dashboard');
  
  // Should be able to access expert dashboard (not redirected to login)
  expect(page.url()).toContain('/expert/dashboard');
  console.log('Can access expert dashboard');
});

test('Provider flow - NYC Transport Provider', async ({ page }) => {
  console.log('Testing provider flow...');
  
  // Login as NYC transport provider
  await loginAs(page, 'nyc-transport@traveloure.test', 'TestPass123!');
  
  // Should be on dashboard
  expect(page.url()).toContain('/dashboard');
  console.log('Provider logged in successfully');
  
  // Try to access provider dashboard
  await page.goto('/provider/dashboard');
  
  // Should be able to access provider dashboard
  expect(page.url()).toContain('/provider/dashboard');
  console.log('Can access provider dashboard');
});

test('Traveler flow - NYC Traveler', async ({ page }) => {
  console.log('Testing traveler flow...');
  
  // Login as NYC traveler
  await loginAs(page, 'test-traveler-nyc@traveloure.test', 'TestPass123!');
  
  // Should be on dashboard
  expect(page.url()).toContain('/dashboard');
  console.log('Traveler logged in successfully');
  
  // Traveler should stay on regular dashboard
  expect(page.url()).toContain('/dashboard');
  console.log('Traveler on regular dashboard');
});