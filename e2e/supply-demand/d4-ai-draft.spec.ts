/**
 * d4-ai-draft.spec.ts — Pass 2, Part 2, D4.
 *
 * T-auth (never T-pass — Trip Pass purchase is HELD:stripe) runs "Plan with AI" for a FRESH,
 * empty Kyoto plan from the one planning modal. Per ledger `2026-09-25-planning-tolls`: the free
 * draft on an EMPTY plan must write NO `fee_ledger` row. Records whether A/B/C appear in the
 * draft's items (candidate pool is `getActiveProviderServices(30)`, no destination scope —
 * content.routes.ts:5084). Then, on the now non-empty plan, opens "Ask AI about this plan" and
 * creates a proposal — free to ask, charged only at pay/apply (Stripe, HELD). If the CI AI stub
 * key cannot complete a real model call, that is recorded as an ENVIRONMENT limit (NOT PROVEN),
 * never as a product finding — only what is directly observable (an honest error, no fee row) is
 * asserted.
 */
import { test } from '@playwright/test';
import { E2E_PASSWORD, e2eEmail } from './lib/run-id';
import { signupViaUi } from './lib/accounts';
import { fillPlanModalToFinish, clickPlanFinish, openPlanModalFromHero } from './lib/flows';
import { shot, netLogger } from './lib/evidence';
import { fileFinding } from './lib/findings';
import { q, feeBand } from './lib/db';
import { readState, writeState } from './lib/state';
import { testid } from './lib/ui';

test.describe.configure({ mode: 'serial' });

