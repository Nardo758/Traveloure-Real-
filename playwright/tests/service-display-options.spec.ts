/**
 * service-display-options.spec.ts
 *
 * Catalog+Distribute ruling 74/75, lane C3 proof — the provider Catalog's per-listing "Card shows"
 * control (client/src/pages/provider/services.tsx CardShowsControl) drives the traveler-facing
 * Preview card. Setting Booking = Request flips the card's CTA from "Book" to "Request to book";
 * turning Show price OFF hides the price (the mock's own `visibility:hidden` treatment — the price
 * box keeps its layout slot rather than being replaced with substitute copy, §13: no fabricated
 * "Enquire" text for a state the row doesn't describe that way). Both PATCH /api/provider/services/:id
 * and are reflected on the very next Preview render — the same values the public storefront honors.
 *
 * The spec RESTORES every value it changes (Booking → Instant, Show price → on) before it ends, so a
 * shared dev DB is left exactly as C1/C2's specs (offering-card / catalog-preview-toggle) expect it —
 * an instant listing renders "Book" and its price.
 *
 * Auth: seeded provider kyoto-interpreter@traveloure.test / TestPass123! (instantBooking=true, so an
 * unset listing resolves to 'instant' — the pre-change baseline is the book CTA).
 *
 * CardShowsControl renders INLINE on the Manage row's card face (no click needed to reveal it —
 * `client/src/pages/provider/services.tsx`'s own comment documents this as a deliberate departure
 * from an earlier gear-popover design; a prior version of this spec assumed the popover and never
 * got updated when the Catalog rebuild (docs/DECISIONS.md ledger row 110) landed the inline control —
 * this spec now matches the shipped Manage UI rather than a design that was superseded before it shipped.
 *
 * Relevant source:
 *   client/src/pages/provider/services.tsx          (CardShowsControl + the Manage/Preview toggle)
 *   client/src/lib/catalog-preview-presentation.ts   (CTA/price derivation the Preview card renders)
 *   server/routes/storefront.routes.ts               (resolveBookingMode on the read)
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

    // The "Card shows" control is inline on the Manage row — visible without an extra click.
    const cardShows = page.getByTestId(`cardshows-${serviceId}`);
    await expect(cardShows).toBeVisible({ timeout: 10_000 });

    // ── Baseline: seeded booking_mode is unset → resolves to 'instant' (account instantBooking=true),
    //    so the Preview card renders the "Book" CTA and the price. ─────────────────────────────────
    await page.getByTestId('button-mode-preview').click();
    let previewCard = page.getByTestId(`storefront-service-${serviceId}`);
    await expect(previewCard).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId(`catalog-preview-cta-${serviceId}`)).toHaveText('Book');
    await expect(page.getByTestId(`catalog-preview-price-${serviceId}`)).toBeVisible();

    // ── (a) Set Booking = Request on the Manage control ────────────────────────────────────────
    await page.getByTestId('button-mode-manage').click();
    await page.getByTestId(`button-cardshows-booking-${serviceId}-request`).click();
    // The mutation invalidates the services query; the segment reflects the new state.
    await expect(page.getByTestId(`button-cardshows-booking-${serviceId}-request`)).toHaveAttribute('aria-pressed', 'true');

    // Preview now shows the outlined "Request to book" CTA.
    await page.getByTestId('button-mode-preview').click();
    previewCard = page.getByTestId(`storefront-service-${serviceId}`);
    await expect(previewCard).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId(`catalog-preview-cta-${serviceId}`)).toHaveText('Request to book');

    // ── (b) Turn Show price OFF → the mock's own hidden-price treatment (visibility:hidden), not a
    //        fabricated "Enquire" substitute — the price element stays attached but not visible ────
    await page.getByTestId('button-mode-manage').click();
    await page.getByTestId(`switch-cardshows-price-${serviceId}`).click();
    await page.getByTestId('button-mode-preview').click();
    previewCard = page.getByTestId(`storefront-service-${serviceId}`);
    await expect(previewCard).toBeVisible({ timeout: 10_000 });
    const priceEl = page.getByTestId(`catalog-preview-price-${serviceId}`);
    await expect(priceEl).toBeAttached();
    await expect(priceEl).toBeHidden();
    // Booking = Request from step (a) is untouched by the price toggle — CTA still reads "Request to book".
    await expect(page.getByTestId(`catalog-preview-cta-${serviceId}`)).toHaveText('Request to book');

    // ── RESTORE — Booking → Instant, Show price → on — so the shared DB matches C1/C2 expectations ─
    await page.getByTestId('button-mode-manage').click();
    await page.getByTestId(`switch-cardshows-price-${serviceId}`).click();
    await page.getByTestId(`button-cardshows-booking-${serviceId}-instant`).click();
    await expect(page.getByTestId(`button-cardshows-booking-${serviceId}-instant`)).toHaveAttribute('aria-pressed', 'true');

    // Confirm the restore is visible on Preview ("Book" CTA + price back).
    await page.getByTestId('button-mode-preview').click();
    previewCard = page.getByTestId(`storefront-service-${serviceId}`);
    await expect(previewCard).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId(`catalog-preview-cta-${serviceId}`)).toHaveText('Book');
    await expect(page.getByTestId(`catalog-preview-price-${serviceId}`)).toBeVisible();
  });
});
