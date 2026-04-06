import { Page } from '@playwright/test';

export async function loginAs(page: Page, email: string, password: string) {
  console.log(`Logging in as ${email}`);
  
  await page.goto('/login');
  await page.waitForLoadState('networkidle');
  
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.click('[data-testid="button-sign-in-submit"]');
  
  // Wait for navigation away from /login
  await page.waitForURL((url) => !url.toString().includes('/login'), { timeout: 15000 });
  await page.waitForLoadState('networkidle');
  
  if (page.url().includes('/accept-terms')) {
    console.log('On accept-terms page, accepting terms...');
    
    await page.waitForSelector('[data-testid="checkbox-accept-terms"]', { timeout: 5000 });
    await page.waitForSelector('[data-testid="checkbox-accept-privacy"]', { timeout: 5000 });
    
    await page.click('[data-testid="checkbox-accept-terms"]');
    await page.click('[data-testid="checkbox-accept-privacy"]');
    
    await page.waitForSelector('[data-testid="button-accept-continue"]:not([disabled])', { timeout: 5000 });
    await page.click('[data-testid="button-accept-continue"]');
    
    // Wait for navigation away from /accept-terms
    await page.waitForURL((url) => !url.toString().includes('/accept-terms'), { timeout: 10000 });
    await page.waitForLoadState('networkidle');
  }
  
  console.log('Login successful, current URL:', page.url());
  return page.url();
}

export async function logout(page: Page) {
  await page.goto('/api/logout');
  await page.waitForLoadState('networkidle');
}

export async function isLoggedIn(page: Page): Promise<boolean> {
  try {
    if (page.url().includes('/login')) return false;
    
    const response = await page.request.get('/api/auth/user');
    return response.status() === 200;
  } catch {
    return false;
  }
}

export async function acceptTermsViaApi(page: Page) {
  await page.request.post('/api/auth/accept-terms', {
    data: { acceptTerms: true, acceptPrivacy: true },
  });
}

export async function waitForAuth(page: Page, timeout = 15000) {
  await page.waitForURL((url) => !url.toString().includes('/login'), { timeout }).catch(() => null);
}