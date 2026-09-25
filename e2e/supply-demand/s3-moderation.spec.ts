/**
 * s3-moderation.spec.ts — the pending/moderation state as seen by provider
 * and expert while submitted, what the traveler sees (hidden), the admin
 * reject path (does the provider see the reason?), and time-to-visible
 * after approve. Stripe Connect onboarding is HELD:stripe.
 */
import { test, expect } from '@playwright/test';
import { RUN_ID, e2eEmail, e2eTitle, E2E_PASSWORD } from './lib/run-id';
import { loginViaUi } from './lib/accounts';
import {
  createListingBasics,
  walkServiceFormToReview,
  submitListingForReview,
  adminRejectService,
  saveDraft,
  enterWizardFromListingHome,
} from './lib/flows';
import { shot, netLogger } from './lib/evidence';
import { fileFinding, fileVisibility } from './lib/findings';
import { serviceByTitle, q, seedMeetingPin } from './lib/db';
import { readState } from './lib/state';
import { testid } from './lib/ui';
import { dedupe } from './lib/dedupe';

const ADMIN = { email: 'ci-admin@traveloure.test', password: 'CITestAdmin!99' };

test.describe.configure({ mode: 'serial' });

test('S3: pending listing is hidden from travelers while awaiting approval', async ({ page }) => {
  const state = readState();
  const providerAEmail = state.accounts.providerA?.email;
  test.skip(!providerAEmail, 'S1 providerA must have run first to produce an account (see state.json)');
  if (!providerAEmail) return;

  const title = e2eTitle('Kyoto Moderation Throwaway Listing');
  const net = netLogger(page, 'S3-moderation');

  await loginViaUi(page, providerAEmail, E2E_PASSWORD);
  await createListingBasics(page, {
    role: 'provider',
    title,
    offeringTypeKey: 'tea_ceremony_host',
    deliveryMethod: 'in-person',
    priceCents: 5000,
    description: `Moderation-state throwaway fixture (run ${RUN_ID}).`,
  });

  // Save as a draft, then seed the meeting pin (R-1 — same fallback S1/S2 use; the map
  // click-to-place + geocode flow is not headless-reliable) — a listing found here with no
  // pin was previously stuck permanently on Logistics behind a real "Meeting point is
  // required before you submit this for review" banner, so submit never reached Review and
  // no row was ever created for the whole rest of this spec to moderate.
  await saveDraft(page);
  const draftRow = await serviceByTitle(title);
  if (draftRow) {
    await seedMeetingPin(draftRow.id, 35.0116, 135.7681, 'Meet outside the main entrance — e2e supply-demand fixture.');
    if (!dedupe.filedMeetingPinFinding) {
      dedupe.filedMeetingPinFinding = true;
      fileFinding({
        journey: 'S1',
        step: 'all:seeded-meeting-pin',
        class: 'SPEC_DIVERGENCE',
        severity: 'P3',
        known: null,
        title: 'seeded step: provider_services.latitude/longitude/meeting_point (R-1 fallback — map click-to-place is not headless-reliable)',
        expected: 'n/a — documented R-1 fallback, not a UI path',
        actual:
          'UPDATE provider_services SET latitude=35.0116, longitude=135.7681, meeting_point=<text> WHERE id=<drafted row>. ' +
          'Applied once per account (A/B/C, expertE, S3 throwaway) across the whole run; filed as ONE finding, ' +
          'shared cross-spec via lib/dedupe.ts, covering the whole class of writes.',
        where: 'e2e/supply-demand/lib/db.ts seedMeetingPin',
        evidence: {},
        behavioural: true,
      });
    }
    await page.goto(`/provider/services/${draftRow.id}/edit`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    await enterWizardFromListingHome(page);
  }

  await walkServiceFormToReview(page);
  const outcome = await submitListingForReview(page);
  await shot(page, 'S3', '01', 'throwaway-post-submit');

  if (outcome.blockedByVerification) {
    fileFinding({
      journey: 'S3',
      step: 'throwaway:submit',
      class: 'SPEC_DIVERGENCE',
      severity: 'P2',
      known: null,
      title: 'S3 throwaway listing blocked by identity/business verification gate (same as S1 providers)',
      expected: 'A provider without background-check requirements can at least reach the pending-approval queue',
      actual: `button-publish-service disabled: "${outcome.reason}" — HELD:stripe`,
      where: 'client/src/components/ServiceForm.tsx:5211-5231',
      evidence: { shot: 'shots/S3-01-throwaway-post-submit.png' },
      behavioural: true,
    });
    net.flush();
    test.skip(true, 'HELD:stripe — see finding above; the entire moderation-state journey for a provider listing needs Stripe Identity/Connect to clear first.');
    return;
  }

  if (!outcome.submitted) {
    fileFinding({
      journey: 'S3',
      step: 'throwaway:submit',
      class: 'DEAD_TRIGGER',
      severity: 'P2',
      known: null,
      title: 'Could not submit the S3 throwaway listing for review',
      expected: 'The wizard reaches review and submits',
      actual: outcome.reason ?? 'submit control unreachable',
      where: 'client/src/components/ServiceForm.tsx',
      evidence: { shot: 'shots/S3-01-throwaway-post-submit.png' },
      behavioural: true,
    });
    net.flush();
    test.skip(true, 'no listing to moderate — see finding above');
    return;
  }

  const row = await serviceByTitle('Kyoto Moderation Throwaway Listing');

  // Product finding (lead review item 3): this listing DELIBERATELY never calls
  // pickNeighborhood (unlike every S1/S2 listing) — the one proof kept for the real defect
  // location-picking prevents. `provider_services.location` DEFAULTs to the literal
  // "Unknown" (shared/schema.ts:1170) and `city` stays NULL until a neighborhood is chosen
  // (ServiceForm.tsx:1440's `location` composer returns `undefined` — never written — when
  // no neighborhood is selected); both server-side location filters key on `city`/`location`
  // (server/services/location-view.service.ts:80-85 `cityScopePredicate`; server/storage.ts:3934
  // `listingLocationMatches`), so a listing born this way is invisible on every location-scoped
  // surface (city page, location browse, the paid optimizer's catalog reads) once approved — and
  // nothing in the wizard warns the seller this happened, before or after publish.
  if (row) {
    const locRow = await q(`SELECT location, city FROM provider_services WHERE id = $1`, [row.id]).catch(() => []);
    const loc = (locRow as any[])[0];
    fileFinding({
      journey: 'S3',
      step: 'throwaway:no-neighborhood-location-default',
      class: 'INVISIBLE_RESULT',
      severity: 'P2',
      known: null,
      title: 'An approved listing with no neighbourhood picked is stored with location \'Unknown\' and no city, so it is invisible on every location-scoped surface (city page, location browse, paid optimizer), and the wizard does not warn',
      expected: 'Either a neighborhood is required before publish, or an unset location is surfaced to the seller as a visibility-affecting gap',
      actual: `provider_services.location=${JSON.stringify(loc?.location)}, city=${JSON.stringify(loc?.city)} for a listing that walked the wizard\'s Logistics step without ever calling the neighborhood picker (option-neighborhood-<slug>) — nothing in the UI flagged this before submit.`,
      where: 'client/src/components/ServiceForm.tsx:1440 (location composer); server/services/location-view.service.ts:80-85 (cityScopePredicate); server/storage.ts:3934 (listingLocationMatches); shared/schema.ts:1170 (location DEFAULT \'Unknown\')',
      evidence: { shot: 'shots/S3-02-provider-pending-view.png' },
      behavioural: true,
    });
  }

  if (!row) {
    fileFinding({
      journey: 'S3',
      step: 'throwaway:submit',
      class: 'SPEC_DIVERGENCE',
      severity: 'P2',
      known: null,
      title: 'No provider_services row for the S3 throwaway listing after submit',
      expected: 'A row exists, born approval_status=submitted',
      actual: 'Row absent',
      where: 'server/routes.ts:3835',
      evidence: {},
      behavioural: true,
    });
    net.flush();
    return;
  }

  // Provider's own view of the pending listing.
  await page.goto(`/provider/services/${row.id}`);
  await shot(page, 'S3', '02', 'provider-pending-view');
  const providerStatusBadge = testid(page, 'badge-listing-hero-status');
  const providerStatusText = (await providerStatusBadge.textContent().catch(() => '')) ?? '';

  // Traveler-facing surfaces: expect hidden.
  const publicResp = await page.request.get(`/api/services/${row.id}`);
  const browseResp = await page.request.get(`/api/discover?location=Kyoto`);
  const browseBody = browseResp.ok() ? await browseResp.json().catch(() => ({})) : {};
  const inBrowse = JSON.stringify(browseBody).includes(row.id);

  fileVisibility({
    content: 'service',
    item: title,
    surface: '/api/services/:id (pending)',
    expected: 'hidden',
    actual: publicResp.status() === 200 ? 'visible' : 'hidden',
    filter: 'server/routes/content.routes.ts:2334 (approved+active gate)',
    journey: 'S3',
    ms: null,
  });
  fileVisibility({
    content: 'service',
    item: title,
    surface: '/api/discover (pending)',
    expected: 'hidden',
    actual: inBrowse ? 'visible' : 'hidden',
    filter: 'server/storage.ts:3929 (approved+active gate)',
    journey: 'S3',
    ms: null,
  });

  if (publicResp.status() === 200 || inBrowse) {
    fileFinding({
      journey: 'S3',
      step: 'throwaway:pending-visibility',
      class: 'FALSE_PROMISE',
      severity: 'P1',
      known: null,
      title: `${title} reachable by a traveler surface while still pending approval`,
      expected: 'A submitted-but-unapproved listing is hidden from every traveler surface',
      actual: `GET /api/services/:id status=${publicResp.status()}, in /api/discover=${inBrowse}`,
      where: 'server/routes/content.routes.ts:2334, server/storage.ts:3929',
      evidence: { shot: 'shots/S3-02-provider-pending-view.png' },
      behavioural: true,
    });
  }

  fileFinding({
    journey: 'S3',
    step: 'throwaway:provider-pending-messaging',
    class: providerStatusText.trim() ? 'SPEC_DIVERGENCE' : 'SILENT_SUCCESS',
    severity: 'P3',
    known: null,
    title: 'What the provider sees on the listing home while submitted/pending',
    expected: 'A clear pending/in-review status pill',
    actual: `badge-listing-hero-status text: "${providerStatusText.trim()}"`,
    where: 'client/src/components/ServiceForm.tsx:2311',
    evidence: { shot: 'shots/S3-02-provider-pending-view.png' },
    behavioural: true,
  });

  // Admin reject path — does the provider see the reason?
  await loginViaUi(page, ADMIN.email, ADMIN.password);
  const rejectReason = `e2e supply-demand: rejected on purpose (run ${RUN_ID}) — does not meet Kyoto category fixture requirements.`;
  // MUST match on the run-id-tagged title (not the bare base) — the pending queue can carry
  // same-titled rows left over from earlier runs, and a bare-text match's `.first()` can
  // silently act on a DIFFERENT row (found behaviourally in S1's admin-approve step).
  const rejected = await adminRejectService(page, title, rejectReason);
  await shot(page, 'S3', '03', 'admin-reject');

  if (!rejected) {
    fileFinding({
      journey: 'S3',
      step: 'throwaway:admin-reject',
      class: 'DEAD_TRIGGER',
      severity: 'P2',
      known: null,
      title: 'Could not find/click reject for the S3 throwaway listing on /admin/service-approvals',
      expected: 'A reject control with a reason field is available for a pending listing',
      actual: 'No matching card/control',
      where: 'client/src/pages/admin/service-approvals.tsx',
      evidence: { shot: 'shots/S3-03-admin-reject.png' },
      behavioural: true,
    });
  } else {
    await loginViaUi(page, providerAEmail, E2E_PASSWORD);
    await page.goto(`/provider/services/${row.id}`);
    await shot(page, 'S3', '04', 'provider-post-reject-view');
    const pageText = await page.textContent('body').catch(() => '');
    const seesReason = !!pageText && pageText.includes(rejectReason.slice(0, 30));
    fileFinding({
      journey: 'S3',
      step: 'throwaway:provider-sees-rejection-reason',
      class: seesReason ? 'SPEC_DIVERGENCE' : 'INVISIBLE_RESULT',
      severity: seesReason ? 'P3' : 'P2',
      known: null,
      title: 'Does the provider see the admin\'s rejection reason on the listing home?',
      expected: 'The rejection reason set by the admin is shown to the provider on their listing page',
      actual: seesReason ? 'Reason text found on page' : 'Reason text NOT found on page',
      where: 'client/src/components/ServiceForm.tsx (listing home)',
      evidence: { shot: 'shots/S3-04-provider-post-reject-view.png' },
      behavioural: true,
    });
  }

  net.flush();
});

test('S3: Stripe Connect onboarding steps (HELD)', async () => {
  test.skip(true, 'HELD:stripe — CI Stripe key is a stub (sk_test_ci_stub…, 401 on api.stripe.com); Connect onboarding/verification cannot run against it (see PHASE0_SUPPLY_DEMAND.md §1/§6.1).');
});

test('S3: time-to-visible after a clean approve (no background-check gate)', async ({ page }) => {
  const state = readState();
  const providerAEmail = state.accounts.providerA?.email;
  test.skip(!providerAEmail, 'S1 providerA must have run first');
  if (!providerAEmail) return;

  const title = e2eTitle('Kyoto Moderation Timing Listing');
  const net = netLogger(page, 'S3-timing');
  await loginViaUi(page, providerAEmail, E2E_PASSWORD);
  await createListingBasics(page, {
    role: 'provider',
    title,
    offeringTypeKey: 'tea_ceremony_host',
    deliveryMethod: 'in-person',
    priceCents: 6000,
    description: `Timing fixture (run ${RUN_ID}).`,
  });

  // Same R-1 meeting-pin fallback as the throwaway-listing test above and S1/S2 — without it
  // this listing gets stuck behind a real "Meeting point is required" banner and never reaches
  // Review & submit at all.
  await saveDraft(page);
  const timingDraftRow = await serviceByTitle(title);
  if (timingDraftRow) {
    await seedMeetingPin(timingDraftRow.id, 35.0116, 135.7681, 'Meet outside the main entrance — e2e supply-demand fixture.');
    await page.goto(`/provider/services/${timingDraftRow.id}/edit`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    await enterWizardFromListingHome(page);
  }

  await walkServiceFormToReview(page);
  const outcome = await submitListingForReview(page);
  const submitTime = Date.now();
  if (outcome.blockedByVerification) {
    // Same HELD:stripe gate as S1/S3's throwaway-listing test — not re-filed as a
    // distinct finding (R-3 posture: one root cause, one finding), just skipped.
    net.flush();
    test.skip(true, 'HELD:stripe — provider identity/business verification gate (see the S1/S3 throwaway-listing findings).');
    return;
  }
  if (!outcome.submitted) {
    fileFinding({
      journey: 'S3',
      step: 'timing:submit',
      class: 'DEAD_TRIGGER',
      severity: 'P3',
      known: null,
      title: 'Could not submit the S3 timing listing',
      expected: 'Submit reachable',
      actual: outcome.reason ?? 'Submit control unreachable',
      where: 'client/src/components/ServiceForm.tsx',
      evidence: {},
      behavioural: true,
    });
    net.flush();
    return;
  }

  const row = await serviceByTitle('Kyoto Moderation Timing Listing');
  if (!row) {
    net.flush();
    return;
  }

  await loginViaUi(page, ADMIN.email, ADMIN.password);
  await page.goto('/admin/service-approvals');
  // MUST match on the run-id-tagged title — see the comment on the throwaway-listing reject above.
  const card = page.locator('[data-testid^="pending-service-"]', { hasText: title });
  const approveBtn = card.first().locator('[data-testid^="button-approve-"]');
  await approveBtn.click();
  const confirmBtn = page.locator('[data-testid^="button-approve-confirm-"]');
  if (await confirmBtn.isVisible().catch(() => false)) await confirmBtn.click();
  await page.waitForTimeout(500);

  // Poll GET /api/services/:id until visible or a 15s ceiling.
  let visibleAt: number | null = null;
  for (let i = 0; i < 15; i++) {
    const r = await page.request.get(`/api/services/${row.id}`);
    if (r.ok()) {
      visibleAt = Date.now();
      break;
    }
    await page.waitForTimeout(1000);
  }
  const elapsed = visibleAt ? visibleAt - submitTime : null;

  // Time-to-visible is DATA, not a finding (lead review, findings hygiene) — visibility.jsonl only.
  fileVisibility({
    content: 'service',
    item: title,
    surface: '/api/services/:id (submit-to-visible timing, no background-check gate)',
    expected: 'visible',
    actual: elapsed !== null ? 'visible' : 'hidden',
    filter: 'server/routes/content.routes.ts:2334 (approved+active gate)',
    journey: 'S3',
    ms: elapsed,
  });
  expect(elapsed, 'listing should become visible shortly after admin approval').not.toBeNull();

  net.flush();
});
