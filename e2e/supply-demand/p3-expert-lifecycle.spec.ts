/**
 * p3-expert-lifecycle.spec.ts — Pass 3 batch 1, deliverable 1: the whole expert lifecycle through
 * the real UI on BOTH sides, with DB state asserted at every step.
 *
 *   hire (traveler: slip → HireExpertDialog → POST /api/trips/:tripId/advisors)
 *   → accept (expert: inbox → POST /api/expert/assignments/:id/accept; pending → accepted)
 *   → 2 suggestions (expert: workspace → POST /api/trips/:id/suggestions)
 *   → traveler REJECTS one, APPROVES one (the approved one lands as an origin='expert' item)
 *   → expert delivers (workspace_status draft → in_review → delivered)
 *   → traveler "Request changes" (note stored, workspace_status → draft)
 *   → expert re-delivers → traveler Approve → owner finalizes (trips.finalized_at, trip_finals v1)
 *   → what the expert UI shows afterwards.
 *
 * It also proves or disproves the inventory's static gaps (a)–(e) — see the brief; each is filed
 * only when observed, otherwise NOT_PROVEN with its reason.
 *
 * A fresh traveler (`e2e-<run>-tlife`) and a fresh Kyoto plan are used, so this journey never
 * touches D3's plan. Expert E (S2) is the advisor — he is the expert S2 made visible in Kyoto.
 */
import { test, expect, type Page } from '@playwright/test';
import { E2E_PASSWORD, RUN_ID, e2eEmail } from './lib/run-id';
import { loginViaUi, signupViaUi } from './lib/accounts';
import { fillPlanModalToFinish, clickPlanFinish, openPlanModalFromHero } from './lib/flows';
import { q, userByEmail, closeDb } from './lib/db';
import { readState, writeState } from './lib/state';
import { testid, appears } from './lib/ui';
import { shot3, netLogger3, dbStep, file3 } from './lib/p3';

test.describe.configure({ mode: 'serial' });
test.setTimeout(900_000);

const J = 'L1';

async function settle(page: Page, ms = 800) {
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(ms);
}

/** Wait for a control; on failure take a screenshot and throw — a harness stop, not a finding. */
async function must(page: Page, id: string, nn: string, timeoutMs = 10_000) {
  const loc = testid(page, id);
  if (!(await appears(loc, timeoutMs))) {
    await shot3(page, J, nn, `MISSING-${id.slice(0, 60)}`);
    throw new Error(`${J} step ${nn}: [data-testid="${id}"] did not appear within ${timeoutMs}ms`);
  }
  return loc;
}

async function openDistribute(page: Page, tripId: string) {
  await page.goto(`/expert/workspace/${tripId}`);
  await settle(page, 1200);
  const tab = testid(page, 'tab-right-distribute');
  if (await appears(tab, 10_000)) {
    await tab.click();
    await page.waitForTimeout(700);
  }
}

