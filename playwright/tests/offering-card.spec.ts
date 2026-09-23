/**
 * offering-card.spec.ts
 *
 * Catalog+Distribute ruling 74, lane C1 proof — the traveler-facing offering
 * card was extracted from a local, un-exported component in
 * client/src/pages/storefront.tsx into a shared, exported
 * client/src/components/OfferingCard.tsx (so C2's Catalog Preview could render
 * the exact same card). This spec proves the legacy `/p/kyoto-interpreter` link
 * permanently redirects to the canonical provider storefront while its offering
 * cards still render with no regression.
 *
 * WHAT IT ACTUALLY DRIVES, corrected 2026-09-15 (ledger `2026-09-15-buy-label-cards`):
 * the LIVE storefront page, never the extracted component in isolation. Both
 * consumers later re-forked their own card — `StorefrontOfferingCard` here and
 * `CatalogPreviewOfferCard` in client/src/pages/provider/services.tsx — which left
 * the shared file with zero importers, and §18c deleted it. Every assertion below is
 * unchanged and still describes the rendered storefront: this spec was never a
 * render harness for that file, so it is kept rather than deleted with it. It stays
 * ORPHANED for its own separate, recorded reason (ledger
 * `2026-09-14-test-files-wired-orphans`): it expects a SERVER 301 on `/p/:handle`,
 * which is a client route now.
 *
 * No auth required — the storefront is a public page. Selectors are the real
 * `storefront-service-<id>` testids the card emits, resolved from the live
 * GET /api/storefront/:handle payload (we don't hardcode ids).
 *
 * Seeded facts asserted (server/seeds): the kyoto-interpreter provider sells
 * "Business Meeting Interpretation (Full Day)" and "Conference & Event
 * Interpretation"; both are approved+active so they surface on the storefront.
 *
 * Relevant source:
 *   client/src/pages/storefront.tsx          (StorefrontOfferingCard — the live card)
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5000';
const HANDLE = 'kyoto-interpreter';

const EXPECTED_SERVICES = [
  'Business Meeting Interpretation (Full Day)',
  'Conference & Event Interpretation',
];

test.describe('/p/:handle — legacy redirect + extracted OfferingCard (lane C1)', () => {
  test('seeded storefront renders offering cards through the shared component', async ({ page }) => {
    const redirect = await page.request.get(`${BASE_URL}/p/${HANDLE}`, {
      maxRedirects: 0,
    });
    expect(redirect.status()).toBe(301);
    expect(redirect.headers().location).toBe(`/s/${HANDLE}`);

    await page.goto(`${BASE_URL}/p/${HANDLE}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });

    await expect(page).toHaveURL(new RegExp(`/s/${HANDLE}$`));

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
    const storefrontResponse = await page.request.get(`${BASE_URL}/api/storefront/${HANDLE}`);
    expect(storefrontResponse.ok()).toBeTruthy();
    const storefront = await storefrontResponse.json() as {
      services: Array<{ serviceName: string; buyAction?: { primary?: { label?: string } } }>;
    };

    // Each expected seeded service renders as a card with title + price + CTA.
    for (const name of EXPECTED_SERVICES) {
      const card = lane.locator('[data-testid^="storefront-service-"]', { hasText: name });
      await expect(card).toHaveCount(1);

      // Title (the <h3> the card emits).
      await expect(card.getByRole('heading', { name })).toBeVisible();

      // Price affordance — a "$<n>" or a "Custom quote" (both real card outputs).
      await expect(card).toContainText(/\$\d|Custom quote/);

      // The card repeats the server-authored buy-action label rather than deriving its own.
      const service = storefront.services.find((candidate) => candidate.serviceName === name);
      expect(service?.buyAction?.primary?.label).toBeTruthy();
      await expect(card).toContainText(`${service!.buyAction!.primary!.label} →`);

      // The card is a link into the service detail page (the OfferingCard <Link href>).
      await expect(card).toHaveAttribute('href', /^\/services\//);
    }
  });

  test('expert directory trip handoff reaches handled storefront service links without booking', async ({ page }) => {
    const tripId = 'playwright-trip-handoff';
    const forbiddenMutations: string[] = [];
    page.on('request', (request) => {
      if (
        request.method() !== 'GET' &&
        (
          request.url().includes('/api/expert-booking-requests') ||
          request.url().includes('/api/bookings')
        )
      ) {
        forbiddenMutations.push(`${request.method()} ${request.url()}`);
      }
    });

    await page.goto(`${BASE_URL}/experts?tripId=${tripId}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });

    const handledExpert = page.getByTestId(/card-expert-/).filter({ hasText: 'Sofia Chen' });
    await expect(handledExpert).toHaveCount(1);
    await handledExpert.getByTestId('button-view-profile').click();

    await expect(page).toHaveURL(new RegExp(`/s/sofia-chen\\?tripId=${tripId}$`));
    await expect(page.getByTestId('storefront-page')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('link-back-to-plan-storefront')).toHaveAttribute(
      'href',
      `/plans/${tripId}`,
    );
    await expect(page.getByTestId('button-plan-entry-storefront')).toHaveCount(0);
    await expect(page.getByText('Start a plan', { exact: false })).toHaveCount(0);

    const serviceLinks = page.locator('[data-testid^="storefront-service-"]');
    await expect(serviceLinks.first()).toBeVisible();
    const serviceCount = await serviceLinks.count();
    expect(serviceCount).toBeGreaterThan(0);
    for (let index = 0; index < serviceCount; index += 1) {
      await expect(serviceLinks.nth(index)).toHaveAttribute(
        'href',
        new RegExp(`^/services/[^?]+\\?tripId=${tripId}$`),
      );
    }
    expect(forbiddenMutations).toEqual([]);
  });
});
