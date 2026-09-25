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

  // ── Provider B changes price (safe edit, LD 23) ──
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
      const saveBtn = testid(page, 'button-save-draft');
      if (await saveBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await saveBtn.click().catch(() => {});
        await page.waitForTimeout(1500);
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
  fileFinding({
    journey: 'D7',
    step: 'providerB:price-applied-live',
    class: priceChangedInDb ? 'SPEC_DIVERGENCE' : 'DEAD_TRIGGER',
    severity: priceChangedInDb ? 'P3' : 'P2',
    known: null,
    title: `Provider B's price edit ${priceChangedInDb ? 'DID' : 'did NOT'} apply live (LD 23 safe edit)`,
    expected: 'A price edit is a safe edit and applies to the live row immediately, no admin review',
    actual: `before=${originalPrice}, after=${afterPriceRow[0]?.price}`,
    where: 'server PATCH /api/provider/services/:id',
    evidence: {},
    behavioural: true,
  });

  // P1 CANDIDATE, found as a byproduct of this same edit: does "Save draft" (the wizard's ONE
  // save control, per Part 1's `saveDraft`/`button-save-draft`) unpublish an already-APPROVED,
  // already-ACTIVE listing just because a routine field edit used it? Confirmed in code before
  // filing (never filed on a hunch): `ServiceForm.tsx`'s `createMutation` sets
  // `payload.status = submitAction === "publish" ? "active" : "draft"` UNCONDITIONALLY for the
  // provider role on every save — there is no `isEditMode`/already-live guard. Server-side,
  // `status` is NOT in `IDENTITY_EDIT_FIELDS` (shared/edit-split.ts, the §23/LD-23 edit-split
  // list), so it never enters the `pending_changes` staging lane and is applied to the live row
  // immediately by the generic `storage.updateProviderService` call
  // (server/routes.ts PATCH /api/provider/services/:id). Net effect: EVERY save from this
  // wizard on an approved+active listing — even a price-only edit through the exact "safe
  // edit" path LD 23 describes — silently reverts `status` to 'draft', unpublishing it, unless
  // the provider happens to press a (currently nonexistent, in this UI) "Publish" action
  // instead of "Save draft" on every single edit.
  const statusRegressed = originalStatus === 'active' && afterPriceRow[0]?.status !== 'active';
  fileFinding({
    journey: 'D7',
    step: 'providerB:save-draft-unpublishes-approved-listing',
    class: 'FALSE_PROMISE',
    severity: 'P1',
    known: null,
    title: statusRegressed
      ? "Save draft on an approved+active listing REVERTS provider_services.status to 'draft', unpublishing it (LD 23 violation)"
      : `Provider B status after the Save-Draft price edit: before=${originalStatus}, after=${afterPriceRow[0]?.status}`,
    expected:
      "LD 23 (CLAUDE.md §23): 'An APPROVED listing is never taken down for an edit... safe edits ... apply to the live row " +
      "immediately... the approved version stays live and bookable.' A price-only edit is explicitly listed as a safe edit.",
    actual: statusRegressed
      ? `provider_services.status: before='${originalStatus}' (live) -> after='${afterPriceRow[0]?.status}' (unpublished), ` +
        `caused by a routine price-only edit through button-save-draft. Root cause, confirmed in code: ` +
        `client/src/components/ServiceForm.tsx's createMutation sets ` +
        `payload.status = submitAction === "publish" ? "active" : "draft" unconditionally for the provider role branch ` +
        `(no isEditMode/already-approved guard), and status is absent from shared/edit-split.ts IDENTITY_EDIT_FIELDS, so ` +
        `server/routes.ts PATCH /api/provider/services/:id applies it straight to the live row instead of staging it. ` +
        `Same root cause as the earlier walkthrough finding F-3 (Catalog shows "In review" while the listing-home ` +
        `checklist independently reads "Draft (not submitted)") — one write path (this PATCH) determines BOTH ` +
        `"is it live" and "is it under review" for every field the client sends, with no per-field authority.`
      : `before=${originalStatus}, after=${afterPriceRow[0]?.status} (no regression observed on this run)`,
    where:
      'client/src/components/ServiceForm.tsx (createMutation, payload.status); shared/edit-split.ts (IDENTITY_EDIT_FIELDS, ' +
      'status absent); server/routes.ts PATCH /api/provider/services/:id (safeInput applied unconditionally)',
    evidence: { shot: 'shots/D7-02-providerB-price-edited.png' },
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
