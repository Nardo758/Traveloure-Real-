/**
 * playwright/tier4/keyboard.spec.ts
 *
 * Tier 4 keyboard-only checkout audit. Chromium ONLY.
 *
 * All navigation through the app uses Tab/Shift+Tab + Enter/Space only — zero
 * mouse clicks. locator.focus() is explicitly NEVER used (programmatic focus is
 * not keyboard interaction). Any step that requires programmatic focus to proceed
 * is recorded as an explicit blocker, not a pass.
 *
 * Flow:
 *   1. Register a fresh account + accept terms (API via page.request)
 *   2. Add a priced service to cart (API — logged as limitation, not a UI pass)
 *   3. Navigate to /cart; Tab through to "Proceed to Payment" button; activate via Enter
 *   4. Tab to "Complete Booking"; activate via Enter; wait for Stripe iframe
 *   5. First: attempt an empty/invalid submit to check validation announcements
 *      (check role=alert/status and aria-live on main page and Stripe frame)
 *   6. Tab into Stripe frame; type card details using page.keyboard only
 *      (Tab traversal, pressSequentially via page.keyboard.type)
 *   7. Tab back to outer Pay button; submit via Enter
 *   8. Wait for app redirect to /bookings; poll for exact booking ID confirmed status
 *
 * Evidence: docs/audits/tier4-evidence/keyboard-{project}.json
 *
 * Run:
 *   npx playwright test --config playwright/tier4/playwright.config.ts keyboard.spec.ts --project=chromium
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
  collectConsole,
  checkOverflow,
  safeFrameLabel,
  writeEvidence,
  saveScreenshot,
  now,
  elapsed,
} from './helpers';

const _filename = fileURLToPath(import.meta.url);
const _dirname = path.dirname(_filename);
const EVIDENCE_DIR = path.resolve(_dirname, '../../docs/audits/tier4-evidence');

// Keyboard-only test: Chromium exclusively
test.skip(({ browserName }) => browserName !== 'chromium', 'keyboard spec runs Chromium only');

// Terminal-confirmed statuses (same as booking.spec.ts)
const CONFIRMED_STATUSES = new Set([
  'confirmed', 'in_progress', 'completed', 'active', 'payment_received',
]);

// ── Focus tracking ────────────────────────────────────────────────────────────

interface FocusEntry {
  tag: string;
  role: string | null;
  label: string | null;
  testid: string | null;
  visibleFocus: boolean;
  index: number;
}

async function captureFocusedElement(
  page: import('@playwright/test').Page,
  index: number,
): Promise<FocusEntry> {
  return page.evaluate((idx) => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el.tagName === 'BODY')
      return { tag: 'body', role: null, label: null, testid: null, visibleFocus: false, index: idx };
    const styles = window.getComputedStyle(el);
    const outline = styles.outline;
    const boxShadow = styles.boxShadow;
    // Visible focus: non-zero outline OR box-shadow that looks like a focus ring
    const visibleFocus =
      (outline !== 'none' && outline !== '' && !outline.startsWith('0px none') && !outline.startsWith('0 ')) ||
      (boxShadow !== 'none' && boxShadow.includes('rgb'));
    return {
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute('role'),
      label:
        el.getAttribute('aria-label') ||
        el.getAttribute('aria-labelledby') ||
        el.getAttribute('name') ||
        el.getAttribute('placeholder') ||
        (el as HTMLButtonElement).innerText?.trim().slice(0, 60) ||
        null,
      testid: el.getAttribute('data-testid'),
      visibleFocus,
      index: idx,
    };
  }, index);
}

/**
 * Tab forward until `matcher(entry)` is true, or `maxTabs` is exhausted.
 * NEVER calls locator.focus() — pure keyboard traversal via page.keyboard.press('Tab').
 */
