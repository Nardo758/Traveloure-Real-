/**
 * offering-card.spec.ts
 *
 * Catalog+Distribute ruling 74, lane C1 proof — the traveler-facing offering
 * card was extracted from a local, un-exported component in
 * client/src/pages/storefront.tsx into the shared, exported
 * client/src/components/OfferingCard.tsx (so C2's Catalog Preview can render the
 * exact same card). This spec proves the seeded storefront `/p/kyoto-interpreter`
 * still renders its offering cards THROUGH the extracted component with no
 * regression: the same `data-testid`s are present, and each card shows its
 * title, price, and book affordance.
 *
 * No auth required — the storefront is a public page. Selectors are the real
 * `storefront-service-<id>` testids the extracted OfferingCard emits, resolved
 * from the live GET /api/storefront/:handle payload (we don't hardcode ids).
 *
 * Seeded facts asserted (server/seeds): the kyoto-interpreter provider sells
 * "Business Meeting Interpretation (Full Day)" and "Conference & Event
 * Interpretation"; both are approved+active so they surface on the storefront.
 *
 * Relevant source:
 *   client/src/components/OfferingCard.tsx   (the extracted card)
 *   client/src/pages/storefront.tsx          (adopts it, deleted local copy)
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5000';
const HANDLE = 'kyoto-interpreter';

const EXPECTED_SERVICES = [
  'Business Meeting Interpretation (Full Day)',
  'Conference & Event Interpretation',
];

test.describe('/p/:handle — extracted OfferingCard (lane C1)', () => {
  test('seeded storefront renders offering cards through the shared component', async ({ page }) => {
    await page.goto(`${BASE_URL}/p/${HANDLE}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });

    // The storefront page shell renders (not the not-found state).
    await expect(page.getByTestId('storefront-page')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('storefront-not-found')).toHaveCount(0);

    // Services lane exists and holds cards emitted by the extracted OfferingCard,
    // each with a `storefront-service-<id>` testid (the card's `testId` prop).
    const lane = page.getByTestId('storefront-lane-services');
    await expect(lane).toBeVisible();
    const cards = lane.locator('[data-testid^="storefront-service-"]');
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(EXPECTED_SERVICES.length);

    // Each expected seeded service renders as a card with title + price + CTA.
    for (const name of EXPECTED_SERVICES) {
      const card = lane.locator('[data-testid^="storefront-service-"]', { hasText: name });
      await expect(card).toHaveCount(1);

      // Title (the <h3> the card emits).
      await expect(card.getByRole('heading', { name })).toBeVisible();

      // Price affordance — a "$<n>" or a "Custom quote" (both real card outputs).
      await expect(card).toContainText(/\$\d|Custom quote/);

      // Book affordance — the CTA span the card renders ("View & book →" for a
      // bookable interpretation service).
      await expect(card).toContainText(/View & book →|Check dates →|View listing →/);

      // The card is a link into the service detail page (the OfferingCard <Link href>).
      await expect(card).toHaveAttribute('href', /^\/services\//);
    }
  });
});
