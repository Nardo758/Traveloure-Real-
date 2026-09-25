/**
 * d6b-join-link.spec.ts — decision-maker request, added after the main Pass-2 run.
 *
 * Provider A creates a `video-call` listing with a join link (real UI, admin-approved). A
 * confirmed `service_bookings` row is SEEDED for T-auth on it (Stripe checkout is HELD, and
 * `stripe_payment_intent_id` is deliberately left NULL per §19a — never a fabricated
 * PaymentIntent id). T-auth's /my-bookings must reveal the join link; a different traveler and a
 * `pending`-status version of the same row must not.
 *
 * Run standalone against the left-running final state:
 *   npx playwright test -c playwright.supply-demand.config.ts --grep "D6b"
 */
import { test, expect } from '@playwright/test';
import { E2E_PASSWORD, e2eEmail, e2eTitle } from './lib/run-id';
import { loginViaUi, signupViaUi } from './lib/accounts';
import {
  createListingBasics,
  saveDraft,
  seedMeetingPin,
  enterWizardFromListingHome,
  walkServiceFormToReview,
  submitListingForReview,
  adminApproveService,
} from './lib/flows';
import { shot, netLogger } from './lib/evidence';
import { fileFinding } from './lib/findings';
import { q, feeBand, userByEmail } from './lib/db';
import { readState, writeState } from './lib/state';
import { testid, appears } from './lib/ui';

const ADMIN = { email: 'ci-admin@traveloure.test', password: 'CITestAdmin!99' };

test.describe.configure({ mode: 'serial' });

