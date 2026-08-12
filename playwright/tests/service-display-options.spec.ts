/**
 * service-display-options.spec.ts
 *
 * Catalog+Distribute ruling 74/75, lane C3 proof — the provider Catalog's per-listing "Card shows"
 * control (client/src/pages/provider/services.tsx CardShowsControl) drives the SHARED traveler
 * OfferingCard rendered in the Preview toggle. Setting Booking = Request flips the card's CTA from
 * the book affordance to "Request to book →"; turning Show price OFF replaces the price with the
 * honest "Enquire for pricing" (never a $0). Both PATCH /api/provider/services/:id and are reflected
 * on the very next Preview render — the same values the public storefront honors.
 *
 * The spec RESTORES every value it changes (Booking → Instant, Show price → on) before it ends, so a
 * shared dev DB is left exactly as C1/C2's specs (offering-card / catalog-preview-toggle) expect it —
 * an instant listing renders "View & book →" and its price.
 *
 * Auth: seeded provider kyoto-interpreter@traveloure.test / TestPass123! (instantBooking=true, so an
 * unset listing resolves to 'instant' — the pre-change baseline is the book CTA).
 *
 * Relevant source:
 *   client/src/pages/provider/services.tsx   (CardShowsControl + the Manage/Preview toggle)
 *   client/src/components/OfferingCard.tsx    (showPrice / bookingMode props)
 *   server/routes/storefront.routes.ts        (resolveBookingMode on the read)
 */
import { test, expect, type Page } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5000';
const PROVIDER_EMAIL = 'kyoto-interpreter@traveloure.test';
const PROVIDER_PASSWORD = 'TestPass123!';
const LIVE_SERVICE = 'Business Meeting Interpretation (Full Day)';

async function loginProvider(page: Page) {
  const resp = await page.request.post(`${BASE_URL}/api/auth/login`, {
    headers: { 'Content-Type': 'application/json' },
    data: { email: PROVIDER_EMAIL, password: PROVIDER_PASSWORD },
  });
  expect(resp.ok(), `login failed: ${resp.status()}`).toBeTruthy();
}

test.describe('/provider/services — Card shows control drives the traveler card (lane C3)', () => {
  test('Booking mode + Show price on the Manage control change the Preview card', async ({ page }) => {
    await loginProvider(page);
    await page.goto(`${BASE_URL}/provider/services`, { waitUntil: 'domcontentloaded', timeout: 30_000 });

    // Locate the Manage card for a LIVE (approved+active) listing and recover its service id from the
    // card testid, so the control + preview selectors below key on the real row.
    const manageCard = page.locator('[data-testid^="card-service-"]', { hasText: LIVE_SERVICE });
    await expect(manageCard).toHaveCount(1, { timeout: 15_000 });
    const testId = await manageCard.getAttribute('data-testid');
    const serviceId = testId!.replace('card-service-', '');

    // The "Card shows" control is present on the Manage card.
    const control = page.getByTestId(`cardshows-${serviceId}`);
    await expect(control).toBeVisible();

    // ── Baseline: seeded booking_mode is unset → resolves to 'instant' (account instantBooking=true),
    //    so the Preview card renders the book CTA and the price. ─────────────────────────────────
    await page.getByTestId('button-mode-preview').click();
    let previewCard = page.getByTestId(`storefront-service-${serviceId}`);
    await expect(previewCard).toBeVisible({ timeout: 10_000 });
    await expect(previewCard).toContainText(/View & book →|Check dates →/);
    await expect(previewCard).toContainText(/\$\d/);

    // ── (a) Set Booking = Request on the Manage control ────────────────────────────────────────
    await page.getByTestId('button-mode-manage').click();
    await page.getByTestId(`button-cardshows-booking-${serviceId}-request`).click();
    // The mutation invalidates the services query; the segment reflects the new state.
    await expect(page.getByTestId(`button-cardshows-booking-${serviceId}-request`)).toHaveAttribute('aria-pressed', 'true');

    // Preview now shows the "Request to book" CTA.
    await page.getByTestId('button-mode-preview').click();
    previewCard = page.getByTestId(`storefront-service-${serviceId}`);
    await expect(previewCard).toBeVisible({ timeout: 10_000 });
    await expect(previewCard).toContainText('Request to book →');

    // ── (b) Turn Show price OFF → the card shows the honest enquire affordance, not a price ─────
    await page.getByTestId('button-mode-manage').click();
    await page.getByTestId(`switch-cardshows-price-${serviceId}`).click();
    await page.getByTestId('button-mode-preview').click();
    previewCard = page.getByTestId(`storefront-service-${serviceId}`);
    await expect(previewCard).toBeVisible({ timeout: 10_000 });
    await expect(previewCard.getByTestId(`storefront-service-${serviceId}-enquire-price`)).toBeVisible();
    await expect(previewCard).toContainText('Enquire for pricing');

    // ── RESTORE — Booking → Instant, Show price → on — so the shared DB matches C1/C2 expectations ─
    await page.getByTestId('button-mode-manage').click();
    await page.getByTestId(`switch-cardshows-price-${serviceId}`).click();
    await page.getByTestId(`button-cardshows-booking-${serviceId}-instant`).click();
    await expect(page.getByTestId(`button-cardshows-booking-${serviceId}-instant`)).toHaveAttribute('aria-pressed', 'true');

    // Confirm the restore is visible on Preview (book CTA + price back).
    await page.getByTestId('button-mode-preview').click();
    previewCard = page.getByTestId(`storefront-service-${serviceId}`);
    await expect(previewCard).toBeVisible({ timeout: 10_000 });
    await expect(previewCard).toContainText(/View & book →|Check dates →/);
    await expect(previewCard).toContainText(/\$\d/);
  });
});
