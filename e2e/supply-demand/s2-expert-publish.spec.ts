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
} from './lib/flows';
import { shot, netLogger } from './lib/evidence';
import { fileFinding, fileVisibility } from './lib/findings';
import { q, userByEmail, serviceByTitle, feeBand } from './lib/db';
import { writeState, readState } from './lib/state';
import { testid } from './lib/ui';

const ADMIN = { email: 'ci-admin@traveloure.test', password: 'CITestAdmin!99' };

test.describe.configure({ mode: 'serial' });

test('S2: Expert E applies, publishes an offering, and is admin-approved', async ({ page }) => {
  const email = e2eEmail('expertE');
  const handle = e2eHandle('expertE');
  const offeringTitle = e2eTitle('Kyoto Custom Itinerary Planning');
  const net = netLogger(page, 'S2-expertE');

  await signupViaUi(page, { email, firstName: 'E2E', lastName: 'ExpertE' });
  await shot(page, 'S2-expertE', '01', 'post-signup');

  await applyAsExpert(page, { firstName: 'E2E', lastName: 'ExpertE', email, city: 'Kyoto', country: 'Japan', handle });
  await shot(page, 'S2-expertE', '02', 'post-application-submit');

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

  // Log in as the expert; create one custom-itinerary offering via ServiceForm.
  await loginViaUi(page, email, E2E_PASSWORD);
  await createListingBasics(page, {
    role: 'expert',
    title: offeringTitle,
    deliveryMethod: 'in-person',
    priceCents: 15000,
    description: `Custom Kyoto itinerary planning — e2e supply-demand fixture (run ${RUN_ID}).`,
  });
  await shot(page, 'S2-expertE', '04', 'offering-basics-filled');
  const stepClicks = await walkServiceFormToReview(page);
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
    const svcApproved = await adminApproveService(page, 'Kyoto Custom Itinerary Planning');
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
      evidence: { shot: 'shots/S2-expertE-05-offering-post-submit.png', net: 'net/S2-expertE.jsonl' },
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

  await page.goto('/expert/workspace');
  await shot(page, 'S2-readymade', '01', 'workspace-landing');

  const newBuildBtn = testid(page, 'button-new-build');
  let usedUiBuild = false;
  let tripId: string | null = null;

  if (await newBuildBtn.isVisible().catch(() => false)) {
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
      if (await titleInput.isVisible().catch(() => false)) {
        await titleInput.fill(buildTitle).catch(() => {});
      }

      // Add A, B, C via the platform Service catalog picker.
      const openPicker = testid(page, 'button-open-service-picker');
      const providerServiceIds = [
        state.listings.providerA?.providerServiceId,
        state.listings.providerB?.providerServiceId,
        state.listings.providerC?.providerServiceId,
      ].filter(Boolean) as string[];

      if (await openPicker.isVisible({ timeout: 5000 }).catch(() => false) && providerServiceIds.length > 0) {
        for (const svcId of providerServiceIds) {
          await openPicker.click().catch(() => {});
          await page.waitForTimeout(500);
          const searchBox = testid(page, 'input-service-picker-search');
          if (await searchBox.isVisible().catch(() => false)) {
            await searchBox.fill('Kyoto').catch(() => {});
            await page.waitForTimeout(600);
          }
          const addBtn = testid(page, `button-service-add-${svcId}`);
          const added = await addBtn.isVisible({ timeout: 4000 }).catch(() => false);
          if (added) {
            await addBtn.click().catch(() => {});
            await page.waitForTimeout(500);
          } else {
            fileFinding({
              journey: 'S2',
              step: `readymade:add-service:${svcId}`,
              class: 'DEAD_TRIGGER',
              severity: 'P2',
              known: null,
              title: `Service-picker did not surface provider_services ${svcId} for the ready-made build`,
              expected: 'Searching "Kyoto" in the service picker surfaces the just-approved listing',
              actual: 'button-service-add-<id> not visible within 4s',
              where: 'client/src/components/expert/service-picker-modal.tsx',
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
          title: 'button-open-service-picker not available, or no A/B/C provider_service ids in state',
          expected: 'The service catalog picker opens and A/B/C are addable',
          actual: `openPicker visible=${await openPicker.isVisible().catch(() => false)}, ids=${providerServiceIds.length}`,
          where: 'client/src/pages/expert/workspace.tsx (button-open-service-picker)',
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

  // Attempt the listing-panel publish step (title/plan type/price/save/submit) if a
  // ready_made_trips row now exists for this trip (created by "New build" per P1-1).
  const rmRows = tripId
    ? await q(`SELECT id, status FROM ready_made_trips WHERE source_trip_id = $1`, [tripId])
    : [];

  if (rmRows.length > 0) {
    const rm = rmRows[0];
    writeState((s) => {
      s.readyMade = { id: rm.id, title: buildTitle };
      s.trips.expertBuild = { id: tripId!, label: buildTitle };
    });

    await testid(page, 'input-listing-title').fill(buildTitle).catch(() => {});
    const planTypeSelect = testid(page, 'select-listing-plan-type');
    if (await planTypeSelect.isVisible().catch(() => false)) {
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
      await page.waitForTimeout(800);
    }

    const submitBtn = testid(page, 'button-submit-listing');
    const submittable = await submitBtn.isEnabled().catch(() => false);
    if (submittable) {
      await submitBtn.click();
      await page.waitForTimeout(1000);
    } else {
      fileFinding({
        journey: 'S2',
        step: 'readymade:submit-listing',
        class: 'DEAD_TRIGGER',
        severity: 'P2',
        known: null,
        title: 'button-submit-listing disabled — the ready-made likely needs a hero photo and/or non-empty days',
        expected: 'Submit becomes enabled once title/plan-type/price are set and the build has items',
        actual: 'button-submit-listing remained disabled',
        where: 'client/src/components/expert/ready-made-listing-panel.tsx',
        evidence: { shot: 'shots/S2-readymade-04-listing-panel-filled.png' },
        behavioural: true,
      });
    }
    await shot(page, 'S2-readymade', '05', 'listing-panel-post-submit');
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

  // Admin approves the ready-made via /admin/template-approvals.
  await loginViaUi(page, ADMIN.email, ADMIN.password);
  await page.goto('/admin/template-approvals');
  await shot(page, 'S2-readymade', '06', 'admin-template-approvals');
  const pendingCard = page.locator(`text=${buildTitle}`);
  const found = await pendingCard.isVisible({ timeout: 5000 }).catch(() => false);
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
  });

  net.flush();
});