async function tabToElement(
  page: import('@playwright/test').Page,
  matcher: (entry: FocusEntry) => boolean,
  maxTabs = 80,
): Promise<{ found: boolean; focusOrder: FocusEntry[]; index: number }> {
  const focusOrder: FocusEntry[] = [];
  for (let i = 0; i < maxTabs; i++) {
    const entry = await captureFocusedElement(page, i);
    focusOrder.push(entry);
    if (matcher(entry)) return { found: true, focusOrder, index: i };
    await page.keyboard.press('Tab');
    await page.waitForTimeout(80);
  }
  return { found: false, focusOrder, index: maxTabs };
}

// ── Form label audit ──────────────────────────────────────────────────────────

async function checkFormLabels(page: import('@playwright/test').Page): Promise<{
  unlabelledInputs: number;
  unlabelledButtons: number;
  details: string[];
}> {
  return page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input, select, textarea'));
    const buttons = Array.from(document.querySelectorAll('button'));
    const details: string[] = [];
    let unlabelledInputs = 0;
    let unlabelledButtons = 0;

    for (const input of inputs) {
      const el = input as HTMLInputElement;
      const id = el.getAttribute('id');
      const hasLabel =
        el.getAttribute('aria-label') ||
        el.getAttribute('aria-labelledby') ||
        (id && document.querySelector(`label[for="${id}"]`));
      if (!hasLabel) {
        unlabelledInputs++;
        details.push(`unlabelled input: type=${el.type} name=${el.name || 'n/a'} id=${id || 'n/a'}`);
      }
    }

    for (const btn of buttons) {
      const b = btn as HTMLButtonElement;
      const hasLabel =
        b.innerText?.trim() ||
        b.getAttribute('aria-label') ||
        b.getAttribute('aria-labelledby') ||
        b.getAttribute('title');
      if (!hasLabel) {
        unlabelledButtons++;
        details.push(`unlabelled button: testid=${b.getAttribute('data-testid') || 'n/a'}`);
      }
    }

    return { unlabelledInputs, unlabelledButtons, details };
  });
}

// ── Validation announcement audit ─────────────────────────────────────────────

/** Check live/error semantics on the main page and every Stripe frame. */
async function auditValidationAnnouncements(
  page: import('@playwright/test').Page,
): Promise<{
  mainPage: {
    alerts: string[];
    statusRegions: string[];
    liveRegions: string[];
    invalidFieldDescriptions: string[];
  };
  stripeFrames: Array<{
    url: string;
    alerts: string[];
    statusRegions: string[];
    liveRegions: string[];
    invalidFieldDescriptions: string[];
  }>;
}> {
  const mainPage = await page.evaluate(() => {
    const cleanText = (el: Element | null, limit: number) =>
      ((el as HTMLElement | null)?.innerText || el?.textContent || '')
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .trim()
        .slice(0, limit);
    const alerts = Array.from(document.querySelectorAll('[role="alert"]'))
      .map(el => cleanText(el, 150))
      .filter(Boolean);
    const statusRegions = Array.from(document.querySelectorAll('[role="status"]'))
      .map(el => cleanText(el, 150))
      .filter(Boolean);
    const liveRegions = Array.from(document.querySelectorAll('[aria-live]'))
      .map(el => {
        const text = cleanText(el, 100);
        return text ? `[aria-live="${el.getAttribute('aria-live')}"] ${text}` : '';
      })
      .filter(Boolean);
    const invalidFieldDescriptions = Array.from(
      document.querySelectorAll('[aria-invalid="true"][aria-describedby]'),
    )
      .flatMap(el =>
        (el.getAttribute('aria-describedby') || '')
          .split(/\s+/)
          .filter(Boolean)
          .map(id => cleanText(document.getElementById(id), 150)),
      )
      .filter(Boolean);
    return { alerts, statusRegions, liveRegions, invalidFieldDescriptions };
  });

  const stripeFrames = page.frames().filter(
    f => f.url().includes('stripe.com') || f.name().startsWith('__privateStripeFrame'),
  );
  const stripeAudits: Array<{
    url: string;
    alerts: string[];
    statusRegions: string[];
    liveRegions: string[];
    invalidFieldDescriptions: string[];
  }> = [];

  for (const stripeFrame of stripeFrames) {
    const stripeAudit = await stripeFrame.evaluate(() => {
      const cleanText = (el: Element | null, limit: number) =>
        ((el as HTMLElement | null)?.innerText || el?.textContent || '')
          .replace(/[\u200B-\u200D\uFEFF]/g, '')
          .trim()
          .slice(0, limit);
      const alerts = Array.from(document.querySelectorAll('[role="alert"]'))
        .map(el => cleanText(el, 150))
        .filter(Boolean);
      const statusRegions = Array.from(document.querySelectorAll('[role="status"]'))
        .map(el => cleanText(el, 150))
        .filter(Boolean);
      const liveRegions = Array.from(document.querySelectorAll('[aria-live]'))
        .map(el => {
          const text = cleanText(el, 100);
          return text ? `[aria-live="${el.getAttribute('aria-live')}"] ${text}` : '';
        })
        .filter(Boolean);
      const invalidFieldDescriptions = Array.from(
        document.querySelectorAll('[aria-invalid="true"][aria-describedby]'),
      )
        .flatMap(el =>
          (el.getAttribute('aria-describedby') || '')
            .split(/\s+/)
            .filter(Boolean)
            .map(id => cleanText(document.getElementById(id), 150)),
        )
        .filter(Boolean);
      return { alerts, statusRegions, liveRegions, invalidFieldDescriptions };
    }).catch(() => null);
    if (stripeAudit) {
      stripeAudits.push({
        url: safeFrameLabel(stripeFrame.url(), stripeFrame.name()),
        ...stripeAudit,
      });
    }
  }

  return { mainPage, stripeFrames: stripeAudits };
}

