/**
 * d7-supply-change-propagation.spec.ts — Pass 2, Part 2, D7.
 *
 * With T-auth's D1 plan already holding A and B: Provider B changes its price through the UI (a
 * SAFE edit that applies live immediately, LD 23); Provider A pauses/unpublishes through the UI
 * (`switch-active-<id>` on Catalog); Provider C's slot capacity is set to 0 through the
 * availability UI (a provider self-service action, since a REAL booking that fills a slot needs
 * Stripe/HELD). Then checks what T-auth's slip shows: a stale price is STALE_CACHE, a silently
 * missing/still-bookable item is ORPHAN_READ, an honest notice is a pass.
 */
import { test } from '@playwright/test';
import { E2E_PASSWORD } from './lib/run-id';
import { loginViaUi } from './lib/accounts';
import { shot, netLogger } from './lib/evidence';
import { fileFinding } from './lib/findings';
import { q } from './lib/db';
import { readState } from './lib/state';
import { testid } from './lib/ui';

test.describe.configure({ mode: 'serial' });

test('D7: provider-side changes propagate (or fail to) onto the traveler\'s slip', async ({ page }) => {
  const state = readState();
  const tauth = state.accounts.tauth;
  const providerA = state.listings.providerA;
  const providerB = state.listings.providerB;
  const providerC = state.listings.providerC;
  const accounts = state.accounts;
  const tripId = state.trips.tauthKyoto?.id;
  if (!tauth?.email || !providerA?.providerServiceId || !providerB?.providerServiceId || !tripId) {
    fileFinding({
      journey: 'D7',
      step: 'precondition',
      class: 'SPEC_DIVERGENCE',
      severity: 'P1',
      known: null,
      title: 'Missing D1 plan/state for D7',
      expected: 'D1 and S1 ran first and left providerA/providerB/tripId in state',
      actual: 'one or more missing',
      where: 'e2e/supply-demand/d7-supply-change-propagation.spec.ts',
      evidence: {},
      behavioural: true,
    });
    test.skip(true, 'missing precondition state');
    return;
  }

  const net = netLogger(page, 'D7');

  // ── Baseline: T-auth's slip before any provider-side change ──
  await loginViaUi(page, tauth.email, E2E_PASSWORD);
  await page.goto(`/plans/${tripId}`);
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  await shot(page, 'D7', '01', 'slip-baseline');
  const beforePriceRow = await q(`SELECT price, status, approval_status FROM provider_services WHERE id = $1`, [providerB.providerServiceId]);
  const originalPrice = beforePriceRow[0]?.price;
  const originalStatus = beforePriceRow[0]?.status;

  // ── Provider B changes price (safe edit, LD 23) — the LIVE-edit path ──
  // WITHDRAWN (lead review): a prior version of this test pressed `button-save-draft`, whose
  // label and disclosed warning ("Unpublish & Save Draft" / "This listing is live. Saving it as
  // a draft removes it from the marketplace until you publish it again.", ServiceForm.tsx
  // ~5175-5185, gated on `isCurrentlyLive` ~2078) make it the DESIGNED, disclosed unpublish
  // rail — not a bug, the harness pressed the wrong control. The live-edit control that keeps
  // `status: "active"` is `button-publish-service` (`handleFinalSubmit("publish")` ->
  // `payload.status = submitAction === "publish" ? "active" : "draft"`), reached the same way a
  // fresh listing reaches it — walk the wizard to Review and press it — since Pricing & Fees
  // drawer's own base-price field is read-only (pricing-fees-drawer.tsx ~143, surcharge/deposit/
  // cancellation only).
  const providerBAccount = accounts.providerB;
  if (providerBAccount?.email) {
    await loginViaUi(page, providerBAccount.email, E2E_PASSWORD);
    await page.goto(`/provider/services/${providerB.providerServiceId}/edit`);
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    const row = testid(page, 'checklist-row-description140');
    if (await row.isVisible({ timeout: 5000 }).catch(() => false)) await row.click().catch(() => {});
    await page.waitForTimeout(600);
    const priceInput = testid(page, 'input-base-price');
    if (await priceInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await priceInput.fill('120').catch(() => {});
      await shot(page, 'D7', '02', 'providerB-price-edited');
      // Walk to Review (Next up to 8 times) without touching neighbourhood/category fields —
      // they are already set from S1 and this edit should not need to retouch them.
      for (let i = 0; i < 8; i++) {
        if (await testid(page, 'card-review-summary').isVisible().catch(() => false)) break;
        const next = testid(page, 'button-step-next');
        if (!(await next.isVisible().catch(() => false)) || (await next.isDisabled().catch(() => false))) break;
        await next.click().catch(() => {});
        await page.waitForTimeout(400);
      }
      await shot(page, 'D7', '02b', 'providerB-review-before-publish');
      const publishBtn = testid(page, 'button-publish-service');
      if (await publishBtn.isVisible({ timeout: 5000 }).catch(() => false) && !(await publishBtn.isDisabled().catch(() => false))) {
        await publishBtn.click().catch(() => {});
        await page.waitForTimeout(1500);
      } else {
        fileFinding({
          journey: 'D7',
          step: 'providerB:live-price-edit-publish',
          class: 'DEAD_TRIGGER',
          severity: 'P2',
          known: null,
          title: 'button-publish-service not reachable/enabled to re-publish Provider B after a live price edit',
          expected: 'The wizard reaches Review with button-publish-service enabled (all gates already cleared during S1)',
          actual: `publishVisible=${await publishBtn.isVisible().catch(() => false)}, disabled=${await publishBtn.isDisabled().catch(() => true)}`,
          where: 'client/src/components/ServiceForm.tsx (button-publish-service)',
          evidence: { shot: 'shots/D7-02b-providerB-review-before-publish.png' },
          behavioural: true,
        });
      }
    } else {
      fileFinding({
        journey: 'D7',
        step: 'providerB:price-edit',
        class: 'DEAD_TRIGGER',
        severity: 'P2',
        known: null,
        title: 'input-base-price not reachable from listing-home for Provider B',
        expected: 'Entering the wizard from listing-home lands on the basics step with input-base-price',
        actual: 'Not visible within 5s',
        where: 'client/src/components/ServiceForm.tsx',
        evidence: {},
        behavioural: true,
      });
    }
  }
  const afterPriceRow = await q(`SELECT price, status, approval_status FROM provider_services WHERE id = $1`, [providerB.providerServiceId]);
  const priceChangedInDb = String(afterPriceRow[0]?.price) !== String(originalPrice);
  const stayedLive = afterPriceRow[0]?.status === 'active';
  fileFinding({
    journey: 'D7',
    step: 'providerB:price-applied-live',
    class: priceChangedInDb && stayedLive ? 'SPEC_DIVERGENCE' : 'FALSE_PROMISE',
    severity: priceChangedInDb && stayedLive ? 'P3' : 'P2',
    known: null,
    title: `Provider B's price edit via button-publish-service: price ${priceChangedInDb ? 'DID' : 'did NOT'} change, status ${stayedLive ? 'stayed active' : `became '${afterPriceRow[0]?.status}'`} (LD 23 safe edit, live-edit path)`,
    expected: "A price edit is a safe edit: it applies to the live row immediately, and status stays 'active' throughout",
    actual: `before price=${originalPrice} status=${originalStatus}, after price=${afterPriceRow[0]?.price} status=${afterPriceRow[0]?.status}`,
    where: 'server PATCH /api/provider/services/:id (button-publish-service -> submitAction="publish")',
    evidence: { shot: 'shots/D7-02b-providerB-review-before-publish.png' },
    behavioural: true,
  });

  // ── Provider A pauses/unpublishes ──
  const providerAAccount = accounts.providerA;
  if (providerAAccount?.email) {
    await loginViaUi(page, providerAAccount.email, E2E_PASSWORD);
    await page.goto('/provider/services');
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    const toggle = testid(page, `switch-active-${providerA.providerServiceId}`);
    if (await toggle.isVisible({ timeout: 6000 }).catch(() => false)) {
      await toggle.click().catch(() => {});
      await page.waitForTimeout(1200);
      await shot(page, 'D7', '03', 'providerA-paused');
    } else {
      fileFinding({
        journey: 'D7',
        step: 'providerA:pause',
        class: 'DEAD_TRIGGER',
        severity: 'P2',
        known: null,
        title: `switch-active-${providerA.providerServiceId} not visible on /provider/services`,
        expected: 'Catalog offers a pause/unpublish toggle per listing',
        actual: 'Not visible within 6s',
        where: 'client/src/pages/provider/services.tsx',
        evidence: {},
        behavioural: true,
      });
    }
  }
  const afterPauseRow = await q(`SELECT status FROM provider_services WHERE id = $1`, [providerA.providerServiceId]);
  const paused = afterPauseRow[0]?.status === 'paused';
  fileFinding({
    journey: 'D7',
    step: 'providerA:pause-verify',
    class: paused ? 'SPEC_DIVERGENCE' : 'DEAD_TRIGGER',
    severity: paused ? 'P3' : 'P2',
    known: null,
    title: `Provider A status after pause attempt: ${afterPauseRow[0]?.status}`,
    expected: "provider_services.status becomes 'paused'",
    actual: JSON.stringify(afterPauseRow[0] ?? null),
    where: 'server (switch-active toggle handler)',
    evidence: { shot: 'shots/D7-03-providerA-paused.png' },
    behavioural: true,
  });

  // ── Provider C's slot capacity to 0 (self-service, since a real booking needs Stripe) ──
  const providerCAccount = accounts.providerC;
  if (providerCAccount?.email && providerC?.providerServiceId) {
    await loginViaUi(page, providerCAccount.email, E2E_PASSWORD);
    await page.goto(`/provider/availability?serviceId=${providerC.providerServiceId}`);
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    const capacityInput = testid(page, 'input-patterns-capacity');
    if (await capacityInput.isVisible({ timeout: 6000 }).catch(() => false)) {
      await capacityInput.fill('0').catch(() => {});
      const saveBtn = page.getByRole('button', { name: /Save schedule/i });
      if (await saveBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await saveBtn.click().catch(() => {});
        await page.waitForTimeout(1200);
      }
      await shot(page, 'D7', '04', 'providerC-capacity-zero');
    } else {
      fileFinding({
        journey: 'D7',
        step: 'providerC:capacity-zero',
        class: 'DEAD_TRIGGER',
        severity: 'P3',
        known: null,
        title: `input-patterns-capacity not reachable for Provider C (${providerC.providerServiceId})`,
        expected: 'The availability page offers a capacity field to set to 0',
        actual: 'Not visible within 6s (may be a NoCalendarPanel delivery method, or no saved pattern yet)',
        where: 'client/src/pages/provider/availability.tsx',
        evidence: {},
        behavioural: true,
      });
    }
  }

  // ── Now check T-auth's slip for the three effects ──
  await loginViaUi(page, tauth.email, E2E_PASSWORD);
  await page.goto(`/plans/${tripId}`);
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  await page.reload();
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  await shot(page, 'D7', '05', 'slip-after-changes');
  const slipText = await page.locator('body').innerText().catch(() => '');

  // Price: does the slip show the OLD price (stale cache) or the NEW one / an honest "price
  // changed" notice?
  const showsOldPrice = originalPrice != null && slipText.includes(String(originalPrice));
  const showsNewPrice = slipText.includes('120');
  fileFinding({
    journey: 'D7',
    step: 'slip:price-propagation',
    class: showsOldPrice && !showsNewPrice ? 'STALE_CACHE' : 'SPEC_DIVERGENCE',
    severity: showsOldPrice && !showsNewPrice ? 'P2' : 'P3',
    known: null,
    title: `Slip price display after Provider B's live price change: old=${showsOldPrice}, new=${showsNewPrice}`,
    expected: 'The slip either reads the live price at render time, or honestly flags that the price may have changed',
    actual: `slip text includes old price(${originalPrice})=${showsOldPrice}, includes new price(120)=${showsNewPrice}`,
    where: 'client/src/components/plancard/SlipView.tsx',
    evidence: { shot: 'shots/D7-05-slip-after-changes.png' },
    behavioural: true,
  });

  // Item A (now paused): still shown as bookable (ORPHAN_READ), silently gone (also a problem),
  // or honestly flagged as unavailable (pass)?
  const showsA = slipText.includes('Traditional Tea Ceremony');
  const showsUnavailableNoteForA = /paused|no longer available|unavailable|not bookable/i.test(slipText);
  fileFinding({
    journey: 'D7',
    step: 'slip:paused-item-propagation',
    class: showsA && !showsUnavailableNoteForA ? 'ORPHAN_READ' : 'SPEC_DIVERGENCE',
    severity: showsA && !showsUnavailableNoteForA ? 'P1' : 'P3',
    known: null,
    title: `Slip's handling of Provider A's item after A was paused: shown=${showsA}, unavailableNote=${showsUnavailableNoteForA}`,
    expected: 'The item is either removed with a reason, or shown with an honest "no longer available" flag — never silently still bookable',
    actual: `text includes item title=${showsA}, includes an unavailable-style word=${showsUnavailableNoteForA}`,
    where: 'client/src/components/plancard/SlipView.tsx',
    evidence: { shot: 'shots/D7-05-slip-after-changes.png' },
    behavioural: true,
  });

  net.flush();
});
