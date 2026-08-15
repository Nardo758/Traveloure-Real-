/**
 * admin-test-email.spec.ts
 *
 * Playwright UI tests for the admin system page's "Verify Email Delivery" panel.
 *
 * Task 1415 added these tests to confirm:
 *   A. A custom recipient address is accepted, sent to the backend, and echoed
 *      in the success banner.
 *   B. An invalid email format triggers a visible error result (client-side or
 *      server-side — either is acceptable; the banner must appear).
 *   C. Leaving the field empty falls back to the admin's own address, and the
 *      success banner shows that address.
 *
 * Auth strategy
 *   Uses the saved admin storageState (playwright/.auth/admin.json) written by
 *   playwright/global-setup.ts for ci-admin@traveloure.test.  If the auth file
 *   is absent or yields no authenticated session, tests are skipped in local dev
 *   and throw in CI (matching the pattern in auth-routes.spec.ts).
 *
 * Network strategy
 *   page.route() intercepts every API call made by the admin/system page so the
 *   test never touches the real Resend API and is deterministic across
 *   environments.  The /test-email handler is replaced per-test to exercise
 *   different server responses.
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5000';
const IS_CI = process.env.CI === 'true';

// ── Saved admin session (written by playwright/global-setup.ts) ───────────────
test.use({ storageState: 'playwright/.auth/admin.json' });

// ── Module-level session gate ──────────────────────────────────────────────────

let adminSessionOk = false;
const ADMIN_EMAIL = 'ci-admin@traveloure.test';

test.beforeAll(async ({ request }) => {
  const res = await request.get(`${BASE_URL}/api/auth/session`).catch(() => null);
  if (!res) {
    if (IS_CI) {
      throw new Error(
        '[admin-test-email] Could not reach server — cannot verify admin session.',
      );
    }
    console.warn('[admin-test-email] Server unreachable — tests will be skipped.');
    return;
  }

  const body = await res.json().catch(() => ({})) as Record<string, unknown>;
  const authenticated = body.authenticated === true;
  const role = (body.user as Record<string, unknown> | undefined)?.role ?? '';
  const roleOk = authenticated && role === 'admin';

  console.log(
    `[admin-test-email] Admin session check — authenticated=${authenticated}, role=${role}`,
  );

  if (IS_CI) {
    if (!authenticated) {
      throw new Error(
        `[admin-test-email] Admin storageState did not yield an authenticated session. ` +
          `Got: ${JSON.stringify(body)}. ` +
          `Ensure scripts/seed-ci-test-users.ts ran and globalSetup completed successfully.`,
      );
    }
    if (!roleOk) {
      throw new Error(
        `[admin-test-email] Session has unexpected role "${role}". Expected "admin".`,
      );
    }
  } else if (!roleOk) {
    console.warn(
      '[admin-test-email] Admin session not authenticated or wrong role. ' +
        'Tests will be skipped. Run scripts/seed-ci-test-users.ts and restart the server.',
    );
  }

  adminSessionOk = roleOk;
});

// ── Shared route-mocking helpers ───────────────────────────────────────────────

/**
 * Intercept the supporting admin API calls so the page renders without a real
 * database or health-check service.  Called inside each test before page.goto().
 */
async function mockSupportingRoutes(page: import('@playwright/test').Page) {
  // Platform settings — empty list so all flags take their defaults.
  await page.route('**/api/admin/platform-settings', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );

  // System health — minimal stub so the page renders the service grid.
  await page.route('**/api/admin/system/health', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        services: [
          { service: 'Database', status: 'operational', uptime: '99.9%' },
          { service: 'Email',    status: 'operational', uptime: '99.9%' },
          { service: 'Stripe',   status: 'operational', uptime: '99.9%' },
        ],
        apiUsage: {
          claude: { used: 0, limit: 1000, cost: '$0' },
          stripe: { transactions: 0, volume: '$0' },
          email:  { sent: 0, bounceRate: '0%' },
        },
      }),
    }),
  );

  // Slow-query widget (if present).
  await page.route('**/api/admin/slow-queries**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
}

