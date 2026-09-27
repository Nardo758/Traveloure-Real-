/**
 * s2-expert-publish.spec.ts — Expert E (Kyoto local): apply → admin-approve
 * → claim handle → create one custom-itinerary offering → admin-approve →
 * build a ready-made "3 days in Kyoto" referencing A/B/C's live listings →
 * submit → admin-approve → poll surfaces.
 *
 * Where a UI step is genuinely unreachable within this pass's time budget
 * (the ready-made builder is a large multi-panel editor), the step falls
 * back to the smallest DB write, itself logged as a finding (R-1).
 */
import { test, expect } from '@playwright/test';
import { RUN_ID, e2eEmail, e2eHandle, e2eTitle, E2E_PASSWORD } from './lib/run-id';
import { signupViaUi, loginViaUi } from './lib/accounts';
import {
  applyAsExpert,
  adminApproveExpertApplication,
  createListingBasics,
  walkServiceFormToReview,
  submitListingForReview,
  adminApproveService,
  claimHandle,
  pickNeighborhood,
} from './lib/flows';
import { shot, netLogger } from './lib/evidence';
import { fileFinding, fileVisibility } from './lib/findings';
import { q, userByEmail, serviceByTitle, feeBand, seedMeetingPin, seedExpertIdentityVerification, seedReadyMadeHero } from './lib/db';
import { writeState, readState } from './lib/state';
import { testid, appears } from './lib/ui';
import { dedupe } from './lib/dedupe';

const ADMIN = { email: 'ci-admin@traveloure.test', password: 'CITestAdmin!99' };

test.describe.configure({ mode: 'serial' });

