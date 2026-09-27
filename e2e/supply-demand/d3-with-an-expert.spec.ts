/**
 * d3-with-an-expert.spec.ts — Pass 2, Part 2, D3.
 *
 * T-auth opens Expert E's storefront (/s/<handle>), sends a first message (RC-11 is resolved on
 * main — a failure here is a NEW regression, never KNOWN), hires E onto the D1 plan through the
 * slip's HireExpertDialog (ruling 42 D6/D7 — the ONE picker), Expert E sends a suggestion from
 * /expert/workspace/:tripId, and T-auth accepts it on the slip. Verifies both sides (DB + UI).
 */
import { test, expect } from '@playwright/test';
import { E2E_PASSWORD, RUN_ID } from './lib/run-id';
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
      // Real store: `storage.createChat` (server/storage.ts) writes `user_and_expert_chats`
      // (shared/schema.ts:2124) — NOT a `chat_messages` table, which does not exist. Checking
      // the wrong table always read "not found" regardless of what actually happened (lead
      // verdict on P2-D3-1: "checks a chat_messages table instead of the chat store").
      const sentInDb = await q(
        `SELECT id FROM user_and_expert_chats WHERE message ILIKE $1 ORDER BY created_at DESC LIMIT 1`,
        [`%${messageBody}%`],
      ).catch(() => [] as any[]);
      // `net.entries` is this test's own in-process array (reset by netLogger's `flush()`,
      // never read back from the shared JSONL file), so it is already scoped to this run — the
      // false RC-11 regression was never an in-memory scan bug, it was (a) the wrong DB table
      // above and (b) the ON-DISK net log file accumulating entries across separate harness runs
      // with no run id in its name, so a HUMAN reading net/D3.jsonl to corroborate a finding
      // could see a stale run's 404 next to this run's success (fixed in lib/evidence.ts).
      //
      // RC-11 is resolved on main: a POST /api/chats 404 only counts as a REGRESSION of it when
      // it happens AFTER a successful conversation start on THIS run's bundle — a 404 with no
      // prior 201 start (e.g. the start call itself failed, or was never sent) is a different,
      // upstream problem and must not be mislabelled as the RC-11 send-rail 404.
      const startPost201 = net.entries.some(
        (e) => e.url.endsWith('/api/conversations/start') && e.method === 'POST' && e.status === 201,
      );
      const chatsPostEntries = net.entries.filter((e) => e.url.endsWith('/api/chats') && e.method === 'POST');
      const chatsPost404AfterStart = startPost201 && chatsPostEntries.some((e) => e.status === 404);
      const isRc11Regression = chatsPost404AfterStart && sentInDb.length === 0;
      fileFinding({
        journey: 'D3',
        step: 'chat:first-message',
        class: sentInDb.length > 0 ? 'SPEC_DIVERGENCE' : isRc11Regression ? 'DEAD_TRIGGER' : 'SPEC_DIVERGENCE',
        severity: sentInDb.length > 0 ? 'P3' : isRc11Regression ? 'P1' : 'P3',
        known: null,
        title: `First message to Expert E ${sentInDb.length > 0 ? 'was recorded' : 'was NOT recorded'}${isRc11Regression ? ' (RC-11 REGRESSION — POST /api/chats 404 after a successful start)' : ''}`,
        expected: 'RC-11 is resolved on main — a successful POST /api/conversations/start 201 followed by POST /api/chats must succeed (201) and write user_and_expert_chats',
        actual:
          `user_and_expert_chats row found=${sentInDb.length > 0}. conversations/start 201 seen=${startPost201}. ` +
          `POST /api/chats statuses this run=${JSON.stringify(chatsPostEntries.map((e) => e.status))}` +
          (isRc11Regression ? ' — 404 occurred AFTER a successful start on this run\'s bundle.' : ''),
        where: 'server/services/messages.service.ts; the send rail POSTing to /api/chats',
        evidence: { shot: 'shots/D3-03-after-send.png', net: `net/D3-${RUN_ID}.jsonl` },
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

  // ── Expert E accepts the assignment (LD 12: a PENDING advisor may not write; the earlier pass
  // never drove this and filed the resulting missing-suggest-control as "UNPROVEN either way" —
  // lead review, P2-D3-4) ──
  await loginViaUi(page, expertE.email, E2E_PASSWORD);
  await page.goto('/expert/inbox?tab=assignments');
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  await shot(page, 'D3', '06b', 'expert-inbox-assignments');
  // The "Assigned Trips" tab (?tab=assignments) renders `AssignmentsSection`, whose accept
  // control is `button-accept-<tripId>` — a DIFFERENT testid from
  // `button-accept-assignment-<tripId>`, which belongs to `AssignmentInvitesSection` on the
  // default "queue" tab instead (both call the same POST /api/expert/assignments/:id/accept via
  // the same trip.assignment_id). Confirmed live: inbox.tsx AssignmentsSection ~1449.
  const acceptBtn = testid(page, `button-accept-${tripId}`);
  const acceptVisible = await appears(acceptBtn, 8000);
  if (acceptVisible) {
    await acceptBtn.click().catch(() => {});
    await page.waitForTimeout(1000);
  }
  await shot(page, 'D3', '06c', 'after-accept-assignment');
  const advisorRowAfterAccept = expertUser?.id
    ? await q(`SELECT status FROM trip_expert_advisors WHERE trip_id = $1 AND local_expert_id = $2`, [tripId, expertUser.id])
    : [];
  const advisorAccepted = ['accepted', 'assigned'].includes(advisorRowAfterAccept[0]?.status);
  fileFinding({
    journey: 'D3',
    step: 'assignment:accept',
    class: advisorAccepted ? 'SPEC_DIVERGENCE' : 'DEAD_TRIGGER',
    severity: advisorAccepted ? 'P3' : 'P1',
    known: null,
    title: `Expert E's assignment accept ${advisorAccepted ? 'DID' : 'did NOT'} move trip_expert_advisors.status past pending (now: ${advisorRowAfterAccept[0]?.status ?? 'row absent'})`,
    expected:
      'POST /api/expert/assignments/:id/accept, driven from button-accept-<tripId> on the ?tab=assignments ' +
      '(AssignmentsSection) tab — moves status to accepted/assigned, required before LD 12 (a PENDING advisor ' +
      'may not write) permits a suggestion. The queue tab has a sibling control, button-accept-assignment-<tripId> ' +
      '(AssignmentInvitesSection), same endpoint.',
    actual: `acceptVisible=${acceptVisible}, status=${advisorRowAfterAccept[0]?.status ?? 'row absent'}`,
    where: 'client/src/pages/expert/inbox.tsx (AssignmentsSection, ~1374-1449)',
    evidence: { shot: 'shots/D3-06c-after-accept-assignment.png' },
    behavioural: true,
  });
  if (!advisorAccepted) {
    net.flush();
    test.skip(true, 'Expert E could not accept the assignment — see finding above; skipping the suggestion leg');
    return;
  }

  // ── Expert E sends a suggestion from the workspace ──
  await loginViaUi(page, expertE.email, E2E_PASSWORD);
  await page.goto(`/expert/workspace/${tripId}`);
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  await shot(page, 'D3', '07', 'expert-workspace');

  // "Suggest to client" (`ClientSuggestPanel`, button-toggle-suggest) actually lives under the
  // right rail's "Distribute" tab (`rightTab === "distribute"`, workspace.tsx ~5141/5232) — a
  // prior pass's comment here claimed the "Advisor" tab (testid key "gaps") from a screenshot,
  // but reading the component tree directly shows `tab-right-gaps` only gates the AI-gaps content
  // (~4585) and `ClientSuggestPanel` mounts inside the DISTRIBUTE tab's block instead. Confirmed
  // by grep, not by a screenshot this time.
  const distributeTab = testid(page, 'tab-right-distribute');
  const distributeTabVisible = await distributeTab
    .waitFor({ state: 'visible', timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  if (distributeTabVisible) {
    await distributeTab.click().catch(() => {});
    await page.waitForTimeout(700);
  }
  await shot(page, 'D3', '07b', 'expert-workspace-distribute-tab');

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
      severity: 'P1',
      known: null,
      title: 'button-toggle-suggest not visible on the expert workspace, despite the advisor row having ALREADY moved past pending',
      expected:
        'ClientSuggestPanel (workspace.tsx ~2392) itself gates on nothing — it always renders ' +
        'button-toggle-suggest once mounted, and the row is now in a §12 WRITE-access status ' +
        '(accepted/assigned) — the expert accepted the assignment via button-accept-<tripId> ' +
        '(expert/inbox.tsx) immediately before this step, so this is a real DEAD_TRIGGER, not the LD 12 ' +
        'gating the earlier pass could not rule out.',
      actual: `Not visible after an 8s poll (appears()); trip_expert_advisors.status='${advisorRowAfterAccept[0]?.status}' at this point (accepted before this step)`,
      where: 'client/src/pages/expert/workspace.tsx (ClientSuggestPanel, ~2392/5237)',
      evidence: { shot: 'shots/D3-07b-expert-workspace-distribute-tab.png' },
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
