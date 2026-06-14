import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

// Loads .env.e2e if present; harmless otherwise.
dotenv.config({ path: '.env.e2e' });

// E2E_BASE_URL is REQUIRED — it must be the HTTPS deploy URL. There is no
// localhost fallback: the app's session cookie is Secure (httpOnly+secure), so
// it is silently dropped over http, which would surface as a misleading 401 in
// global-setup. Fail loudly here instead.
const baseURL = process.env.E2E_BASE_URL;
if (!baseURL) {
  throw new Error(
    'E2E_BASE_URL is required — set it to your HTTPS deploy URL ' +
      '(e.g. in .env.e2e or the CI secret). No localhost fallback: the session ' +
      'cookie is Secure and only works over https.',
  );
}

// NOTE: filename is playwright.e2e.config.ts (not playwright.config.ts) on purpose
// — the repo already has a root playwright.config.ts for the local-dev harness
// (./playwright/tests). Run this one with:  -c playwright.e2e.config.ts
export default defineConfig({
  testDir: './e2e/specs',
  globalSetup: './e2e/global-setup.ts',
  timeout: 30_000,
  expect: { timeout: 7_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});
