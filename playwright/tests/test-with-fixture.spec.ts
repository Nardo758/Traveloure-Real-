// Test using the rate limit bypass fixture
import { test, expect } from '@playwright/test';
import { loginAs } from '../utils/auth';

test('Test with rate limit bypass fixture', async ({ page }) => {
  console.log('Testing with rate limit bypass fixture...');
  
  const expertEmail = 'nyc-art@traveloure.test';
  
  console.log(`Logging in as ${expertEmail}`);
  
  try {
    await loginAs(page, expertEmail, 'TestPass123!');
    console.log('Login function completed');
    
    console.log('Current URL:', page.url());
    
    if (page.url().includes('/dashboard')) {
      console.log('SUCCESS: On dashboard');
    } else if (page.url().includes('/accept-terms')) {
      console.log('On accept-terms page, accepting terms...');
      
      // Try to accept terms via button click
      const acceptButton = page.locator('button:has-text("Accept")').first();
      if (await acceptButton.isVisible().catch(() => false)) {
        await acceptButton.click();
        await page.waitForLoadState('load');
        console.log('Terms accepted via button');
      } else {
        console.log('No accept button found');
      }
    }
    
    console.log('Final URL:', page.url());
    // await page.screenshot({ path: 'test-with-fixture.png' });
    
  } catch (error: any) {
    console.log('Test failed:', error.message);
    // await page.screenshot({ path: 'test-with-fixture-error.png' });
  }
});