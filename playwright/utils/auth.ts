/**
 * playwright/utils/auth.ts — the ONE session helper for the browser-driven suites.
 *
 * WHY THIS FILE IS SHAPED LIKE THIS (punchlist V-31, ledger `2026-09-15-v31-loginas-verifies`).
 * The previous `loginAs` filled `/login`, clicked submit and waited only for the URL to stop
 * containing `/login`. It checked no cookie and read no `/api/auth/user`, so a login that never
 * happened RETURNED NORMALLY — and every call after it went on to describe the ANONYMOUS site while
 * reading as authorization coverage. Measured on `origin/main`@`42e5213ef`: **31 calls in the four
 * suites V-31 names** (seam-cross-console 18, phase-4-7-advanced-flows 7, phase-3-traveler-flows 5,
 * stripe-init-deferral 1 — the row's "29" and its "16" for seam-cross-console are both one grep
 * short) and **33 in six**, the other two being discover-bento-real-data and phase-1-expert-setup,
 * which V-31 does not name. `logout` had the mirror defect: it looked for a profile menu
 * and, not finding one, returned as though it had signed the browser out.
 *
 * WHAT THIS HELPER PROVES (and it throws — it never returns a failure):
 *   1. `POST /api/auth/login` answered 200 through the caller's OWN cookie jar;
 *   2. that jar now carries the `connect.sid` session cookie;
 *   3. `GET /api/auth/user` answers 200 through that same jar, and the user it names is the
 *      account the caller asked for (email-compared, case-insensitively).
 * Steps 2 and 3 are `assertAuthenticatedSession`, which is the ONE proof in this repo that a
 * session exists: `_persona-helpers.ts`'s same-named request-scoped helper is now a CALLER of
 * `loginAs` rather than a second implementation of it (§18 rule 1 — the two contracts of the same
 * name are exactly what let one of them assert nothing for as long as it did).
 *
 * WHAT IT DOES **NOT** PROVE (§18d — the negative space, stated so a green run is read as
 * green-within-bounds):
 *   - It does NOT exercise the `/login` FORM. The session is established by the app's own
 *     email/password API — the rail `playwright/global-setup.ts` and every persona suite already
 *     use — because none of the callers came here to test the login UI. A spec that means to test
 *     the login page must drive it itself.
 *   - It does not check ROLE, entitlement or console access: proving WHO the session belongs to is
 *     not proving what that person may do. Every authorization assertion still belongs in the spec.
 *   - It asserts the cookie by NAME (`connect.sid`, express-session's default — the literal the
 *     server itself clears, `server/replit_integrations/auth/replitAuth.ts`). If the server ever
 *     renames it, this helper must be changed with it — it would otherwise fail every suite rather than pass one wrongly, which is the safe
 *     direction.
 *   - `BASE_URL` (default `http://localhost:5000`) is where it posts and reads. It does not
 *     cross-check that against the Playwright `baseURL` a `page.goto` would use; a harness that
 *     sets one and not the other is outside what this file can see.
 */
import type { APIRequestContext, Page } from '@playwright/test';

/** express-session's default cookie name; `GET /api/logout` clears exactly this one. */
export const SESSION_COOKIE_NAME = 'connect.sid';

/** The shape `GET /api/auth/user` answers with (sanitizeUser — no password, no IG token). */
export type AuthenticatedUser = {
  id: string;
  email: string;
  role?: string;
  [key: string]: unknown;
};

function baseUrl(): string {
  return process.env.BASE_URL ?? 'http://localhost:5000';
}

function isPage(target: Page | APIRequestContext): target is Page {
  return typeof (target as Page).goto === 'function';
}

/** The request context whose cookie jar carries the session. `page.request` shares the browser
 *  context's jar, so proving the jar proves the PAGE is signed in too. */
function jarOf(target: Page | APIRequestContext): APIRequestContext {
  return isPage(target) ? target.request : target;
}

async function cookieNames(request: APIRequestContext): Promise<string[]> {
  const state = await request.storageState();
  return state.cookies.map((c) => c.name);
}

/**
 * THE ONE PROOF that a session exists on `target`'s cookie jar and belongs to `expectedEmail`.
 * Throws — loudly and with the evidence — on anything else. Never returns a failure.
 */
