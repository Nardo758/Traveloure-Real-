/**
 * accounts.ts — account creation/login through the real UI (R-1).
 *
 * Every account used by the supply specs is created via /signup, never a
 * direct DB insert. A DB-seeded account is only ever used as a documented
 * fallback, and using it MUST be logged as a finding by the caller.
 */
import type { Page } from '@playwright/test';
import { E2E_PASSWORD } from './run-id';

export type NewAccount = {
  email: string;
  password?: string;
  firstName?: string;
  lastName?: string;
};

/** POST /signup via the real form (Signup.tsx: input-name, input-email, input-password, button-create-account). */
export async function signupViaUi(page: Page, acc: NewAccount): Promise<void> {
  const password = acc.password ?? E2E_PASSWORD;
  const fullName = `${acc.firstName ?? 'E2E'} ${acc.lastName ?? 'Runner'}`.trim();
  await page.goto('/signup');
  await page.locator('[data-testid="input-name"]').fill(fullName);
  await page.locator('[data-testid="input-email"]').fill(acc.email);
  await page.locator('[data-testid="input-password"]').fill(password);
  // The account exists only if the register request says so (ledger
  // `2026-09-27-e2e-helpers-confirm-effect`): wait for it, then confirm the session is this account.
  const registered = page
    .waitForResponse((r) => new URL(r.url()).pathname === '/api/auth/register' && r.request().method() === 'POST', { timeout: 20_000 })
    .then((r) => r.status())
    .catch(() => null);
  await page.locator('[data-testid="button-create-account"]').click();
  const status = await registered;
  if (status === null || status < 200 || status >= 300) {
    throw new Error(`signupViaUi(${acc.email}): ${status === null ? 'the signup form never sent POST /api/auth/register' : `POST /api/auth/register answered ${status}`}`);
  }
  // Give the app time to redirect/settle post-signup (varies by role/onboarding gate).
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  const me = await page.request.get('/api/auth/user');
  const who = me.ok() ? ((await me.json().catch(() => null)) as { email?: string } | null) : null;
  if (!who || String(who.email ?? '').toLowerCase() !== acc.email.toLowerCase()) {
    throw new Error(`signupViaUi(${acc.email}): registered, but GET /api/auth/user answered ${me.status()}${who?.email ? ` as ${who.email}` : ''}`);
  }
  // HARNESS WORKAROUND, not a product fix: Signup.tsx's onSuccess routes to a
  // protected page (/dashboard) before the auth query has re-resolved, so
  // ProtectedRoute's guard fires once, stores sessionStorage
  // "traveloure_return_to"="/dashboard" and bounces to "/". AuthReturnToRestorer
  // (client/src/App.tsx) then replays that stored path on the NEXT full
  // navigation this session makes — hijacking our very next page.goto (e.g. to
  // /become-provider) back to /dashboard. Clearing it here keeps the harness
  // deterministic; the underlying race is filed as a finding by the caller.
  await page.evaluate(() => sessionStorage.removeItem('traveloure_return_to')).catch(() => {});
}

/**
 * GET /login → SignInModal in login mode (input-email, input-password, button-auth-submit).
 *
 * SILENT-LOGIN RACE (ledger `2026-09-27-s1-login-must-land`, the R159 class): this used to click
 * submit and move on without checking that anything happened. On run 36335493993 S1 providerC's
 * mid-run provider re-login (after the admin step) sent NO `POST /api/auth/login` at all — the click
 * landed before the modal's submit handler was live — so the test carried on signed out, the edit
 * route bounced to the landing page, and the failure surfaced two steps later as "could not re-enter
 * the wizard". Now the login request is awaited (registered BEFORE the click); if the click produced
 * no request, the form is submitted once more; and the session is CONFIRMED (`GET /api/auth/user`
 * answers 200 as this email) before returning. A login that does not land throws HERE, naming the
 * login, instead of being discovered later as an unrelated step. Nothing is skipped and no assertion
 * is weakened: a wrong password still fails, now loudly and at the right place.
 */
export async function loginViaUi(page: Page, email: string, password: string = E2E_PASSWORD): Promise<void> {
  // LoginRoute (client/src/App.tsx) immediately navigates an already-authenticated
  // session away from /login (it never renders the sign-in form for one), so a
  // role switch mid-run (provider -> admin -> provider) must log out first.
  await page.request.post('/api/auth/logout').catch(() => {});
  await page.goto('/login');
  const isLogin = (r: { url(): string; request(): { method(): string } }) =>
    /\/api\/auth\/login$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST';
  let status: number | null = null;
  for (let attempt = 1; attempt <= 2 && status === null; attempt++) {
    await page.locator('[data-testid="input-email"]').fill(email);
    await page.locator('[data-testid="input-password"]').fill(password);
    const answered = page.waitForResponse(isLogin, { timeout: 10_000 }).then((r) => r.status()).catch(() => null);
    await page.locator('[data-testid="button-auth-submit"]').click();
    status = await answered;
  }
  if (status !== 200) {
    throw new Error(`loginViaUi(${email}): ${status === null ? 'the sign-in form never sent POST /api/auth/login' : `POST /api/auth/login answered ${status}`}`);
  }
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  const me = await page.request.get('/api/auth/user');
  const who = me.ok() ? ((await me.json().catch(() => null)) as { email?: string } | null) : null;
  if (!who || String(who.email ?? '').toLowerCase() !== email.toLowerCase()) {
    throw new Error(`loginViaUi(${email}): signed in, but GET /api/auth/user answered ${me.status()}${who?.email ? ` as ${who.email}` : ''}`);
  }
  // Same harness workaround as signupViaUi (see its comment) — clear any stale
  // return-to before the caller's next page.goto.
  await page.evaluate(() => sessionStorage.removeItem('traveloure_return_to')).catch(() => {});
}

export async function logoutViaApi(page: Page): Promise<void> {
  await page.request.post('/api/auth/logout').catch(() => {});
}
