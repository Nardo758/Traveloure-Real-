/**
 * logo-navigation-surfaces.spec.ts
 *
 * Verifies that the Traveloure PNG logo renders correctly across every
 * navigation surface after the brand update.
 *
 * For each surface the test asserts:
 *   (a) the logo anchor (`data-testid="link-*-logo"`) contains an <img>
 *       with src="/traveloure-logo.png" and alt="Traveloure"
 *   (b) no red-T placeholder <div> (background-color #E85D55 with inner
 *       text "T") exists anywhere inside the logo anchor
 *
 * Surfaces covered and the auth required to reach them:
 *   link-logo         — main public navbar (/) — no auth
 *   link-logo         — dashboard layout header (/dashboard) — traveler auth
 *   link-expert-logo  — expert sidebar (/expert/today) — expert auth
 *   link-provider-logo— provider sidebar (/provider/dashboard) — provider auth
 *   link-sidebar-logo — traveler dashboard sidebar (/dashboard) — traveler auth
 *   link-ea-logo      — EA sidebar (/ea/dashboard) — EA auth
 *   link-admin-logo   — admin sidebar (/admin/dashboard) — admin auth
 *
 * Auth pattern: mirrors ea-console-pages.spec.ts — storageState files written
 * by globalSetup (PW_AUTH_SETUP=1). In non-CI environments without a running
 * server the tests skip gracefully; in CI they throw immediately.
 */

import { test, expect, type Page } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5000';
const IS_CI = process.env.CI === 'true';

// ── shared helpers ─────────────────────────────────────────────────────────────

async function gotoAndSettle(page: Page, path: string) {
  await page.goto(`${BASE_URL}${path}`, {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  });
  // Allow client-side routing + any auth redirect to settle
  await page.waitForTimeout(2_000);
}

/**
 * Returns true when the current URL matches the requested path — i.e. the
 * user was NOT redirected away (e.g. by an auth guard).
 */
function didNotRedirect(page: Page, requestedPath: string): boolean {
  const current = new URL(page.url()).pathname;
  return current === requestedPath || current.startsWith(requestedPath + '?');
}

/**
 * Core assertion: the element identified by `testId` must contain exactly one
 * <img src="/traveloure-logo.png" alt="Traveloure"> and no red-T placeholder.
 */
