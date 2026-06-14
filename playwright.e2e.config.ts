import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

// Loads .env.e2e if present; harmless otherwise. (dotenv/config loads .env, not
// .env.e2e — so we point it explicitly.)
dotenv.config({ path: '.env.e2e' });

// Point at your deployed Replit URL via env. Local dev server (port 5000 in this
// repo, see .env.example) is the fallback.
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:5000';

// NOTE: filename is playwright.e2e.config.ts (not playwright.config.ts) on purpose
// — the repo already has a root playwright.config.ts for the local-dev harness
// (./playwright/tests). Run this one with:  -c playwright.e2e.config.ts
export default defineConfig({
  testDir: './e2e/specs',
  globalSetup: './e2e/global-setup.ts', // logs in each role once → storageState
  timeout: 30_000,
  expect: { timeout: 7_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'on-first-retry',       // bot reads the trace on failure
    screenshot: 'only-on-failure', // + screenshot
    video: 'retain-on-failure',    // + video
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } }, // PlanCard + optimize gate are mobile-critical
  ],
});
