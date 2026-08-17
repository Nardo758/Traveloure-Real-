/**
 * distribute-shell.spec.ts
 *
 * Catalog+Distribute ruling 74/76, lane D1 proof — the provider Distribute page shell plus its
 * first two channels (Storefront + Marketplace). Reached from the Workstation.
 *
 * Asserts:
 *   - the page renders (header "Distribute");
 *   - the Storefront channel (`ProviderStorefrontHeader`, exported from services.tsx — S6 made
 *     this its ONE mount, Catalog no longer renders it) shows the real live state
 *     ("Live · N approved") and a share caption with NO fee-waiver wording — the caption hold
 *     (ruling 74 / ruling 69 disp. 2): absence of "skip"/"waive"/"service fee";
 *   - the listing selector lists the owner's services (populated from GET /api/provider/services);
 *   - the Marketplace channel reflects the SELECTED listing's real approval/gate state:
 *       · an approved+active listing shows the honest LIVE badge;
 *       · an approved+draft listing (the seeded provider is NOT identity-verified) shows the
 *         honest BLOCKED state with the true VERIFICATION_GATE reason ("Finish identity …") and a
 *         fix deep-link — the blocked path is asserted directly here (the gate services'
 *         own suites, f2-verification-gate + attestations, prove the gate LOGIC).
 *
 * Honesty note: "live" on the Marketplace channel = the SAME predicate the public storefront read
 * serves (approved AND active). The verification/attestation gates are PUBLISH gates that block a
 * transition to active — so a grandfathered approved+active listing on an unverified account is
 * genuinely live (and the Storefront header on the same page agrees). The gates surface as the
 * reasons a NON-active listing can't be activated, never as a contradiction of a live one.
 *
 * Auth: seeded provider kyoto-interpreter@traveloure.test / TestPass123! (identity/business
 * verification = pending; handle = kyoto-interpreter; 2 approved+active listings + 1 approved+draft).
 *
 * Relevant source:
 *   client/src/pages/provider/distribute.tsx            (the page + Marketplace channel)
 *   client/src/pages/provider/services.tsx              (exported ProviderStorefrontHeader)
 *   server/routes.ts GET /api/provider/services/:id/publish-readiness (composed honest state)
 */
import { test, expect, type Page } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5000';
const PROVIDER_EMAIL = 'kyoto-interpreter@traveloure.test';
const PROVIDER_PASSWORD = 'TestPass123!';
const LIVE_SERVICE = 'Business Meeting Interpretation (Full Day)';
/**
 * THE NOT-LIVE LISTING is created by this spec, not borrowed from the seed.
 *
 * It used to be `Business Document Translation`, described as "approved + draft (not active)" as
 * a SEEDED fact — but server/seeds/phase-d-kyoto-vendors.seed.ts inserts every vendor service
 * with `approvalStatus: 'approved', status: 'active'` (one shared insert, no per-service
 * override), so that state never existed and the blocked-badge assertions below were unreachable.
 *
 * Pausing a seeded row instead is a ONE-WAY DOOR and was rejected: this fixture provider is
 * deliberately un-verified (that is what makes the VERIFICATION_GATE blocker assertion below
 * real), so `PATCH { status: 'active' }` comes back 403 VERIFICATION_GATE and the row could never
 * be restored — the spec would corrode the shared fixture a little more on every run.
 *
 * A throwaway listing has neither problem: migration 111 means it is BORN `submitted` (never
 * live), which is exactly the state under test, and DELETE genuinely restores. Same
 * create-and-delete pattern as service-logistics-step.spec.ts.
 */
const THROWAWAY_BLOCKED_NAME = 'D1 distribute-shell blocked fixture';

async function loginProvider(page: Page) {
  const resp = await page.request.post(`${BASE_URL}/api/auth/login`, {
    headers: { 'Content-Type': 'application/json' },
    data: { email: PROVIDER_EMAIL, password: PROVIDER_PASSWORD },
  });
  expect(resp.ok(), `login failed: ${resp.status()}`).toBeTruthy();
}

async function serviceIdByName(page: Page, name: string): Promise<string> {
  const resp = await page.request.get(`${BASE_URL}/api/provider/services`);
  expect(resp.ok(), `owner services read failed: ${resp.status()}`).toBeTruthy();
  const rows = (await resp.json()) as { id: string; serviceName: string }[];
  const row = rows.find((r) => r.serviceName === name);
  expect(row, `seeded listing "${name}" not found`).toBeTruthy();
  return row!.id;
}

