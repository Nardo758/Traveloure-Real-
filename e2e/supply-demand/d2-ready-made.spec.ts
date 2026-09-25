/**
 * d2-ready-made.spec.ts — Pass 2, Part 2, D2.
 *
 * T-auth (the same traveler minted in D1) opens Expert E's "3 Days in Kyoto" ready-made on the
 * browse page (/ready-made) and its detail page (/ready-made/:id), and attempts to clone/use it
 * into a plan. `ready-made-detail.tsx`'s own header comment says clone happens ONLY on purchase
 * (a real Stripe charge, `button-buy-rm`) — there is no free/preview clone path — so the actual
 * clone is HELD:stripe. This spec still proves discovery (visibility) and the purchase CTA's
 * shape, and — if the row happens to already be purchased by this account (idempotent 409 →
 * redirect) — verifies the cloned items resolve to A/B/C's LIVE provider_services ids, never
 * copies (ruling 39).
 */
import { test } from '@playwright/test';
import { E2E_PASSWORD } from './lib/run-id';
import { loginViaUi } from './lib/accounts';
import { shot, netLogger } from './lib/evidence';
import { fileFinding, fileVisibility } from './lib/findings';
import { q } from './lib/db';
import { readState } from './lib/state';
import { testid, appears } from './lib/ui';

test.describe.configure({ mode: 'serial' });

test('D2: traveler discovers and attempts to clone Expert E\'s ready-made', async ({ page }) => {
  const state = readState();
  const tauth = state.accounts.tauth;
  const readyMade = state.readyMade;
  if (!tauth?.email) {
    fileFinding({
      journey: 'D2',
      step: 'precondition',
      class: 'SPEC_DIVERGENCE',
      severity: 'P1',
      known: null,
      title: 'No T-auth account in harness state — D1 must run first',
      expected: 'state.accounts.tauth is populated by D1',
      actual: 'missing',
      where: 'e2e/supply-demand/d2-ready-made.spec.ts',
      evidence: {},
      behavioural: true,
    });
    test.skip(true, 'no traveler account in state');
    return;
  }

  const net = netLogger(page, 'D2');
  await loginViaUi(page, tauth.email, E2E_PASSWORD);

  if (!readyMade?.id) {
    fileFinding({
      journey: 'D2',
      step: 'precondition',
      class: 'SPEC_DIVERGENCE',
      severity: 'P2',
      known: null,
      title: 'No ready_made_trips row in harness state — S2\'s ready-made build did not complete',
      expected: 'S2\'s ready-made test (Part 1c) populated state.readyMade',
      actual: 'state.readyMade is empty',
      where: 'e2e/supply-demand/s2-expert-publish.spec.ts',
      evidence: {},
      behavioural: true,
    });
    net.flush();
    test.skip(true, 'no ready-made fixture in state — see finding above');
    return;
  }

  // ── Discovery: /ready-made browse ──
  await page.goto('/ready-made');
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  await page.reload();
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  const browseText = await page.locator('body').innerText().catch(() => '');
  const foundOnBrowse = browseText.includes(readyMade.title) || browseText.includes('3 Days in Kyoto');
  await shot(page, 'D2', '01', 'ready-made-browse');
  fileVisibility({
    content: 'ready_made',
    item: readyMade.title,
    surface: '/ready-made',
    expected: 'visible',
    actual: foundOnBrowse ? 'visible' : 'hidden',
    filter: 'client/src/pages/ready-made.tsx',
    journey: 'D2',
    ms: null,
  });

  // ── Detail page ──
  await page.goto(`/ready-made/${readyMade.id}`);
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  await shot(page, 'D2', '02', 'ready-made-detail');
  const detailText = await page.locator('body').innerText().catch(() => '');
  const detailShows = detailText.includes(readyMade.title) || detailText.includes('3 Days in Kyoto');
  fileVisibility({
    content: 'ready_made',
    item: readyMade.title,
    surface: `/ready-made/${readyMade.id}`,
    expected: 'visible',
    actual: detailShows ? 'visible' : 'hidden',
    filter: 'client/src/pages/ready-made-detail.tsx',
    journey: 'D2',
    ms: null,
  });

  const buyBtn = testid(page, 'button-buy-rm');
  const buyVisible = await appears(buyBtn, 5000);
  if (!buyVisible) {
    fileFinding({
      journey: 'D2',
      step: 'purchase-cta',
      class: 'SPEC_DIVERGENCE',
      severity: 'P3',
      known: null,
      title: 'button-buy-rm not visible on the ready-made detail page',
      expected: 'A purchase CTA is present for an approved, live ready-made',
      actual: `detailShows=${detailShows}, buyVisible=false`,
      where: 'client/src/pages/ready-made-detail.tsx',
      evidence: { shot: 'shots/D2-02-ready-made-detail.png' },
      behavioural: true,
    });
    net.flush();
    return;
  }

  const beforeTrips = await q(
    `SELECT id FROM trips WHERE user_id = (SELECT id FROM users WHERE email = $1) AND destination ILIKE '%Kyoto%'`,
    [tauth.email],
  );
  await buyBtn.click().catch(() => {});
  await page.waitForTimeout(2000);
  await shot(page, 'D2', '03', 'after-buy-click');

  const url = page.url();
  const clonedByRedirect = /\/plans\//.test(url);
  if (clonedByRedirect) {
    // Idempotent 409 -> redirect path (already purchased). Not expected on a fresh account, but
    // handled honestly rather than assumed away.
    const tripIdMatch = url.match(/\/plans\/([a-zA-Z0-9-]+)/);
    const tripId = tripIdMatch ? tripIdMatch[1] : null;
    const items = tripId
      ? await q(`SELECT provider_service_id FROM itinerary_items WHERE trip_id = $1 AND provider_service_id IS NOT NULL`, [tripId])
      : [];
    const expectedIds = [
      state.listings.providerA?.providerServiceId,
      state.listings.providerB?.providerServiceId,
      state.listings.providerC?.providerServiceId,
    ].filter(Boolean);
    const referencesLive = items.length > 0 && items.every((r: any) => expectedIds.includes(r.provider_service_id));
    fileFinding({
      journey: 'D2',
      step: 'clone-verify',
      class: 'SPEC_DIVERGENCE',
      severity: 'P3',
      known: null,
      title: 'Ready-made clone landed on a plan without a Stripe redirect (already-purchased 409 path)',
      expected: 'Cloned itinerary_items reference the LIVE provider_services ids (ruling 39, never copies)',
      actual: `tripId=${tripId}, items=${items.length}, referencesLive=${referencesLive}`,
      where: 'client/src/pages/ready-made-detail.tsx (409 -> cloneTripId redirect)',
      evidence: { shot: 'shots/D2-03-after-buy-click.png' },
      behavioural: true,
    });
  } else {
    test.skip(true, 'HELD:stripe — button-buy-rm opens a real Stripe PaymentIntent; the clone happens only on a successful charge (ready-made-detail.tsx header comment), which this environment cannot complete');
  }
  net.flush();
});
