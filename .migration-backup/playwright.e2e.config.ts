import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

// Loads .env.e2e if present; harmless otherwise. (dotenv/config loads .env, not
// .env.e2e — so we point it explicitly.)
dotenv.config({ path: '.env.e2e' });

// ─────────────────────────────────────────────────────────────────────────────
// AUTH-DEPENDENT HARNESS — targets STAGING, never production.
//
// globalSetup logs in the seeded @traveloure.test accounts. Production PURGES
// those accounts on every boot (PR #319 P0 fix, enforced by
// scripts/check-env-allowlist.cjs), so pointing this config at production
// guarantees a 401 in global-setup before any test runs — the failure that made
// e2e-deploy-smoke permanent noise. Auth smoke runs against a STAGING deploy
// provisioned with ALLOW_TEST_ACCOUNTS=1. See docs/STAGING.md.
//
// For an unauthenticated production smoke use playwright.e2e.public.config.ts.
//
// Resolution: E2E_STAGING_BASE_URL wins; E2E_BASE_URL is the legacy/local
// fallback (a local dev target set in .env.e2e). Both must be HTTPS — the
// session cookie is Secure (httpOnly+secure) and is silently dropped over http,
// which surfaces as a misleading 401. (HTTPS is asserted in global-setup.)
// ─────────────────────────────────────────────────────────────────────────────
const baseURL = process.env.E2E_STAGING_BASE_URL || process.env.E2E_BASE_URL;
if (!baseURL) {
  throw new Error(
    'No target for the auth-dependent E2E harness. Set E2E_STAGING_BASE_URL to the ' +
      'HTTPS staging deploy URL (the deploy provisioned so the seeded test accounts ' +
      'exist — see docs/STAGING.md), or E2E_BASE_URL for a local/legacy target. ' +
      'No localhost fallback: the session cookie is Secure and only works over https.',
  );
}

// NOTE: filename is playwright.e2e.config.ts (not playwright.config.ts) on purpose
// — the repo already has a root playwright.config.ts for the local-dev harness
// (./playwright/tests). Run this one with:  -c playwright.e2e.config.ts
export default defineConfig({
  testDir: './e2e/specs',
  globalSetup: './e2e/global-setup.ts', // logs in each role once → storageState
  // 300 s per test: Vite dev server on Replit takes up to 90 s to compile and
  // serve the JS bundle on the first cold request after wake-up, so any test
  // that waits for a React-rendered element (link-logo, expert cards, etc.)
  // needs at least 90 s headroom on top of the actual business logic.
  // 300 s = 5 min gives comfortable margin for two consecutive 90 s waits plus
  // network + API overhead without approaching the 90 min job timeout.
  timeout: 300_000,
  expect: { timeout: 15_000 },
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