test('L1: expert lifecycle — hire → accept → suggest ×2 → reject/approve → deliver → request changes → re-deliver → approve → finalize', async ({ page }) => {
  const state = readState();
  const expertE = state.accounts.expertE;
  if (!expertE?.email || !expertE?.handle) {
    test.skip(true, 'S2 did not persist Expert E in harness state (run the supply project first)');
    return;
  }
  const expertUser = await userByEmail(expertE.email);
  expect(expertUser?.id, 'Expert E users row').toBeTruthy();
  const expertId: string = expertUser.id;
  const net = netLogger3(page, J);
  const startedAt = (await q(`SELECT NOW() AS now`))[0].now;

  // ── 0. Traveler signs up and mints a Kyoto plan ("Build it myself") ──
  const travelerEmail = e2eEmail('tlife');
  await signupViaUi(page, { email: travelerEmail, firstName: 'E2E', lastName: 'TLife' });
  const traveler = await userByEmail(travelerEmail);
  expect(traveler?.id, 'traveler users row').toBeTruthy();
  writeState((s) => {
    s.accounts.tlife = { email: travelerEmail, userId: traveler.id };
  });
  await page.goto('/');
  await settle(page);
  expect(await openPlanModalFromHero(page), 'plan modal opens').toBeTruthy();
  expect(await fillPlanModalToFinish(page, 'Kyoto, Japan', { offsetDays: 60 }), 'plan modal reaches finish').toBeTruthy();
  const tripId = await clickPlanFinish(page, 'myself');
  expect(tripId, 'Build it myself mints a plan').toBeTruthy();
  writeState((s) => {
    s.trips.lifecycle = { id: tripId!, label: 'P3 L1 lifecycle plan' };
  });
  await shot3(page, J, '00', 'traveler-slip-new-plan');

  const advisorSql = `SELECT id, status, workspace_status, plan_approval_status, plan_review_note, plan_approved_at
                        FROM trip_expert_advisors WHERE trip_id = $1 AND local_expert_id = $2`;

  // ── 1. HIRE (traveler, slip → HireExpertDialog) ──
  const d1 = await dbStep(J, '01', 'hire: trip_expert_advisors row', advisorSql, [tripId, expertId]);
  await page.goto(`/plans/${tripId}`);
  await settle(page);
  await (await must(page, 'slip-action-hire-expert', '01')).click();
  await page.waitForTimeout(800);
  const option = await must(page, `hire-expert-option-${expertId}`, '01b', 12_000);
  await option.click();
  await shot3(page, J, '01', 'hire-dialog-expert-picked');
  await (await must(page, 'button-hire-expert-submit', '01c')).click();
  await settle(page, 1500);
  await shot3(page, J, '02', 'traveler-slip-after-hire');
  const a1 = await d1.after();
  expect(a1.length, 'advisor row born by hire').toBe(1);
  expect(a1[0].status).toBe('pending');
  const assignmentId: string = a1[0].id;
  const hirePost = net.find(`/api/trips/${tripId}/advisors`, 'POST');
  expect(hirePost.some((e) => e.status < 300), 'POST /api/trips/:tripId/advisors 2xx').toBeTruthy();

  // ── 2. ACCEPT (expert, inbox queue) + gap (a): is there any decline control? ──
  await loginViaUi(page, expertE.email, E2E_PASSWORD);
  await page.goto('/expert/inbox');
  await settle(page, 1200);
  const inviteCard = await must(page, `inbox-assignment-${tripId}`, '03', 12_000);
  await shot3(page, J, '03', 'expert-inbox-invite');
  const cardText = (await inviteCard.innerText()).replace(/\s+/g, ' ');
  const cardButtons = await inviteCard.locator('button, a[role="button"]').allInnerTexts();
  const declineControls = cardButtons.filter((t) => /decline|reject|pass|not interested|refuse/i.test(t));
  // Also the Assigned Trips tab's card, the other place a pending assignment renders.
  await page.goto('/expert/inbox?tab=assignments');
  await settle(page, 1000);
  const assignedCard = testid(page, `assigned-trip-card-${tripId}`);
  const assignedButtons = (await appears(assignedCard, 8000)) ? await assignedCard.locator('button').allInnerTexts() : [];
  const declineControls2 = assignedButtons.filter((t) => /decline|reject|pass|not interested|refuse/i.test(t));
  await shot3(page, J, '03b', 'expert-assigned-trips-tab-pending');
  file3({
    id: 'P3-L1-NO-DECLINE',
    journey: J,
    step: 'accept:(a) decline path',
    class: 'DEAD_TRIGGER',
    severity: declineControls.length + declineControls2.length === 0 ? 'P2' : 'PASS',
    known: null,
    title:
      declineControls.length + declineControls2.length === 0
        ? 'An expert cannot decline a hire: the pending assignment offers Accept only, and trip_expert_advisors.status=\'rejected\' is unreachable'
        : 'A decline control exists on the pending assignment',
    expected:
      "server/utils/trip-advisor-status.ts:43 — \"`rejected` is reachable only by the expert's decline\"; so a pending " +
      'invitation should offer the expert a decline next to Accept.',
    actual:
      `Queue card buttons=${JSON.stringify(cardButtons)}; Assigned-Trips card buttons=${JSON.stringify(assignedButtons)}. ` +
      'No route under server/ writes trip_expert_advisors.status=\'rejected\' (grep: only POST …/accept exists, booking-actions.ts:1329). ' +
      'The invitation stays pending forever unless accepted; the traveler\'s slip keeps showing the expert as invited.',
    where: 'client/src/pages/expert/inbox.tsx (AssignmentInvitesSection ~345-400, AssignmentsSection ~1374-1470); server/routes/booking-actions.ts:1329',
    evidence: { shot: 'pass3/shots/L1-03-expert-inbox-invite.png', net: net.ref },
    behavioural: true,
  });

  const d2 = await dbStep(J, '04', 'accept: advisor status', advisorSql, [tripId, expertId]);
  await page.goto('/expert/inbox');
  await settle(page, 1000);
  await (await must(page, `button-accept-assignment-${tripId}`, '04')).click();
  await settle(page, 1200);
  await shot3(page, J, '04', 'expert-after-accept');
  const a2 = await d2.after();
  expect(a2[0].status, 'accept flips pending → accepted').toBe('accepted');
  expect(a2[0].workspace_status ?? 'draft').toBe('draft');
  expect(net.find(`/api/expert/assignments/${assignmentId}/accept`, 'POST').some((e) => e.status < 300)).toBeTruthy();

  // ── 3. TWO SUGGESTIONS (expert workspace → Distribute → Suggest to client) ──
  const suggSql = `SELECT id, title, status, rejection_note, reviewed_at FROM trip_suggestions WHERE trip_id = $1 ORDER BY created_at`;
  const d3 = await dbStep(J, '05', 'suggest ×2: trip_suggestions', suggSql, [tripId]);
  await openDistribute(page, tripId!);
  await (await must(page, 'button-toggle-suggest', '05', 12_000)).click();
  await page.waitForTimeout(500);
  const titles = [`Keep: Nishiki Market at opening [e2e:${RUN_ID}]`, `Drop: Fushimi Inari at noon [e2e:${RUN_ID}]`];
  for (let i = 0; i < titles.length; i++) {
    const t = titles[i];
    await (await must(page, 'input-suggestion-title', `05-${i}`)).fill(t);
    await testid(page, 'input-suggestion-description').fill(`P3 L1 suggestion ${i + 1}.`).catch(() => {});
    await (await must(page, 'button-submit-suggestion', `05-${i}b`)).click();
    await page.waitForTimeout(1500);
  }
  await shot3(page, J, '05', 'expert-two-suggestions-sent');
  const a3 = await d3.after();
  expect(a3.length, 'two trip_suggestions rows').toBe(2);
  expect(a3.every((r) => r.status === 'pending')).toBeTruthy();
  const keep = a3.find((r) => r.title.startsWith('Keep'))!;
  const drop = a3.find((r) => r.title.startsWith('Drop'))!;

  // Notifications the expert holds BEFORE the traveler decides — for gap (b).
  const expertNotifSql = `SELECT type, title, message, created_at FROM notifications WHERE user_id = $1 AND created_at >= $2 ORDER BY created_at`;
  const expertNotifsBeforeReview = await q(expertNotifSql, [expertId, startedAt]);

  // ── 4. TRAVELER REJECTS one, APPROVES the other (slip) ──
  const itemsSql = `SELECT id, title, origin, item_type FROM itinerary_items WHERE trip_id = $1 ORDER BY created_at`;
  const d4 = await dbStep(J, '06', 'reject + approve: suggestions', suggSql, [tripId]);
  const d4i = await dbStep(J, '06i', 'approve: itinerary_items', itemsSql, [tripId]);
  await loginViaUi(page, travelerEmail, E2E_PASSWORD);
  await page.goto(`/plans/${tripId}`);
  await settle(page, 1200);
  await shot3(page, J, '06', 'traveler-slip-two-suggestions');
  await (await must(page, `button-reject-suggestion-${drop.id}`, '06a', 12_000)).click();
  await (await must(page, 'input-rejection-note', '06b')).fill('Too crowded at noon — e2e P3 rejection note.');
  await (await must(page, 'button-confirm-reject', '06c')).click();
  await settle(page, 1200);
  await (await must(page, `button-approve-suggestion-${keep.id}`, '06d')).click();
  await settle(page, 1500);
  await page.reload();
  await settle(page, 1200);
  await shot3(page, J, '07', 'traveler-slip-after-reject-approve');
  const a4 = await d4.after();
  const keepAfter = a4.find((r) => r.id === keep.id);
  const dropAfter = a4.find((r) => r.id === drop.id);
  expect(dropAfter.status).toBe('rejected');
  expect(dropAfter.rejection_note).toContain('Too crowded');
  expect(keepAfter.status).toBe('approved');
  const a4i = await d4i.after();
  const expertItem = a4i.find((r) => r.title === keep.title);
  expect(expertItem, 'approved suggestion materialized as an itinerary_items row').toBeTruthy();
  expect(expertItem.origin, "approved suggestion item is stamped origin='expert'").toBe('expert');
  expect(a4i.some((r) => r.title === drop.title), 'rejected suggestion never becomes an item').toBeFalsy();
  const originBadge = testid(page, `badge-origin-${expertItem.id}`);
  const badgeText = (await appears(originBadge, 8000)) ? (await originBadge.innerText()).trim() : null;
  file3({
    id: 'P3-L1-ORIGIN-CHIP',
    journey: J,
    step: 'approve: item origin chip',
    class: 'INVISIBLE_RESULT',
    severity: (badgeText ?? '').toLowerCase() === 'from your expert' ? 'PASS' : 'P2',
    known: null,
    title: `Approved suggestion's item carries the "from your expert" chip on the slip (read: ${JSON.stringify(badgeText)})`,
    expected: 'LD 42 D23: badge-origin-<itemId> reads "from your expert" for origin=\'expert\'',
    actual: `itinerary_items.origin=${expertItem.origin}; chip text=${JSON.stringify(badgeText)}`,
    where: 'client/src/components/plancard/ActivitiesSection.tsx OriginBadge; server/routes/booking-actions.ts:1245',
    evidence: { shot: 'pass3/shots/L1-07-traveler-slip-after-reject-approve.png', db: d4i.ref },
    behavioural: true,
  });

  // gap (b): did the expert receive ANY notification of either decision?
  const expertNotifsAfterReview = await q(expertNotifSql, [expertId, startedAt]);
  const newForExpert = expertNotifsAfterReview.slice(expertNotifsBeforeReview.length);
  file3({
    id: 'P3-L1-NO-SUGGESTION-VERDICT-NOTICE',
    journey: J,
    step: 'reject/approve:(b) expert notification',
    class: 'INVISIBLE_RESULT',
    severity: newForExpert.length === 0 ? 'P2' : 'PASS',
    known: null,
    title:
      newForExpert.length === 0
        ? 'The expert is not notified when the traveler approves or declines a suggestion (0 notifications rows written for either decision)'
        : `The expert received ${newForExpert.length} notification(s) for the suggestion decisions`,
    expected:
      'Symmetry with the rest of the loop: suggestion CREATE notifies the traveler (booking-actions.ts:1113-1123) and ' +
      'plan-review notifies the expert (booking-actions.ts:1544-1557); a decision on the expert\'s suggestion should reach the expert too.',
    actual:
      `notifications for the expert between the two reads: ${JSON.stringify(newForExpert)}. PATCH /api/trips/:id/suggestions/:suggestionId ` +
      '(booking-actions.ts:1171-1270) writes no notification on either branch; the only trace is the workspace suggestion log, ' +
      'which the expert sees only by opening the Suggest panel on that trip.',
    where: 'server/routes/booking-actions.ts:1171-1270',
    evidence: { db: 'pass3/db/L1-06.txt', net: net.ref },
    behavioural: true,
  });

  // What the expert's workspace shows for the two decisions (the one surface that carries them).
  await loginViaUi(page, expertE.email, E2E_PASSWORD);
  await openDistribute(page, tripId!);
  await (await must(page, 'button-toggle-suggest', '08')).click();
  await page.waitForTimeout(1200);
  await shot3(page, J, '08', 'expert-suggestion-log-after-decisions');
  const keepLog = testid(page, `expert-suggestion-log-${keep.id}`);
  const dropLog = testid(page, `expert-suggestion-log-${drop.id}`);
  const keepLogText = (await appears(keepLog, 8000)) ? (await keepLog.innerText()).replace(/\s+/g, ' ') : null;
  const dropLogText = (await appears(dropLog, 4000)) ? (await dropLog.innerText()).replace(/\s+/g, ' ') : null;
  expect(dropLogText ?? '', 'expert sees the rejection note in the suggestion log').toContain('Too crowded');

  // ── 5. DELIVER (expert: draft → in_review → delivered via button-send-edits) ──
  const d5 = await dbStep(J, '09', 'deliver: workspace_status draft→in_review→delivered', advisorSql, [tripId, expertId]);
  const sendEdits = await must(page, 'button-send-edits', '09');
  const sendLabel1 = (await sendEdits.innerText()).trim();
  await sendEdits.click();
  await settle(page, 1500);
  const mid = (await q(advisorSql, [tripId, expertId]))[0];
  expect(mid.workspace_status).toBe('in_review');
  const sendEdits2 = await must(page, 'button-send-edits', '09b');
  const sendLabel2 = (await sendEdits2.innerText()).trim();
  await sendEdits2.click();
  await settle(page, 1500);
  await shot3(page, J, '09', 'expert-after-deliver');
  const a5 = await d5.after();
  expect(a5[0].workspace_status).toBe('delivered');

  // ── 6. TRAVELER REQUESTS CHANGES (banner on the slip) ──
  const d6 = await dbStep(J, '10', 'request changes: advisor row', advisorSql, [tripId, expertId]);
  await loginViaUi(page, travelerEmail, E2E_PASSWORD);
  await page.goto(`/plans/${tripId}`);
  await settle(page, 1200);
  await must(page, `banner-plan-review-${tripId}`, '10', 12_000);
  await shot3(page, J, '10', 'traveler-review-banner');
  await (await must(page, `button-request-changes-${tripId}`, '10a')).click();
  const note = `Swap day 2 dinner for somewhere near the hotel — e2e ${RUN_ID}`;
  await (await must(page, `textarea-request-changes-note-${tripId}`, '10b')).fill(note);
  await (await must(page, `button-submit-request-changes-${tripId}`, '10c')).click();
  await settle(page, 1500);
  await shot3(page, J, '11', 'traveler-after-request-changes');
  const a6 = await d6.after();
  expect(a6[0].workspace_status, 'request_changes sends the plan back to draft').toBe('draft');
  expect(a6[0].plan_approval_status).toBe('changes_requested');
  expect(a6[0].plan_review_note).toBe(note);

  // ── 7. EXPERT sees the note, RE-DELIVERS ──
  await loginViaUi(page, expertE.email, E2E_PASSWORD);
  await openDistribute(page, tripId!);
  const noteEl = testid(page, 'text-plan-changes-requested-note');
  const noteShown = (await appears(noteEl, 8000)) ? (await noteEl.innerText()).includes('Swap day 2') : false;
  await shot3(page, J, '12', 'expert-sees-changes-requested');
  expect(noteShown, 'expert workspace shows the traveler\'s change note').toBeTruthy();
  const d7 = await dbStep(J, '13', 're-deliver: advisor row', advisorSql, [tripId, expertId]);
  for (let i = 0; i < 2; i++) {
    const b = testid(page, 'button-send-edits');
    if (!(await appears(b, 6000))) break;
    await b.click();
    await settle(page, 1500);
  }
  await shot3(page, J, '13', 'expert-after-redeliver');
  const a7 = await d7.after();
  expect(a7[0].workspace_status, 're-delivery reaches delivered again').toBe('delivered');
  const noteStillShownToExpert = await appears(testid(page, 'text-plan-changes-requested-note'), 3000);

  // ── 8. TRAVELER APPROVES the re-delivered plan ──
  const d8 = await dbStep(J, '14', 'approve re-delivered plan: advisor row', advisorSql, [tripId, expertId]);
  await loginViaUi(page, travelerEmail, E2E_PASSWORD);
  await page.goto(`/plans/${tripId}`);
  await settle(page, 1500);
  const bannerAgain = await appears(testid(page, `banner-plan-review-${tripId}`), 10_000);
  const approveBtn = testid(page, `button-approve-plan-${tripId}`);
  const approveVisible = bannerAgain && (await appears(approveBtn, 3000));
  await shot3(page, J, '14', 'traveler-slip-after-redelivery');
  const planApprovalDto = await page.evaluate(async (id) => {
    const r = await fetch(`/api/trips/${id}/plancard`, { credentials: 'include' });
    const j = await r.json().catch(() => null);
    return j?.meta?.planApproval ?? null;
  }, tripId);
  file3({
    id: 'P3-L1-REDELIVERY-UNAPPROVABLE',
    journey: J,
    step: 're-deliver → approve',
    class: 'DEAD_TRIGGER',
    severity: approveVisible ? 'PASS' : 'P1',
    known: null,
    title: approveVisible
      ? 'Re-delivered plan shows the review banner again; traveler can approve'
      : 'After "Request changes", a RE-DELIVERED plan can never be approved: the review banner does not come back',
    expected:
      'booking-actions.ts:1503 — request_changes "send[s] the expert back to work; re-delivery re-runs this handshake": the ' +
      'traveler is offered Approve / Request changes again once the expert re-delivers.',
    actual:
      `trip_expert_advisors after re-delivery: ${JSON.stringify(a7[0])}; plancard meta.planApproval=${JSON.stringify(planApprovalDto)}; ` +
      `banner-plan-review visible=${bannerAgain}, button-approve-plan visible=${approveVisible}. ` +
      `The expert's workspace still shows the OLD "Client requested changes" note after re-delivering: ${noteStillShownToExpert}. ` +
      'PlanApprovalBanner.tsx:146 returns null whenever planApproval.status != null, and the workspace-status advance ' +
      '(booking-actions.ts:1347-1450, storage.updateExpertAssignmentWorkspaceStatus) never clears plan_approval_status=' +
      "'changes_requested' — so the second delivery is invisible to the traveler as a decision, the plan can never reach " +
      "'approved', and \"Approve & book N items\" (LD 52 A) is unreachable for this plan. The server rail itself would accept " +
      'a POST /api/trips/:id/plan-review approve (static reading: it keys on workspace_status=\'delivered\' only, booking-actions.ts:1487-1491) — the refusal is purely the client banner\'s null-status gate.',
    where:
      'client/src/components/plancard/PlanApprovalBanner.tsx:146; server/routes/booking-actions.ts:1347-1450 (advance leaves plan_approval_status); server/services/trip-plan.service.ts:433-452',
    evidence: { shot: 'pass3/shots/L1-14-traveler-slip-after-redelivery.png', db: d7.ref, net: net.ref },
    behavioural: true,
  });

  let approvedViaUi = false;
  if (approveVisible) {
    await approveBtn.click();
    await settle(page, 1500);
    approvedViaUi = true;
  } else {
    // The lifecycle cannot finish through the UI. Record exactly that, and continue to finalize
    // with the plan UNAPPROVED — nothing is written on the traveler's behalf (no API shortcut).
    file3({
      id: 'P3-L1-APPROVE-NOT-DRIVEN',
      journey: J,
      step: 'approve (second delivery)',
      class: 'SPEC_DIVERGENCE',
      severity: 'NOT_PROVEN',
      known: null,
      title: 'Approve-after-re-delivery could not be driven through the UI (see P3-L1-REDELIVERY-UNAPPROVABLE); finalize ran on an unapproved plan',
      expected: 'n/a — harness note',
      actual: 'No POST /api/trips/:id/plan-review was sent by the harness; plan_approval_status stays changes_requested.',
      where: 'e2e/supply-demand/p3-expert-lifecycle.spec.ts',
      evidence: {},
      behavioural: true,
    });
  }
  await shot3(page, J, '15', 'traveler-after-approve-attempt');
  const a8 = await d8.after();
  if (approvedViaUi) expect(a8[0].plan_approval_status).toBe('approved');

  // ── 9. OWNER FINALIZES ──
  const finSql = `SELECT t.finalized_at, (SELECT max(version) FROM trip_finals f WHERE f.trip_id = t.id) AS final_version
                    FROM trips t WHERE t.id = $1`;
  const d9 = await dbStep(J, '16', 'finalize: trips.finalized_at + trip_finals', finSql, [tripId]);
  await page.goto(`/plans/${tripId}`);
  await settle(page, 1200);
  await (await must(page, 'slip-action-finalize-plan', '16', 12_000)).click();
  await settle(page, 2000);
  await shot3(page, J, '16', 'traveler-after-finalize');
  // FinalizeBookingModal opens on top; close it so the next screenshot is the slip itself.
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(500);
  const a9 = await d9.after();
  expect(a9[0].finalized_at, 'trips.finalized_at set by finalize').toBeTruthy();
  expect(Number(a9[0].final_version)).toBeGreaterThanOrEqual(1);
  await page.goto(`/trip/${tripId}`);
  await settle(page, 1500);
  await shot3(page, J, '17', 'traveler-trip-card');

  // ── 10. WHAT THE EXPERT SEES AFTER FINALIZE — gap (d) ──
  await loginViaUi(page, expertE.email, E2E_PASSWORD);
  await openDistribute(page, tripId!);
  await shot3(page, J, '18', 'expert-workspace-after-finalize');
  const wsText = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ');
  await page.goto('/expert/inbox?tab=assignments');
  await settle(page, 1200);
  await shot3(page, J, '19', 'expert-assigned-trips-after-finalize');
  const cardAfter = testid(page, `assigned-trip-card-${tripId}`);
  const cardAfterText = (await appears(cardAfter, 8000)) ? (await cardAfter.innerText()).replace(/\s+/g, ' ') : '(card absent)';
  await page.goto('/notifications');
  await settle(page, 1200);
  await shot3(page, J, '20', 'expert-notifications-after-finalize');
  const expertNotifsFinal = await q(expertNotifSql, [expertId, startedAt]);
  const finalWord = /finali[sz]ed|trip card|final plan|v1\b|version 1/i;
  const expertSeesFinal = finalWord.test(wsText) || finalWord.test(cardAfterText) || expertNotifsFinal.some((n) => finalWord.test(`${n.title} ${n.message}`));
  file3({
    id: 'P3-L1-EXPERT-BLIND-TO-FINALIZE',
    journey: J,
    step: 'finalize:(d) expert view',
    class: 'INVISIBLE_RESULT',
    severity: expertSeesFinal ? 'PASS' : 'P2',
    known: null,
    title: expertSeesFinal
      ? 'The expert UI reflects that the traveler finalized the plan'
      : 'The expert is never told the traveler finalized: no notification, and neither the workspace nor the Assigned Trips card changes',
    expected: 'The advisor on a plan learns the plan was finalized (Trip Card v1 exists) — a notification, a workspace state, or a card badge.',
    actual:
      `trips.finalized_at=${a9[0].finalized_at}, trip_finals v${a9[0].final_version}. Expert notifications this journey: ` +
      `${JSON.stringify(expertNotifsFinal.map((n) => n.title))}. Assigned Trips card text: "${cardAfterText.slice(0, 300)}". ` +
      `Workspace mentions finalization: ${finalWord.test(wsText)}. POST /api/trips/:tripId/finalize notifies only trips.user_id ` +
      '(routing.routes.ts:343-370, type trip_card_ready); nothing reads trips.finalized_at on an expert surface.',
    where: 'server/routes/routing.routes.ts:301-392; client/src/pages/expert/workspace.tsx; client/src/pages/expert/inbox.tsx',
    evidence: { shot: 'pass3/shots/L1-18-expert-workspace-after-finalize.png', db: d9.ref },
    behavioural: true,
  });

  // ── gap (c): notification TYPES across the whole lifecycle ──
  const allNotifs = await q(
    `SELECT user_id = $1 AS to_expert, type, title FROM notifications WHERE user_id IN ($1, $2) AND created_at >= $3 ORDER BY created_at`,
    [expertId, traveler.id, startedAt],
  );
  const lifecycleNotifs = allNotifs.filter((n) => n.type !== 'welcome');
  const types = Array.from(new Set(lifecycleNotifs.map((n) => n.type)));
  const itinUpdate = lifecycleNotifs.filter((n) => n.type === 'itinerary_update');
  file3({
    id: 'P3-L1-ONE-NOTIFICATION-TYPE',
    journey: J,
    step: 'all:(c) notification types',
    class: 'SPEC_DIVERGENCE',
    severity: itinUpdate.length >= 4 && new Set(itinUpdate.map((n) => n.title)).size >= 4 ? 'P3' : 'PASS',
    known: null,
    title: `Lifecycle notifications: ${itinUpdate.length} of ${lifecycleNotifs.length} are type 'itinerary_update' across ${new Set(itinUpdate.map((n) => n.title)).size} distinct events (types seen: ${types.join(', ')})`,
    expected:
      'Distinct lifecycle events (new suggestion, sent for review, delivered, changes requested, plan approved) carry distinct ' +
      'notification types, so preference keys and push routing (LD 53: ONE type→key table, shared/push-notifications.ts) can tell them apart.',
    actual: JSON.stringify(lifecycleNotifs),
    where: 'server/routes/booking-actions.ts:1113, 1392, 1544 (all type: "itinerary_update")',
    evidence: { db: 'pass3/db/L1-*.txt' },
    behavioural: true,
  });

  writeState((s) => {
    s.p3 = {
      ...(s.p3 ?? {}),
      lifecycle: {
        tripId,
        assignmentId,
        suggestions: { kept: keep.id, dropped: drop.id },
        expertItemId: expertItem.id,
        sendLabels: [sendLabel1, sendLabel2],
        keepLogText,
        dropLogText,
        noteStillShownToExpertAfterRedeliver: noteStillShownToExpert,
        approvedViaUi,
        final: a9[0],
      },
    };
  });
});

test.afterAll(async () => {
  await closeDb();
});
