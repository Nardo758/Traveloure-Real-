/**
 * d4-ai-draft.spec.ts — Pass 2, Part 2, D4.
 *
 * T-auth (never T-pass — Trip Pass purchase is HELD:stripe) opens a fresh empty Kyoto plan.
 * This job boots a production bundle, which ignores `E2E_AI_STUB`. The draft step asserts that
 * failure: 429, 502 or 503, no `origin='ai'` rows, the slip's `ai-draft-failure` notice, and no
 * new `ai_concierge_fee` row. A canned draft cannot name provider services or answer Ask AI, so
 * those observations are not moved. The proof that an empty-plan draft writes `origin='ai'` items
 * and no fee row is the stand-in on dev-server-gates.
 */
import { test, expect } from '@playwright/test';
import { e2eEmail } from './lib/run-id';
import { signupViaUi } from './lib/accounts';
import { fillPlanEntryToStart, clickPlanStart, openPlanEntryFromHero } from './lib/flows';
import { shot, netLogger } from './lib/evidence';
import { fileFinding } from './lib/findings';
import { q } from './lib/db';
import { readState, writeState } from './lib/state';
import { testid, appears, actAndAwait } from './lib/ui';

test.describe.configure({ mode: 'serial' });

test('D4: a production free draft on an empty plan fails honestly and writes no fee row', async ({ page }) => {
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
  const opened = await openPlanEntryFromHero(page);
  if (!opened) {
    fileFinding({
      journey: 'D4',
      step: 'plan-modal:open',
      class: 'DEAD_TRIGGER',
      severity: 'P1',
      known: null,
      title: 'button-plan-trip did not open plan-entry for the D4 AI-draft attempt',
      expected: 'Clicking the hero CTA opens PlanEntry (E2)',
      actual: 'plan-entry never became visible',
      where: 'client/src/components/landing/landing-hero.tsx',
      evidence: {},
      behavioural: true,
    });
    net.flush();
    throw new Error('D4: could not open the planning modal');
  }
  await fillPlanEntryToStart(page, 'Kyoto, Japan', { offsetDays: 55, lenDays: 4 });
  await shot(page, 'D4', '01', 'plan-entry-start');

  const feeLedgerBefore = await q(
    `SELECT count(*)::int AS c FROM fee_ledger WHERE fee_type = 'ai_concierge_fee'`,
  );

  // E2: Start a plan mints the (empty) plan and lands on it; the free draft is then the slip's own
  // "Draft it with AI" (the build chooser left the pop-up). The tripId falls back to the DB read.
  const tripId = await clickPlanStart(page);
  await shot(page, 'D4', '02', 'after-start-a-plan');
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
      title: 'Start a plan did not mint a trips row for the AI draft',
      expected: 'E2: Start a plan mints through mintTripSlip and lands on the plan',
      actual: 'No matching trips row found',
      where: 'client/src/contexts/PlanningContext.tsx (startFromEntry)',
      evidence: { shot: 'shots/D4-02-after-start-a-plan.png' },
      behavioural: true,
    });
    net.flush();
    throw new Error('D4: no trip minted for the AI draft');
  }
  writeState((s) => {
    s.trips.tauthAiDraft = { id: draftTripId, label: 'D4 AI draft plan' };
  });

  const generateBtn = testid(page, 'slip-action-draft-ai').first();
  const generateVisible = await appears(generateBtn, 10_000);
  if (!generateVisible) {
    fileFinding({
      journey: 'D4',
      step: 'ai-form:generate-button',
      class: 'DEAD_TRIGGER',
      severity: 'P1',
      known: null,
      title: 'Draft it with AI (slip-action-draft-ai) not visible on the new empty plan',
      expected: 'An empty plan offers Draft it with AI (LD 41 (b))',
      actual: 'Not visible within 10s',
      where: 'client/src/components/plancard/SlipRail.tsx',
      evidence: { shot: 'shots/D4-02-after-start-a-plan.png' },
      behavioural: true,
    });
    net.flush();
    throw new Error('D4: no generate control');
  }
  const status = await actAndAwait(
    page,
    async () => {
      await generateBtn.click();
    },
    { method: 'POST', path: /^\/api\/ai\/generate-itinerary$/ },
    60_000,
  );
  await shot(page, 'D4', '03', 'after-draft-failure');
  expect(
    [429, 502, 503],
    `production ignores E2E_AI_STUB; the slip draft answered ${status}`,
  ).toContain(status);

  const aiItems = await q(
    `SELECT id FROM itinerary_items WHERE trip_id = $1 AND origin = 'ai'`,
    [draftTripId],
  );
  expect(aiItems.length, 'a production model failure writes no drafted rows').toBe(0);
  await expect(testid(page, 'ai-draft-failure')).toBeVisible({ timeout: 20_000 });

  const feeLedgerAfter = await q(
    `SELECT count(*)::int AS c FROM fee_ledger WHERE fee_type = 'ai_concierge_fee'`,
  );
  expect(
    feeLedgerAfter[0]?.c,
    'a failed free draft on an empty plan writes no ai_concierge_fee row',
  ).toBe(feeLedgerBefore[0]?.c);

  net.flush();
});