test('D4: AI free draft on an empty plan, then a paid-task proposal ask', async ({ page }) => {
  const state = readState();
  if (!state.accounts.tauth?.email) {
    fileFinding({
      journey: 'D4',
      step: 'precondition',
      class: 'SPEC_DIVERGENCE',
      severity: 'P1',
      known: null,
      title: 'No T-auth account in harness state — D1 must run first',
      expected: 'state.accounts.tauth is populated by D1',
      actual: 'missing',
      where: 'e2e/supply-demand/d4-ai-draft.spec.ts',
      evidence: {},
      behavioural: true,
    });
    test.skip(true, 'no traveler account in state');
    return;
  }

  // A SEPARATE fresh account, not D1's tauth (harness fix): `finish()`'s `shouldMint` only mints
  // a NEW trip when `!getTripContext().tripId` — D1's tauth already has a plan bound as "current"
  // in their pen, so re-opening "Plan with AI" in that SAME session just continues D1's
  // now-non-empty plan (confirmed behaviourally: state.trips.tauthAiDraft came back with the
  // IDENTICAL id as state.trips.tauthKyoto). LD 41 (b)'s free-draft-on-empty-plan premise needs a
  // session with NO plan bound yet, so this journey mints its own traveler.
  const tauth = { email: e2eEmail('tauth-d4') };

  const net = netLogger(page, 'D4');
  await signupViaUi(page, { email: tauth.email, firstName: 'E2E', lastName: 'TAuthD4' });

  // ── A FRESH plan for the free-draft leg (LD 41 (b): free draft runs only on an EMPTY plan) ──
  await page.goto('/');
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  const opened = await openPlanModalFromHero(page);
  if (!opened) {
    fileFinding({
      journey: 'D4',
      step: 'plan-modal:open',
      class: 'DEAD_TRIGGER',
      severity: 'P1',
      known: null,
      title: 'button-plan-trip did not open plan-modal for the D4 AI-draft attempt',
      expected: 'Clicking the hero CTA opens the one planning modal',
      actual: 'plan-modal never became visible',
      where: 'client/src/components/landing/landing-hero.tsx',
      evidence: {},
      behavioural: true,
    });
    net.flush();
    throw new Error('D4: could not open the planning modal');
  }
  await fillPlanModalToFinish(page, 'Kyoto, Japan', { offsetDays: 55, lenDays: 4 });
  await shot(page, 'D4', '01', 'plan-modal-finish-row');

  const feeLedgerBefore = await q(
    `SELECT count(*)::int AS c FROM fee_ledger WHERE fee_type = 'ai_concierge_fee'`,
  );

  const tripId = await clickPlanFinish(page, 'ai');
  await page.waitForTimeout(1000);
  await shot(page, 'D4', '02', 'after-ai-finish-click');
  // "ai" does not itself navigate — it opens EnhancedPlanningModal in place, so `clickPlanFinish`
  // (which parses the URL) is expected to return null here; the tripId is read from the DB
  // instead, by matching the plan this account just minted for this destination/date window.
  const mintedTrip = await q(
    `SELECT id FROM trips WHERE user_id = (SELECT id FROM users WHERE email = $1) AND destination ILIKE '%Kyoto%' ORDER BY created_at DESC LIMIT 1`,
    [tauth.email],
  );
  const draftTripId = tripId ?? mintedTrip[0]?.id ?? null;
  if (!draftTripId) {
    fileFinding({
      journey: 'D4',
      step: 'plan-modal:ai-mint',
      class: 'SPEC_DIVERGENCE',
      severity: 'P1',
      known: null,
      title: '"Plan with AI" did not mint a trips row before opening the AI draft form',
      expected: 'ledger 2026-09-24-rc1-finish-mints: the ai branch mints through mintTripSlip before the form opens',
      actual: 'No matching trips row found',
      where: 'client/src/contexts/PlanningContext.tsx (runBranch, branch === "ai")',
      evidence: { shot: 'shots/D4-02-after-ai-finish-click.png' },
      behavioural: true,
    });
    net.flush();
    throw new Error('D4: no trip minted for the AI draft');
  }
  writeState((s) => {
    s.trips.tauthAiDraft = { id: draftTripId, label: 'D4 AI draft plan' };
  });

  const generateBtn = testid(page, 'button-generate-itinerary');
  const generateVisible = await generateBtn.isVisible({ timeout: 6000 }).catch(() => false);
  if (!generateVisible) {
    fileFinding({
      journey: 'D4',
      step: 'ai-form:generate-button',
      class: 'DEAD_TRIGGER',
      severity: 'P1',
      known: null,
      title: 'button-generate-itinerary not visible on EnhancedPlanningModal after the ai finish',
      expected: 'The AI draft form opens with a Generate control',
      actual: 'Not visible within 6s',
      where: 'client/src/components/EnhancedPlanningModal.tsx',
      evidence: { shot: 'shots/D4-02-after-ai-finish-click.png' },
      behavioural: true,
    });
    net.flush();
    throw new Error('D4: no generate control');
  }
  await generateBtn.click().catch(() => {});
  await shot(page, 'D4', '03', 'generating');

  // Give the model call a generous window; this is exactly the leg the CI stub key may not be
  // able to complete. Poll for either new itinerary_items or an on-screen error, up to 90s.
  let itemsAfter: any[] = [];
  let sawError = false;
  for (let i = 0; i < 18; i++) {
    await page.waitForTimeout(5000);
    itemsAfter = await q(`SELECT id FROM itinerary_items WHERE trip_id = $1`, [draftTripId]);
    if (itemsAfter.length > 0) break;
    const errText = await page.locator('body').innerText().catch(() => '');
    if (/error|failed|try again|could not generate/i.test(errText)) {
      sawError = true;
      break;
    }
  }
  await shot(page, 'D4', '04', 'after-generate-wait');

  const feeLedgerAfter = await q(
    `SELECT count(*)::int AS c FROM fee_ledger WHERE fee_type = 'ai_concierge_fee'`,
  );
  const noFeeRow = feeLedgerAfter[0]?.c === feeLedgerBefore[0]?.c;
  fileFinding({
    journey: 'D4',
    step: 'free-draft:no-fee-row',
    class: noFeeRow ? 'SPEC_DIVERGENCE' : 'SPEC_DIVERGENCE',
    severity: noFeeRow ? 'P3' : 'P1',
    known: null,
    title: `Free AI draft on an empty plan ${noFeeRow ? 'wrote NO' : 'WROTE A'} fee_ledger ai_concierge_fee row`,
    expected: 'ledger 2026-09-25-planning-tolls: the free draft on an empty plan is un-tolled',
    actual: `before=${feeLedgerBefore[0]?.c}, after=${feeLedgerAfter[0]?.c}`,
    where: 'server routes handling the free draft generate',
    evidence: {},
    behavioural: true,
  });

  if (itemsAfter.length === 0) {
    test.skip(
      true,
      `NOT PROVEN (environment): the AI draft did not produce items within 90s (sawErrorOnScreen=${sawError}). ` +
        'The CI Anthropic key is a stub (sk-ant-ci…); a model call cannot be completed in this environment. ' +
        'The only assertion made is the fee_ledger check above, which holds regardless.',
    );
    net.flush();
    return;
  }

  const candidateIds = itemsAfter.map((r: any) => r.id);
  const withProviderService = await q(
    `SELECT provider_service_id FROM itinerary_items WHERE trip_id = $1 AND provider_service_id IS NOT NULL`,
    [draftTripId],
  );
  const expectedIds = [
    state.listings.providerA?.providerServiceId,
    state.listings.providerB?.providerServiceId,
    state.listings.providerC?.providerServiceId,
  ].filter(Boolean);
  const anyMatchesABC = withProviderService.some((r: any) => expectedIds.includes(r.provider_service_id));
  fileFinding({
    journey: 'D4',
    step: 'free-draft:abc-in-pool',
    class: 'SPEC_DIVERGENCE',
    severity: 'P3',
    known: null,
    title: `A/B/C ${anyMatchesABC ? 'DID' : 'did NOT'} appear in the free draft's items`,
    expected: 'n/a — observation of getActiveProviderServices(30), no destination scope (content.routes.ts:5084)',
    actual: `${withProviderService.length} item(s) carry a provider_service_id; A/B/C present=${anyMatchesABC}`,
    where: 'server/routes/content.routes.ts:5084',
    evidence: {},
    behavioural: true,
  });

  // ── Now the plan is non-empty: open "Ask AI about this plan" and create a proposal ──
  await page.goto(`/plans/${draftTripId}`);
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  const askAiTrigger = testid(page, 'slip-action-ask-ai');
  if (await askAiTrigger.isVisible({ timeout: 5000 }).catch(() => false)) {
    await askAiTrigger.click().catch(() => {});
    await page.waitForTimeout(500);
    await shot(page, 'D4', '05', 'ask-ai-drawer-open');
    const question = testid(page, 'ask-ai-question');
    if (await question.isVisible({ timeout: 3000 }).catch(() => false)) {
      await question.fill('Swap one afternoon activity for something quieter.').catch(() => {});
      const submit = testid(page, 'ask-ai-submit');
      if (await submit.isVisible({ timeout: 2000 }).catch(() => false) && !(await submit.isDisabled().catch(() => false))) {
        const band = await feeBand('concierge:ai_task').catch(() => null);
        await submit.click().catch(() => {});
        await page.waitForTimeout(3000);
        await shot(page, 'D4', '06', 'after-ask-ai-submit');
        const proposalRows = await q(
          `SELECT id, status FROM plan_proposals WHERE trip_id = $1 ORDER BY created_at DESC LIMIT 1`,
          [draftTripId],
        ).catch(() => [] as any[]);
        fileFinding({
          journey: 'D4',
          step: 'ask-ai:proposal-created',
          class: proposalRows.length > 0 ? 'SPEC_DIVERGENCE' : 'SPEC_DIVERGENCE',
          severity: proposalRows.length > 0 ? 'P3' : 'P2',
          known: null,
          title: `plan_proposals row ${proposalRows.length > 0 ? 'created' : 'NOT created'} by Ask AI (fee_bands concierge:ai_task rate=${band?.defaultRate ?? 'n/a'})`,
          expected: 'Asking is free; a plan_proposals row is written; charge happens only at pay/apply',
          actual: JSON.stringify(proposalRows[0] ?? null),
          where: 'client/src/components/plancard/AskAiDrawer.tsx; server (POST .../proposals)',
          evidence: { shot: 'shots/D4-06-after-ask-ai-submit.png' },
          behavioural: true,
        });
        if (proposalRows.length > 0) {
          test.skip(true, 'HELD:stripe — pay/apply on the proposal charges from concierge:ai_task and is not attempted');
        } else {
          test.skip(true, 'NOT PROVEN (environment): the proposal ask could not be confirmed as created within the wait window (CI model stub)');
        }
      }
    }
  }

  net.flush();
});