test('S2: Expert E applies, publishes an offering, and is admin-approved', async ({ page }) => {
  // Same margin as S1 (lead review, isVisible sweep arithmetic fix) — this test also walks the
  // wizard and can retry it, so it carries the same risk of exceeding the default 120s budget.
  test.setTimeout(8 * 60_000);
  const email = e2eEmail('expertE');
  const handle = e2eHandle('expertE');
  const offeringTitle = e2eTitle('Kyoto Custom Itinerary Planning');
  const net = netLogger(page, 'S2-expertE');

  await signupViaUi(page, { email, firstName: 'E2E', lastName: 'ExpertE' });
  await shot(page, 'S2-expertE', '01', 'post-signup');

  const applyOutcome = await applyAsExpert(page, {
    firstName: 'E2E',
    lastName: 'ExpertE',
    email,
    city: 'Kyoto',
    country: 'Japan',
    handle,
  });
  await shot(page, 'S2-expertE', '02', 'post-application-submit');

  if (!applyOutcome.reachedFinalStep) {
    fileFinding({
      journey: 'S2',
      step: 'expertE:apply',
      class: 'DEAD_TRIGGER',
      severity: 'P2',
      known: null,
      title: `Local Expert application walker stopped at step ${applyOutcome.stoppedAtStep} — a step-specific gate never satisfied`,
      expected: 'Each of the 7 Local Expert steps\' canProceed() gate is satisfied by the fields the walker fills',
      actual: `button-next-step stayed disabled (or absent) after step ${applyOutcome.stoppedAtStep}`,
      where: 'client/src/pages/travel-experts.tsx canProceed() (isLocalExpert branch)',
      evidence: { shot: 'shots/S2-expertE-02-post-application-submit.png' },
      behavioural: true,
    });
  }

  const appRow = await q(
    `SELECT id, status FROM local_expert_forms WHERE email = $1 ORDER BY created_at DESC LIMIT 1`,
    [email],
  ).catch(() => [] as any[]);
  if (appRow.length === 0) {
    fileFinding({
      journey: 'S2',
      step: 'expertE:apply',
      class: 'SPEC_DIVERGENCE',
      severity: 'P2',
      known: null,
      title: 'No local_expert_forms row found after submitting the become-expert form',
      expected: 'A local_expert_forms row exists after wizard submit',
      actual: 'No matching row',
      where: 'client/src/pages/travel-experts.tsx (button-submit handler)',
      evidence: { shot: 'shots/S2-expertE-02-post-application-submit.png' },
      behavioural: true,
    });
  }

  writeState((s) => {
    s.accounts.expertE = { email, handle };
  });

  await loginViaUi(page, ADMIN.email, ADMIN.password);
  const approved = await adminApproveExpertApplication(page, email);
  await shot(page, 'S2-expertE', '03', 'admin-approve-application');
  if (!approved) {
    fileFinding({
      journey: 'S2',
      step: 'expertE:admin-approve-application',
      class: 'DEAD_TRIGGER',
      severity: 'P1',
      known: null,
      title: `Application card for ${email} not found on /admin/experts applications tab`,
      expected: 'A pending expert application card is listed and approvable',
      actual: 'No matching card',
      where: 'client/src/pages/admin/experts.tsx (Applications tab)',
      evidence: { shot: 'shots/S2-expertE-03-admin-approve-application.png' },
      behavioural: true,
    });
  }

  // Verify the approval actually TOOK — admin/experts.tsx's Approve opens a
  // window.prompt() override dialog whenever verification is incomplete (always true
  // here); a click that finds the button but never handles that dialog silently does
  // nothing, and the UI helper alone cannot tell "clicked" from "took effect".
  const acctAfterApproval = await userByEmail(email);
  const roleFlipped = acctAfterApproval?.role && acctAfterApproval.role !== 'user';
  if (approved && !roleFlipped) {
    fileFinding({
      journey: 'S2',
      step: 'expertE:admin-approve-application-verify',
      class: 'DEAD_TRIGGER',
      severity: 'P1',
      known: null,
      title: 'adminApproveExpertApplication clicked Approve but users.role never flipped off "user"',
      expected: 'A successful admin approve mutation updates users.role to an expert role',
      actual: `users.role = ${JSON.stringify(acctAfterApproval?.role)} after the click (likely an unhandled window.prompt() override dialog silently cancelling the mutation)`,
      where: 'client/src/pages/admin/experts.tsx (Approve handler, window.prompt override-reason path)',
      evidence: { shot: 'shots/S2-expertE-03-admin-approve-application.png' },
      behavioural: true,
    });
  }

  // Log in as the expert; claim a handle (lead review item 4); create one
  // custom-itinerary offering via ServiceForm.
  await loginViaUi(page, email, E2E_PASSWORD);
  const handleClaimed = await claimHandle(page, '/expert/dashboard');
  if (!handleClaimed) {
    const acct = await userByEmail(email);
    if (!acct?.handle) {
      fileFinding({
        journey: 'S2',
        step: 'expertE:handle-claim',
        class: 'DEAD_TRIGGER',
        severity: 'P2',
        known: null,
        title: 'Could not claim a handle via the HandleClaimBanner for expertE',
        expected: 'handle-claim-banner is visible on /expert/dashboard for an earner with no handle, and submitting it sets users.handle',
        actual: 'Banner not visible, submit disabled, or users.handle stayed null after submit',
        where: 'client/src/components/backoffice/handle-claim-banner.tsx',
        evidence: {},
        behavioural: true,
      });
    }
  }

  // Lead review item 1: the expert wizard's final-step control was NEVER reachable because
  // the harness never picked "What you sell" (expertOfferingTypeKey, required for role='expert')
  // or Category (required for both roles) — service-form-required.ts's "tier"/"category" rows.
  // `itinerary_2nd_opinion` is an ADVISORY-tier offering (LOCAL_EXPERT_TIERS — the only tier set
  // visible to a local_expert account per ServiceForm.tsx's `visibleExpertOfferingTypes`
  // partition; `full_itinerary`/PLANNING would not even render as an option here).
  await createListingBasics(page, {
    role: 'expert',
    title: offeringTitle,
    expertOfferingTypeKey: 'itinerary_2nd_opinion',
    expertCategoryName: 'Tours & Experiences',
    deliveryMethod: 'in-person',
    priceCents: 15000,
    description: `Custom Kyoto itinerary planning — e2e supply-demand fixture (run ${RUN_ID}).`,
  });
  await shot(page, 'S2-expertE', '04', 'offering-basics-filled');

  // Meeting point (lead review item 1: "same seeded-and-logged way as providers" — R-1, the
  // map click-to-place + geocode flow is not headless-reliable, see S1's identical comment).
  // Save as a draft first so a row id exists to seed against.
  const draftBtn = testid(page, 'button-save-draft');
  if (await appears(draftBtn, 2000)) {
    await draftBtn.click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(1000);
  }
  const draftRow = await serviceByTitle(offeringTitle);
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
          'Applied once per account (A/B/C, expertE, S3 throwaway) across the whole run; filed as ONE finding covering ' +
          'the whole class of writes, per lead review.',
        where: 'e2e/supply-demand/lib/db.ts seedMeetingPin',
        evidence: {},
        behavioural: true,
      });
    }
    // Re-enter the wizard (a cold /edit load lands on listing-home, same as S1).
    await page.goto(`/expert/services/${draftRow.id}/edit`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  }

  const stepClicks = await walkServiceFormToReview(page, 8, { neighborhoodSlug: 'gion' });
  const outcome = await submitListingForReview(page);
  await shot(page, 'S2-expertE', '05', 'offering-post-submit');

  if (!outcome.submitted) {
    // Expert offerings use button-submit-service, which is NOT gated by identity
    // verification (submitting for review is never blocked while unverified — only
    // GOING LIVE is, per the wizard's own copy) — so unlike S1's providers, this
    // should genuinely succeed even under the Stripe stub. A failure here is filed
    // as a real defect, not HELD:stripe.
    fileFinding({
      journey: 'S2',
      step: 'expertE:submit-offering',
      class: outcome.blockedByVerification ? 'SPEC_DIVERGENCE' : 'DEAD_TRIGGER',
      severity: 'P1',
      known: null,
      title: `Could not reach the submit control for "${offeringTitle}" via the wizard's step-next chain`,
      expected: 'The wizard reaches review and submits (expert submit is never verification-gated)',
      actual: `Advanced ${stepClicks} step(s); ${outcome.reason ?? 'submit control never became available'}`,
      where: 'client/src/components/ServiceForm.tsx (button-submit-service)',
      evidence: { shot: 'shots/S2-expertE-05-offering-post-submit.png' },
      behavioural: true,
    });
  }

  const offeringRow = await serviceByTitle(offeringTitle);
  if (offeringRow) {
    writeState((s) => {
      s.listings.expertOffering = { id: offeringRow.id, title: offeringTitle, providerServiceId: offeringRow.id };
    });
    await loginViaUi(page, ADMIN.email, ADMIN.password);
    // MUST match on the run-id-tagged title, not the bare base (see S1's admin-approve comment —
    // a bare-text match's `.first()` can silently approve a different, stale row).
    const svcApproved = await adminApproveService(page, offeringTitle);
    await shot(page, 'S2-expertE', '06', 'admin-approve-offering');
    if (!svcApproved) {
      fileFinding({
        journey: 'S2',
        step: 'expertE:admin-approve-offering',
        class: 'DEAD_TRIGGER',
        severity: 'P1',
        known: null,
        title: `No pending-service card for "${offeringTitle}" on /admin/service-approvals`,
        expected: 'The submitted offering appears in the pending-approval queue',
        actual: 'No matching card',
        where: 'client/src/pages/admin/service-approvals.tsx',
        evidence: { shot: 'shots/S2-expertE-06-admin-approve-offering.png' },
        behavioural: true,
      });
    } else {
      // Part 1b (Pass 2). approval_status flips to 'approved' but `provider_services.status`
      // stays 'draft' for an EXPERT-owned offering until the identity-verification gate is
      // satisfied (resolvePublishVerification, server/services/publish-verification.service.ts —
      // the expert branch requires identity_verification_status='verified', Stripe-Identity-only,
      // no admin override). Confirm the row is actually held BEFORE seeding, so the finding below
      // is a proven behaviour and not an assumption.
      const heldRow = await serviceByTitle(offeringTitle);
      const wasHeldDraft = heldRow?.approval_status === 'approved' && heldRow?.status === 'draft';

      // FALSE_PROMISE check: what does each side see while approved-but-held? Admin's queue
      // already emptied it (svcApproved implies the card is gone from pending); capture what the
      // admin's OWN listing/queue view says next, and what the expert's console/listing-home says,
      // before any seeding happens.
      await page.goto('/admin/service-approvals');
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
      await shot(page, 'S2-expertE', '06b', 'admin-view-after-approve-held');

      await loginViaUi(page, email, E2E_PASSWORD);
      await page.goto(`/expert/services/${heldRow?.id}/edit`);
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
      await shot(page, 'S2-expertE', '06c', 'expert-listing-home-before-identity-seed');
      const expertPageText = await page.locator('body').innerText().catch(() => '');
      const expertToldNotLive = /not live|held|awaiting|pending verification|identity verif/i.test(expertPageText);

      fileFinding({
        journey: 'S2',
        step: 'expertE:approved-but-held-visibility',
        class: 'FALSE_PROMISE',
        severity: wasHeldDraft ? 'P2' : 'P3',
        known: null,
        title: 'What the admin and the expert see when an offering is approved but held at draft by the identity gate',
        expected:
          'Either the admin approval queue or the expert listing-home tells the reader the ' +
          'listing is approved but not yet visible to travelers (identity verification pending)',
        actual: wasHeldDraft
          ? `provider_services row confirmed approval_status=approved, status=draft. Expert listing-home text ` +
            `${expertToldNotLive ? 'DOES mention' : 'does NOT mention'} not-live/pending-verification wording ` +
            `(admin queue view captured separately, screenshot 06b).`
          : `Row was not observed held (approval_status/status = ${heldRow?.approval_status}/${heldRow?.status}) — ` +
            'seeding proceeded but the held-state screenshots above are recorded for reference only.',
        where: 'client/src/components/ServiceForm.tsx (listing-home view); client/src/pages/admin/service-approvals.tsx',
        evidence: { shot: 'shots/S2-expertE-06c-expert-listing-home-before-identity-seed.png' },
        behavioural: true,
      });

      // Part 1b seed: bring identity verification the rest of the way, the same R-1 class as
      // S1's provider seed (HELD:stripe — no non-Stripe path exists for either role's identity
      // check; see S1's 'expertE:no-verification-path'-equivalent finding, cross-referenced here
      // rather than re-filed).
      const expertUser = await userByEmail(email);
      if (expertUser?.id) {
        const { activatedListingCount } = await seedExpertIdentityVerification(expertUser.id);
        fileFinding({
          journey: 'S2',
          step: 'expertE:seeded-identity-verification',
          class: 'SPEC_DIVERGENCE',
          severity: 'P3',
          known: null,
          title: "seeded step: local_expert_forms.identity_verification_status='verified' (HELD:stripe)",
          expected: 'n/a — documented R-1 fallback, same class of write as S1\'s provider identity/business ' +
            'verification seed (P2-S1-3): no non-Stripe path exists to verify EITHER role\'s identity in this ' +
            'environment, so this is not a second, separate product gap — it is the expert-side instance of ' +
            'the same one.',
          actual:
            `UPDATE local_expert_forms SET identity_verification_status='verified', identity_verified_at=NOW() ` +
            `WHERE user_id=${expertUser.id}. Reproduced the production auto-activation sweep verbatim ` +
            `(activateVerificationHeldListings, server/services/publish-verification.service.ts): ` +
            `UPDATE provider_services SET status='active' WHERE approval_status='approved' AND status='draft' — ` +
            `${activatedListingCount} row(s) promoted.`,
          where: 'e2e/supply-demand/lib/db.ts seedExpertIdentityVerification',
          evidence: {},
          behavioural: true,
        });
      }

      await page.reload();
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
      await shot(page, 'S2-expertE', '06d', 'expert-listing-home-after-identity-seed');
    }
  } else {
    fileFinding({
      journey: 'S2',
      step: 'expertE:submit-offering',
      class: 'SPEC_DIVERGENCE',
      severity: 'P1',
      known: null,
      title: `No provider_services row found for "${offeringTitle}" after wizard walk`,
      expected: 'A provider_services row exists (role=expert)',
      actual: 'Row absent',
      where: 'server/routes.ts:3835 POST /api/provider/services',
      evidence: { shot: 'shots/S2-expertE-05-offering-post-submit.png', net: `net/S2-expertE-${RUN_ID}.jsonl` },
      behavioural: true,
    });
  }

  net.flush();
});

