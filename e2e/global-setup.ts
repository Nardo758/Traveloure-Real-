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
  fs.mkdirSync(AUTH_DIR, { recursive: true });

  for (const role of ROLES) {
    const browser = await chromium.launch();
    const context = await browser.newContext({ baseURL });
    const page = await context.newPage();

    // ── SWAP #3: login + the authed-confirmation ────────────────────────────────────
    // This app has NO `/login` page — auth is the SignInModal dialog, which POSTs
    //   POST /api/auth/login  { email, password }
    // and gets back a passport session cookie (see client/src/components/SignInModal.tsx
    // + server/replit_integrations/auth/emailAuth.ts). We call that endpoint from the
    // browser context so the cookie lands in the same jar storageState persists — the
    // robust headless equivalent of fill-email / fill-password / click-submit.
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
    // To drive the real UI instead, open the SignInModal and use its testids:
    //   [data-testid="input-email"], [data-testid="input-password"], [data-testid="button-auth-submit"]
    // ──────────────────────────────────────────────────────────────────────────────

    await context.storageState({ path: path.join(AUTH_DIR, `${role}.json`) });
    await browser.close();
    console.log(`✓ auth saved: ${role} (${ACCOUNTS[role].email})`);
  }
}
