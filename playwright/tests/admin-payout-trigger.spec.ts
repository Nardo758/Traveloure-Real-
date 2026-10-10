/**
 * admin-payout-trigger.spec.ts — SS-2 Phase D, pin 5 (ledger `2026-10-10-ss2d-pins`).
 *
 * The admin payout trigger on /admin/payouts, with the payout STUBBED: page.route() answers the
 * list read and the PATCH, so nothing reaches the server's payout handler and no money moves in CI.
 * What is pinned is what the console SENDS, which is the half a server-side test cannot see:
 *
 *   P1  Approve on a pending request sends ONE PATCH /api/admin/payouts/:id with status
 *       `processing` and the row's requesterType.
 *   P2  Execute on an approved request opens the confirm dialog, sends NOTHING until confirmed,
 *       then sends ONE PATCH with status `completed`.
 *   P3  No body carries an amount, a currency or a user id — the payout amount is the server's
 *       record and the actor is the session (CLAUDE.md §14). The PATCH body is exactly
 *       {status, notes?, requesterType}.
 *
 * Replaces the retired e2e/specs/journey-5-admin "Admin triggers payout" test, whose every test id
 * no longer existed. Uses the admin storageState globalSetup writes for ci-admin@traveloure.test
 * (PW_AUTH_SETUP=1), the admin-test-email posture.
 */
import { test, expect, type Page } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5000';
const IS_CI = !!process.env.CI;

test.use({ storageState: 'playwright/.auth/admin.json' });

let adminSessionOk = false;

test.beforeAll(async ({ request }) => {
  const res = await request.get(`${BASE_URL}/api/auth/session`).catch(() => null);
  const body = res ? ((await res.json().catch(() => ({}))) as Record<string, unknown>) : {};
  const role = (body.user as Record<string, unknown> | undefined)?.role ?? '';
  adminSessionOk = body.authenticated === true && role === 'admin';
  if (IS_CI && !adminSessionOk) {
    throw new Error(
      `[admin-payout-trigger] Admin storageState did not yield an admin session: ${JSON.stringify(body)}. ` +
        'Ensure scripts/seed-ci-test-users.ts ran and globalSetup completed.',
    );
  }
});

const PENDING_ID = 'ss2d-payout-pending';
const APPROVED_ID = 'ss2d-payout-approved';

function row(id: string, status: string) {
  return {
    id,
    expertId: 'ss2d-expert',
    amount: '120.00',
    currency: 'USD',
    payoutMethod: 'stripe_connect',
    status,
    requestedAt: '2026-10-01T10:00:00.000Z',
    processedAt: null,
    requesterType: 'expert',
    requesterName: 'SS2D Expert',
  };
}

/** Stub the list read and record every PATCH; nothing reaches the server's payout handler. */
async function stubPayouts(page: Page): Promise<Array<{ id: string; body: Record<string, unknown> }>> {
  const patches: Array<{ id: string; body: Record<string, unknown> }> = [];
  await page.route(/\/api\/admin\/payouts(\?.*)?$/, (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([row(PENDING_ID, 'pending'), row(APPROVED_ID, 'processing')]),
    });
  });
  await page.route(/\/api\/admin\/payouts\/[^/?]+$/, (route) => {
    if (route.request().method() !== 'PATCH') return route.continue();
    const id = route.request().url().split('/').pop()!;
    patches.push({ id, body: route.request().postDataJSON() ?? {} });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });
  return patches;
}

function assertNoMoneyFields(body: Record<string, unknown>) {
  for (const k of ['amount', 'amountCents', 'currency', 'userId', 'expertId', 'providerId']) {
    expect(body, `the PATCH body must not carry "${k}" (§14)`).not.toHaveProperty(k);
  }
  expect(Object.keys(body).every((k) => ['status', 'notes', 'requesterType'].includes(k))).toBe(true);
}

test.describe('/admin/payouts — the payout trigger sends a status, never an amount (§14)', () => {
  test('P1/P3: Approve sends one PATCH with status processing', async ({ page }) => {
    test.skip(!adminSessionOk, 'admin session not available outside CI');
    const patches = await stubPayouts(page);
    await page.goto(`${BASE_URL}/admin/payouts`, { waitUntil: 'domcontentloaded' });

    await page.getByTestId(`button-approve-payout-${PENDING_ID}`).click({ timeout: 30_000 });
    await page.getByTestId('button-confirm-payout-action').click();

    await expect.poll(() => patches.length, { timeout: 10_000 }).toBe(1);
    expect(patches[0].id).toBe(PENDING_ID);
    expect(patches[0].body.status).toBe('processing');
    expect(patches[0].body.requesterType).toBe('expert');
    assertNoMoneyFields(patches[0].body);
  });

  test('P2/P3: Execute asks first, then sends one PATCH with status completed', async ({ page }) => {
    test.skip(!adminSessionOk, 'admin session not available outside CI');
    const patches = await stubPayouts(page);
    await page.goto(`${BASE_URL}/admin/payouts`, { waitUntil: 'domcontentloaded' });

    await page.getByTestId(`button-execute-payout-${APPROVED_ID}`).click({ timeout: 30_000 });
    await expect(page.getByTestId('button-confirm-payout-action')).toContainText('Confirm Execution');
    await page.waitForTimeout(500);
    expect(patches, 'opening the dialog sends nothing').toHaveLength(0);

    await page.getByTestId('button-confirm-payout-action').click();
    await expect.poll(() => patches.length, { timeout: 10_000 }).toBe(1);
    expect(patches[0].id).toBe(APPROVED_ID);
    expect(patches[0].body.status).toBe('completed');
    assertNoMoneyFields(patches[0].body);
  });
});