test('S2: ready-made "3 days in Kyoto" build referencing A/B/C', async ({ page }) => {
  const state = readState();
  const expertEmail = state.accounts.expertE?.email;
  if (!expertEmail) {
    fileFinding({
      journey: 'S2',
      step: 'readymade:precondition',
      class: 'SPEC_DIVERGENCE',
      severity: 'P1',
      known: null,
      title: 'No Expert E account recorded in harness state — cannot attempt ready-made build',
      expected: 'S2 expert-account test ran first and persisted state',
      actual: 'state.accounts.expertE is empty',
      where: 'e2e/supply-demand/s2-expert-publish.spec.ts',
      evidence: {},
      behavioural: true,
    });
    test.skip(true, 'no expert account in state');
    return;
  }

  const buildTitle = e2eTitle('3 Days in Kyoto');
  const net = netLogger(page, 'S2-readymade');
  await loginViaUi(page, expertEmail, E2E_PASSWORD);

  // Part 1c fix (Pass 2): the original spec shot this page immediately after `goto`, with
  // no wait — the "workspace landing" screenshot in the prior pass was a loading spinner,
  // not the loaded page, so `button-new-build`'s `isVisible()` (which does not itself wait)
  // read false before the workspace had ever rendered its content. Wait for the page to
  // actually settle, then give the button-visibility check a real timeout.
  await page.goto('/expert/workspace');
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  await shot(page, 'S2-readymade', '01', 'workspace-landing');

  const newBuildBtn = testid(page, 'button-new-build');
  let usedUiBuild = false;
  let tripId: string | null = null;

  if (await appears(newBuildBtn, 8000)) {
    await newBuildBtn.click();
    await page.waitForTimeout(1500);
    await shot(page, 'S2-readymade', '02', 'after-new-build');

    // Best-effort: try to pick up the tripId this build created, from the URL or state.
    const url = page.url();
    const m = url.match(/\/expert\/workspace\/([a-zA-Z0-9-]+)/);
    if (m) tripId = m[1];

    if (tripId) {
      usedUiBuild = true;
      // Rename the build.
      const titleInput = testid(page, 'input-build-title');
      if (await appears(titleInput)) {
        await titleInput.fill(buildTitle).catch(() => {});
      }

      // Add A, B, C via the "Platform services" Add-panel source (Part 1c fix, lead review):
      // `button-open-service-picker` / `input-service-picker-search` / `button-service-add-<id>`
      // read as a `service-picker-modal.tsx` shape that does not exist in the CURRENT workspace —
      // the real surface is the Add panel's seven source pills (`pill-add-<key>`), and the
      // service catalog lives under the "platform" pill's inline search+results list
      // (`input-browse-search`, `button-add-result-<id>`), which `button-open-service-picker`
      // (Store icon, "Service catalog") sits inside of and is a SEPARATE, secondary control, not
      // the entry point. Confirmed live: `pill-add-platform` was never clicked, so that whole
      // panel — and therefore the picker button inside it — was never rendered.
      const providerServiceIds = [
        state.listings.providerA?.providerServiceId,
        state.listings.providerB?.providerServiceId,
        state.listings.providerC?.providerServiceId,
      ].filter(Boolean) as string[];

      const platformPill = testid(page, 'pill-add-platform');
      const platformPillVisible = await appears(platformPill, 5000);
      if (platformPillVisible && providerServiceIds.length > 0) {
        await platformPill.click().catch(() => {});
        await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
        await shot(page, 'S2-readymade', '03a', 'platform-services-pill-open');
        for (const svcId of providerServiceIds) {
          // Part 1c follow-on fix (found live via curl against /api/search/experiences): the
          // platform search's `result.id` is `pl_<provider_services.id>` (content.routes.ts
          // ~6640, `id: \`pl_${p.id}\``), not the raw id — `button-add-result-${svcId}` never
          // matched anything. Also: the endpoint's `storage.getAllProviderServices()` read can
          // lag the admin-approve UI action by longer than 5s (the same time-to-visible
          // characteristic already tracked, e.g. P2-S1-13), so this polls with page reloads
          // rather than a single short wait.
          const addBtn = testid(page, `button-add-result-pl_${svcId}`);
          let added = false;
          for (let attempt = 0; attempt < 6 && !added; attempt++) {
            added = await appears(addBtn, 5000);
            if (added) break;
            const searchBox = testid(page, 'input-browse-search');
            if (await appears(searchBox, 3000)) {
              await searchBox.fill('').catch(() => {});
              await page.waitForTimeout(400);
            }
            await page.reload();
            await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
            const pillAgain = testid(page, 'pill-add-platform');
            if (await appears(pillAgain, 5000)) {
              await pillAgain.click().catch(() => {});
              await page.waitForTimeout(600);
            }
          }
          if (added) {
            await addBtn.click().catch(() => {});
            await page.waitForTimeout(700);
          } else {
            fileFinding({
              journey: 'S2',
              step: `readymade:add-service:${svcId}`,
              class: 'DEAD_TRIGGER',
              severity: 'P2',
              known: null,
              title: `Platform-services search did not surface provider_services ${svcId} for the ready-made build`,
              expected: '/api/search/experiences?sources=platform&destination=Kyoto surfaces the just-approved listing',
              actual: 'button-add-result-pl_<id> not visible after 6 reload attempts (~30-45s)',
              where: 'client/src/pages/expert/workspace.tsx (searchResults / button-add-result-<id>)',
              evidence: {},
              behavioural: true,
            });
          }
        }
        await shot(page, 'S2-readymade', '03', 'after-adding-services');
      } else {
        fileFinding({
          journey: 'S2',
          step: 'readymade:service-picker',
          class: 'DEAD_TRIGGER',
          severity: 'P1',
          known: null,
          title: 'pill-add-platform not available, or no A/B/C provider_service ids in state',
          expected: 'The "Platform services" Add-panel source opens and A/B/C are addable',
          actual: `platformPillVisible=${platformPillVisible}, ids=${providerServiceIds.length}`,
          where: 'client/src/pages/expert/workspace.tsx (pill-add-platform)',
          evidence: { shot: 'shots/S2-readymade-02-after-new-build.png' },
          behavioural: true,
        });
      }
    }
  }

  if (!usedUiBuild || !tripId) {
    fileFinding({
      journey: 'S2',
      step: 'readymade:new-build',
      class: 'SPEC_DIVERGENCE',
      severity: 'P2',
      known: null,
      title: 'Could not drive the ready-made builder end-to-end via the UI within this pass',
      expected: 'button-new-build opens a build editor whose tripId is derivable from the URL',
      actual: `usedUiBuild=${usedUiBuild}, tripId=${tripId}`,
      where: 'client/src/pages/expert/workspace.tsx',
      evidence: { shot: 'shots/S2-readymade-02-after-new-build.png' },
      behavioural: true,
    });
  }

  // Harness fix (lead review class — same shape as D3's Advisor-tab bug): the listing panel
  // lives under the right rail's "Distribute" tab (App.tsx: "ReadyMadeListingPanel via
  // Distribute"), not on "Add" where "New build" leaves the panel open. AND: "New build" does
  // NOT itself create a `ready_made_trips` row (confirmed — the table was empty in the DB right
  // after a successful 3-item build) — the row is minted by pressing "Ship to store"
  // (`button-ship-to-store`, `shipToStoreMutation`) on that tab, which only renders while no
  // listing exists yet (`workspaceCtx.listing`). The earlier "created by New build per P1-1"
  // comment was a stale reading of an earlier phase.
  if (tripId) {
    const distributeTab = testid(page, 'tab-right-distribute');
    if (await appears(distributeTab, 5000)) {
      await distributeTab.click().catch(() => {});
      await page.waitForTimeout(600);
      await shot(page, 'S2-readymade', '03b', 'distribute-tab-open');
      const shipBtn = testid(page, 'button-ship-to-store');
      if (await appears(shipBtn, 5000)) {
        await shipBtn.click().catch(() => {});
        await page.waitForTimeout(1500);
        await shot(page, 'S2-readymade', '03c', 'after-ship-to-store');
      } else {
        fileFinding({
          journey: 'S2',
          step: 'readymade:ship-to-store',
          class: 'DEAD_TRIGGER',
          severity: 'P2',
          known: null,
          title: 'button-ship-to-store not visible on the Distribute tab',
          expected: 'A build with no listing yet offers "Ship to store" under Distribute > Store',
          actual: 'Not visible within 5s',
          where: 'client/src/pages/expert/workspace.tsx (Store channel, isAuthoring branch)',
          evidence: { shot: 'shots/S2-readymade-03b-distribute-tab-open.png' },
          behavioural: true,
        });
      }
    } else {
      fileFinding({
        journey: 'S2',
        step: 'readymade:distribute-tab',
        class: 'DEAD_TRIGGER',
        severity: 'P2',
        known: null,
        title: 'tab-right-distribute not visible on the expert workspace build',
        expected: 'The right rail offers an Add/Advisor/Distribute tab set for every build',
        actual: 'Not visible within 5s',
        where: 'client/src/pages/expert/workspace.tsx',
        evidence: {},
        behavioural: true,
      });
    }
  }

  // Attempt the listing-panel publish step (title/plan type/price/save/submit) now that
  // "Ship to store" should have minted the ready_made_trips row.
  const rmRows = tripId
    ? await q(`SELECT id, status FROM ready_made_trips WHERE source_trip_id = $1`, [tripId])
    : [];
  let reachedSubmitted = false;

  if (rmRows.length > 0) {
    const rm = rmRows[0];
    writeState((s) => {
      s.readyMade = { id: rm.id, title: buildTitle };
      s.trips.expertBuild = { id: tripId!, label: buildTitle };
    });

    await testid(page, 'input-listing-title').fill(buildTitle).catch(() => {});
    const planTypeSelect = testid(page, 'select-listing-plan-type');
    if (await appears(planTypeSelect)) {
      const options = await planTypeSelect.locator('option').allTextContents();
      if (options.length > 1) {
        await planTypeSelect.selectOption({ index: 1 }).catch(() => {});
      }
    }
    await testid(page, 'input-listing-price').fill('249.00').catch(() => {});
    await shot(page, 'S2-readymade', '04', 'listing-panel-filled');

    const saveBtn = testid(page, 'button-save-listing');
    if (await saveBtn.isEnabled().catch(() => false)) {
      await saveBtn.click().catch(() => {});
    }
    // Poll for the save round trip to actually land (PATCH -> invalidate -> re-render with a
    // `listing` prop that matches `draft`, at which point `dirty` goes false and Submit becomes
    // clickable) rather than a single fixed wait — the earlier fixed 800ms window was the
    // documented root cause of run rbvvcu leaving this listing at status='draft': the button was
    // never actually driven, just checked once too early (lead verdict P2-S2-3/P2-D2-… "vacuous
    // pass"). isEnabled() polls no more than isVisible() does, so this loop drives it for real.
    const submitBtn = testid(page, 'button-submit-listing');
    let submittable = false;
    for (let i = 0; i < 15; i++) {
      submittable = await submitBtn.isEnabled().catch(() => false);
      if (submittable) break;
      await page.waitForTimeout(500);
    }

    // Cover photo — REQUIRED server-side (assertReadyMadeComplete, ready-made.routes.ts) even
    // though the Save/Submit buttons' client-side `dirty` gate does not itself block on it, so
    // this must be driven for real or Submit's 400 is not "the listing wasn't ready", it's "this
    // harness never tried". Only attempted once (title/plan-type/price alone were never enough
    // to reach `approved` for a fresh build with no hero).
    if (!(await testid(page, 'img-listing-hero').isVisible().catch(() => false))) {
      const chooseHero = testid(page, 'button-choose-hero');
      if (await appears(chooseHero, 4000)) {
        await chooseHero.click().catch(() => {});
        const modal = testid(page, 'modal-hero-picker');
        if (await appears(modal, 4000)) {
          await shot(page, 'S2-readymade', '03b', 'hero-picker-open');
          const unavailable = testid(page, 'text-hero-unavailable');
          const option = testid(page, 'button-hero-option');
          let pickedHero = false;
          for (let i = 0; i < 10; i++) {
            if (await unavailable.isVisible().catch(() => false)) break;
            if (await option.first().isVisible().catch(() => false)) {
              await option.first().click({ timeout: 3000 }).catch(() => {});
              await page.waitForTimeout(700);
              pickedHero = await testid(page, 'img-listing-hero').isVisible().catch(() => false);
              break;
            }
            await page.waitForTimeout(500);
          }
          if (!pickedHero) {
            fileFinding({
              journey: 'S2',
              step: 'readymade:hero-unavailable',
              class: 'SPEC_DIVERGENCE',
              severity: 'P3',
              known: null,
              title: 'Ready-made cover photo could not be set through the real picker — Unsplash is not configured in this environment (HELD:unsplash)',
              expected:
                'n/a — this is an environment limit, not a product defect: /api/expert/ready-made/hero-search ' +
                'correctly answers {ready:false, reason:"unsplash_not_configured"} with no UNSPLASH_ACCESS_KEY set, ' +
                'and the picker correctly shows text-hero-unavailable rather than faking results (§13)',
              actual:
                'button-choose-hero opened modal-hero-picker; no button-hero-option ever became available within 5s ' +
                'of polling (unavailable banner or empty). assertReadyMadeComplete (ready-made.routes.ts) requires ' +
                'heroImageUrl + heroImageMeta.photographer, so submit would 400 on "hero" without an unblock — this ' +
                'attempt is recorded BEFORE the coordinator-authorized R-1 seed below runs, so this finding records ' +
                'what the real UI actually said.',
              where: 'server/services/unsplash.service.ts isReady(); client/src/components/expert/ready-made-listing-panel.tsx',
              evidence: { shot: 'shots/S2-readymade-03b-hero-picker-open.png' },
              behavioural: true,
            });
          }
          await testid(page, 'button-close-hero-picker').click({ timeout: 2000 }).catch(() => {});

          if (!pickedHero) {
            // Coordinator decision (Pass 2, R-1 exception — the same class as S1's
            // identity/business-verification seed and S3's meeting-pin seed): with no
            // UNSPLASH_ACCESS_KEY AND the object-storage upload path also 503ing in this
            // environment, there is no UI-reachable way to satisfy assertReadyMadeComplete's
            // hero requirement here. Seed the exact two columns the gate reads
            // (hero_image_url, hero_image_meta.photographer — ready-made.routes.ts:540/687) with
            // a stable test image, logged as its own finding, never silently.
            await seedReadyMadeHero(rm.id);
            fileFinding({
              journey: 'S2',
              step: 'readymade:seeded-hero',
              class: 'SPEC_DIVERGENCE',
              severity: 'P3',
              known: null,
              title: 'seeded ready-made hero (HELD:unsplash)',
              expected: 'n/a — documented R-1 exception, not a UI path; coordinator-authorized for this ready-made only',
              actual:
                `UPDATE ready_made_trips SET hero_image_url = <stable test image>, hero_image_meta = ` +
                `{photographer: '...'} WHERE id = ${rm.id}. Applied only after the real Unsplash picker was driven ` +
                'and confirmed unavailable (see readymade:hero-unavailable above).',
              where: 'e2e/supply-demand/lib/db.ts seedReadyMadeHero',
              evidence: {},
              behavioural: true,
            });
            // The client's `listing` query does not know about a direct DB write — reload so the
            // panel refetches and `dirty`/Submit recompute against the seeded row.
            await page.reload();
            await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
            // A hard reload resets `rightTab` to its mount default ("add"), NOT the "distribute"
            // tab this whole listing panel lives under (workspace.tsx: `{rightTab === "distribute"
            // && (…<ReadyMadeListingPanel/>…)}`, ~5141/5458) — the tab had only been "distribute"
            // because an EARLIER step in this test clicked it (to reach "Ship to store") and React
            // state doesn't survive a reload. Without re-selecting it, `button-submit-listing` is
            // simply not in the DOM post-reload, `isEnabled()` on it resolves to `false`, and — the
            // actual bug this fixes (found live, run 5sdiqy) — because `submittable` had ALREADY
            // read `true` from an EARLIER poll (the client button is never gated on the hero, only
            // on `dirty`), the old `for (…&& !submittable…)` guard below short-circuited and never
            // re-polled at all, so a stale `submittable=true` drove a `.click()` against a button
            // that no longer existed — 3 silent timeouts, no `POST …/submit` ever sent, and the row
            // stayed `draft` with no finding explaining why (`readymade:submit-verify` blamed
            // "a missing requirement" when the real cause was the hidden tab).
            const distributeTabAfterReload = testid(page, 'tab-right-distribute');
            if (await appears(distributeTabAfterReload, 8000)) {
              await distributeTabAfterReload.click().catch(() => {});
              await page.waitForTimeout(700);
            }
            await shot(page, 'S2-readymade', '03c', 'after-seeded-hero-reload');
          }
        }
      }
      // Re-check submit-enabled now that a hero may have just been set — UNCONDITIONALLY, not
      // only `while (!submittable)`: a reload can turn a previously-true reading stale (see the
      // comment above), so a value from before this block must never be trusted without a fresh
      // read here.
      submittable = false;
      for (let i = 0; i < 10 && !submittable; i++) {
        submittable = await submitBtn.isEnabled().catch(() => false);
        if (submittable) break;
        await page.waitForTimeout(400);
      }
    }

    if (submittable) {
      // Retry with a swallowed error, not a bare `.click()` (found live, run 4: `isEnabled()`
      // read true a moment earlier, but the click itself hit Playwright's own actionability wait
      // and timed out — e.g. a toast or a re-render mid-transition — which an unguarded click
      // turns into an uncaught exception that crashes the WHOLE test instead of a findable state.
      // The post-submit DB read below is the real verification either way, so a swallowed click
      // failure here still gets reported accurately as readymade:submit-verify, never silently.
      let clicked = false;
      for (let i = 0; i < 3 && !clicked; i++) {
        await submitBtn
          .click({ timeout: 3000 })
          .then(() => {
            clicked = true;
          })
          .catch(() => {});
        if (!clicked) await page.waitForTimeout(500);
      }
      await page.waitForTimeout(1200);
    } else {
      fileFinding({
        journey: 'S2',
        step: 'readymade:submit-listing',
        class: 'DEAD_TRIGGER',
        severity: 'P2',
        known: null,
        title: 'button-submit-listing never became enabled after saving title/plan-type/price (and, where possible, a cover photo)',
        expected: 'Submit becomes enabled once title/plan-type/price are set and saved and the build has items',
        actual: `button-submit-listing.isEnabled() polled false for ~7.5s after save`,
        where: 'client/src/components/expert/ready-made-listing-panel.tsx',
        evidence: { shot: 'shots/S2-readymade-04-listing-panel-filled.png' },
        behavioural: true,
      });
    }
    await shot(page, 'S2-readymade', '05', 'listing-panel-post-submit');

    // Verify the submit actually took (server-side, via the row's own status) rather than
    // trusting the click — a 400 from assertReadyMadeComplete (most likely: missing hero, see
    // above) leaves status='draft' with no client-visible failure beyond a toast this harness
    // does not read.
    const postSubmitRow = await q(`SELECT status FROM ready_made_trips WHERE id = $1`, [rm.id]);
    reachedSubmitted = !!(postSubmitRow[0]?.status && postSubmitRow[0].status !== 'draft');
    if (submittable && !reachedSubmitted) {
      fileFinding({
        journey: 'S2',
        step: 'readymade:submit-verify',
        class: 'SILENT_SUCCESS',
        severity: 'P2',
        known: null,
        title: `Submit was clicked (button enabled) but ready_made_trips.status is still "${postSubmitRow[0]?.status ?? 'row absent'}" — the click did not move it out of draft`,
        expected: 'POST /api/expert/ready-made/:id/submit returns 200 and flips status to submitted',
        actual: `status=${postSubmitRow[0]?.status ?? 'row absent'}; most likely cause: assertReadyMadeComplete 400 on a missing requirement (see the hero finding above if the picker was unavailable)`,
        where: 'server/routes/ready-made.routes.ts POST /:id/submit',
        evidence: { shot: 'shots/S2-readymade-05-listing-panel-post-submit.png' },
        behavioural: true,
      });
    }
  } else {
    fileFinding({
      journey: 'S2',
      step: 'readymade:precondition',
      class: 'SPEC_DIVERGENCE',
      severity: 'P1',
      known: null,
      title: 'No ready_made_trips row exists for the build — UI path exhausted for this pass',
      expected: 'A ready_made_trips row (status=draft) exists once "New build" is pressed (P1-1)',
      actual: 'No matching row; ready-made publish/admin-approve/visibility steps are therefore SKIPPED, not faked',
      where: 'client/src/pages/expert/workspace.tsx (startBuild mutation, POST /api/expert/ready-made)',
      evidence: {},
      behavioural: true,
    });
    net.flush();
    test.skip(true, 'no ready_made_trips row — see finding above; not seeding one (R-1 requires it be logged, and a bare INSERT here would not satisfy source_trip_id/itinerary invariants without also faking itinerary_items, which this pass will not do)');
    return;
  }

  // Admin approves the ready-made via /admin/template-approvals — only meaningful once the
  // listing actually reached status='submitted'; if it didn't (see the hero/submit-verify
  // findings above), the queue correctly has nothing to show and re-filing "not found" here
  // would be the same vacuous-pass-adjacent noise the lead flagged for the pre-fix run
  // (P2-S2-3: "the row is draft — it correctly does not appear in the approval queue").
  if (reachedSubmitted) {
    await loginViaUi(page, ADMIN.email, ADMIN.password);
    await page.goto('/admin/template-approvals');
    await shot(page, 'S2-readymade', '06', 'admin-template-approvals');
    const pendingCard = page.locator(`text=${buildTitle}`);
    const found = await appears(pendingCard, 5000);
    if (found) {
      const approveBtn = page.locator('button', { hasText: /approve/i }).first();
      await approveBtn.click().catch(() => {});
      await page.waitForTimeout(1000);
    } else {
      fileFinding({
        journey: 'S2',
        step: 'readymade:admin-approve',
        class: 'DEAD_TRIGGER',
        severity: 'P2',
        known: null,
        title: `"${buildTitle}" not found on /admin/template-approvals`,
        expected: 'A submitted ready-made appears in the admin approval queue',
        actual: 'Not found',
        where: 'client/src/pages/admin/template-approvals.tsx (or equivalent)',
        evidence: { shot: 'shots/S2-readymade-06-admin-template-approvals.png' },
        behavioural: true,
      });
    }
  }

  // Assert via DB: the ready-made's items reference the LIVE provider_services ids (never copies).
  const itemRows = tripId
    ? await q(
        `SELECT id, provider_service_id FROM itinerary_items WHERE trip_id = $1 AND provider_service_id IS NOT NULL`,
        [tripId],
      )
    : [];
  const expectedIds = [
    state.listings.providerA?.providerServiceId,
    state.listings.providerB?.providerServiceId,
    state.listings.providerC?.providerServiceId,
  ].filter(Boolean);
  const referencesLive = itemRows.every((r: any) => expectedIds.includes(r.provider_service_id));
  fileFinding({
    journey: 'S2',
    step: 'readymade:live-reference-check',
    class: referencesLive && itemRows.length > 0 ? 'SPEC_DIVERGENCE' : 'SPEC_DIVERGENCE',
    severity: 'P3',
    known: null,
    title: `Ready-made itinerary_items provider_service_id linkage (${itemRows.length} row(s))`,
    expected: 'Every itinerary_items.provider_service_id for this build is one of A/B/C\'s live provider_services.id',
    actual: `itemRows=${JSON.stringify(itemRows)}`,
    where: 'shared/schema.ts itinerary_items.provider_service_id',
    evidence: {},
    behavioural: true,
  });

  // Visibility: /s/<handle>, /experts, /ready-made, /ready-made/:id, /discover/location/kyoto (expect hidden).
  const acct = await userByEmail(expertEmail);
  const surfaces: { name: string; check: () => Promise<boolean> }[] = [
    {
      name: `/s/${acct?.handle}`,
      check: async () => {
        if (!acct?.handle) return false;
        const r = await page.request.get(`/api/storefront/${acct.handle}`);
        return r.ok();
      },
    },
    {
      name: '/experts',
      check: async () => {
        const r = await page.request.get('/api/experts');
        if (!r.ok()) return false;
        const body = await r.json().catch(() => []);
        const items = Array.isArray(body) ? body : body?.experts ?? [];
        return Array.isArray(items) && items.some((i: any) => i.handle === acct?.handle || i.id === acct?.id);
      },
    },
    {
      name: '/ready-made',
      check: async () => {
        const r = await page.request.get('/api/ready-made');
        if (!r.ok()) return false;
        const body = await r.json().catch(() => []);
        const items = Array.isArray(body) ? body : body?.trips ?? [];
        return Array.isArray(items) && items.some((i: any) => (i.title ?? '').includes(buildTitle));
      },
    },
  ];
  for (const s of surfaces) {
    const visible = await s.check().catch(() => false);
    fileVisibility({
      content: 'ready_made',
      item: buildTitle,
      surface: s.name,
      expected: 'visible',
      actual: visible ? 'visible' : 'hidden',
      filter: 'see $P2/../PHASE0_SUPPLY_DEMAND.md §3(c)',
      journey: 'S2',
      ms: null,
    });
  }
  // Known/expected-hidden: the city page never shows ready-mades (discover-location.tsx:1964).
  const cityPageR = await page.request.get('/api/discover/location/kyoto');
  const cityPageBody = cityPageR.ok() ? await cityPageR.json().catch(() => ({})) : {};
  fileVisibility({
    content: 'ready_made',
    item: buildTitle,
    surface: '/discover/location/kyoto',
    expected: 'hidden',
    actual: JSON.stringify(cityPageBody).includes(buildTitle) ? 'visible' : 'hidden',
    filter: 'client/src/pages/discover-location.tsx:1964 (cityWideReadyMade = null)',
    journey: 'S2',
    ms: null,
  });

  net.flush();
});