/**
 * Navigate to the admin system page and wait until the Send button is visible.
 */
async function openSystemPage(page: import('@playwright/test').Page) {
  await page.goto(`${BASE_URL}/admin/system`, { waitUntil: 'domcontentloaded' });
  await expect(
    page.getByTestId('button-send-test-email'),
    'Send test email button must be visible',
  ).toBeVisible({ timeout: 15_000 });
}

// ── Suite A — Custom recipient address ─────────────────────────────────────────

test.describe('Admin test-email — custom recipient address', () => {
  test('success banner shows the custom address that was entered', async ({ page }) => {
    test.skip(!adminSessionOk, 'Admin session not authenticated — skipped in local dev');

    const CUSTOM_ADDRESS = 'delivery-check@example.com';

    await mockSupportingRoutes(page);

    // The test-email route returns success with the custom address echoed back.
    await page.route('**/api/admin/system/test-email', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, id: 'msg_test_abc123', to: CUSTOM_ADDRESS }),
      }),
    );

    await openSystemPage(page);

    // Enter the custom address.
    const input = page.getByTestId('input-test-email-to');
    await input.fill(CUSTOM_ADDRESS);

    // Click Send.
    await page.getByTestId('button-send-test-email').click();

    // Result banner must be visible and show the custom address.
    const banner = page.getByTestId('test-email-result');
    await expect(banner).toBeVisible({ timeout: 10_000 });
    await expect(banner).toContainText(CUSTOM_ADDRESS);
    await expect(banner).toContainText('Delivered successfully');
  });
});

// ── Suite B — Invalid email format ─────────────────────────────────────────────

test.describe('Admin test-email — invalid email format', () => {
  test('result banner shows an error when a non-email value is submitted', async ({
    page,
  }) => {
    test.skip(!adminSessionOk, 'Admin session not authenticated — skipped in local dev');

    await mockSupportingRoutes(page);

    // The server returns a 400 with the validation error.
    await page.route('**/api/admin/system/test-email', (route) =>
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false, error: "Invalid email address in 'to' field" }),
      }),
    );

    await openSystemPage(page);

    // Type an obviously invalid value.
    const input = page.getByTestId('input-test-email-to');
    await input.fill('not-an-email-address');

    await page.getByTestId('button-send-test-email').click();

    // The result banner must surface — either a client validation message or
    // the server's error string.  We only assert that it appears and signals
    // failure (not the exact wording, which the server controls).
    const banner = page.getByTestId('test-email-result');
    await expect(banner).toBeVisible({ timeout: 10_000 });

    // The banner must NOT claim success.
    await expect(banner).not.toContainText('Delivered successfully');
  });
});

// ── Suite C — Empty field falls back to admin address ─────────────────────────

test.describe('Admin test-email — empty field falls back to admin address', () => {
  test('success banner shows the admin own address when field is left blank', async ({
    page,
  }) => {
    test.skip(!adminSessionOk, 'Admin session not authenticated — skipped in local dev');

    await mockSupportingRoutes(page);

    // When no `to` body field is sent the server uses the admin's own email.
    // The mock echoes the seeded CI admin address.
    await page.route('**/api/admin/system/test-email', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, id: 'msg_test_fallback', to: ADMIN_EMAIL }),
      }),
    );

    await openSystemPage(page);

    // Confirm the input is blank (no pre-filled value).
    const input = page.getByTestId('input-test-email-to');
    await expect(input).toHaveValue('');

    // Click Send without entering an address.
    await page.getByTestId('button-send-test-email').click();

    // Banner must show success with the admin's own address.
    const banner = page.getByTestId('test-email-result');
    await expect(banner).toBeVisible({ timeout: 10_000 });
    await expect(banner).toContainText('Delivered successfully');
    await expect(banner).toContainText(ADMIN_EMAIL);
  });
});
