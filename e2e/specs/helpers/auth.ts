// e2e/helpers/auth.ts
// Programmatic login helper — mirrors global-setup.ts API-login pattern.
// Use this when a test needs to log in mid-flow (e.g. guest → sign-in).

import type { Page } from '@playwright/test';
import { ACCOUNTS, PASSWORD, type Role } from '../../fixtures/accounts';

export async function loginAsTestAccount(page: Page, role: Role) {
  const login = await page.request.post('/api/auth/login', {
    data: { email: ACCOUNTS[role].email, password: PASSWORD },
  });
  if (!login.ok()) {
    const text = (await login.text().catch(() => '')).slice(0, 200);
    throw new Error(
      `loginAsTestAccount failed for ${role} (${ACCOUNTS[role].email}): ` +
        `${login.status()} ${login.statusText()} ${text}`,
    );
  }
  // Confirm the session cookie resolves a user
  const me = await page.request.get('/api/auth/user');
  if (!me.ok()) {
    throw new Error(`authed-confirmation failed for ${role}: /api/auth/user returned ${me.status()}`);
  }
}
