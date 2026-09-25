/**
 * d1-build-it-yourself.spec.ts — Pass 2, Part 2, D1.
 *
 * A fresh traveler (T-auth, signed up via the real /signup form) finds Provider A and B on
 * /services?location=Kyoto and on /discover/location/kyoto, plans a Kyoto trip through the ONE
 * planning modal (ruling 33/42/45) via "Build it myself", adds A and B through each service
 * page's "Add to plan" control, and verifies the plan on /plans/:tripId and on the My Plans
 * console (/my-trips).
 *
 * COORDS (already filed by the lead, referenced here — NOT re-filed): a plan item added from a
 * located listing carries no lat/lng, so the slip map is disabled. This spec records whether that
 * still holds for A/B on this plan as a DB observation only.
 */
import { test, expect } from '@playwright/test';
import { RUN_ID, e2eEmail, E2E_PASSWORD } from './lib/run-id';
import { signupViaUi } from './lib/accounts';
import { fillPlanModalToFinish, clickPlanFinish, openPlanModalFromHero } from './lib/flows';
import { shot, netLogger } from './lib/evidence';
import { fileFinding, fileVisibility } from './lib/findings';
import { q } from './lib/db';
import { readState, writeState } from './lib/state';
import { testid } from './lib/ui';

test.describe.configure({ mode: 'serial' });