// ── Stripe iframe keyboard fill ───────────────────────────────────────────────

async function waitForStripePaymentElement(
  page: import('@playwright/test').Page,
  maxWaitMs = 60_000,
): Promise<{ ready: boolean; blocker?: string }> {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    const payVisible = await page
      .locator('form button[type="submit"]:has-text("Pay")')
      .first()
      .isVisible()
      .catch(() => false);
    const stripeFrames = page.frames().filter(
      f => f.url().includes('stripe.com') || f.name().startsWith('__privateStripeFrame'),
    );
    let cardInputMounted = false;
    for (const frame of stripeFrames) {
      const count = await frame
        .locator(
          'input[name="number"], #Field-numberInput, ' +
            'input[data-elements-stable-field-name="cardNumber"]',
        )
        .count()
        .catch(() => 0);
      if (count > 0) {
        cardInputMounted = true;
        break;
      }
    }
    if (payVisible && cardInputMounted) return { ready: true };
    await page.waitForTimeout(1000);
  }

  return {
    ready: false,
    blocker:
      `Stripe PaymentElement did not fully render within ${maxWaitMs}ms after checkout. ` +
      'This blocks keyboard assessment but is not evidence that a rendered card field is ' +
      'keyboard-inaccessible. Frames observed: ' +
      page.frames().map(f => safeFrameLabel(f.url(), f.name())).join(', '),
  };
}

/**
 * Fill Stripe card fields using ONLY page.keyboard — no locator.focus().
 *
 * Strategy: Tab from the main page into the Stripe iframe. Once the active
 * element is inside a Stripe frame (detected by checking document.activeElement
 * in the frame), type the card digits via page.keyboard.type().
 *
 * Returns a detailed result including whether true keyboard traversal reached
 * the iframe, or whether it was impossible and why.
 */
