/**
 * playwright.local.config.ts
 *
 * Playwright config for specs that run against a locally-built server on
 * http://localhost:5000 (used by selection-controls-gate e2e-journey-2 job and
 * any dev-local run of ./e2e/specs).
 *
 * Key differences from playwright.e2e.config.ts:
 *  - Reads BASE_URL (not E2E_BASE_URL) — http://localhost is fine.
 *  - global-setup uses the same ./e2e/global-setup.ts but NODE_ENV=development
 *    skips the Secure-cookie / HTTPS guard (fixed in Task #638).
 *  - testDir points at ./e2e/specs — where journey-2, selection-controls live.
 */
import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.BASE_URL || 'http://localhost:5000';

export default defineConfig({
  testDir: './e2e/specs',
  globalSetup: './e2e/global-setup.ts',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'on',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {},
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