test('D1: traveler finds A and B, plans Kyoto, adds both to the plan', async ({ page }) => {
  const state = readState();
  const providerA = state.listings.providerA;
  const providerB = state.listings.providerB;
  if (!providerA?.providerServiceId || !providerB?.providerServiceId) {
    fileFinding({
      journey: 'D1',
      step: 'precondition',
      class: 'SPEC_DIVERGENCE',
      severity: 'P1',
      known: null,
      title: 'No Provider A/B listing ids in harness state — cannot run D1',
      expected: 'S1 ran first in this run-id and persisted providerA/providerB',
      actual: 'state.listings.providerA/providerB missing a providerServiceId',
      where: 'e2e/supply-demand/d1-build-it-yourself.spec.ts',
      evidence: {},
      behavioural: true,
    });
    test.skip(true, 'no supply fixtures in state');
    return;
  }

  const email = e2eEmail('tauth');
  const net = netLogger(page, 'D1');

  await signupViaUi(page, { email, firstName: 'E2E', lastName: 'TAuth' });
  await shot(page, 'D1', '01', 'post-signup');
  writeState((s) => {
    s.accounts.tauth = { email };
  });

  // ── Find A and B on /services?location=Kyoto ──
  await page.goto('/services?location=Kyoto');
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  await page.reload();
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  const servicesPageText = await page.locator('body').innerText().catch(() => '');
  const foundAOnServices = servicesPageText.includes('Traditional Tea Ceremony');
  const foundBOnServices = servicesPageText.includes('Arashiyama');
  await shot(page, 'D1', '02', 'services-location-kyoto');
  fileVisibility({
    content: 'service',
    item: providerA.title,
    surface: '/services?location=Kyoto',
    expected: 'visible',
    actual: foundAOnServices ? 'visible' : 'hidden',
    filter: 'client/src/pages/services.tsx',
    journey: 'D1',
    ms: null,
  });
  fileVisibility({
    content: 'service',
    item: providerB.title,
    surface: '/services?location=Kyoto',
    expected: 'visible',
    actual: foundBOnServices ? 'visible' : 'hidden',
    filter: 'client/src/pages/services.tsx',
    journey: 'D1',
    ms: null,
  });

  // ── Find them on /discover/location/kyoto too ──
  await page.goto('/discover/location/kyoto');
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  await page.reload();
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  const discoverPageText = await page.locator('body').innerText().catch(() => '');
  const foundAOnDiscover = discoverPageText.includes('Traditional Tea Ceremony');
  const foundBOnDiscover = discoverPageText.includes('Arashiyama');
  await shot(page, 'D1', '03', 'discover-location-kyoto');
  fileVisibility({
    content: 'service',
    item: providerA.title,
    surface: '/discover/location/kyoto',
    expected: 'visible',
    actual: foundAOnDiscover ? 'visible' : 'hidden',
    filter: 'client/src/pages/discover.tsx',
    journey: 'D1',
    ms: null,
  });
  fileVisibility({
    content: 'service',
    item: providerB.title,
    surface: '/discover/location/kyoto',
    expected: 'visible',
    actual: foundBOnDiscover ? 'visible' : 'hidden',
    filter: 'client/src/pages/discover.tsx',
    journey: 'D1',
    ms: null,
  });

  // ── Plan a Kyoto trip through the ONE planning modal, "Build it myself" ──
  await page.goto('/');
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  const opened = await openPlanModalFromHero(page);
  if (!opened) {
    fileFinding({
      journey: 'D1',
      step: 'plan-modal:open',
      class: 'DEAD_TRIGGER',
      severity: 'P1',
      known: null,
      title: 'button-plan-trip on the landing hero did not open plan-modal',
      expected: 'Clicking the hero CTA opens the one planning modal (ruling 33)',
      actual: 'plan-modal never became visible',
      where: 'client/src/components/landing/landing-hero.tsx',
      evidence: { shot: 'shots/D1-01-post-signup.png' },
      behavioural: true,
    });
    net.flush();
    throw new Error('D1: could not open the planning modal');
  }
  await shot(page, 'D1', '04', 'plan-modal-open');

  const reachedFinish = await fillPlanModalToFinish(page, 'Kyoto, Japan');
  await shot(page, 'D1', '05', 'plan-modal-finish-row');
  if (!reachedFinish) {
    fileFinding({
      journey: 'D1',
      step: 'plan-modal:walk',
      class: 'DEAD_TRIGGER',
      severity: 'P1',
      known: null,
      title: 'Plan modal never reached a finish row (planning-option-*) for a Kyoto/travel occasion',
      expected: 'occasion -> where -> when -> who -> events resolves to the finish row',
      actual: 'No planning-option-* control became visible within 8 step-advances',
      where: 'client/src/components/trip/plan-modal.tsx',
      evidence: { shot: 'shots/D1-05-plan-modal-finish-row.png' },
      behavioural: true,
    });
    net.flush();
    throw new Error('D1: plan modal did not reach its finish row');
  }

  const tripId = await clickPlanFinish(page, 'myself');
  await shot(page, 'D1', '06', 'after-build-it-myself');
  if (!tripId) {
    fileFinding({
      journey: 'D1',
      step: 'plan-modal:myself-finish',
      class: 'SPEC_DIVERGENCE',
      severity: 'P1',
      known: null,
      title: '"Build it myself" did not land on a /plans/:tripId (or ?tripId=) URL',
      expected: 'LD 42 D5 / LD 45: the myself finish mints a trips row and lands on its slip',
      actual: `Landed at ${page.url()}`,
      where: 'client/src/components/trip/plan-modal.tsx (finish("myself"))',
      evidence: { shot: 'shots/D1-06-after-build-it-myself.png' },
      behavioural: true,
    });
    net.flush();
    throw new Error('D1: no tripId minted from Build it myself');
  }
  writeState((s) => {
    s.trips.tauthKyoto = { id: tripId, label: 'D1 Kyoto plan' };
  });

  const tripRow = await q(`SELECT id, destination, market_slug, user_id FROM trips WHERE id = $1`, [tripId]);
  fileFinding({
    journey: 'D1',
    step: 'plan-modal:trip-minted',
    class: 'SPEC_DIVERGENCE',
    severity: 'P3',
    known: null,
    title: 'trips row minted by Build it myself (recorded for the record, not itself a defect)',
    expected: 'n/a — observation',
    actual: JSON.stringify(tripRow[0] ?? null),
    where: 'trips table',
    evidence: {},
    behavioural: true,
  });

  // ── Add A, then B, through each service page's "Add to plan" (button-add-to-cart) control ──
  for (const listing of [providerA, providerB]) {
    await page.goto(`/services/${listing.providerServiceId}`);
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    await shot(page, 'D1', `07-${listing.title.slice(0, 12)}`, 'service-detail');

    const beforeItems = await q(
      `SELECT id FROM itinerary_items WHERE trip_id = $1 AND provider_service_id = $2`,
      [tripId, listing.providerServiceId],
    );

    const addBtn = testid(page, 'button-add-to-cart');
    const addVisible = await addBtn.isVisible({ timeout: 5000 }).catch(() => false);
    if (!addVisible) {
      fileFinding({
        journey: 'D1',
        step: `add-to-plan:${listing.title}`,
        class: 'DEAD_TRIGGER',
        severity: 'P1',
        known: null,
        title: `button-add-to-cart not visible on /services/${listing.providerServiceId}`,
        expected: 'The listing detail page offers an Add-to-plan control',
        actual: 'Control not visible within 5s',
        where: 'client/src/pages/service-detail.tsx',
        evidence: { shot: `shots/D1-07-${listing.title.slice(0, 12)}-service-detail.png` },
        behavioural: true,
      });
      continue;
    }
    await addBtn.click().catch(() => {});
    await page.waitForTimeout(1200);

    // RC-2/RC-5 class: if no plan was bound as "current", a PlanPickerDialog asks which plan.
    const picker = testid(page, 'dialog-plan-picker');
    if (await picker.isVisible({ timeout: 3000 }).catch(() => false)) {
      await shot(page, 'D1', `07b-${listing.title.slice(0, 12)}`, 'plan-picker-shown');
      fileFinding({
        journey: 'D1',
        step: `add-to-plan:${listing.title}:plan-picker`,
        class: 'SPEC_DIVERGENCE',
        severity: 'P3',
        known: 'KNOWN:RC-5',
        title: 'Adding to plan asked which plan (the just-minted plan was not bound as "current")',
        expected: 'A plan minted moments earlier by the same session is the implicit target (RC-5)',
        actual: 'PlanPickerDialog (dialog-plan-picker) opened instead of adding directly',
        where: 'client/src/pages/service-detail.tsx (beginAdd -> decideAddTarget)',
        evidence: { shot: `shots/D1-07b-${listing.title.slice(0, 12)}-plan-picker-shown.png` },
        behavioural: true,
      });
      const pickBtn = testid(page, `button-pick-plan-${tripId}`);
      if (await pickBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await pickBtn.click().catch(() => {});
        await page.waitForTimeout(1000);
      } else {
        // Confirm before assuming: our tripId may simply not be the first/only pickable row yet.
        const anyPickable = page.locator('[data-testid^="button-pick-plan-"]');
        if ((await anyPickable.count()) > 0) await anyPickable.first().click().catch(() => {});
        await page.waitForTimeout(1000);
      }
    }
    await shot(page, 'D1', `08-${listing.title.slice(0, 12)}`, 'after-add-click');

    const afterItems = await q(
      `SELECT id, latitude, longitude, provider_service_id FROM itinerary_items WHERE trip_id = $1 AND provider_service_id = $2`,
      [tripId, listing.providerServiceId],
    );
    if (afterItems.length <= beforeItems.length) {
      fileFinding({
        journey: 'D1',
        step: `add-to-plan:${listing.title}`,
        class: 'SILENT_SUCCESS',
        severity: 'P1',
        known: null,
        title: `Add to plan for "${listing.title}" produced no new itinerary_items row on trip ${tripId}`,
        expected: 'A new itinerary_items row with provider_service_id set exists after the add',
        actual: `before=${beforeItems.length}, after=${afterItems.length}`,
        where: 'client/src/pages/service-detail.tsx (addToCartMutation)',
        evidence: { shot: `shots/D1-08-${listing.title.slice(0, 12)}-after-add-click.png` },
        behavioural: true,
      });
    } else {
      const hasCoords = afterItems.some((r: any) => r.latitude != null && r.longitude != null);
      fileFinding({
        journey: 'D1',
        step: `add-to-plan:${listing.title}:coords`,
        class: 'INVISIBLE_RESULT',
        severity: hasCoords ? 'P3' : 'P2',
        known: null,
        title: `Coordinate carry-through for "${listing.title}"'s plan item (COORDS, referenced not re-filed)`,
        expected: 'See the lead\'s COORDS finding — a located listing\'s item is expected to carry no lat/lng today',
        actual: hasCoords ? 'Item DOES carry lat/lng (COORDS may be resolved/partially resolved)' : 'Item carries no lat/lng, consistent with COORDS',
        where: 'server (item-add write path) — see COORDS finding for the file:line',
        evidence: {},
        behavioural: true,
      });
    }
  }

  // ── Verify on /plans/:tripId ──
  await page.goto(`/plans/${tripId}`);
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  await shot(page, 'D1', '09', 'slip-view');
  const slipVisible = await testid(page, `slip-view-${tripId}`).isVisible({ timeout: 5000 }).catch(() => false);
  const slipText = await page.locator('body').innerText().catch(() => '');
  const slipShowsA = slipText.includes('Traditional Tea Ceremony');
  const slipShowsB = slipText.includes('Arashiyama');
  fileFinding({
    journey: 'D1',
    step: 'slip:verify',
    class: slipVisible && slipShowsA && slipShowsB ? 'SPEC_DIVERGENCE' : 'INVISIBLE_RESULT',
    severity: slipVisible && slipShowsA && slipShowsB ? 'P3' : 'P1',
    known: null,
    title: 'The slip (/plans/:tripId) reflects the two added items',
    expected: 'slip-view-<tripId> is visible and its text includes both listing titles',
    actual: `slipVisible=${slipVisible}, showsA=${slipShowsA}, showsB=${slipShowsB}`,
    where: 'client/src/components/plancard/SlipView.tsx',
    evidence: { shot: 'shots/D1-09-slip-view.png' },
    behavioural: true,
  });

  // ── Verify on My Plans (/my-trips) ──
  await page.goto('/my-trips');
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  await page.reload();
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  await shot(page, 'D1', '10', 'my-trips');
  const myTripsText = await page.locator('body').innerText().catch(() => '');
  const visibleOnMyTrips = myTripsText.includes('Kyoto');
  fileFinding({
    journey: 'D1',
    step: 'my-trips:verify',
    class: visibleOnMyTrips ? 'SPEC_DIVERGENCE' : 'INVISIBLE_RESULT',
    severity: visibleOnMyTrips ? 'P3' : 'P2',
    known: visibleOnMyTrips ? null : 'KNOWN:RC-7',
    title: 'The new plan is visible on My Plans (/my-trips) immediately after minting',
    expected: 'A cold load of /my-trips lists the just-minted Kyoto plan',
    actual: `page text ${visibleOnMyTrips ? 'includes' : 'does NOT include'} "Kyoto"`,
    where: 'client/src/pages/my-trips.tsx; lib/queryClient.ts staleTime (RC-7)',
    evidence: { shot: 'shots/D1-10-my-trips.png' },
    behavioural: true,
  });

  net.flush();
});
