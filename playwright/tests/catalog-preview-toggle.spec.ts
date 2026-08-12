/**
 * catalog-preview-toggle.spec.ts
 *
 * Catalog+Distribute ruling 74, lane C2 proof — the provider Catalog page
 * (client/src/pages/provider/services.tsx) gained a Manage ⇄ Preview view-mode
 * toggle. Manage shows today's operational cards (status switch, edit/duplicate/
 * delete). Preview renders each listing through C1's SHARED OfferingCard — the
 * exact traveler card the public /p/:handle storefront draws — and honors the
 * SAME storefront visibility predicate (approvalStatus='approved' AND
 * status='active', mirrored from server/routes/storefront.routes.ts
 * loadStorefront).
 *
 * The point of the lane is the NEGATIVE: a listing that IS visible in Manage but
 * is not approved+active must be ABSENT from Preview — "what you see = what users
 * see". The seeded kyoto-interpreter provider sells three services; "Business
 * Document Translation" is approved+DRAFT (not active), so it shows in Manage and
 * must NOT appear in Preview, while the two approved+active interpretation
 * services do.
 *
 * Auth: seeded provider kyoto-interpreter@traveloure.test / TestPass123!.
 *
 * Relevant source:
 *   client/src/pages/provider/services.tsx     (the toggle + CatalogPreviewCard)
 *   client/src/components/OfferingCard.tsx      (C1 shared card, reused verbatim)
 *   server/routes/storefront.routes.ts          (the mirrored visibility predicate)
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5000';
const PROVIDER_EMAIL = 'kyoto-interpreter@traveloure.test';
const PROVIDER_PASSWORD = 'TestPass123!';

/** Authenticate the browser context via the login API. page.request shares the context's cookie
 *  jar, so the session cookie carries into subsequent page.goto navigations. (The /login route is
 *  a modal over the landing page, not a form page, so a direct API login is the deterministic path.) */
async function loginProvider(page: import('@playwright/test').Page) {
  const resp = await page.request.post(`${BASE_URL}/api/auth/login`, {
    headers: { 'Content-Type': 'application/json' },
    data: { email: PROVIDER_EMAIL, password: PROVIDER_PASSWORD },
  });
  expect(resp.ok(), `login failed: ${resp.status()}`).toBeTruthy();
}

// Seeded facts (server/seeds/phase-d-kyoto-vendors.seed.ts): three services on this
// provider. The two below are approved+active (surface on Preview + storefront); the
// third — "Business Document Translation" — is approved+draft (Manage only).
const LIVE_SERVICES = [
  'Business Meeting Interpretation (Full Day)',
  'Conference & Event Interpretation',
];
const HIDDEN_SERVICE = 'Business Document Translation';

test.describe('/provider/services — Manage ⇄ Preview toggle (lane C2)', () => {
  test('Preview mirrors the public storefront visibility filter; hover-Edit is present', async ({ page }) => {
    await loginProvider(page);

    await page.goto(`${BASE_URL}/provider/services`, { waitUntil: 'domcontentloaded', timeout: 30_000 });

    // ── (a) Manage view (default) shows the management cards with their affordances ──────────
    await expect(page.getByTestId('button-mode-manage')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('button-mode-preview')).toBeVisible();

    // A management card carries the operational controls (status switch + edit link).
    const manageCards = page.locator('[data-testid^="card-service-"]');
    await expect(manageCards.first()).toBeVisible({ timeout: 15_000 });
    expect(await page.locator('[data-testid^="switch-active-"]').count()).toBeGreaterThan(0);
    expect(await page.locator('[data-testid^="button-edit-"]').count()).toBeGreaterThan(0);

    // The draft listing IS visible in Manage (owner console is ungated on status).
    await expect(
      page.locator('[data-testid^="card-service-"]', { hasText: HIDDEN_SERVICE }),
    ).toHaveCount(1);
    // Sanity: the live ones are in Manage too.
    for (const name of LIVE_SERVICES) {
      await expect(
        page.locator('[data-testid^="card-service-"]', { hasText: name }),
      ).toHaveCount(1);
    }

    // ── (b) Switch to Preview — listings render through C1's shared OfferingCard ─────────────
    await page.getByTestId('button-mode-preview').click();

    const previewGrid = page.getByTestId('catalog-preview-grid');
    await expect(previewGrid).toBeVisible({ timeout: 10_000 });

    // The Preview cards emit the storefront card's own testid shape (storefront-service-<id>),
    // proving the shared traveler card is what renders here.
    const previewCards = previewGrid.locator('[data-testid^="storefront-service-"]');
    expect(await previewCards.count()).toBe(LIVE_SERVICES.length);

    for (const name of LIVE_SERVICES) {
      const card = previewGrid.locator('[data-testid^="storefront-service-"]', { hasText: name });
      await expect(card).toHaveCount(1);
      // Storefront card shape: title heading + a book CTA + a link into the service detail page.
      await expect(card.getByRole('heading', { name })).toBeVisible();
      await expect(card).toContainText(/View & book →|Check dates →/);
      await expect(card).toHaveAttribute('href', /^\/services\//);
    }

    // ── (c) THE HONESTY PROOF — the approved+DRAFT listing is ABSENT from Preview ────────────
    await expect(
      previewGrid.locator('[data-testid^="storefront-service-"]', { hasText: HIDDEN_SERVICE }),
    ).toHaveCount(0);
    // And it does not sneak in under the preview-card wrapper either.
    await expect(page.locator('[data-testid^="preview-card-"]', { hasText: HIDDEN_SERVICE })).toHaveCount(0);

    // ── (d) Hover-Edit affordance exists on a Preview card (ruling 74 resolution B) ──────────
    const firstPreviewWrapper = page.locator('[data-testid^="preview-card-"]').first();
    await expect(firstPreviewWrapper).toBeVisible();
    const editAffordance = firstPreviewWrapper.locator('[data-testid^="button-preview-edit-"]');
    // Present in the DOM (hover-only: opacity 0 until hover, so assert attached, then visible on hover).
    await expect(editAffordance).toHaveCount(1);
    await expect(editAffordance).toHaveAttribute('href', /\/(edit|workstation)/);
    await firstPreviewWrapper.hover();
    await expect(editAffordance).toBeVisible();

    // ── Switching back to Manage restores the operational cards ──────────────────────────────
    await page.getByTestId('button-mode-manage').click();
    await expect(page.locator('[data-testid^="card-service-"]').first()).toBeVisible();
  });
});
