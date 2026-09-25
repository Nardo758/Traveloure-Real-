/**
 * d3-with-an-expert.spec.ts — Pass 2, Part 2, D3.
 *
 * T-auth opens Expert E's storefront (/s/<handle>), sends a first message (RC-11 is resolved on
 * main — a failure here is a NEW regression, never KNOWN), hires E onto the D1 plan through the
 * slip's HireExpertDialog (ruling 42 D6/D7 — the ONE picker), Expert E sends a suggestion from
 * /expert/workspace/:tripId, and T-auth accepts it on the slip. Verifies both sides (DB + UI).
 */
import { test, expect } from '@playwright/test';
import { E2E_PASSWORD } from './lib/run-id';
import { loginViaUi } from './lib/accounts';
import { shot, netLogger } from './lib/evidence';
import { fileFinding } from './lib/findings';
import { q, userByEmail } from './lib/db';
import { readState } from './lib/state';
import { testid, appears } from './lib/ui';

test.describe.configure({ mode: 'serial' });

test('D3: traveler messages, hires and gets a suggestion from Expert E', async ({ page }) => {
  const state = readState();
  const tauth = state.accounts.tauth;
  const expertE = state.accounts.expertE;
  const tripId = state.trips.tauthKyoto?.id;
  if (!tauth?.email || !expertE?.handle || !tripId) {
    fileFinding({
      journey: 'D3',
      step: 'precondition',
      class: 'SPEC_DIVERGENCE',
      severity: 'P1',
      known: null,
      title: 'Missing T-auth account, Expert E handle, or D1 tripId in harness state',
      expected: 'D1 and S2 ran first and persisted this state',
      actual: `tauth=${!!tauth?.email}, expertE.handle=${!!expertE?.handle}, tripId=${!!tripId}`,
      where: 'e2e/supply-demand/d3-with-an-expert.spec.ts',
      evidence: {},
      behavioural: true,
    });
    test.skip(true, 'missing precondition state');
    return;
  }

  const net = netLogger(page, 'D3');
  await loginViaUi(page, tauth.email, E2E_PASSWORD);

  // ── Storefront + first message (RC-11 resolved) ──
  await page.goto(`/s/${expertE.handle}`);
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  await shot(page, 'D3', '01', 'storefront');

  const msgBtn = testid(page, 'button-message-storefront');
  const msgBtnVisible = await appears(msgBtn, 5000);
  if (!msgBtnVisible) {
    fileFinding({
      journey: 'D3',
      step: 'storefront:message-button',
      class: 'DEAD_TRIGGER',
      severity: 'P1',
      known: null,
      title: `button-message-storefront not visible on /s/${expertE.handle}`,
      expected: 'A signed-in, non-owner visitor sees a Message CTA',
      actual: 'Not visible within 5s',
      where: 'client/src/pages/storefront.tsx',
      evidence: { shot: 'shots/D3-01-storefront.png' },
      behavioural: true,
    });
  } else {
    await msgBtn.click().catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    await shot(page, 'D3', '02', 'chat-opened');
    const input = testid(page, 'input-message');
    // `locator.isVisible()` does NOT auto-wait for the element to appear — it checks the DOM's
    // CURRENT state and returns instantly, so a plain `isVisible({timeout})` on a still-rendering
    // React tree can read false even though the element shows up a moment later (the D3-02
    // screenshot from an earlier attempt proved this: the composer WAS on screen by the time the
    // screenshot fired, moments after the check had already failed). `waitFor` DOES poll.
    let inputVisible = await input
      .waitFor({ state: 'visible', timeout: 10_000 })
      .then(() => true)
      .catch(() => false);
    if (!inputVisible) {
      await page.reload();
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
      await shot(page, 'D3', '02b', 'chat-opened-after-reload');
      inputVisible = await input
        .waitFor({ state: 'visible', timeout: 10_000 })
        .then(() => true)
        .catch(() => false);
    }
    if (inputVisible) {
      const messageBody = `D3 first message — e2e supply-demand`;
      await input.fill(messageBody).catch(() => {});
      const sendBtn = testid(page, 'button-send');
      await sendBtn.click().catch(() => {});
      await page.waitForTimeout(1500);
      await shot(page, 'D3', '03', 'after-send');
      const sentInDb = await q(
        `SELECT id FROM chat_messages WHERE message ILIKE $1 ORDER BY created_at DESC LIMIT 1`,
        [`%${messageBody}%`],
      ).catch(() => [] as any[]);
      fileFinding({
        journey: 'D3',
        step: 'chat:first-message',
        class: sentInDb.length > 0 ? 'SPEC_DIVERGENCE' : 'DEAD_TRIGGER',
        severity: sentInDb.length > 0 ? 'P3' : 'P1',
        known: null,
        title: `First message to Expert E ${sentInDb.length > 0 ? 'was recorded' : 'was NOT recorded'} (RC-11 regression check)`,
        expected: 'RC-11 is resolved on main — the first send to a newly-opened conversation must succeed',
        actual: `chat_messages row found=${sentInDb.length > 0}`,
        where: 'server/services/messages.service.ts',
        evidence: { shot: 'shots/D3-03-after-send.png' },
        behavioural: true,
      });
    } else {
      fileFinding({
        journey: 'D3',
        step: 'chat:input',
        class: 'DEAD_TRIGGER',
        severity: 'P1',
        known: null,
        title: 'input-message not visible after opening the storefront conversation',
        expected: 'The chat composer renders for a freshly-opened conversation',
        actual: 'Not visible within 5s',
        where: 'client/src/pages/chat.tsx',
        evidence: { shot: 'shots/D3-02-chat-opened.png' },
        behavioural: true,
      });
    }
  }

  // ── Hire E onto the plan via the slip's HireExpertDialog (ruling 42 D6/D7) ──
  await page.goto(`/plans/${tripId}`);
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  await shot(page, 'D3', '04', 'slip-before-hire');

  const expertUser = await userByEmail(expertE.email);
  const hireTrigger = testid(page, 'slip-action-hire-expert');
  const hireTriggerVisible = await appears(hireTrigger, 5000);
  let hired = false;
  if (hireTriggerVisible) {
    await hireTrigger.click().catch(() => {});
    await page.waitForTimeout(800);
    await shot(page, 'D3', '05', 'hire-dialog-open');
    const specificOption = expertUser?.id ? testid(page, `hire-expert-option-${expertUser.id}`) : null;
    const specificVisible = specificOption ? await appears(specificOption, 4000) : false;
    if (specificVisible && specificOption) {
      await specificOption.click().catch(() => {});
    } else {
      const anyOption = page.locator('[data-testid^="hire-expert-option-"]');
      const anyCount = await anyOption.count().catch(() => 0);
      if (anyCount > 0) {
        fileFinding({
          journey: 'D3',
          step: 'hire-expert:not-the-named-expert',
          class: 'SPEC_DIVERGENCE',
          severity: 'P3',
          known: null,
          title: 'HireExpertDialog did not list Expert E specifically for this occasion/destination',
          expected: 'Expert E (Kyoto, custom-itinerary-planning offering) is one of the listed options',
          actual: `hire-expert-option-${expertUser?.id} not visible; ${anyCount} other option(s) present — picked the first`,
          where: 'client/src/components/plancard/HireExpertDialog.tsx',
          evidence: { shot: 'shots/D3-05-hire-dialog-open.png' },
          behavioural: true,
        });
        await anyOption.first().click().catch(() => {});
      }
    }
    const submit = testid(page, 'button-hire-expert-submit');
    if (await appears(submit, 3000) && !(await submit.isDisabled().catch(() => false))) {
      await submit.click().catch(() => {});
      await page.waitForTimeout(1200);
      hired = true;
    }
    await shot(page, 'D3', '06', 'after-hire-submit');
  }

  const advisorRow = expertUser?.id
    ? await q(`SELECT status FROM trip_expert_advisors WHERE trip_id = $1 AND local_expert_id = $2`, [tripId, expertUser.id])
    : [];
  fileFinding({
    journey: 'D3',
    step: 'hire-expert:verify',
    class: advisorRow.length > 0 ? 'SPEC_DIVERGENCE' : 'DEAD_TRIGGER',
    severity: advisorRow.length > 0 ? 'P3' : 'P1',
    known: null,
    title: `trip_expert_advisors row ${advisorRow.length > 0 ? 'exists' : 'does NOT exist'} for Expert E on this plan after hire`,
    expected: 'A trip_expert_advisors row (status pending/accepted/assigned) exists via upsertTripAdvisorRow (LD 32)',
    actual: JSON.stringify(advisorRow[0] ?? null),
    where: 'server/services/booking-actions.service.ts upsertTripAdvisorRow',
    evidence: { shot: 'shots/D3-06-after-hire-submit.png' },
    behavioural: true,
  });
  if (advisorRow.length === 0) {
    net.flush();
    test.skip(true, 'could not hire Expert E onto the plan — see finding above; skipping the suggestion leg');
    return;
  }

  // ── Expert E sends a suggestion from the workspace ──
  await loginViaUi(page, expertE.email, E2E_PASSWORD);
  await page.goto(`/expert/workspace/${tripId}`);
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  await shot(page, 'D3', '07', 'expert-workspace');

  // "Suggest to client" (button-toggle-suggest) lives under the right rail's "Advisor" tab, not
  // the default "Add" tab the panel opens on (confirmed live via screenshot — the "Add" tab was
  // showing the DMO/Platform-services picker with no suggest control anywhere on the page). The
  // tab's DISPLAY label is "Advisor" but its testid key is still "gaps" (workspace.tsx: "Advisor
  // Phase 1: visible label only — the 'gaps' key/testids are untouched... tab-right-gaps... stays
  // exactly as it was") — `tab-right-advisor` does not exist, which is why the first fix attempt
  // silently no-opped (isVisible=false, swallowed by .catch()) and this screenshot still showed
  // "Add" selected.
  const advisorTab = testid(page, 'tab-right-gaps');
  const advisorTabVisible = await advisorTab
    .waitFor({ state: 'visible', timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  if (advisorTabVisible) {
    await advisorTab.click().catch(() => {});
    await page.waitForTimeout(700);
  }
  await shot(page, 'D3', '07b', 'expert-workspace-advisor-tab');

  const toggleSuggest = testid(page, 'button-toggle-suggest');
  const toggleVisible = await toggleSuggest
    .waitFor({ state: 'visible', timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  let suggestionSubmitted = false;
  if (toggleVisible) {
    await toggleSuggest.click().catch(() => {});
    await page.waitForTimeout(500);
    await testid(page, 'input-suggestion-title').fill('A local\'s tip — Nishiki Market at opening').catch(() => {});
    await testid(page, 'input-suggestion-description').fill('Go right when it opens, before the tour groups — e2e D3 suggestion.').catch(() => {});
    await shot(page, 'D3', '08', 'suggestion-form-filled');
    const submitBtn = testid(page, 'button-submit-suggestion');
    if (await appears(submitBtn, 3000) && !(await submitBtn.isDisabled().catch(() => false))) {
      await submitBtn.click().catch(() => {});
      await page.waitForTimeout(1200);
      suggestionSubmitted = true;
    }
    await shot(page, 'D3', '09', 'after-suggestion-submit');
  } else {
    fileFinding({
      journey: 'D3',
      step: 'workspace:suggest-toggle',
      class: 'DEAD_TRIGGER',
      severity: 'P2',
      known: null,
      title: 'button-toggle-suggest not visible on the expert workspace for the hired plan',
      expected: 'A §12 WRITE-status advisor can open the suggestion form',
      actual: 'Not visible within 5s',
      where: 'client/src/pages/expert/workspace.tsx',
      evidence: { shot: 'shots/D3-07-expert-workspace.png' },
      behavioural: true,
    });
  }

  const suggestionRows = await q(
    `SELECT id, title, status FROM trip_suggestions WHERE trip_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [tripId],
  ).catch(() => [] as any[]);
  fileFinding({
    journey: 'D3',
    step: 'workspace:suggestion-verify',
    class: suggestionRows.length > 0 ? 'SPEC_DIVERGENCE' : 'SILENT_SUCCESS',
    severity: suggestionRows.length > 0 ? 'P3' : 'P1',
    known: null,
    title: `trip_suggestions row ${suggestionRows.length > 0 ? 'exists' : 'does NOT exist'} after the expert's submit`,
    expected: 'A trip_suggestions row (status pending) exists',
    actual: JSON.stringify(suggestionRows[0] ?? null),
    where: 'client/src/pages/expert/workspace.tsx (button-submit-suggestion)',
    evidence: { shot: 'shots/D3-09-after-suggestion-submit.png' },
    behavioural: true,
  });

  if (suggestionRows.length === 0) {
    net.flush();
    test.skip(true, 'no trip_suggestions row minted — see finding above; skipping the accept leg');
    return;
  }
  const suggestionId = suggestionRows[0].id;

  // ── T-auth accepts it on the slip ──
  await loginViaUi(page, tauth.email, E2E_PASSWORD);
  await page.goto(`/plans/${tripId}`);
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  await shot(page, 'D3', '10', 'slip-with-suggestion');

  const approveBtn = testid(page, `button-approve-suggestion-${suggestionId}`);
  const approveVisible = await appears(approveBtn, 6000);
  if (approveVisible) {
    await approveBtn.click().catch(() => {});
    await page.waitForTimeout(1200);
  }
  await shot(page, 'D3', '11', 'after-approve-suggestion');

  const afterStatus = await q(`SELECT status FROM trip_suggestions WHERE id = $1`, [suggestionId]);
  fileFinding({
    journey: 'D3',
    step: 'slip:accept-suggestion',
    class: afterStatus[0]?.status === 'approved' || afterStatus[0]?.status === 'accepted' ? 'SPEC_DIVERGENCE' : 'DEAD_TRIGGER',
    severity: afterStatus[0]?.status === 'approved' || afterStatus[0]?.status === 'accepted' ? 'P3' : 'P1',
    known: null,
    title: `Suggestion status after traveler accept: ${afterStatus[0]?.status ?? 'row absent'}`,
    expected: 'button-approve-suggestion-<id> flips trip_suggestions.status to approved/accepted',
    actual: `approveVisible=${approveVisible}, status=${afterStatus[0]?.status}`,
    where: 'client/src/components/plancard/ExpertSuggestionsPanel.tsx',
    evidence: { shot: 'shots/D3-11-after-approve-suggestion.png' },
    behavioural: true,
  });

  net.flush();
});
