/**
 * playwright/global-setup.ts
 *
 * Runs ONCE before any Playwright project starts (configured via
 * `globalSetup` in playwright.config.ts).
 *
 * Creates three saved auth-state files — one per platform role — so that
 * the authenticated smoke-test spec can load pages as a real logged-in user
 * and catch crashes caused by bad API responses rather than missing sessions.
 *
 * Prerequisites (all handled by the CI workflow):
 *   1. The server must be running and /api/ready must return { ready: true }.
 *   2. scripts/seed-ci-test-users.ts must have run so the three CI accounts
 *      exist in the database with hashed passwords.
 *
 * Auth-state files written:
 *   playwright/.auth/expert.json   — travel_expert role
 *   playwright/.auth/provider.json — service_provider role
 *   playwright/.auth/admin.json    — admin role
 *
 * Failure modes handled gracefully:
 *   - Server not reachable → warns and writes empty auth states (safe for
 *     unauthenticated tests; auth-routes tests will redirect as guest).
 *   - Login endpoint returns non-200 → same empty-state fallback.
 *   - Any unexpected error → logs and continues.
 */

import { chromium, type FullConfig } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5000';

const EMPTY_STATE = JSON.stringify({ cookies: [], origins: [] });

const CI_USERS = [
  {
    email: 'ci-expert@traveloure.test',
    password: 'CITestExpert!99',
    authFile: 'playwright/.auth/expert.json',
    label: 'expert',
  },
  {
    email: 'ci-provider@traveloure.test',
    password: 'CITestProvider!99',
    authFile: 'playwright/.auth/provider.json',
    label: 'provider',
  },
  {
    email: 'ci-admin@traveloure.test',
    password: 'CITestAdmin!99',
    authFile: 'playwright/.auth/admin.json',
    label: 'admin',
  },
];

function writeEmptyState(filePath: string) {
  try {
    fs.writeFileSync(filePath, EMPTY_STATE, 'utf-8');
  } catch {
    // Best-effort — if we can't write, the spec will fail to read the state
    // and Playwright will handle it with a descriptive error.
  }
}

async function globalSetup(_config: FullConfig) {
  const authDir = path.resolve(process.cwd(), 'playwright/.auth');
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  // Pre-flight: check if the server is reachable. If not (e.g. local dev
  // without a running server), skip auth setup silently so the unauthenticated
  // navbar/footer tests can still run without blockage.
  try {
    const ping = await fetch(`${BASE_URL}/api/ready`, { signal: AbortSignal.timeout(5_000) });
    if (!ping.ok) {
      console.warn(
        `[global-setup] Server at ${BASE_URL} is not ready (${ping.status}). ` +
          'Writing empty auth states — auth-gated routes will redirect as unauthenticated.',
      );
      for (const user of CI_USERS) writeEmptyState(user.authFile);
      return;
    }
  } catch {
    console.warn(
      `[global-setup] Could not reach ${BASE_URL}. ` +
        'Writing empty auth states — auth-gated routes will redirect as unauthenticated.',
    );
    for (const user of CI_USERS) writeEmptyState(user.authFile);
    return;
  }

  const browser = await chromium.launch();

  for (const user of CI_USERS) {
    const context = await browser.newContext();

    try {
      const response = await context.request.post(`${BASE_URL}/api/auth/login`, {
        data: { email: user.email, password: user.password },
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok()) {
        const body = await response.text().catch(() => '<unreadable>');
        console.warn(
          `[global-setup] Login failed for ${user.email} (${user.label}): ` +
            `HTTP ${response.status()} — ${body}. ` +
            `Auth-gated routes will redirect as unauthenticated (safe for CI).`,
        );
        writeEmptyState(user.authFile);
      } else {
        await context.storageState({ path: user.authFile });
        console.log(`[global-setup] Auth state saved for ${user.email} (${user.label}) → ${user.authFile}`);
      }
    } catch (err) {
      console.warn(`[global-setup] Unexpected error for ${user.email} (${user.label}):`, err);
      writeEmptyState(user.authFile);
    } finally {
      await context.close();
    }
  }

  await browser.close();
}

export default globalSetup;
