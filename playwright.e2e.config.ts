import { defineConfig, devices } from '@playwright/test';

/**
 * E2E harness config — runs from the Claude Code CLI on your PC against the
 * deployed Replit URL (see e2e/README.md). Kept separate from the repo's
 * existing local-dev `playwright.config.ts` (which targets ./playwright/tests
 * on localhost:5000) so the two harnesses don't collide.
 *
 * Run:  npx playwright test -c playwright.e2e.config.ts
 */

// Optional: load .env.e2e if dotenv is installed (`npm i -D dotenv`).
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const dotenv = await import('dotenv');
  dotenv.config({ path: '.env.e2e' });
} catch {
  // dotenv not installed — rely on the ambient environment.
}

const baseURL = process.env.E2E_BASE_URL || 'http://localhost:5000';

export default defineConfig({
  testDir: './e2e/specs',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html', { open: 'never' }], ['list']],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 5'] },
    },
  ],
});
