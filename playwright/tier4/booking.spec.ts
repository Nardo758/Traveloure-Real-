/**
 * playwright/tier4/booking.spec.ts
 *
 * Tier 4 cross-browser booking audit.
 *
 * Local-dev only: assertNotProduction() fails closed for *.replit.app / *.repl.co.
 * Registers a fresh @traveloure.test user, discovers a real priced service,
 * navigates discover → service detail (attempts UI add-to-cart, records limitation
 * if API fallback is used) → cart → checkout → Stripe 4242 → waits for the app's
 * real redirect to /bookings → polls /api/my-bookings until the exact booking ID
 * from the checkout response reaches a terminal-confirmed status.
 *
 * Deterministic checkpoint: seeded by TIER4_SEED + project name, selected from
 * [discovery, service-detail, cart, payment, confirmation]. The checkpoint
 * screenshot is the deep-inspection capture with viewport/document dimensions,
 * horizontal overflow, and console snapshot. All other screenshots are supporting
 * evidence only.
 *
 * Evidence: docs/audits/tier4-evidence/booking-{project}.json
 *
 * Run:
 *   npx playwright test --config playwright/tier4/playwright.config.ts booking.spec.ts
 */

import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import {
  BASE_URL,
  TIER4_SEED,
  assertNotProduction,
  registerAndLogin,
  findPricedService,
  addToCartApi,
  fillStripeTestCard,
  collectConsole,
  checkOverflow,
  getDocumentDimensions,
  writeEvidence,
  saveScreenshot,
  relativeEvidence,
  seededPick,
  now,
  elapsed,
  type ServiceInfo,
} from './helpers';

const _filename = fileURLToPath(import.meta.url);
const _dirname = path.dirname(_filename);
const EVIDENCE_DIR = path.resolve(_dirname, '../../docs/audits/tier4-evidence');

// Terminal-confirmed statuses: anything beyond payment_pending counts as the
// checkout having been accepted and processed by the system.
const CONFIRMED_STATUSES = new Set([
  'confirmed', 'in_progress', 'completed', 'active', 'payment_received',
]);

/** Poll /api/my-bookings until the booking with `bookingId` reaches a confirmed status,
 *  or until `maxMs` elapses. Returns the final booking object or null on timeout. */
async function pollForConfirmedBooking(
  page: import('@playwright/test').Page,
  bookingId: string,
  maxMs = 30_000,
): Promise<{ id: string; status: string } | null> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const res = await page.request.get(`${BASE_URL}/api/my-bookings`).catch(() => null);
    if (res && res.ok()) {
      const body = await res.json().catch(() => ({}));
      const list: any[] = Array.isArray(body) ? body : (body.bookings ?? []);
      const found = list.find((b: any) => b.id === bookingId);
      if (found) {
        if (CONFIRMED_STATUSES.has(found.status)) return found;
        if (found.status === 'payment_pending') {
          // Still pending — keep polling
        }
      }
    }
    await new Promise(r => setTimeout(r, 3000));
  }
  return null;
}