async function fillStripeViaKeyboard(
  page: import('@playwright/test').Page,
  maxWaitMs = 90_000,
): Promise<{
  method: 'keyboard-tab' | 'programmatic-focus-NOT-used' | 'blocked';
  cardFilled: boolean;
  expFilled: boolean;
  cvcFilled: boolean;
  zipFilled: boolean;
  blocker?: string;
  tabsUsed: number;
}> {
  const deadline = Date.now() + maxWaitMs;
  let totalTabs = 0;

  // Wait for the specific frame containing the card-number input, not merely
  // Stripe telemetry/outer frames.
  let cardInputFrameMounted = false;
  while (Date.now() < deadline && !cardInputFrameMounted) {
    await page.waitForTimeout(1500);
    const stripeFrames = page.frames().filter(
      f => f.url().includes('stripe.com') || f.name().startsWith('__privateStripeFrame'),
    );
    for (const frame of stripeFrames) {
      const count = await frame
        .locator(
          'input[name="number"], #Field-numberInput, ' +
            'input[data-elements-stable-field-name="cardNumber"]',
        )
        .count()
        .catch(() => 0);
      if (count > 0) {
        cardInputFrameMounted = true;
        break;
      }
    }
  }

  if (!cardInputFrameMounted) {
    return {
      method: 'blocked',
      cardFilled: false,
      expFilled: false,
      cvcFilled: false,
      zipFilled: false,
      blocker:
        `Stripe card-input frame did not mount within ${maxWaitMs}ms. ` +
        'Frames: ' + page.frames().map(f => safeFrameLabel(f.url(), f.name())).join(', '),
      tabsUsed: totalTabs,
    };
  }

  // Tab from the current focus position into the Stripe iframe.
  // We detect "inside Stripe frame" by polling the active frame's document.activeElement
  // in each known Stripe frame after each Tab press.
  let cardFilled = false;
  let expFilled = false;
  let cvcFilled = false;
  let zipFilled = false;

  const MAX_TABS_INTO_STRIPE = 120;

  for (let i = 0; i < MAX_TABS_INTO_STRIPE && Date.now() < deadline; i++) {
    // Check the current focus before moving. An empty submit commonly moves
    // focus directly to Stripe's first invalid field; pressing Tab first would
    // skip card number and create a false keyboard blocker.
    const stripeFrames = page.frames().filter(
      f => f.url().includes('stripe.com') || f.name().startsWith('__privateStripeFrame'),
    );

    for (const frame of stripeFrames) {
      let activeInfo: { name: string; stableField: string | null } | null = null;
      try {
        activeInfo = await frame.evaluate(() => {
          const el = document.activeElement as HTMLInputElement | null;
          if (!el || el.tagName !== 'INPUT') return null;
          return {
            name: el.getAttribute('name') || el.id || '',
            stableField: el.getAttribute('data-elements-stable-field-name'),
          };
        });
      } catch { continue; }

      if (!activeInfo) continue;

      const fieldName = activeInfo.name;
      const stableField = activeInfo.stableField ?? '';

      const isCardNumber =
        fieldName === 'number' ||
        fieldName.includes('numberInput') ||
        stableField === 'cardNumber';
      const isExpiry =
        fieldName === 'expiry' ||
        fieldName.includes('expiryInput') ||
        stableField === 'cardExpiry';
      const isCvc =
        fieldName === 'cvc' ||
        fieldName.includes('cvcInput') ||
        stableField === 'cardCvc';
      const isZip =
        fieldName === 'postalCode' ||
        fieldName.includes('postalCodeInput') ||
        stableField === 'postalCode';

      if (isCardNumber && !cardFilled) {
        await page.keyboard.type('4242424242424242', { delay: 20 });
        await page.waitForTimeout(200);
        cardFilled = true;
        continue;
      }
      if (isExpiry && !expFilled) {
        await page.keyboard.type('1228', { delay: 20 });
        await page.waitForTimeout(200);
        expFilled = true;
        continue;
      }
      if (isCvc && !cvcFilled) {
        await page.keyboard.type('123', { delay: 20 });
        await page.waitForTimeout(200);
        cvcFilled = true;
        continue;
      }
      if (isZip && !zipFilled) {
        await page.keyboard.type('10001', { delay: 20 });
        await page.waitForTimeout(200);
        zipFilled = true;
        continue;
      }
    }

    // All four filled — done
    if (cardFilled && expFilled && cvcFilled && zipFilled) break;
    // Card filled, exp filled, cvc filled; zip is optional — break if three done
    if (cardFilled && expFilled && cvcFilled && Date.now() > deadline - 10_000) break;

    await page.keyboard.press('Tab');
    totalTabs++;
    await page.waitForTimeout(60);
  }

  if (!cardFilled) {
    return {
      method: 'blocked',
      cardFilled,
      expFilled,
      cvcFilled,
      zipFilled,
      blocker:
        `Tab traversal reached ${totalTabs} tabs but never focused the Stripe card number input. ` +
        'locator.focus() was NOT used — this is a genuine keyboard-inaccessibility finding. ' +
        'Frames observed: ' +
          page.frames().map(f => safeFrameLabel(f.url(), f.name())).join(', '),
      tabsUsed: totalTabs,
    };
  }

  return {
    method: 'keyboard-tab',
    cardFilled,
    expFilled,
    cvcFilled,
    zipFilled,
    tabsUsed: totalTabs,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Tier4 — keyboard-only checkout audit (Chromium)', () => {
  test.describe.configure({ mode: 'serial' });

  test(
    'T4-keyboard: register → cart → keyboard checkout → Stripe 4242 via keyboard → /bookings confirmed',
    { timeout: 300_000 },
    async ({ page }, testInfo) => {
      const projectName = testInfo.project.name;
      const timings: Record<string, number> = {};
      const msgs = collectConsole(page);
      const blockers: string[] = [];
      let lastReachedStep = 'init';

      fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

      // Intercept checkout response before it fires
      let checkoutResponseData: {
        paymentIntent?: { clientSecret?: string; paymentIntentId?: string };
        bookings?: Array<{ id?: string; booking?: { id?: string } }>;
        bookingIds?: string[];
      } | null = null;

      page.on('response', async (response) => {
        if (
          new URL(response.url()).pathname === '/api/checkout' &&
          response.request().method() === 'POST'
        ) {
          try { checkoutResponseData = await response.json(); } catch { /* ignore */ }
        }
      });

      // ── Guard ─────────────────────────────────────────────────────────────
      await assertNotProduction(page);

      // ── Register fresh account (page.request) ─────────────────────────────
      const t0 = now();
      const actor = await registerAndLogin(page, 'kb');
      timings.register_ms = elapsed(t0);
      lastReachedStep = 'registered';

      // ── Add service to cart (API — keyboard cannot navigate service detail without session) ──
      const svc = await findPricedService(page);
      await addToCartApi(page, svc.id);
      lastReachedStep = 'cart-seeded-via-api';
      // This is recorded as a limitation: add-to-cart was not performed via keyboard.
      blockers.push(
        'LIMITATION (not a blocker): add-to-cart was performed via API (page.request), not keyboard UI. ' +
        'Service detail page requires login context that is not yet established via keyboard-only navigation.',
      );

      // ── Navigate to /cart ─────────────────────────────────────────────────
      await page.goto('/cart', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3000);
      lastReachedStep = 'cart-loaded';

      const cartSs = await saveScreenshot(page, 'keyboard-cart.png');
      const cartLabels = await checkFormLabels(page);
      const overflowCart = await checkOverflow(page);

      // ── Tab to "Proceed to Payment" / "Skip to Payment" via keyboard ──────
      const t1 = now();
      // Send initial Tab to move focus off browser chrome
      await page.keyboard.press('Tab');
      await page.waitForTimeout(150);

      const { found: foundProceed, focusOrder: focusOrderCart, index: proceedTabIndex } =
        await tabToElement(
          page,
          entry =>
            entry.testid === 'button-skip-to-payment' ||
            entry.testid === 'button-proceed-payment' ||
            (entry.tag === 'button' &&
              ((entry.label ?? '').toLowerCase().includes('proceed') ||
                (entry.label ?? '').toLowerCase().includes('payment'))),
          80,
        );
      timings.tab_to_proceed_ms = elapsed(t1);

      if (!foundProceed) {
        blockers.push(
          `BLOCKER: Could not reach "Proceed to Payment" button via Tab (${proceedTabIndex} tabs). ` +
            'The button may not be in the keyboard tab order, may require scrolling, or the testid changed.',
        );
      } else {
        await page.keyboard.press('Enter');
        await page.waitForTimeout(2000);
        lastReachedStep = 'payment-step-opened-via-keyboard';
      }

      const postProceedSs = await saveScreenshot(page, 'keyboard-post-proceed.png');

      // ── Tab to "Complete Booking" via keyboard ────────────────────────────
      const t2 = now();
      const { found: foundComplete, focusOrder: focusOrderPayment, index: completeTabIndex } =
        await tabToElement(
          page,
          entry =>
            entry.testid === 'button-complete-booking' ||
            (entry.tag === 'button' && (entry.label ?? '').toLowerCase().includes('complete booking')),
          60,
        );
      timings.tab_to_complete_ms = elapsed(t2);

      if (!foundComplete) {
        blockers.push(
          `BLOCKER: Could not reach "Complete Booking" button via Tab (${completeTabIndex} tabs). ` +
            "flowStep may not have transitioned to 'payment', or the button is not keyboard-accessible.",
        );
      } else {
        await page.keyboard.press('Enter');
        await page.waitForTimeout(5000);
        lastReachedStep = 'checkout-posted-via-keyboard';
      }

      const postCompleteSs = await saveScreenshot(page, 'keyboard-post-complete.png');

      // ── Check form labels at payment step ─────────────────────────────────
      const paymentLabels = await checkFormLabels(page);
      const paymentElementReadiness = foundComplete
        ? await waitForStripePaymentElement(page, 60_000)
        : { ready: false, blocker: 'Checkout was not activated by keyboard.' };
      if (!paymentElementReadiness.ready) {
        blockers.push(`BLOCKER: ${paymentElementReadiness.blocker}`);
      }

      // ── Step A: empty/invalid submit to test validation announcements ──────
      // Attempt to Tab to the Pay button and press Enter BEFORE filling the card.
      // This tests whether validation errors are announced via ARIA.
      let emptySubmitAnnouncementAudit: {
        attempted: boolean;
        payButtonReached: boolean;
        announcements?: {
          mainPage: {
            alerts: string[];
            statusRegions: string[];
            liveRegions: string[];
            invalidFieldDescriptions: string[];
          };
          stripeFrames: Array<{
            url: string;
            alerts: string[];
            statusRegions: string[];
            liveRegions: string[];
            invalidFieldDescriptions: string[];
          }>;
        };
        announcementPresent?: boolean;
        describedErrorPresent?: boolean;
        accessibleValidationPresent?: boolean;
        blocker?: string;
      } | null = null;

      // Only attempt empty submit if checkout was posted (Stripe element may be present)
      if (foundComplete && paymentElementReadiness.ready) {
        // Try to Tab to a "Pay" button and press Enter to trigger validation
        const { found: foundPayEarly } = await tabToElement(
          page,
          entry =>
            (entry.tag === 'button' &&
              (entry.label ?? '').toLowerCase().includes('pay')),
          120,
        );

        if (foundPayEarly) {
          await page.keyboard.press('Enter');
          await page.waitForTimeout(2000);
          const announcements = await auditValidationAnnouncements(page);
          const stripeAnnouncementCount = announcements.stripeFrames.reduce(
            (count, frame) =>
              count +
              frame.alerts.length +
              frame.statusRegions.length +
              frame.liveRegions.length,
            0,
          );
          const mainAnnouncementCount =
            announcements.mainPage.alerts.length +
            announcements.mainPage.statusRegions.length +
            announcements.mainPage.liveRegions.length;
          const announcementPresent = stripeAnnouncementCount + mainAnnouncementCount > 0;
          const stripeDescribedErrorCount = announcements.stripeFrames.reduce(
            (count, frame) => count + frame.invalidFieldDescriptions.length,
            0,
          );
          const describedErrorPresent =
            stripeDescribedErrorCount +
              announcements.mainPage.invalidFieldDescriptions.length >
            0;
          const accessibleValidationPresent = announcementPresent || describedErrorPresent;
          emptySubmitAnnouncementAudit = {
            attempted: true,
            payButtonReached: true,
            announcements,
            announcementPresent,
            describedErrorPresent,
            accessibleValidationPresent,
          };
          if (!accessibleValidationPresent) {
            blockers.push(
              'BLOCKER: Empty keyboard submission produced no non-empty role=alert/status, ' +
                'aria-live announcement, or aria-describedby error relationship in the app ' +
                'or Stripe frames.',
            );
          }
          lastReachedStep = 'empty-submit-attempted';
        } else {
          const blocker =
            'Could not reach the outer Pay button by keyboard within 120 tabs to test empty-form validation.';
          emptySubmitAnnouncementAudit = {
            attempted: false,
            payButtonReached: false,
            blocker,
          };
          blockers.push(`BLOCKER: ${blocker}`);
        }
      }

      // ── Step B: Fill Stripe fields via keyboard Tab traversal ─────────────
      const t3 = now();
      const stripeKbResult = paymentElementReadiness.ready
        ? await fillStripeViaKeyboard(page, 90_000)
        : {
            method: 'blocked' as const,
            cardFilled: false,
            expFilled: false,
            cvcFilled: false,
            zipFilled: false,
            blocker: paymentElementReadiness.blocker,
            tabsUsed: 0,
          };
      timings.stripe_keyboard_ms = elapsed(t3);

      const stripeFilledSs = await saveScreenshot(page, 'keyboard-stripe-filled.png');

      if (stripeKbResult.method === 'blocked') {
        blockers.push(
          `BLOCKER: ${stripeKbResult.blocker ?? 'Stripe keyboard fill blocked (no detail)'}`,
        );
        lastReachedStep = 'stripe-keyboard-blocked';
      } else {
        lastReachedStep = 'stripe-card-filled-via-keyboard';
      }

      // ── Step C: Tab to outer Pay button; submit via Enter ─────────────────
      // After filling Stripe fields, Tab should move focus back to the main frame.
      const t4 = now();
      let submitted = false;
      let payTabIndex = 0;

      if (stripeKbResult.cardFilled) {
        // Tab until we reach the outer Pay/Complete Booking button in the main frame
        const { found: foundPay, index: payIdx } = await tabToElement(
          page,
          entry =>
            (entry.tag === 'button' &&
              (entry.label ?? '').toLowerCase().includes('pay')),
          50,
        );
        payTabIndex = payIdx;

        if (!foundPay) {
          blockers.push(
            `BLOCKER: Could not Tab to outer Pay button after filling Stripe card (${payIdx} more tabs). ` +
              'This is a genuine keyboard accessibility gap.',
          );
        } else {
          await page.keyboard.press('Enter');
          await page.waitForTimeout(5000);
          submitted = true;
          lastReachedStep = 'payment-submitted-via-keyboard';
        }
      }
      timings.keyboard_submit_ms = elapsed(t4);

      const postSubmitSs = await saveScreenshot(page, 'keyboard-post-submit.png');

      // ── Wait for app's real redirect to /bookings ─────────────────────────
      let bookingId: string | null = null;
      let finalBookingStatus: string | null = null;
      let confirmedOk = false;

      if (submitted) {
        try {
          await page.waitForURL(
            url => url.pathname === '/bookings' || url.pathname.startsWith('/bookings'),
            { timeout: 30_000 },
          );
          lastReachedStep = 'bookings-page-reached';
        } catch {
          blockers.push(
            `BLOCKER: App did not redirect to /bookings within 30s after keyboard submit. ` +
              `Current URL: ${page.url()}.`,
          );
        }

        // Extract booking ID from the intercepted checkout response
        if (checkoutResponseData) {
          bookingId =
            checkoutResponseData.bookings?.[0]?.id ??
            checkoutResponseData.bookings?.[0]?.booking?.id ??
            (checkoutResponseData.bookingIds?.[0] ?? null);
        }

        // Poll for confirmed status on the exact booking ID
        if (bookingId) {
          const deadline = Date.now() + 30_000;
          while (Date.now() < deadline) {
            const res = await page.request.get(`${BASE_URL}/api/my-bookings`).catch(() => null);
            if (res && res.ok()) {
              const body = await res.json().catch(() => ({}));
              const list: any[] = Array.isArray(body) ? body : (body.bookings ?? []);
              const found = list.find((b: any) => b.id === bookingId);
              if (found) {
                finalBookingStatus = found.status;
                if (CONFIRMED_STATUSES.has(found.status)) {
                  confirmedOk = true;
                  break;
                }
              }
            }
            await new Promise(r => setTimeout(r, 3000));
          }
        }
      }

      await page.waitForTimeout(1000);
      const bookingsSs = await saveScreenshot(page, 'keyboard-bookings.png');

      // ── Write evidence ────────────────────────────────────────────────────
      // Separate genuine blockers from the recorded limitation
      const realBlockers = blockers.filter(b => !b.startsWith('LIMITATION'));
      const limitations = blockers.filter(b => b.startsWith('LIMITATION'));

      const result =
        realBlockers.length > 0
          ? `BLOCKED - ${realBlockers.length} keyboard-accessibility blocker(s)`
          : confirmedOk
          ? `PASS - keyboard checkout completed; booking ${bookingId} status="${finalBookingStatus}"`
          : submitted && bookingId
          ? `PARTIAL - submitted via keyboard; booking ${bookingId} status="${finalBookingStatus ?? 'unknown'}" (webhook may confirm async)`
          : 'BLOCKED - keyboard submit not reached';

      writeEvidence(`keyboard-${projectName}.json`, {
        seed: TIER4_SEED,
        chosenStep: 'keyboard-checkout',
        engine: projectName,
        project: projectName,
        result,
        lastReachedStep,
        limitations: limitations.join(' | ') || undefined,
        serviceId: svc.id,
        serviceName: svc.name,
        servicePrice: svc.price,
        addToCartMethod: 'api-only',
        bookingId,
        finalBookingStatus,
        confirmedOk,
        stripeKeyboardMethod: stripeKbResult.method,
        paymentElementReadiness,
        stripeCardFilled: stripeKbResult.cardFilled,
        stripeExpFilled: stripeKbResult.expFilled,
        stripeCvcFilled: stripeKbResult.cvcFilled,
        stripeZipFilled: stripeKbResult.zipFilled,
        stripeTabsUsed: stripeKbResult.tabsUsed,
        emptySubmitValidationAudit: emptySubmitAnnouncementAudit,
        focusOrderCart: focusOrderCart.map(e => ({
          tag: e.tag, label: e.label, testid: e.testid, visibleFocus: e.visibleFocus,
        })),
        focusOrderPayment: focusOrderPayment.map(e => ({
          tag: e.tag, label: e.label, testid: e.testid, visibleFocus: e.visibleFocus,
        })),
        formLabelsCart: cartLabels,
        formLabelsPayment: paymentLabels,
        submitted,
        realBlockers,
        layoutOverflow: overflowCart,
        viewport: { width: 1280, height: 900 },
        consoleMessages: msgs.slice(-30),
        timings,
        screenshots: {
          cart: cartSs,
          postProceed: postProceedSs,
          postComplete: postCompleteSs,
          stripeKbFilled: stripeFilledSs,
          postSubmit: postSubmitSs,
          bookings: bookingsSs,
        },
      });

      // ── Final assertions ──────────────────────────────────────────────────
      // Independently enforce that the exact checkout booking confirmed, even
      // when a later accessibility assertion intentionally fails this run.
      expect(
        bookingId !== null,
        'Expected a booking ID from the checkout response after keyboard submit',
      ).toBe(true);

      expect(
        finalBookingStatus !== null,
        `Exact booking ID "${bookingId}" not found in /api/my-bookings after keyboard checkout`,
      ).toBe(true);

      expect(
        confirmedOk,
        `Exact booking ID "${bookingId}" did not reach an accepted confirmed status; ` +
          `final status="${finalBookingStatus ?? 'not-found'}".`,
      ).toBe(true);

      // Genuine blockers (not limitations) cause an explicit failure.
      if (realBlockers.length > 0) {
        throw new Error(
          `[keyboard][${projectName}] ${realBlockers.length} keyboard-accessibility blocker(s) — NOT a pass:\n` +
            realBlockers.map((b, i) => `  ${i + 1}. ${b}`).join('\n'),
        );
      }
    },
  );
});
