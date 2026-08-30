import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.e2e' });

// ─────────────────────────────────────────────────────────────────────────────
// PRODUCTION PUBLIC SMOKE — UNAUTHENTICATED ONLY.
//
// Deliberately has NO globalSetup. That is the whole point of this config:
// playwright.e2e.config.ts runs e2e/global-setup.ts, which logs in the seeded
// @traveloure.test accounts — impossible against production, which purges them
// on every boot (PR #319 P0 fix, enforced by scripts/check-env-allowlist.cjs).
// The old deploy smoke therefore died in global-setup with a 401 before a single
// test ran, on every PR, for weeks.
//
// Auth-dependent smoke lives in playwright.e2e.config.ts and targets STAGING
// (E2E_STAGING_BASE_URL). See docs/STAGING.md.
//
// DO NOT add globalSetup here. DO NOT add a spec to testMatch that logs in.
// ─────────────────────────────────────────────────────────────────────────────

const baseURL = process.env.E2E_BASE_URL;
if (!baseURL) {
  throw new Error(
    'E2E_BASE_URL is required for the public smoke — set it to the HTTPS production ' +
      'deploy URL (.env.e2e locally, or the CI secret). No localhost fallback.',
  );
}

export default defineConfig({
  testDir: './e2e/specs',
  // Exactly one spec file. Everything else in e2e/specs is auth-dependent and
  // belongs to the staging harness.
  testMatch: /public-smoke\.spec\.ts$/,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // Belt-and-braces: no stored credentials in this harness.
    storageState: { cookies: [], origins: [] },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