async function assertLogoInLink(page: Page, testId: string, surface: string) {
  const link = page.getByTestId(testId);
  await expect(link, `[${surface}] logo link "${testId}" must exist in DOM`).toBeAttached({
    timeout: 8_000,
  });

  // (a) img with correct src and alt
  const img = link.locator('img[src="/traveloure-logo.png"]');
  await expect(
    img,
    `[${surface}] logo link "${testId}" must contain <img src="/traveloure-logo.png">`,
  ).toBeAttached({ timeout: 5_000 });

  const altValue = await img.getAttribute('alt');
  expect(
    altValue,
    `[${surface}] logo <img> must have alt="Traveloure"`,
  ).toBe('Traveloure');

  // (b) no red-T placeholder div — the old placeholder was a <div> containing
  //     only the letter "T" styled with background #E85D55.
  //     We check two independent signals: text content "T" inside a div, AND
  //     an inline background-color that resolves to the brand red.
  const placeholderByText = link.locator('div').filter({ hasText: /^T$/ });
  const count = await placeholderByText.count();
  for (let i = 0; i < count; i++) {
    const bgColor = await placeholderByText.nth(i).evaluate(
      (el) => (el as HTMLElement).style.backgroundColor || getComputedStyle(el).backgroundColor,
    );
    // rgb(232, 93, 85) is #E85D55
    const isRedPlaceholder =
      bgColor.includes('232') && bgColor.includes('93') && bgColor.includes('85');
    expect(
      isRedPlaceholder,
      `[${surface}] found a red-T placeholder div inside "${testId}" — the PNG logo is missing`,
    ).toBe(false);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Public main navbar — no auth required
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Logo — public main navbar (/)', () => {
  test('link-logo contains traveloure-logo.png img', async ({ page }) => {
    await gotoAndSettle(page, '/');
    await assertLogoInLink(page, 'link-logo', 'public-navbar');
    console.log('[logo-test] PASS public main navbar (/)');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Expert sidebar — requires expert auth
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Logo — expert sidebar (/expert/today)', () => {
  test.use({ storageState: 'playwright/.auth/expert.json' });

  let expertSessionOk = false;

  test.beforeAll(async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/auth/session`);
    const body = await res.json().catch(() => ({})) as Record<string, unknown>;
    const authenticated = body.authenticated === true;
    const role = (body.user as Record<string, unknown> | undefined)?.role ?? '';
    const roleOk =
      authenticated &&
      ['travel_expert', 'local_expert', 'event_planner', 'expert'].includes(String(role));

    console.log(
      `[logo-test] expert session — authenticated=${authenticated}, role=${role}`,
    );

    if (IS_CI && !authenticated) {
      throw new Error(
        `[logo-test] Expert storageState did not yield an authenticated session. ` +
        `Got: ${JSON.stringify(body)}. Run scripts/seed-ci-test-users.ts first.`,
      );
    }
    expertSessionOk = roleOk;
  });

  test('link-expert-logo contains traveloure-logo.png img', async ({ page }) => {
    if (!expertSessionOk) {
      test.skip(true, 'Expert session not available — seed CI users and run with PW_AUTH_SETUP=1');
      return;
    }
    await gotoAndSettle(page, '/expert/today');
    if (!didNotRedirect(page, '/expert/today')) {
      test.skip(true, 'Redirected away from /expert/today — expert session may be stale');
      return;
    }
    await assertLogoInLink(page, 'link-expert-logo', 'expert-sidebar');
    console.log('[logo-test] PASS expert sidebar (/expert/today)');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Provider sidebar — requires provider auth
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Logo — provider sidebar (/provider/dashboard)', () => {
  test.use({ storageState: 'playwright/.auth/provider.json' });

  let providerSessionOk = false;

  test.beforeAll(async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/auth/session`);
    const body = await res.json().catch(() => ({})) as Record<string, unknown>;
    const authenticated = body.authenticated === true;
    const role = (body.user as Record<string, unknown> | undefined)?.role ?? '';
    const roleOk = authenticated && String(role) === 'service_provider';

    console.log(
      `[logo-test] provider session — authenticated=${authenticated}, role=${role}`,
    );

    if (IS_CI && !authenticated) {
      throw new Error(
        `[logo-test] Provider storageState did not yield an authenticated session. ` +
        `Got: ${JSON.stringify(body)}. Run scripts/seed-ci-test-users.ts first.`,
      );
    }
    providerSessionOk = roleOk;
  });

  test('link-provider-logo contains traveloure-logo.png img', async ({ page }) => {
    if (!providerSessionOk) {
      test.skip(true, 'Provider session not available — seed CI users and run with PW_AUTH_SETUP=1');
      return;
    }
    await gotoAndSettle(page, '/provider/dashboard');
    if (!didNotRedirect(page, '/provider/dashboard')) {
      test.skip(true, 'Redirected away from /provider/dashboard — provider session may be stale');
      return;
    }
    await assertLogoInLink(page, 'link-provider-logo', 'provider-sidebar');
    console.log('[logo-test] PASS provider sidebar (/provider/dashboard)');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Traveler dashboard sidebar (link-sidebar-logo) + dashboard-layout
//    header (link-logo in dashboard context) — requires traveler auth.
//    Uses admin auth as a fallback since admins can also visit /dashboard.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Logo — traveler dashboard sidebar (/dashboard)', () => {
  // Admin users can reach /dashboard and the DashboardLayout / DashboardSidebar
  // renders there; this covers link-sidebar-logo without needing a traveler seed.
  test.use({ storageState: 'playwright/.auth/admin.json' });

  let sessionOk = false;

  test.beforeAll(async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/auth/session`);
    const body = await res.json().catch(() => ({})) as Record<string, unknown>;
    const authenticated = body.authenticated === true;
    console.log(`[logo-test] dashboard sidebar session — authenticated=${authenticated}`);

    if (IS_CI && !authenticated) {
      throw new Error(
        `[logo-test] Admin storageState did not yield an authenticated session for ` +
        `dashboard sidebar check. Got: ${JSON.stringify(body)}.`,
      );
    }
    sessionOk = authenticated;
  });

  test('link-sidebar-logo contains traveloure-logo.png img', async ({ page }) => {
    if (!sessionOk) {
      test.skip(
        true,
        'No authenticated session available for /dashboard — seed CI users and run with PW_AUTH_SETUP=1',
      );
      return;
    }
    await gotoAndSettle(page, '/dashboard');
    if (!didNotRedirect(page, '/dashboard')) {
      test.skip(true, 'Redirected away from /dashboard — session may be stale');
      return;
    }
    await assertLogoInLink(page, 'link-sidebar-logo', 'dashboard-sidebar');
    console.log('[logo-test] PASS traveler dashboard sidebar (/dashboard)');
  });

  test('dashboard layout header link-logo contains traveloure-logo.png img', async ({ page }) => {
    if (!sessionOk) {
      test.skip(
        true,
        'No authenticated session available for /dashboard — seed CI users and run with PW_AUTH_SETUP=1',
      );
      return;
    }
    await gotoAndSettle(page, '/dashboard');
    if (!didNotRedirect(page, '/dashboard')) {
      test.skip(true, 'Redirected away from /dashboard — session may be stale');
      return;
    }
    // The dashboard layout header shares data-testid="link-logo" with the
    // public navbar; this assertion confirms the dashboard-context instance too.
    await assertLogoInLink(page, 'link-logo', 'dashboard-layout-header');
    console.log('[logo-test] PASS dashboard layout header logo (/dashboard)');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. EA sidebar — requires EA auth
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Logo — EA sidebar (/ea/dashboard)', () => {
  test.use({ storageState: 'playwright/.auth/ea.json' });

  let eaSessionOk = false;

  test.beforeAll(async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/auth/session`);
    const body = await res.json().catch(() => ({})) as Record<string, unknown>;
    const authenticated = body.authenticated === true;
    const role = (body.user as Record<string, unknown> | undefined)?.role ?? '';
    const roleOk = authenticated && String(role) === 'executive_assistant';

    console.log(
      `[logo-test] EA session — authenticated=${authenticated}, role=${role}`,
    );

    if (IS_CI && !authenticated) {
      throw new Error(
        `[logo-test] EA storageState did not yield an authenticated session. ` +
        `Got: ${JSON.stringify(body)}. Run scripts/seed-ci-test-users.ts first.`,
      );
    }
    eaSessionOk = roleOk;
  });

  test('link-ea-logo contains traveloure-logo.png img', async ({ page }) => {
    if (!eaSessionOk) {
      test.skip(true, 'EA session not available — seed CI users and run with PW_AUTH_SETUP=1');
      return;
    }
    await gotoAndSettle(page, '/ea/dashboard');
    if (!didNotRedirect(page, '/ea/dashboard')) {
      test.skip(true, 'Redirected away from /ea/dashboard — EA session may be stale');
      return;
    }
    await assertLogoInLink(page, 'link-ea-logo', 'ea-sidebar');
    console.log('[logo-test] PASS EA sidebar (/ea/dashboard)');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Admin sidebar — requires admin auth
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Logo — admin sidebar (/admin/dashboard)', () => {
  test.use({ storageState: 'playwright/.auth/admin.json' });

  let adminSessionOk = false;

  test.beforeAll(async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/auth/session`);
    const body = await res.json().catch(() => ({})) as Record<string, unknown>;
    const authenticated = body.authenticated === true;
    const role = (body.user as Record<string, unknown> | undefined)?.role ?? '';
    const roleOk = authenticated && String(role) === 'admin';

    console.log(
      `[logo-test] admin session — authenticated=${authenticated}, role=${role}`,
    );

    if (IS_CI && !authenticated) {
      throw new Error(
        `[logo-test] Admin storageState did not yield an authenticated session. ` +
        `Got: ${JSON.stringify(body)}. Run scripts/seed-ci-test-users.ts first.`,
      );
    }
    adminSessionOk = roleOk;
  });

  test('link-admin-logo contains traveloure-logo.png img', async ({ page }) => {
    if (!adminSessionOk) {
      test.skip(true, 'Admin session not available — seed CI users and run with PW_AUTH_SETUP=1');
      return;
    }
    await gotoAndSettle(page, '/admin/dashboard');
    if (!didNotRedirect(page, '/admin/dashboard')) {
      test.skip(true, 'Redirected away from /admin/dashboard — admin session may be stale');
      return;
    }
    await assertLogoInLink(page, 'link-admin-logo', 'admin-sidebar');
    console.log('[logo-test] PASS admin sidebar (/admin/dashboard)');
  });
});