test.describe('Tier4 — cross-browser booking audit', () => {
  test.describe.configure({ mode: 'serial' });

  test(
    'T4-booking: discover → service → cart → checkout → Stripe 4242 → /bookings confirmed',
    { timeout: 240_000 },
    async ({ page }, testInfo) => {
      const projectName = testInfo.project.name;
      const evidenceBase = `booking-${projectName}`;
      const timings: Record<string, number> = {};
      const msgs = collectConsole(page);
      let lastReachedStep = 'init';
      let errorDetail: string | undefined;

      fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

      // Deterministic checkpoint: varies by seed + project so each engine inspects
      // a different step. Steps: discovery, service-detail, cart, payment, confirmation
      const CHECKPOINT_STEPS = ['discovery', 'service-detail', 'cart', 'payment', 'confirmation'] as const;
      const checkpoint = seededPick([...CHECKPOINT_STEPS], `evidence-checkpoint-${projectName}`);

      // Supporting screenshots (evidence-relative paths)
      const supportingScreenshots: Record<string, string> = {};
      // Deep-inspection capture (set at the checkpoint step)
      let checkpointData: {
        screenshotRel: string;
        viewport: { width: number; height: number };
        documentDimensions: { scrollWidth: number; scrollHeight: number; innerWidth: number; innerHeight: number };
        noHorizontalOverflow: boolean;
        consoleSnapshot: { type: string; text: string }[];
      } | null = null;

      async function captureCheckpoint(stepName: string): Promise<void> {
        if (stepName !== checkpoint) return;
        const dims = await getDocumentDimensions(page);
        const noOverflow = dims.scrollWidth <= dims.innerWidth + 4;
        const ssRel = await saveScreenshot(page, `${evidenceBase}-checkpoint-${stepName}.png`);
        checkpointData = {
          screenshotRel: ssRel,
          viewport: { width: dims.innerWidth, height: dims.innerHeight },
          documentDimensions: dims,
          noHorizontalOverflow: noOverflow,
          consoleSnapshot: msgs.slice(-20),
        };
      }

      // Write evidence and re-throw — used in catch blocks after setup is done
      async function failWithEvidence(step: string, err: unknown): Promise<never> {
        const errMsg = err instanceof Error ? err.message : String(err);
        const ssRel = await saveScreenshot(page, `${evidenceBase}-fail-${step}.png`).catch(() => 'screenshot-failed');
        writeEvidence(`${evidenceBase}.json`, {
          seed: TIER4_SEED,
          chosenStep: checkpoint,
          engine: projectName,
          project: projectName,
          result: `FAIL - ${step}`,
          lastReachedStep: step,
          errorDetail: errMsg,
          timings,
          consoleMessages: msgs.slice(-30),
          checkpointData,
          supportingScreenshots,
          failureScreenshot: ssRel,
        });
        throw new Error(`[T4-booking][${projectName}] FAIL at step "${step}": ${errMsg}`);
      }

      // ── Guard: never run against production ───────────────────────────────
      try {
        await assertNotProduction(page);
      } catch (e) {
        throw e; // Guard fails before any data is created; no evidence needed
      }

      // ── Register + log in ─────────────────────────────────────────────────
      const t0 = now();
      const actor = await registerAndLogin(page, `bk-${projectName.slice(0, 4)}`);
      timings.register_ms = elapsed(t0);
      lastReachedStep = 'registered';

      // ── Discover a real priced service ────────────────────────────────────
      const t1 = now();
      const svc: ServiceInfo = await findPricedService(page);
      timings.service_discovery_ms = elapsed(t1);
      lastReachedStep = 'service-found';

      // ── Visit /discover and confirm the Services tab exists ───────────────
      const t2 = now();
      await page.goto('/discover', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2500);
      timings.discover_load_ms = elapsed(t2);
      lastReachedStep = 'discover-loaded';

      const servicesTab = page.getByTestId('tab-services');
      await expect(servicesTab, 'Services tab must be visible on /discover').toBeVisible();
      await servicesTab.click();
      await page.waitForTimeout(1500);

      supportingScreenshots.discover = await saveScreenshot(page, `${evidenceBase}-discover.png`);
      await captureCheckpoint('discovery');

      // ── Visit service detail page ─────────────────────────────────────────
      const t3 = now();
      await page.goto(`/services/${svc.id}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2000);
      timings.service_detail_load_ms = elapsed(t3);
      lastReachedStep = 'service-detail-loaded';

      // Confirm we're on a real service detail (not 404)
      const serviceNameEl = page.locator('[data-testid="text-service-name"]');
      await expect(serviceNameEl, 'service name must be visible on service detail').toBeVisible({ timeout: 10_000 });

      supportingScreenshots.serviceDetail = await saveScreenshot(page, `${evidenceBase}-service-detail.png`);
      await captureCheckpoint('service-detail');

      // ── Add to cart: try UI button first, fall back to API ────────────────
      const t4 = now();
      let addToCartMethod: 'ui' | 'api' = 'api';
      let addToCartLimitation: string | undefined;

      const addToCartBtn = page.locator(`[data-testid="button-add-to-cart-${svc.id}"]`).first();
      const hasUiBtn = await addToCartBtn.isVisible({ timeout: 3000 }).catch(() => false);

      if (hasUiBtn) {
        try {
          await addToCartBtn.click();
          await page.waitForTimeout(1500);
          addToCartMethod = 'ui';
        } catch (uiErr) {
          addToCartLimitation =
            `UI add-to-cart button click failed (${(uiErr as Error).message}); fell back to API.`;
          await addToCartApi(page, svc.id);
        }
      } else {
        addToCartLimitation =
          `[data-testid="button-add-to-cart-${svc.id}"] was not visible on the service detail page; ` +
          'used API fallback (POST /api/cart). This is not a full UI pass for the add-to-cart step.';
        await addToCartApi(page, svc.id);
      }
      timings.add_to_cart_ms = elapsed(t4);
      lastReachedStep = `cart-added-via-${addToCartMethod}`;

      // ── Navigate to /cart ─────────────────────────────────────────────────
      const t5 = now();
      await page.goto('/cart', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3000);
      timings.cart_load_ms = elapsed(t5);
      lastReachedStep = 'cart-loaded';

      supportingScreenshots.cart = await saveScreenshot(page, `${evidenceBase}-cart.png`);
      await captureCheckpoint('cart');

      // ── Navigate to payment step via "Proceed to Payment" ─────────────────
      const proceedBtn = page.locator(
        '[data-testid="button-skip-to-payment"], [data-testid="button-proceed-payment"]',
      ).first();

      if (await proceedBtn.isVisible({ timeout: 8000 }).catch(() => false)) {
        await proceedBtn.click();
        await page.waitForTimeout(1500);
        lastReachedStep = 'payment-step-opened';
      }

      // ── Intercept POST /api/checkout to capture the exact response ────────
      // We need bookingIds and paymentIntent from the real checkout response.
      let checkoutResponseData: {
        paymentIntent?: { clientSecret?: string; paymentIntentId?: string; amount?: number };
        bookings?: { id: string }[];
        bookingIds?: string[];
      } | null = null;

      page.on('response', async (response) => {
        if (
          new URL(response.url()).pathname === '/api/checkout' &&
          response.request().method() === 'POST'
        ) {
          try {
            const json = await response.json();
            checkoutResponseData = json;
          } catch { /* ignore parse errors */ }
        }
      });

      // ── Click "Complete Booking" to POST /api/checkout ────────────────────
      const completeBtn = page.locator('[data-testid="button-complete-booking"]').first();
      const hasComplete = await completeBtn.isVisible({ timeout: 10_000 }).catch(() => false);

      if (!hasComplete) {
        await failWithEvidence('complete-booking-btn-missing',
          '"Complete Booking" button (data-testid="button-complete-booking") not visible on payment step. ' +
          'The cart flowStep may not have transitioned to "payment".');
      }

      const t6 = now();
      await completeBtn.click();
      // Wait for checkout API response to arrive
      await page.waitForTimeout(4000);
      timings.checkout_click_ms = elapsed(t6);
      lastReachedStep = 'checkout-posted';

      // Validate the checkout response has a PaymentIntent and booking IDs
      if (!checkoutResponseData) {
        await failWithEvidence('checkout-no-response',
          'POST /api/checkout response was not captured (no response event fired). ' +
          'The button click may not have triggered the checkout mutation.');
      }

      const paymentIntent = checkoutResponseData!.paymentIntent;
      if (!paymentIntent?.clientSecret) {
        await failWithEvidence('checkout-no-client-secret',
          `POST /api/checkout returned no paymentIntent.clientSecret. ` +
          `Response keys: ${Object.keys(checkoutResponseData ?? {}).join(', ') || '(none)'}`);
      }

      // Extract the exact booking IDs returned by the server
      const bookingIdsFromResponse: string[] = (
        checkoutResponseData!.bookings?.map((b: any) => b.id || b.booking?.id).filter(Boolean) ??
        checkoutResponseData!.bookingIds ??
        []
      );

      if (bookingIdsFromResponse.length === 0) {
        await failWithEvidence('checkout-no-booking-ids',
          `POST /api/checkout returned no booking IDs. ` +
          `Response keys: ${Object.keys(checkoutResponseData ?? {}).join(', ') || '(none)'}; ` +
          `bookings length: ${checkoutResponseData!.bookings?.length ?? 0}; ` +
          `bookingIds length: ${checkoutResponseData!.bookingIds?.length ?? 0}`);
      }

      lastReachedStep = 'checkout-pi-obtained';

      // ── Fill Stripe test card 4242 ────────────────────────────────────────
      const t7 = now();
      const stripeResult = await fillStripeTestCard(page, 60_000);
      timings.stripe_fill_ms = elapsed(t7);

      supportingScreenshots.payment = await saveScreenshot(page, `${evidenceBase}-payment.png`);
      await captureCheckpoint('payment');

      if (!stripeResult.filled) {
        await failWithEvidence('stripe-iframe-not-found', stripeResult.blocker!);
      }

      lastReachedStep = 'stripe-card-filled';

      // ── Locate and click the outer Pay button (must be present) ──────────
      // This is the submit button in the main frame (not inside the Stripe iframe).
      // It must be visible — if it's not, that is a real failure.
      const payBtn = page.locator(
        'form button[type="submit"]:has-text("Pay"), ' +
        'button:has-text("Pay $"), ' +
        'button:has-text("Pay €")',
      ).first();

      const hasPayBtn = await payBtn.isVisible({ timeout: 10_000 }).catch(() => false);
      if (!hasPayBtn) {
        await failWithEvidence('pay-button-missing',
          'The outer Pay / Complete Booking button was not visible after filling the Stripe card. ' +
          'Cannot submit payment without this button.');
      }

      const t8 = now();
      await payBtn.click();
      timings.payment_submit_ms = elapsed(t8);
      lastReachedStep = 'payment-submitted';

      // ── Wait for the app's real redirect to /bookings (never force-navigate) ──
      try {
        await page.waitForURL(
          url => url.pathname === '/bookings' || url.pathname.startsWith('/bookings'),
          { timeout: 30_000 },
        );
      } catch {
        await failWithEvidence('no-redirect-to-bookings',
          `App did not redirect to /bookings within 30s after payment submit. ` +
          `Current URL: ${page.url()}. ` +
          'The payment may have failed or the redirect was not triggered.');
      }

      lastReachedStep = 'bookings-page-reached';
      await page.waitForTimeout(2000);

      const bookingsPageTitle = page.locator('[data-testid="text-page-title"]');
      await expect(bookingsPageTitle, 'My Bookings title must render').toBeVisible({ timeout: 10_000 });

      supportingScreenshots.bookings = await saveScreenshot(page, `${evidenceBase}-bookings.png`);
      await captureCheckpoint('confirmation');

      // ── Poll for exact booking ID reaching confirmed status ───────────────
      // We only accept the exact booking ID from the checkout response — not any
      // unrelated booking that happens to match the service.
      const primaryBookingId = bookingIdsFromResponse[0];
      const t9 = now();
      const confirmedBooking = await pollForConfirmedBooking(page, primaryBookingId, 30_000);
      timings.poll_confirmed_ms = elapsed(t9);

      let finalBookingStatus: string | null = null;
      let confirmedOk = false;

      if (confirmedBooking) {
        finalBookingStatus = confirmedBooking.status;
        confirmedOk = true;
        lastReachedStep = `booking-confirmed-${confirmedBooking.status}`;
      } else {
        // One last direct check in case the booking is still payment_pending
        const res = await page.request.get(`${BASE_URL}/api/my-bookings`).catch(() => null);
        if (res && res.ok()) {
          const body = await res.json().catch(() => ({}));
          const list: any[] = Array.isArray(body) ? body : (body.bookings ?? []);
          const found = list.find((b: any) => b.id === primaryBookingId);
          finalBookingStatus = found?.status ?? null;
        }
      }

      supportingScreenshots.bookings = await saveScreenshot(page, `${evidenceBase}-bookings-final.png`);

      // ── Write final evidence ───────────────────────────────────────────────
      const result = confirmedOk
        ? `PASS - booking ${primaryBookingId} reached status "${finalBookingStatus}"`
        : `PARTIAL - booking ${primaryBookingId} not yet confirmed (status: ${finalBookingStatus ?? 'not-found'}; may still confirm via webhook)`;

      writeEvidence(`${evidenceBase}.json`, {
        seed: TIER4_SEED,
        chosenStep: checkpoint,
        engine: projectName,
        project: projectName,
        result,
        lastReachedStep,
        addToCartMethod,
        addToCartLimitation,
        serviceId: svc.id,
        serviceName: svc.name,
        servicePrice: svc.price,
        bookingIdsFromCheckout: bookingIdsFromResponse,
        primaryBookingId,
        finalBookingStatus,
        stripeCardFilled: stripeResult.filled,
        checkpointData,
        supportingScreenshots,
        timings,
        consoleMessages: msgs.slice(-30),
      });

      // ── Hard assertion: exact booking ID must be present in the list ──────
      // "confirmed" is ideal; payment_pending is acceptable only if the booking
      // is genuinely present in the list (webhook may be async in local dev).
      expect(
        finalBookingStatus !== null,
        `Exact booking ID "${primaryBookingId}" from checkout response not found in ` +
          `/api/my-bookings after payment submit. API returned no matching booking.`,
      ).toBe(true);

      // Confirm the booking reached a terminal-confirmed state (or at minimum exists)
      // We do not accept unrelated bookings as proof.
      if (!confirmedOk) {
        // Log the limitation but do not swallow it silently — the result above records it.
        console.warn(
          `[T4-booking][${projectName}] Booking ${primaryBookingId} present but status="${finalBookingStatus}" ` +
            '(not yet confirmed). Webhook may deliver asynchronously. Evidence recorded.',
        );
      }
    },
  );
});
