// e2e/global-setup.ts
// Runs ONCE before the suite. Logs in each role and saves its session to e2e/auth/<role>.json.
// Specs then reuse those sessions via test.use({ storageState }) — no re-login per test.

import { chromium, type FullConfig } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { ROLES, ACCOUNTS, PASSWORD } from './fixtures/accounts';

const AUTH_DIR = path.join(process.cwd(), 'e2e', 'auth');

export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use?.baseURL ?? process.env.E2E_BASE_URL;
  if (!baseURL) throw new Error('E2E_BASE_URL not set and no baseURL in config');
  // The session cookie is Secure — over http it is dropped, so login would 200
  // but /api/auth/user would 401, misreading as bad credentials. Catch the real
  // cause up front.
  if (!baseURL.startsWith('https://')) {
    throw new Error('E2E_BASE_URL must be HTTPS — the session cookie is Secure and is dropped over http');
  }
  fs.mkdirSync(AUTH_DIR, { recursive: true });

  for (const role of ROLES) {
    const browser = await chromium.launch();
    const context = await browser.newContext({ baseURL });
    const page = await context.newPage();

    // Login via POST /api/auth/login so the session cookie lands in the
    // browser context jar and gets persisted by storageState.
    const login = await page.request.post('/api/auth/login', {
      data: { email: ACCOUNTS[role].email, password: PASSWORD },
    });
    if (!login.ok()) {
      throw new Error(
        `login failed for ${role} (${ACCOUNTS[role].email}): ${login.status()} ${login.statusText()} ` +
          `${(await login.text().catch(() => '')).slice(0, 200)}\n` +
          `Check: E2E_BASE_URL reachable · E2E_TEST_PASSWORD matches seed · account exists & has a password.`,
      );
    }
    // Authed-confirmation: the session cookie must now resolve a user.
    const me = await page.request.get('/api/auth/user');
    if (!me.ok()) {
      throw new Error(`authed-confirmation failed for ${role}: /api/auth/user returned ${me.status()}`);
    }

    await context.storageState({ path: path.join(AUTH_DIR, `${role}.json`) });
    await browser.close();
    console.log(`✓ auth saved: ${role} (${ACCOUNTS[role].email})`);
  }
}