test('D6b: a confirmed video-call booking reveals its join link only where it should', async ({ page }) => {
  const state = readState();
  const providerA = state.accounts.providerA;
  const providerAListing = state.listings.providerA;
  const tauth = state.accounts.tauth;
  if (!providerA?.email || !providerAListing?.categoryKey || !tauth?.email) {
    fileFinding({
      journey: 'D6b',
      step: 'precondition',
      class: 'SPEC_DIVERGENCE',
      severity: 'P1',
      known: null,
      title: 'Missing Provider A account/listing or T-auth in harness state — S1 and D1 must have run first',
      expected: 'state.accounts.providerA, state.listings.providerA and state.accounts.tauth are all populated',
      actual: `providerA=${!!providerA?.email}, listing=${!!providerAListing}, tauth=${!!tauth?.email}`,
      where: 'e2e/supply-demand/d6b-join-link.spec.ts',
      evidence: {},
      behavioural: true,
    });
    test.skip(true, 'missing precondition state');
    return;
  }

  const net = netLogger(page, 'D6b');
  const joinTitle = e2eTitle('Kyoto Video Consultation');
  const joinLinkUrl = `https://meet.example.test/e2e-${state.runId}`;

  // ── 1. Provider A creates a video-call listing with a join link, submits, admin approves ──
  await loginViaUi(page, providerA.email, E2E_PASSWORD);
  await createListingBasics(page, {
    role: 'provider',
    title: joinTitle,
    offeringTypeKey: 'tea_ceremony_host',
    deliveryMethod: 'video-call',
    priceCents: 8000,
    description: `Video consultation — e2e supply-demand D6b fixture (run ${state.runId}).`,
  });
  await shot(page, 'D6b', '01', 'listing-basics-filled');

  const drafted = await saveDraft(page);
  const draftRow = await q(
    `SELECT id FROM provider_services WHERE service_name = $1 ORDER BY created_at DESC LIMIT 1`,
    [joinTitle],
  );
  if (!drafted || draftRow.length === 0) {
    fileFinding({
      journey: 'D6b',
      step: 'listing:save-draft',
      class: 'DEAD_TRIGGER',
      severity: 'P1',
      known: null,
      title: `button-save-draft did not mint a provider_services row for "${joinTitle}"`,
      expected: 'Save draft creates a provider_services row for the video-call listing',
      actual: `drafted=${drafted}, row found=${draftRow.length > 0}`,
      where: 'client/src/components/ServiceForm.tsx',
      evidence: { shot: 'shots/D6b-01-listing-basics-filled.png' },
      behavioural: true,
    });
    net.flush();
    throw new Error('D6b: draft save did not create a row — see finding above');
  }
  const serviceId = draftRow[0].id;
  // No physical meeting point applies to a remote session — seedMeetingPin is a place-anchored
  // fallback and is deliberately NOT called here.

  await page.goto(`/provider/services/${serviceId}/edit`);
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  const entered = await enterWizardFromListingHome(page);
  if (!entered) {
    fileFinding({
      journey: 'D6b',
      step: 'listing:enter-wizard',
      class: 'DEAD_TRIGGER',
      severity: 'P2',
      known: null,
      title: 'Could not re-enter the wizard from listing-home for the video-call listing',
      expected: 'checklist-row-description140 (or any step-target row) is clickable',
      actual: 'No matching row found',
      where: 'client/src/components/ServiceForm.tsx',
      evidence: {},
      behavioural: true,
    });
    net.flush();
    throw new Error('D6b: could not re-enter the wizard');
  }

  // Walk to wherever the join-link field lands (the "session" step for a video-call flow); fill
  // it as soon as it appears, then continue to Review.
  let joinLinkFilled = false;
  for (let i = 0; i < 6; i++) {
    if (await appears(testid(page, 'card-review-summary'), 1500)) break;
    const joinInput = testid(page, 'input-join-link');
    if (await appears(joinInput, 1500)) {
      await joinInput.fill(joinLinkUrl).catch(() => {});
      joinLinkFilled = true;
      await shot(page, 'D6b', '02', 'join-link-filled');
    }
    const next = testid(page, 'button-step-next');
    if (!(await appears(next, 1500)) || (await next.isDisabled().catch(() => false))) break;
    await next.click().catch(() => {});
    await page.waitForTimeout(400);
  }
  if (!joinLinkFilled) {
    fileFinding({
      journey: 'D6b',
      step: 'listing:join-link-field',
      class: 'DEAD_TRIGGER',
      severity: 'P1',
      known: null,
      title: 'input-join-link was never found while walking the video-call wizard',
      expected: 'section-join-link/input-join-link renders on the session step for a video-call listing (isRemoteSessionListing)',
      actual: 'Not found across 6 step-advances',
      where: 'client/src/components/ServiceForm.tsx (~4558, isRemoteSessionListing gate)',
      evidence: { shot: 'shots/D6b-01-listing-basics-filled.png' },
      behavioural: true,
    });
  }

  // Fill any generic required category fields, tick attestations, then submit.
  await walkServiceFormToReview(page, 4);
  const outcome = await submitListingForReview(page);
  await shot(page, 'D6b', '03', 'after-submit');
  if (!outcome.submitted) {
    fileFinding({
      journey: 'D6b',
      step: 'listing:submit',
      class: 'DEAD_TRIGGER',
      severity: 'P1',
      known: null,
      title: `Could not submit the video-call listing "${joinTitle}"`,
      expected: 'button-publish-service is reachable and enabled (Provider A is already identity/business/category-verified from S1)',
      actual: `submitted=${outcome.submitted}, blockedByVerification=${outcome.blockedByVerification}, reason=${outcome.reason}`,
      where: 'client/src/components/ServiceForm.tsx',
      evidence: { shot: 'shots/D6b-03-after-submit.png' },
      behavioural: true,
    });
    net.flush();
    throw new Error('D6b: could not submit the video-call listing — see finding above');
  }

  await loginViaUi(page, ADMIN.email, ADMIN.password);
  const approved = await adminApproveService(page, joinTitle);
  await shot(page, 'D6b', '04', 'admin-approve');
  const finalRow = await q(
    `SELECT id, status, approval_status, join_link, price, category_id FROM provider_services WHERE id = $1`,
    [serviceId],
  );
  if (!approved || finalRow[0]?.approval_status !== 'approved') {
    fileFinding({
      journey: 'D6b',
      step: 'listing:admin-approve',
      class: 'DEAD_TRIGGER',
      severity: 'P1',
      known: null,
      title: `Admin approval of "${joinTitle}" did not land (approval_status=${finalRow[0]?.approval_status})`,
      expected: 'The listing appears in /admin/service-approvals and approves',
      actual: JSON.stringify(finalRow[0] ?? null),
      where: 'client/src/pages/admin/service-approvals.tsx',
      evidence: { shot: 'shots/D6b-04-admin-approve.png' },
      behavioural: true,
    });
    net.flush();
    throw new Error('D6b: admin approval did not land — see finding above');
  }
  writeState((s) => {
    s.listings.joinLinkService = { id: serviceId, title: joinTitle, providerServiceId: serviceId, categoryKey: providerAListing.categoryKey };
  });

  const joinLinkStoredCorrectly = finalRow[0]?.join_link === joinLinkUrl;
  fileFinding({
    journey: 'D6b',
    step: 'listing:join-link-persisted',
    class: joinLinkStoredCorrectly ? 'SPEC_DIVERGENCE' : 'DEAD_TRIGGER',
    severity: joinLinkStoredCorrectly ? 'P3' : 'P1',
    known: null,
    title: `provider_services.join_link ${joinLinkStoredCorrectly ? 'matches' : 'does NOT match'} what was entered`,
    expected: `join_link = "${joinLinkUrl}"`,
    actual: `join_link = ${JSON.stringify(finalRow[0]?.join_link)}`,
    where: 'server PATCH/POST /api/provider/services',
    evidence: {},
    behavioural: true,
  });

  // ── 2. Seed a confirmed booking for T-auth (Stripe checkout is HELD) ──
  const tauthUser = await userByEmail(tauth.email);
  const providerAUser = await userByEmail(providerA.email);
  const band = await feeBand('moderate');
  const totalAmount = Number(finalRow[0]?.price ?? 80);
  const platformFee = Math.round(totalAmount * Number(band.defaultRate) * 100) / 100;
  const providerEarnings = Math.round((totalAmount - platformFee) * 100) / 100;
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 30);
  const scheduledDate = futureDate.toISOString().slice(0, 10);

  const bookingId = await q(
    `INSERT INTO service_bookings
       (id, service_id, traveler_id, provider_id, status, total_amount, platform_fee, provider_earnings,
        stripe_payment_intent_id, confirmed_at, booking_details, source)
     VALUES
       (gen_random_uuid()::text, $1, $2, $3, 'confirmed', $4, $5, $6,
        NULL, NOW(), $7::jsonb, 'direct')
     RETURNING id`,
    [
      serviceId,
      tauthUser?.id,
      providerAUser?.id,
      totalAmount,
      platformFee,
      providerEarnings,
      JSON.stringify({ scheduledDate }),
    ],
  );
  const seededBookingId = bookingId[0]?.id;

  fileFinding({
    journey: 'D6b',
    step: 'booking:seeded-confirmed',
    class: 'SPEC_DIVERGENCE',
    severity: 'P3',
    known: null,
    title: 'seeded confirmed booking (HELD:stripe)',
    expected:
      'n/a — R-1 fallback: a real checkout needs a live Stripe PaymentIntent, which this environment ' +
      'cannot complete. The row is seeded directly, with stripe_payment_intent_id left NULL (never a ' +
      'fabricated PaymentIntent id — §19a) and platform_fee/provider_earnings computed from the ' +
      `fee_bands "moderate" row at test time (rate=${band.defaultRate}), never a literal (R-2).`,
    actual:
      `INSERT INTO service_bookings (id=${seededBookingId}, service_id=${serviceId}, traveler_id=${tauthUser?.id}, ` +
      `provider_id=${providerAUser?.id}, status='confirmed', total_amount=${totalAmount}, platform_fee=${platformFee}, ` +
      `provider_earnings=${providerEarnings}, stripe_payment_intent_id=NULL). Note (§19b): the drift job's ` +
      '`payment_provenance_unverified` check would flag this exact row on its next pass — it carries no ' +
      '`bookingDetails.stripeAttemptAt` marker and Stripe holds no PaymentIntent naming it, which is the ' +
      'HONEST state for a row this harness seeded rather than one a real checkout authorized.',
    where: 'e2e/supply-demand/d6b-join-link.spec.ts (seed insert, not a product code path)',
    evidence: {},
    behavioural: true,
  });

  if (!seededBookingId) {
    net.flush();
    throw new Error('D6b: seeded booking insert did not return an id');
  }
  writeState((s) => {
    s.trips.joinLinkBooking = { id: seededBookingId, label: 'D6b seeded confirmed booking' };
  });

  // ── 3. T-auth sees the join link on /my-bookings ──
  await loginViaUi(page, tauth.email, E2E_PASSWORD);
  await page.goto('/my-bookings');
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  await page.reload();
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  await shot(page, 'D6b', '05', 'tauth-my-bookings-confirmed');

  const joinLinkBlock = testid(page, `join-link-${seededBookingId}`);
  const joinBtn = testid(page, `button-join-session-${seededBookingId}`);
  const blockVisible = await appears(joinLinkBlock, 8000);
  const btnVisible = blockVisible && (await appears(joinBtn, 3000));
  const href = btnVisible ? await joinBtn.locator('a').getAttribute('href').catch(() => null) : null;
  const target = btnVisible ? await joinBtn.locator('a').getAttribute('target').catch(() => null) : null;

  fileFinding({
    journey: 'D6b',
    step: 'my-bookings:join-link-shown',
    class: blockVisible && btnVisible && href === joinLinkUrl && target === '_blank' ? 'SPEC_DIVERGENCE' : 'INVISIBLE_RESULT',
    severity: blockVisible && btnVisible && href === joinLinkUrl && target === '_blank' ? 'P3' : 'P1',
    known: null,
    title: `T-auth's /my-bookings ${blockVisible && btnVisible ? 'DOES' : 'does NOT'} render the join link for the confirmed booking`,
    expected: `join-link-${seededBookingId} and button-join-session-${seededBookingId} render, with href="${joinLinkUrl}" and target="_blank"`,
    actual: `blockVisible=${blockVisible}, btnVisible=${btnVisible}, href=${href}, target=${target}`,
    where: 'client/src/pages/my-bookings.tsx (~857-870)',
    evidence: { shot: 'shots/D6b-05-tauth-my-bookings-confirmed.png' },
    behavioural: true,
  });

  // ── 4a. A DIFFERENT traveler must not see this booking at all ──
  const otherEmail = e2eEmail('d6b-other-traveler');
  await signupViaUi(page, { email: otherEmail, firstName: 'E2E', lastName: 'D6bOther' });
  const otherRes = await page.request.get('/api/service-bookings');
  const otherBody = await otherRes.json().catch(() => []);
  const otherItems = Array.isArray(otherBody) ? otherBody : (otherBody?.bookings ?? []);
  const leaked = Array.isArray(otherItems) && otherItems.some((b: any) => b.id === seededBookingId);
  fileFinding({
    journey: 'D6b',
    step: 'other-traveler:no-leak',
    class: leaked ? 'INVISIBLE_RESULT' : 'SPEC_DIVERGENCE',
    severity: leaked ? 'P1' : 'P3',
    known: null,
    title: `A different traveler's GET /api/service-bookings ${leaked ? 'DOES leak' : 'correctly excludes'} T-auth's booking`,
    expected: 'The response never includes a booking whose traveler_id is not the session user',
    actual: `leaked=${leaked}, status=${otherRes.status()}, items=${Array.isArray(otherItems) ? otherItems.length : 'n/a'}`,
    where: 'server GET /api/service-bookings (traveler-scoped read)',
    evidence: {},
    behavioural: true,
  });

  // ── 4b. Flip the seeded row to 'pending' — the join link must disappear for T-auth ──
  await q(`UPDATE service_bookings SET status = 'pending' WHERE id = $1`, [seededBookingId]);
  await loginViaUi(page, tauth.email, E2E_PASSWORD);
  await page.goto('/my-bookings');
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  await page.reload();
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  await shot(page, 'D6b', '06', 'tauth-my-bookings-pending');
  const linkShownWhilePending = await testid(page, `join-link-${seededBookingId}`).count().catch(() => 0);
  fileFinding({
    journey: 'D6b',
    step: 'pending:join-link-hidden',
    class: linkShownWhilePending > 0 ? 'INVISIBLE_RESULT' : 'SPEC_DIVERGENCE',
    severity: linkShownWhilePending > 0 ? 'P1' : 'P3',
    known: null,
    title: `A pending (unconfirmed) booking ${linkShownWhilePending > 0 ? 'STILL shows' : 'correctly hides'} the join link`,
    expected: 'The join link is revealed only for status=confirmed (my-bookings.tsx reveal gate; storage.ts ~3129-3142)',
    actual: `join-link element count=${linkShownWhilePending}`,
    where: 'client/src/pages/my-bookings.tsx; server/storage.ts (~3129-3142)',
    evidence: { shot: 'shots/D6b-06-tauth-my-bookings-pending.png' },
    behavioural: true,
  });

  // Restore 'confirmed' so the left-running final state stays consistent with what this run
  // seeded and reported.
  await q(`UPDATE service_bookings SET status = 'confirmed' WHERE id = $1`, [seededBookingId]);

  // ── 5. Expert-notes surfaces — only if D3 produced an ACCEPTED advisor ──
  const advisorRow = await q(
    `SELECT status FROM trip_expert_advisors WHERE local_expert_id = (SELECT id FROM users WHERE email = $1) ORDER BY created_at DESC LIMIT 1`,
    [state.accounts.expertE?.email ?? ''],
  ).catch(() => [] as any[]);
  const acceptedStatus = advisorRow[0]?.status;
  if (acceptedStatus === 'accepted' || acceptedStatus === 'assigned') {
    fileFinding({
      journey: 'D6b',
      step: 'expert-notes:precondition-met',
      class: 'SPEC_DIVERGENCE',
      severity: 'P3',
      known: null,
      title: `D3's advisor row is now '${acceptedStatus}' — expert-notes surfaces were NOT separately checked this pass`,
      expected: 'n/a — recorded for the record; checking expert-notes surfaces is a follow-up, not part of this spec\'s core ask',
      actual: `trip_expert_advisors.status=${acceptedStatus}`,
      where: 'e2e/supply-demand/d6b-join-link.spec.ts',
      evidence: {},
      behavioural: true,
    });
  } else {
    fileFinding({
      journey: 'D6b',
      step: 'expert-notes:skipped',
      class: 'SPEC_DIVERGENCE',
      severity: 'P3',
      known: null,
      title: 'Expert-notes surfaces check SKIPPED — D3\'s advisor never reached an accepted/assigned status',
      expected: 'n/a — per the lead\'s own fallback instruction: skip and say so when D3 did not produce an accepted advisor',
      actual: `trip_expert_advisors.status=${acceptedStatus ?? 'no row found'} (D3 filed this as its own honest P3 finding — see workspace:suggest-toggle)`,
      where: 'e2e/supply-demand/d3-with-an-expert.spec.ts',
      evidence: {},
      behavioural: true,
    });
  }

  net.flush();
});
