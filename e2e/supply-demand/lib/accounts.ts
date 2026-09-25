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
  await page.locator('[data-testid="button-create-account"]').click();
  // Give the app time to redirect/settle post-signup (varies by role/onboarding gate).
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
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

/** GET /login → SignInModal in login mode (input-email, input-password, button-auth-submit). */
export async function loginViaUi(page: Page, email: string, password: string = E2E_PASSWORD): Promise<void> {
  // LoginRoute (client/src/App.tsx) immediately navigates an already-authenticated
  // session away from /login (it never renders the sign-in form for one), so a
  // role switch mid-run (provider -> admin -> provider) must log out first.
  await page.request.post('/api/auth/logout').catch(() => {});
  await page.goto('/login');
  await page.locator('[data-testid="input-email"]').fill(email);
  await page.locator('[data-testid="input-password"]').fill(password);
  await page.locator('[data-testid="button-auth-submit"]').click();
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  // Same harness workaround as signupViaUi (see its comment) — clear any stale
  // return-to before the caller's next page.goto.
  await page.evaluate(() => sessionStorage.removeItem('traveloure_return_to')).catch(() => {});
}

export async function logoutViaApi(page: Page): Promise<void> {
  await page.request.post('/api/auth/logout').catch(() => {});
}
