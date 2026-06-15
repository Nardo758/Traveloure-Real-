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
  // In production the session cookie is Secure — https is required.
  // In development (NODE_ENV !== 'production') Task #638 env-gated the Secure
  // flag, so http://localhost works for local CI runs.
  const isLocalHttp =
    process.env.NODE_ENV !== 'production' &&
    (baseURL.includes('localhost') || baseURL.includes('127.0.0.1'));
  if (!baseURL.startsWith('https://') && !isLocalHttp) {
    throw new Error(
      'E2E base URL must be HTTPS for production deployments — the session cookie is Secure and is dropped over http. ' +
        'For local CI runs set NODE_ENV=development and point BASE_URL at localhost.',
    );
  }
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

  // ── Vite dev-server warm-up ─────────────────────────────────────────────────
  // The Replit Vite dev server lazy-compiles each route chunk on first request.
  // On a cold start this takes 30-90 s per new route.  Without warming, the
  // first test that visits an uncompiled route eats most of its timeout budget
  // just waiting for Vite, leaving no room for the actual test assertions.
  //
  // We visit the key test routes once here (with a generous 120 s per route)
  // using the traveler session so link-logo renders.  Subsequent test pages
  // served from the same Vite process get the compiled bundle instantly.
  //
  // Failures here are non-fatal: a warning is logged and tests continue.  The
  // tests themselves still have their own 90 s element waits as fallback.
  console.log('⏳ Warming up Vite routes (may take up to 4 min)…');
  const warmBrowser = await chromium.launch();
  const warmCtx = await warmBrowser.newContext({
    baseURL,
    storageState: path.join(AUTH_DIR, 'traveler.json'),
  });
  const warmPage = await warmCtx.newPage();

  const warmRoutes: Array<{ url: string; selector: string; label: string }> = [
    { url: '/',              selector: '[data-testid="link-logo"]',      label: 'home'         },
    { url: '/discover',      selector: '[data-testid="link-logo"]',      label: 'discover'     },
    { url: '/local-experts', selector: '[data-testid="role-switcher"]',  label: 'local-experts'},
  ];

  for (const { url, selector, label } of warmRoutes) {
    try {
      await warmPage.goto(url, { waitUntil: 'domcontentloaded' });
      await warmPage.waitForSelector(selector, { timeout: 120_000 });
      console.log(`  ✓ warmed: ${label} (${url})`);
    } catch (err: any) {
      console.warn(`  ⚠ warm-up timeout for ${label} (non-fatal): ${String(err?.message ?? err).slice(0, 120)}`);
    }
  }

  await warmBrowser.close();
  console.log('✓ Vite warm-up complete');
}
