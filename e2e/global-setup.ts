import fs from 'node:fs';
import path from 'node:path';
import { request, type FullConfig } from '@playwright/test';
import { accounts, allRoles } from './fixtures/accounts';

/**
 * SWAP #3 — logs in each role once and persists its session to
 * e2e/auth/<role>.json (gitignored), consumed by specs via authFile(role).
 *
 * Why API login (not the modal UI): in this app "login" is the SignInModal
 * dialog — there is NO `/login` page route. The modal POSTs
 *   POST /api/auth/login   { email, password }
 * which establishes a passport session cookie (verified in
 * client/src/components/SignInModal.tsx + server .../auth/emailAuth.ts).
 * Hitting that endpoint directly and saving the cookie jar is the robust,
 * headless-friendly equivalent of "fill email/password/submit", and the
 * authed-confirmation check is the 200 + /api/auth/user round-trip below.
 *
 * If you ever need true UI login instead, drive the modal with:
 *   [data-testid="input-email"], [data-testid="input-password"],
 *   [data-testid="button-auth-submit"]  (dialog: [data-testid="modal-sign-in"]).
 */
export default async function globalSetup(config: FullConfig) {
  const baseURL =
    config.projects[0]?.use?.baseURL ||
    process.env.E2E_BASE_URL ||
    'http://localhost:5000';

  const authDir = path.join(process.cwd(), 'e2e', 'auth');
  fs.mkdirSync(authDir, { recursive: true });

  const failures: string[] = [];

  for (const role of allRoles) {
    const account = accounts[role];
    const ctx = await request.newContext({ baseURL });

    try {
      const res = await ctx.post('/api/auth/login', {
        data: { email: account.email, password: account.password },
      });

      if (!res.ok()) {
        const body = await res.text().catch(() => '');
        failures.push(
          `  - ${role} (${account.email}): login ${res.status()} ${res.statusText()} ${body.slice(0, 200)}`,
        );
        await ctx.dispose();
        continue;
      }

      // Authed-confirmation check: the session cookie should now resolve a user.
      const me = await ctx.get('/api/auth/user');
      if (!me.ok()) {
        failures.push(
          `  - ${role} (${account.email}): /api/auth/user ${me.status()} after login`,
        );
        await ctx.dispose();
        continue;
      }

      await ctx.storageState({ path: path.join(authDir, `${role}.json`) });
      // eslint-disable-next-line no-console
      console.log(`[e2e auth] ${role} → ${account.email} ✓`);
    } catch (err: any) {
      failures.push(`  - ${role} (${account.email}): ${err?.message ?? err}`);
    } finally {
      await ctx.dispose();
    }
  }

  if (failures.length) {
    throw new Error(
      `\n[e2e global-setup] ${failures.length}/${allRoles.length} role logins failed against ${baseURL}:\n` +
        failures.join('\n') +
        `\n\nChecklist:\n` +
        `  • E2E_BASE_URL points at a reachable deploy\n` +
        `  • E2E_TEST_PASSWORD matches the seed (default TestPass123!)\n` +
        `  • the per-role E2E_*_EMAIL accounts exist & are seeded with passwords\n`,
    );
  }
}