test.describe('/provider/distribute — shell + Storefront + Marketplace (lane D1)', () => {
  test('renders, storefront live + neutral caption, selector lists services, marketplace is honest', async ({ page }) => {
    await loginProvider(page);
    const liveId = await serviceIdByName(page, LIVE_SERVICE);

    // Create the not-live listing this test needs (see THROWAWAY_BLOCKED_NAME above). Born
    // `submitted` per migration 111 — never live, which is the state under test.
    const created = await page.request.post(`${BASE_URL}/api/provider/services`, {
      headers: { 'Content-Type': 'application/json' },
      data: {
        serviceName: THROWAWAY_BLOCKED_NAME,
        description: 'lane D1 throwaway — not-live marketplace state',
        price: '100.00',
        priceType: 'fixed',
        deliveryMethod: 'in_person',
        meetingPoint: 'Kyoto Station, Karasuma exit',
        location: 'Kyoto',
      },
    });
    expect(created.status(), `throwaway create failed: ${await created.text()}`).toBe(201);
    const blockedId = (await created.json()).id as string;

    try {
    await page.goto(`${BASE_URL}/provider/distribute`, { waitUntil: 'domcontentloaded', timeout: 30_000 });

    // ── Page renders ─────────────────────────────────────────────────────────────────────────
    await expect(page.getByTestId('text-distribute-title')).toContainText('Distribute');

    // ── Storefront channel — real live state + share caption, caption hold ────────────────────
    const storefront = page.getByTestId('card-storefront-header');
    await expect(storefront).toBeVisible({ timeout: 15_000 });
    // D-11 (ledger row 119): the badge stopped speaking approval-vocabulary and now states what
    // the public page actually SHOWS — the live (approved+active) subset of the whole catalog.
    // Same predicate as before, clearer claim; the old /Live · \d+ approved/ copy is gone.
    await expect(page.getByTestId('badge-storefront-live')).toContainText(
      /Live · showing \d+ of \d+ listings?/,
    );
    // D-2: the card leads with WHOSE storefront this is, not a generic label.
    await expect(page.getByTestId('avatar-storefront')).toBeVisible();
    await expect(page.getByTestId('text-storefront-business-name')).not.toBeEmpty();

    const caption = page.getByTestId('textarea-storefront-caption');
    await expect(caption).toBeVisible();
    const captionText = (await caption.inputValue()).toLowerCase();
    expect(captionText.length, 'storefront caption is populated').toBeGreaterThan(0);
    // Caption hold — NO fee-waiver wording anywhere in the caption.
    expect(captionText).not.toContain('skip');
    expect(captionText).not.toContain('waive');
    expect(captionText).not.toContain('service fee');

    // ── Listing selector lists the owner's services ───────────────────────────────────────────
    // The workspace's Distribute rework made this a NATIVE <select>: options are asserted
    // attached (native options aren't "visible" until the OS dropdown opens) and picked with
    // selectOption — the intent (both listings offered, pick each) is unchanged.
    const selector = page.getByTestId('select-listing');
    await expect(selector).toBeVisible();
    await expect(page.getByTestId(`option-listing-${liveId}`)).toBeAttached({ timeout: 10_000 });
    await expect(page.getByTestId(`option-listing-${blockedId}`)).toBeAttached();

    // ── Marketplace channel — pick the LIVE listing → honest live badge ───────────────────────
    await selector.selectOption(liveId);
    await expect(page.getByTestId('badge-marketplace-live')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('button-marketplace-view-public')).toBeVisible();

    // ── Marketplace channel — pick the BLOCKED listing → honest blocked state + true reason ───
    await selector.selectOption(blockedId);
    await expect(page.getByTestId('badge-marketplace-blocked')).toBeVisible({ timeout: 10_000 });
    // The seeded provider is NOT identity-verified → the true verification-gate reason with a fix link.
    const verifBlocker = page.getByTestId('blocker-VERIFICATION_GATE');
    await expect(verifBlocker).toBeVisible();
    await expect(verifBlocker).toContainText(/Finish identity/i);
    await expect(page.getByTestId('button-fix-VERIFICATION_GATE')).toBeVisible();
    } finally {
      // The throwaway is DELETED, not un-paused — no seeded row was touched, so the shared
      // fixture is byte-identical for the other console specs.
      await page.request.delete(`${BASE_URL}/api/provider/services/${blockedId}`).catch(() => {});
    }
  });
});
