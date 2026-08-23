/**
 * playwright/tier4/playwright.config.ts
 *
 * Tier 4 audit harness — isolated config.
 * Runs: chromium, firefox, webkit desktop projects (serial workers).
 * Output: test-results/tier4/
 * Evidence: docs/audits/tier4-evidence/
 *
 * Run: npx playwright test --config playwright/tier4/playwright.config.ts
 */

import { defineConfig, devices } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const _filename = fileURLToPath(import.meta.url);
const _dirname = path.dirname(_filename);

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:5000';

export default defineConfig({
  testDir: _dirname,
  testMatch: ['**/*.spec.ts'],
  outputDir: path.resolve(_dirname, '../../test-results/tier4'),
  // The browser booking path includes real Stripe test-mode network calls and
  // confirmation polling. Keep this above every per-step timeout so the runner
  // cannot cancel evidence capture while a bounded wait is still in progress.
  timeout: 300_000,
  passWithNoTests: false,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1, // serial workers as required

  reporter: [
    ['list'],
    [
      'html',
      {
        open: 'never',
        outputFolder: path.resolve(_dirname, '../../test-results/tier4-report'),
      },
    ],
  ],

  use: {
    baseURL: BASE_URL,
    trace: 'on',
    screenshot: 'on',
    video: 'retain-on-failure',
    actionTimeout: 30_000,
    navigationTimeout: 45_000,
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 900 },
      },
    },
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        viewport: { width: 1280, height: 900 },
      },
    },
    {
      name: 'webkit',
      use: {
        ...devices['Desktop Safari'],
        viewport: { width: 1280, height: 900 },
      },
    },
  ],
});
