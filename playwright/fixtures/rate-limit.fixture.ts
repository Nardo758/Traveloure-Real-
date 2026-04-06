// Test fixture for rate limit bypass

import { test as baseTest } from '@playwright/test';

// Base URL from environment or default
const baseURL = process.env.BASE_URL || 'http://localhost:5000';
const testToken = 'traveloure-test-jngqrqm41penm5xcqd6gfr';

// Extract hostname from URL
function getHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return 'localhost';
  }
}

const targetHostname = getHostname(baseURL);

export const test = baseTest.extend({
  page: async ({ browser }, use) => {
    // Create a context with request interception
    const context = await browser.newContext();
    
    // Add request interceptor
    await context.route('**/*', async (route, request) => {
      const url = request.url();
      
      // Check if this is a request to our target domain
      try {
        const requestUrl = new URL(url);
        const isOurDomain = 
          requestUrl.hostname === targetHostname ||
          requestUrl.hostname.includes('replit.dev') ||
          requestUrl.hostname.includes('traveloure.replit.app');
        
        if (isOurDomain) {
          // Add rate limit bypass header to our domain
          const headers = request.headers();
          headers['x-test-token'] = testToken;
          await route.continue({ headers });
        } else {
          // For external domains, don't add the header
          await route.continue();
        }
      } catch {
        // If URL parsing fails, continue without modification
        await route.continue();
      }
    });
    
    const page = await context.newPage();
    await use(page);
    await context.close();
  },
});

export { expect } from '@playwright/test';