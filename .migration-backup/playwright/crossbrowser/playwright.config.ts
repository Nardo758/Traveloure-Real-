import { defineConfig, devices } from '@playwright/test';

/**
 * WebKit (Safari-engine) cross-browser smoke config.
 *
 * Runs ONLY the playwright/crossbrowser/smoke.spec.ts suite against a
 * webkit-desktop project (equivalent to Safari on macOS).
 *
 * Launch via:  bash scripts/webkit-smoke.sh
 * The shell wrapper sets the required NixOS environment (LD_LIBRARY_PATH,
 * GIO_EXTRA_MODULES, GST stubs) before running:
 *   npx playwright test --config playwright/crossbrowser/playwright.config.ts
 *
 * The app must already be serving on port 5000 (Start application workflow).
 */
export default defineConfig({
  testDir: './',
  passWithNoTests: false,
  fullyParallel: false,   // run serially — one browser, one worker
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-webkit' }]],

  use: {
    baseURL: process.env.BASE_URL || 'http://127.0.0.1:5000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // Generous timeouts — WebKit on NixOS can be slower than Chromium
    actionTimeout: 30_000,
    navigationTimeout: 45_000,
  },

  projects: [
    {
      name: 'webkit-desktop',
      use: {
        ...devices['Desktop Safari'],
        viewport: { width: 1280, height: 900 },
      },
    },
  ],
});
