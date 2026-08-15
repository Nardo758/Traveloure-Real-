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
 *   environments.  Critically, each test-email interceptor reads and asserts the
 *   request body BEFORE responding, so a regression in the UI (wrong field name,
 *   missing body, wrong address) causes a test failure — not a silent pass.
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5000';
const IS_CI = process.env.CI === 'true';

// ── Saved admin session (written by playwright/global-setup.ts) ───────────────
test.use({ storageState: 'playwright/.auth/admin.json' });

// ── Module-level session gate ──────────────────────────────────────────────────

let adminSessionOk = false;
/** Email address of the CI admin account seeded by seed-ci-test-users.ts */
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
  test(
    'UI sends the entered address in the POST body and banner shows it on success',
    async ({ page }) => {
      test.skip(!adminSessionOk, 'Admin session not authenticated — skipped in local dev');

      const CUSTOM_ADDRESS = 'delivery-check@example.com';

      await mockSupportingRoutes(page);

      // Intercept the test-email POST, assert it carries the right `to`, then respond.
      let capturedTo: string | undefined;
      await page.route('**/api/admin/system/test-email', async (route) => {
        expect(route.request().method()).toBe('POST');

        const bodyText = route.request().postData() ?? '{}';
        const bodyJson = JSON.parse(bodyText) as Record<string, unknown>;

        // Assert the UI sent the custom address in the `to` field.
        expect(bodyJson.to, 'POST body must include the custom address in the `to` field').toBe(
          CUSTOM_ADDRESS,
        );
        capturedTo = String(bodyJson.to);

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true, id: 'msg_test_abc123', to: CUSTOM_ADDRESS }),
        });
      });

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

      // Confirm the route handler actually ran.
      expect(capturedTo, 'Interceptor must have been invoked').toBe(CUSTOM_ADDRESS);
    },
  );
});

// ── Suite B — Invalid email format ─────────────────────────────────────────────

test.describe('Admin test-email — invalid email format', () => {
  test(
    'result banner shows an error when a non-email value is submitted',
    async ({ page }) => {
      test.skip(!adminSessionOk, 'Admin session not authenticated — skipped in local dev');

      await mockSupportingRoutes(page);

      // The server returns a 400 with the validation error.
      let interceptorCalled = false;
      await page.route('**/api/admin/system/test-email', async (route) => {
        interceptorCalled = true;
        expect(route.request().method()).toBe('POST');

        const bodyText = route.request().postData() ?? '{}';
        const bodyJson = JSON.parse(bodyText) as Record<string, unknown>;

        // The `to` field must equal the exact invalid string the user typed.
        // A UI regression that posts a different value or omits `to` fails here.
        expect(bodyJson.to, '`to` must equal the typed invalid value').toBe('not-an-email-address');

        // Confirm the value is not a valid email format (the premise of this test).
        const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        expect(
          EMAIL_RE.test(String(bodyJson.to)),
          'The submitted value must not be a valid email address',
        ).toBe(false);

        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ ok: false, error: "Invalid email address in 'to' field" }),
        });
      });

      await openSystemPage(page);

      // Type an obviously invalid value.
      const input = page.getByTestId('input-test-email-to');
      await input.fill('not-an-email-address');

      await page.getByTestId('button-send-test-email').click();

      // The result banner must surface and signal failure.
      const banner = page.getByTestId('test-email-result');
      await expect(banner).toBeVisible({ timeout: 10_000 });

      // The banner must NOT claim success.
      await expect(banner).not.toContainText('Delivered successfully');

      // Confirm the route handler actually ran (not short-circuited client-side).
      expect(interceptorCalled, 'Server interceptor must have been called').toBe(true);
    },
  );
});

// ── Suite C — Empty field falls back to admin address ─────────────────────────

test.describe('Admin test-email — empty field falls back to admin address', () => {
  test(
    'POST omits `to` when field is blank; banner shows admin own address',
    async ({ page }) => {
      test.skip(!adminSessionOk, 'Admin session not authenticated — skipped in local dev');

      await mockSupportingRoutes(page);

      let interceptorCalled = false;
      await page.route('**/api/admin/system/test-email', async (route) => {
        interceptorCalled = true;
        expect(route.request().method()).toBe('POST');

        const bodyText = route.request().postData();

        // When the field is blank the UI sends no body (undefined) or an empty
        // JSON body.  It must never include a `to` key.
        // Client code: `const body = testEmailTo.trim() ? { to: ... } : undefined`
        if (bodyText) {
          const bodyJson = JSON.parse(bodyText) as Record<string, unknown>;
          expect(
            Object.prototype.hasOwnProperty.call(bodyJson, 'to'),
            'POST body must NOT include a `to` key when the input is blank',
          ).toBe(false);
        }
        // No body at all (bodyText is null/empty) is also correct — fall through.

        // Server uses the admin's own address and echoes it back.
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true, id: 'msg_test_fallback', to: ADMIN_EMAIL }),
        });
      });

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

      // Confirm the route handler actually ran.
      expect(interceptorCalled, 'Server interceptor must have been called').toBe(true);
    },
  );
});
