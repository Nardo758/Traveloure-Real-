import { test, expect } from '@playwright/test';

// Simple test that manually handles everything
test('Final debug test', async ({ page }) => {
  console.log('Starting final debug test...');
  
  // Go to login page
  await page.goto('/login');
  console.log('On login page');
  
  // Fill credentials
  await page.fill('#email', 'nyc-art@traveloure.test');
  await page.fill('#password', 'TestPass123!');
  
  // Before submitting, let's add the rate limit bypass header via fetch interception
  await page.route('**/api/**', async (route, request) => {
    const headers = request.headers();
    headers['x-test-token'] = 'traveloure-test-jngqrqm41penm5xcqd6gfr';
    await route.continue({ headers });
  });
  
  console.log('Clicking submit...');
  await page.click('[data-testid="button-sign-in-submit"]');
  
  // Wait for navigation
  try {
    await page.waitForNavigation({ timeout: 15000 });
    console.log('Navigation occurred');
  } catch {
    console.log('No navigation, checking current state...');
  }
  
  console.log('Current URL:', page.url());
  
  // Check if we're on accept-terms page
  if (page.url().includes('/accept-terms')) {
    console.log('On accept-terms page');
    
    // Try to accept terms via API
    console.log('Accepting terms via API...');
    await page.evaluate(async () => {
      try {
        const response = await fetch('/api/auth/accept-terms', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'x-test-token': 'traveloure-test-jngqrqm41penm5xcqd6gfr'
          },
          body: JSON.stringify({ acceptTerms: true, acceptPrivacy: true }),
          credentials: 'include'
        });
        return await response.json();
      } catch (error) {
        return { error: error.message };
      }
    });
    
    // Now go to dashboard
    await page.goto('/dashboard');
    console.log('Navigated to dashboard');
  }
  
  console.log('Final URL:', page.url());
  await page.screenshot({ path: 'final-debug.png' });
  
  // Check if we're logged in
  try {
    const userResponse = await page.evaluate(async () => {
      const response = await fetch('/api/auth/user', {
        headers: { 'x-test-token': 'traveloure-test-jngqrqm41penm5xcqd6gfr' },
        credentials: 'include'
      });
      return await response.json();
    });
    console.log('User API response:', JSON.stringify(userResponse));
  } catch (error) {
    console.log('Failed to fetch user:', error);
  }
});