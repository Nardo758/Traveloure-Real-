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
 *   playwright/.auth/ea.json       — executive_assistant role
 *
 * Failure policy:
 *   CI (process.env.CI === 'true'): any login failure OR unreachable server
 *   throws immediately — the gate cannot silently pass with guest sessions
 *   masquerading as authenticated ones.
 *
 *   Local dev: if the server is unreachable, writes empty auth states so the
 *   unauthenticated navbar/footer gates continue to work without a running
 *   server. If the server IS reachable but a login fails, throws regardless
 *   (the developer needs to know their seed is missing or wrong).
 */

import { chromium, type FullConfig } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5000';
const IS_CI = process.env.CI === 'true';

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
  {
    email: 'ci-ea@traveloure.test',
    password: 'CITestEA!99',
    authFile: 'playwright/.auth/ea.json',
    label: 'ea',
  },
];

function writeEmptyState(filePath: string) {
  try {
    fs.writeFileSync(filePath, EMPTY_STATE, 'utf-8');
  } catch {
    // Best-effort — non-fatal
  }
}

async function globalSetup(_config: FullConfig) {
  const authDir = path.resolve(process.cwd(), 'playwright/.auth');
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  // Pre-flight: check if the server is reachable.
  let serverReady = false;
  try {
    const ping = await fetch(`${BASE_URL}/api/ready`, {
      signal: AbortSignal.timeout(5_000),
    });
    serverReady = ping.ok;
  } catch {
    // fetch threw — server not reachable
  }

  if (!serverReady) {
    const msg =
      `[global-setup] Server at ${BASE_URL} is not reachable or not ready. ` +
      'Cannot obtain authenticated sessions.';

    if (IS_CI) {
      throw new Error(
        `${msg}\n` +
          'Ensure the server is started and /api/ready returns { ready: true } ' +
          'before running Playwright in CI.',
      );
    }

    // In local dev it's common to run `npx playwright test navbar-links`
    // without a running server — degrade gracefully so those tests still work.
    console.warn(
      `${msg}\n` +
        'Writing empty auth states — auth-gated routes will redirect as ' +
        'unauthenticated. Start the dev server to test authenticated routes.',
    );
    for (const user of CI_USERS) writeEmptyState(user.authFile);

    return;
  }

  // Server is up — log in as each CI user and persist their session cookies.
  const browser = await chromium.launch();
  try {
    for (const user of CI_USERS) {
      const context = await browser.newContext();
      try {
        const response = await context.request.post(`${BASE_URL}/api/auth/login`, {
          data: { email: user.email, password: user.password },
          headers: { 'Content-Type': 'application/json' },
        });

        if (!response.ok()) {
          const body = await response.text().catch(() => '<unreadable>');
          throw new Error(
            `[global-setup] Login failed for ${user.email} (${user.label}): ` +
              `HTTP ${response.status()} — ${body}.\n` +
              `Run scripts/seed-ci-test-users.ts against the target database first.`,
          );
        }

        await context.storageState({ path: user.authFile });
        console.log(
          `[global-setup] Auth state saved for ${user.email} (${user.label}) → ${user.authFile}`,
        );
      } finally {
        await context.close().catch(() => {});
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }
}

export default globalSetup;
