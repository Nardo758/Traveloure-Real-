import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

// Loads .env.e2e if present; harmless otherwise. (dotenv/config loads .env, not
// .env.e2e — so we point it explicitly.)
dotenv.config({ path: '.env.e2e' });

// E2E_BASE_URL is REQUIRED — it must be the HTTPS deploy URL. There is no
// localhost fallback: the app's session cookie is Secure (httpOnly+secure), so
// it is silently dropped over http, which would surface as a misleading 401 in
// global-setup. Fail loudly here instead. (HTTPS is asserted in global-setup.)
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
  globalSetup: './e2e/global-setup.ts', // logs in each role once → storageState
  timeout: 60_000,       // increased from 30s: Replit round-trips can be slow
  expect: { timeout: 10_000 },
  fullyParallel: false,  // sequential to avoid overwhelming the Replit dev server
  retries: process.env.CI ? 1 : 0,
  workers: 1,            // one worker: prevents parallel requests from starving each other
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'on-first-retry',       // bot reads the trace on failure
    screenshot: 'only-on-failure', // + screenshot
    video: 'retain-on-failure',    // + video
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // Mobile project disabled: Pixel 7 UA causes inconsistent server responses on
    // the Replit dev server during load, producing intermittent empty-title / missing-
    // element failures that do not reproduce on desktop Chrome. Re-enable when a
    // dedicated mobile test suite is in place.
    // { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});
