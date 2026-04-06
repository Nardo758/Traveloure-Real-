import { Page } from '@playwright/test';

/**
 * Login to the platform with email and password
 * Correct selectors: #email, #password, data-testid="button-sign-in-submit"
 * Handles /accept-terms page with checkboxes
 */
export async function loginAs(page: Page, email: string, password: string) {
  console.log(`Logging in as ${email}`);
  
  // Go to login page
  await page.goto('/login');
  await page.waitForLoadState('networkidle');
  
  // Fill email and password with correct selectors
  await page.fill('#email', email);
  await page.fill('#password', password);
  
  // Click submit with correct selector
  await page.click('[data-testid="button-sign-in-submit"]');
  await page.waitForLoadState('networkidle');
  
  // Check if we're on accept-terms page
  if (page.url().includes('/accept-terms')) {
    console.log('On accept-terms page, accepting terms...');
    
    // Wait for checkboxes to be visible
    await page.waitForSelector('[data-testid="checkbox-accept-terms"]', { timeout: 5000 });
    await page.waitForSelector('[data-testid="checkbox-accept-privacy"]', { timeout: 5000 });
    
    // Click checkboxes
    await page.click('[data-testid="checkbox-accept-terms"]');
    await page.click('[data-testid="checkbox-accept-privacy"]');
    
    // Wait for button to be enabled and click
    await page.waitForSelector('[data-testid="button-accept-continue"]:not([disabled])', { timeout: 5000 });
    await page.click('[data-testid="button-accept-continue"]');
    
    // Wait for navigation away from /accept-terms
    await page.waitForLoadState('networkidle');
    
    // Should be redirected away from /accept-terms
    if (page.url().includes('/accept-terms')) {
      throw new Error('Still on accept-terms page after accepting terms');
    }
  }
  
  console.log('Login successful, current URL:', page.url());
}

/**
 * Accept terms via API (faster for test setup)
 */
export async function acceptTermsViaApi(page: Page) {
  console.log('Accepting terms via API...');
  
  const response = await page.evaluate(async () => {
    const response = await fetch('/api/auth/accept-terms', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-test-token': process.env.RATE_LIMIT_BYPASS_KEY || ''
      },
      body: JSON.stringify({ acceptTerms: true, acceptPrivacy: true }),
      credentials: 'include'
    });
    
    if (!response.ok) {
      throw new Error(`Failed to accept terms: ${response.status}`);
    }
    
    return response.json();
  });
  
  console.log('Terms accepted via API:', response);
  return response;
}

/**
 * Logout from the platform
 */
export async function logout(page: Page) {
  await page.goto('/api/logout');
  await page.waitForLoadState('networkidle');
}

/**
 * Check if user is logged in
 */
export async function isLoggedIn(page: Page): Promise<boolean> {
  try {
    const response = await page.evaluate(async () => {
      const response = await fetch('/api/auth/user', {
        credentials: 'include'
      });
      return response.status;
    });
    
    return response === 200;
  } catch {
    return false;
  }
}