export async function assertAuthenticatedSession(
  target: Page | APIRequestContext,
  expectedEmail: string,
): Promise<AuthenticatedUser> {
  const request = jarOf(target);

  const names = await cookieNames(request);
  if (!names.includes(SESSION_COOKIE_NAME)) {
    throw new Error(
      `[auth] no "${SESSION_COOKIE_NAME}" cookie for ${expectedEmail} — the browser/request jar is ` +
        `ANONYMOUS. Cookies present: ${names.length ? names.join(', ') : '(none)'}.`,
    );
  }

  const res = await request.get(`${baseUrl()}/api/auth/user`);
  if (res.status() !== 200) {
    const body = await res.text().catch(() => '<unreadable>');
    throw new Error(
      `[auth] GET /api/auth/user → ${res.status()} for ${expectedEmail} with a "${SESSION_COOKIE_NAME}" ` +
        `cookie present — the session is not established. Body: ${body.slice(0, 400)}`,
    );
  }

  const user = (await res.json()) as AuthenticatedUser | null;
  const actual = String(user?.email ?? '');
  if (actual.toLowerCase() !== expectedEmail.toLowerCase()) {
    throw new Error(
      `[auth] the session belongs to "${actual || '<no email>'}", not "${expectedEmail}" — every ` +
        `assertion after this point would describe the wrong principal.`,
    );
  }
  return user as AuthenticatedUser;
}

/**
 * THE ONE `loginAs`. Establishes a session for a `Page` (its browser context's jar) or for a bare
 * `APIRequestContext`, then PROVES it with `assertAuthenticatedSession`.
 *
 * POST-CONDITION when a `Page` is given: the browser is signed in AND sitting on `/`, with the
 * terms modal accepted if one appeared. (The old helper left the page wherever the login redirect
 * happened to land; `/` is the predictable replacement, and every caller navigates to the surface
 * it cares about anyway.)
 *
 * Returns the authenticated user, so a caller can assert against the real principal instead of
 * assuming one.
 */
export async function loginAs(
  target: Page | APIRequestContext,
  email: string,
  password: string,
): Promise<AuthenticatedUser> {
  const request = jarOf(target);

  const res = await request.post(`${baseUrl()}/api/auth/login`, {
    data: { email, password },
    headers: { 'Content-Type': 'application/json' },
  });
  if (res.status() !== 200) {
    const body = await res.text().catch(() => '<unreadable>');
    throw new Error(
      `[auth] POST /api/auth/login → ${res.status()} for ${email}. The account may not be seeded in ` +
        `this database. Body: ${body.slice(0, 400)}`,
    );
  }

  const user = await assertAuthenticatedSession(target, email);

  if (isPage(target)) {
    // `domcontentloaded` rather than the default full `load`: the landing page pulls a large
    // module graph and this helper is called 30-odd times across these suites. Every caller
    // navigates to the surface it actually cares about immediately after.
    await target.goto('/', { waitUntil: 'domcontentloaded' });
    await acceptTerms(target);
  }
  return user;
}

/**
 * Signs the browser/request jar out through `POST /api/auth/logout`, then PROVES the session is
 * gone (`GET /api/auth/user` → 401). Throws otherwise.
 *
 * The old version clicked a `[data-testid="profile-menu"]` that does not render on every surface
 * and returned silently when it was absent, so a spec that meant to continue ANONYMOUSLY carried
 * the previous persona's session into its next assertions — the same silent-pass as V-31, one
 * direction over.
 *
 * THE ENDPOINT IS `POST /api/auth/logout`, NOT `GET /api/logout`. The latter is registered only
 * inside `setupAuth`'s Replit-OIDC block, so off-Replit it answers 404 and the session SURVIVES —
 * measured in this lane's harness (404, then `/api/auth/user` still 200). That is the same defect
 * `client/src/lib/__tests__/logout-endpoint-pin.test.ts` pins for the client; this helper is held
 * to it too.
 *
 * POST-CONDITION when a `Page` is given: signed out AND sitting on `/`.
 */
export async function logout(target: Page | APIRequestContext): Promise<void> {
  const request = jarOf(target);

  const res = await request.post(`${baseUrl()}/api/auth/logout`);
  if (!res.ok()) {
    throw new Error(
      `[auth] POST /api/auth/logout → ${res.status()} — the sign-out did not happen, so the 401 ` +
        `check below would be the only thing standing between this and the next persona.`,
    );
  }

  const me = await request.get(`${baseUrl()}/api/auth/user`);
  if (me.status() !== 401) {
    throw new Error(
      `[auth] after POST /api/auth/logout, GET /api/auth/user → ${me.status()} (expected 401) — the ` +
        `session survived the logout and the next step would run as the previous persona.`,
    );
  }

  if (isPage(target)) {
    await target.goto('/', { waitUntil: 'domcontentloaded' });
  }
}

/**
 * Accepts the terms modal when the app raises one. Best-effort BY DESIGN and named so: the modal
 * is conditional on the account's terms version, so "no modal" is a normal outcome and not a
 * failure. It asserts nothing, which is why nothing in this file relies on it for a session.
 */
export async function acceptTerms(page: Page): Promise<void> {
  const acceptButton = page.locator('button:has-text("Accept")').first();
  if (await acceptButton.isVisible().catch(() => false)) {
    await acceptButton.click().catch(() => {});
    await page.waitForLoadState('networkidle').catch(() => {});
  }
}
