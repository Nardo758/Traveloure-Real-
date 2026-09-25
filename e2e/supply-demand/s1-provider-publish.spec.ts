/**
 * s1-provider-publish.spec.ts — Providers A, B, C: apply → admin-approve
 * → create a listing → (B/C only) publish gate on background check →
 * submit for review → admin-approve → poll every traveler surface from the
 * Phase 0 visibility contract.
 *
 * See docs/audits/pass2/BRIEF.md and $P2/../PHASE0_SUPPLY_DEMAND.md.
 */
import { test, expect, type Page } from '@playwright/test';
import { RUN_ID, e2eEmail, e2eHandle, e2eTitle, E2E_PASSWORD } from './lib/run-id';
import { signupViaUi, loginViaUi } from './lib/accounts';
import {
  applyAsProvider,
  adminApproveProviderApplication,
  adminMarkProviderVerified,
  createListingBasics,
  walkServiceFormToReview,
  submitListingForReview,
  adminApproveService,
} from './lib/flows';
import { shot, netLogger, dbSnapshot } from './lib/evidence';
import { fileFinding, fileVisibility } from './lib/findings';
import { q, userByEmail, serviceByTitle, feeBand } from './lib/db';
import { writeState, readState } from './lib/state';
import { testid } from './lib/ui';

const ADMIN = { email: 'ci-admin@traveloure.test', password: 'CITestAdmin!99' };

type ProviderFixture = {
  key: 'providerA' | 'providerB' | 'providerC';
  businessName: string;
  offeringTypeKey: string;
  categoryKey: string;
  bandKey: string;
  needsBackgroundCheck: boolean;
  listingTitleBase: string;
};

const PROVIDERS: ProviderFixture[] = [
  {
    key: 'providerA',
    businessName: `Kyoto Tea Ceremony Co ${RUN_ID}`,
    offeringTypeKey: 'tea_ceremony_host',
    categoryKey: 'activity_provider',
    bandKey: 'moderate',
    needsBackgroundCheck: false,
    listingTitleBase: 'Traditional Tea Ceremony',
  },
  {
    key: 'providerB',
    businessName: `Arashiyama Bike Tours ${RUN_ID}`,
    offeringTypeKey: 'hidden_gems_guide',
    categoryKey: 'tour_guide',
    bandKey: 'limited',
    needsBackgroundCheck: true,
    listingTitleBase: 'Arashiyama Bamboo Grove Bike & Walking Tour',
  },
  {
    key: 'providerC',
    businessName: `Kyoto Airport Transfers ${RUN_ID}`,
    offeringTypeKey: 'airport_driver',
    categoryKey: 'private_transportation',
    bandKey: 'commercial',
    needsBackgroundCheck: true,
    listingTitleBase: 'Private Airport Transfer',
  },
];

test.describe.configure({ mode: 'serial' });

let filedReturnToFinding = false;

for (const fx of PROVIDERS) {
  test(`S1 ${fx.key}: apply, publish, and become visible`, async ({ page }) => {
    const email = e2eEmail(fx.key);
    const handle = e2eHandle(fx.key);
    const title = e2eTitle(fx.listingTitleBase);
    const net = netLogger(page, `S1-${fx.key}`);

    // The fee band is read at run time (R-2), never a literal.
    const band = await feeBand(fx.bandKey);
    expect(Number(band.defaultRate)).toBeGreaterThan(0);

    // ── 1. Sign up + apply as a provider via the real UI ──────────────────
    await signupViaUi(page, { email, firstName: 'E2E', lastName: fx.key });
    await shot(page, `S1-${fx.key}`, '01', 'post-signup');

    if (!filedReturnToFinding) {
      filedReturnToFinding = true;
      fileFinding({
        journey: 'S1',
        step: `${fx.key}:signup-return-to-hijack`,
        class: 'WRONG_TARGET',
        severity: 'P2',
        known: null,
        title: 'A stale sessionStorage "traveloure_return_to" hijacks the very next full navigation after signup',
        expected:
          'After signup, an explicit page.goto to a chosen URL (e.g. /become-provider) lands there',
        actual:
          'Signup.tsx routes to a protected /dashboard before the auth query re-resolves; ProtectedRoute\'s guard ' +
          'fires once (user still null in the cache), stores sessionStorage.traveloure_return_to="/dashboard" and ' +
          'bounces to "/". AuthReturnToRestorer then replays that stored value on the SESSION\'s next full ' +
          'navigation, silently redirecting it back to /dashboard regardless of where it was headed. Reproduced ' +
          'deterministically outside Playwright with a bare script (signup -> read sessionStorage -> "/dashboard").',
        where: 'client/src/App.tsx: ProtectedRoute useEffect + AuthReturnToRestorer (~lines 218-233, 307-323)',
        evidence: { shot: `shots/S1-${fx.key}-01-post-signup.png` },
        behavioural: true,
      });
    }

    await applyAsProvider(page, {
      businessName: fx.businessName,
      categoryKey: fx.categoryKey,
      email,
      city: 'Kyoto',
      country: 'Japan',
      handle,
    });
    await shot(page, `S1-${fx.key}`, '02', 'post-application-submit');

    const appRow = await q(
      `SELECT id, status FROM service_provider_forms WHERE email = $1 ORDER BY created_at DESC LIMIT 1`,
      [email],
    ).catch(() => [] as any[]);
    if (appRow.length === 0) {
      fileFinding({
        journey: 'S1',
        step: `${fx.key}:apply`,
        class: 'SPEC_DIVERGENCE',
        severity: 'P2',
        known: null,
        title: 'No provider_applications row found after submitting the become-provider form',
        expected: 'A provider_applications row exists with status pending/submitted',
        actual: 'No matching row (selector drift, or a step in the 5-step wizard silently failed to submit)',
        where: 'client/src/pages/services-provider.tsx (button-submit handler)',
        evidence: { shot: `shots/S1-${fx.key}-02-post-application-submit.png` },
        behavioural: true,
      });
    }

    writeState((s) => {
      s.accounts[fx.key] = { email, handle };
    });

    // ── 2. Admin approves the application via /admin/providers ────────────
    await loginViaUi(page, ADMIN.email, ADMIN.password);
    const approved = await adminApproveProviderApplication(page, fx.businessName);
    await shot(page, `S1-${fx.key}`, '03', 'admin-approve-application');
    if (!approved) {
      fileFinding({
        journey: 'S1',
        step: `${fx.key}:admin-approve-application`,
        class: 'DEAD_TRIGGER',
        severity: 'P1',
        known: null,
        title: `Application card for "${fx.businessName}" not found on /admin/providers applications tab`,
        expected: 'A pending application card is listed and approvable',
        actual: 'No matching card',
        where: 'client/src/pages/admin/providers.tsx (Applications tab)',
        evidence: { shot: `shots/S1-${fx.key}-03-admin-approve-application.png` },
        behavioural: true,
      });
    }

    // ── 3. Log in as the provider, create the listing via ServiceForm ─────
    await loginViaUi(page, email, E2E_PASSWORD);
    const beforeListings = await dbSnapshot(
      `SELECT id, service_name AS name, approval_status, status FROM provider_services WHERE service_name = $1`,
      [title],
    );

    await createListingBasics(page, {
      role: 'provider',
      title,
      offeringTypeKey: fx.offeringTypeKey,
      deliveryMethod: 'in-person',
      priceCents: 8000,
      description: `${fx.listingTitleBase} — e2e supply-demand fixture (run ${RUN_ID}).`,
    });
    await shot(page, `S1-${fx.key}`, '04', 'listing-basics-filled');

    const stepClicks = await walkServiceFormToReview(page);
    await shot(page, `S1-${fx.key}`, '05', `listing-review-after-${stepClicks}-clicks`);

    const outcome = await submitListingForReview(page);
    await shot(page, `S1-${fx.key}`, '06', 'listing-post-submit');

    if (outcome.blockedByVerification) {
      // Providers create-and-submit in ONE click (button-publish-service), and that
      // control is disabled until identity + business (Stripe Identity/Connect)
      // verification completes — which cannot happen against the CI stub key. This is
      // a HELD:stripe environment limit, not a UI defect: ServiceForm DOES show the
      // reason (text-provider-publish-verification-note), so it is filed as an
      // informational divergence from the fixture plan's assumption (only B/C were
      // expected to need admin action) rather than a bug.
      fileFinding({
        journey: 'S1',
        step: `${fx.key}:submit-listing`,
        class: 'SPEC_DIVERGENCE',
        severity: 'P1',
        known: null,
        title: `${fx.key}: listing creation blocked pre-submit by identity/business verification, not only the category background-check`,
        expected:
          "Per PHASE0_SUPPLY_DEMAND.md §4, only B/C (requires_background_check categories) need admin action before publish",
        actual: `button-publish-service disabled: "${outcome.reason}". This gates ALL providers (A included), not only the background-check categories — HELD:stripe (Stripe Identity/Connect cannot complete against the CI stub key).`,
        where: 'client/src/components/ServiceForm.tsx:5211-5231 (verificationGateBlocked)',
        evidence: { shot: `shots/S1-${fx.key}-06-listing-post-submit.png` },
        behavioural: true,
      });
      net.flush();
      test.skip(true, `HELD:stripe — ${fx.key} cannot pass the provider identity/business verification gate without real Stripe Identity/Connect keys; see finding above.`);
      return;
    }

    if (!outcome.submitted) {
      fileFinding({
        journey: 'S1',
        step: `${fx.key}:submit-listing`,
        class: 'DEAD_TRIGGER',
        severity: 'P1',
        known: null,
        title: `Could not reach the submit control for "${title}" via the wizard's step-next chain`,
        expected: 'The wizard reaches the review step and submits for approval',
        actual: `Advanced ${stepClicks} step(s); ${outcome.reason ?? 'submit control never became available'}`,
        where: 'client/src/components/ServiceForm.tsx (button-step-next / button-publish-service)',
        evidence: { shot: `shots/S1-${fx.key}-06-listing-post-submit.png` },
        behavioural: true,
      });
      net.flush();
      test.fail(true, `S1 ${fx.key}: submit unreachable — see finding above`);
      return;
    }

    const serviceRow = await serviceByTitle(fx.listingTitleBase + ` [e2e:${RUN_ID}]`);
    if (!serviceRow) {
      fileFinding({
        journey: 'S1',
        step: `${fx.key}:submit-listing`,
        class: 'SPEC_DIVERGENCE',
        severity: 'P1',
        known: null,
        title: `No provider_services row found for "${title}" after wizard walk`,
        expected: 'A provider_services row exists (born approval_status=submitted, migration 111)',
        actual: 'Row absent — either the create call never fired or a required field blocked it silently',
        where: 'server/routes.ts:3835 POST /api/provider/services',
        evidence: { shot: `shots/S1-${fx.key}-06-listing-post-submit.png`, net: `net/S1-${fx.key}.jsonl` },
        behavioural: true,
      });
      net.flush();
      test.fail(true, `S1 ${fx.key}: no provider_services row created — see finding above`);
      return;
    }

    writeState((s) => {
      s.listings[fx.key] = { id: serviceRow.id, title, providerServiceId: serviceRow.id, categoryKey: fx.categoryKey };
    });

    // ── 4. Background-check gate (B/C): assert NOT visible/publishable pre-verification ─
    if (fx.needsBackgroundCheck) {
      await page.goto(`/provider/services/${serviceRow.id}`);
      await shot(page, `S1-${fx.key}`, '07', 'listing-home-pre-verification');
      const statusBadge = testid(page, 'badge-listing-hero-status');
      const statusText = (await statusBadge.textContent().catch(() => '')) ?? '';
      const publicResp = await page.request.get(`/api/services/${serviceRow.id}`);
      const publicVisible = publicResp.status() === 200;

      fileVisibility({
        content: 'service',
        item: title,
        surface: '/api/services/:id (pre-verification)',
        expected: 'hidden',
        actual: publicVisible ? 'visible' : 'hidden',
        filter: 'server/routes/content.routes.ts:2334 (approved+active gate)',
        journey: 'S1',
      });

      if (publicVisible) {
        fileFinding({
          journey: 'S1',
          step: `${fx.key}:pre-verification-visibility`,
          class: 'FALSE_PROMISE',
          severity: 'P1',
          known: null,
          title: `${title} is publicly reachable before its background-check verification is confirmed`,
          expected: 'A requires_background_check listing is hidden from GET /api/services/:id until admin verification',
          actual: `GET /api/services/${serviceRow.id} returned ${publicResp.status()}`,
          where: 'server/routes.ts:3899 (background/insurance publish gate)',
          evidence: { shot: `shots/S1-${fx.key}-07-listing-home-pre-verification.png` },
          behavioural: true,
        });
      }

      // What the provider itself sees in this pending state (status pill / messaging).
      fileFinding({
        journey: 'S1',
        step: `${fx.key}:pre-verification-provider-view`,
        class: statusText.trim() ? 'SPEC_DIVERGENCE' : 'SILENT_SUCCESS',
        severity: 'P3',
        known: null,
        title: `Listing-home status pill for ${fx.key} while awaiting background-check verification`,
        expected: 'A status pill/message explaining the listing is blocked on verification',
        actual: `badge-listing-hero-status text: "${statusText.trim()}"`,
        where: 'client/src/components/ServiceForm.tsx:2311',
        evidence: { shot: `shots/S1-${fx.key}-07-listing-home-pre-verification.png` },
        behavioural: true,
      });

      // Admin confirms the background check.
      await loginViaUi(page, ADMIN.email, ADMIN.password);
      const verified = await adminMarkProviderVerified(page, fx.businessName);
      await shot(page, `S1-${fx.key}`, '08', 'admin-mark-verified');
      if (!verified) {
        fileFinding({
          journey: 'S1',
          step: `${fx.key}:admin-verify`,
          class: 'DEAD_TRIGGER',
          severity: 'P1',
          known: null,
          title: `Could not find/click "Mark Verified" for ${fx.businessName} on /admin/providers platform tab`,
          expected: 'A provider row with a Mark Verified control exists post-approval',
          actual: 'No matching card/control found',
          where: 'client/src/pages/admin/providers.tsx:594 (button-verify-*)',
          evidence: { shot: `shots/S1-${fx.key}-08-admin-mark-verified.png` },
          behavioural: true,
        });
      }
    }

    // ── 5. Admin approves the service listing via /admin/service-approvals ─
    await loginViaUi(page, ADMIN.email, ADMIN.password);
    const submitTime = Date.now();
    const svcApproved = await adminApproveService(page, fx.listingTitleBase);
    await shot(page, `S1-${fx.key}`, '09', 'admin-approve-service');
    const timeToApproveMs = Date.now() - submitTime;

    if (!svcApproved) {
      fileFinding({
        journey: 'S1',
        step: `${fx.key}:admin-approve-service`,
        class: 'DEAD_TRIGGER',
        severity: 'P1',
        known: null,
        title: `No pending-service card for "${title}" on /admin/service-approvals`,
        expected: 'The submitted listing appears in the pending-approval queue',
        actual: 'No matching card',
        where: 'client/src/pages/admin/service-approvals.tsx',
        evidence: { shot: `shots/S1-${fx.key}-09-admin-approve-service.png` },
        behavioural: true,
      });
      net.flush();
      test.fail(true, `S1 ${fx.key}: could not approve listing — see finding above`);
      return;
    }

    // ── 6. Poll every traveler surface from the Phase 0 visibility contract ─
    const surfaces: { name: string; check: () => Promise<boolean> }[] = [
      {
        name: '/services (browse, location=Kyoto)',
        check: async () => {
          const r = await page.request.get(`/api/discover?location=Kyoto`);
          if (!r.ok()) return false;
          const body = await r.json().catch(() => ({}));
          const items = body?.services ?? body?.results ?? body?.items ?? [];
          return Array.isArray(items) && items.some((i: any) => i.id === serviceRow.id || i.name === title);
        },
      },
      {
        name: `/services (browse, categoryKey=${fx.categoryKey})`,
        check: async () => {
          const r = await page.request.get(`/api/discover?categoryKey=${fx.categoryKey}`);
          if (!r.ok()) return false;
          const body = await r.json().catch(() => ({}));
          const items = body?.services ?? body?.results ?? body?.items ?? [];
          return Array.isArray(items) && items.some((i: any) => i.id === serviceRow.id);
        },
      },
      {
        name: '/discover/location/kyoto',
        check: async () => {
          const r = await page.request.get(`/api/discover/location/kyoto`);
          if (!r.ok()) return false;
          const body = await r.json().catch(() => ({}));
          const text = JSON.stringify(body);
          return text.includes(serviceRow.id);
        },
      },
      {
        name: '/services/:id',
        check: async () => {
          const r = await page.request.get(`/api/services/${serviceRow.id}`);
          return r.ok();
        },
      },
      {
        name: 'experience-template picker source (/api/provider-services)',
        check: async () => {
          const r = await page.request.get(`/api/provider-services`);
          if (!r.ok()) return false;
          const body = await r.json().catch(() => []);
          const items = Array.isArray(body) ? body : body?.services ?? [];
          return Array.isArray(items) && items.some((i: any) => i.id === serviceRow.id);
        },
      },
      {
        name: '/providers',
        check: async () => {
          const r = await page.request.get(`/api/provider-storefronts`);
          if (!r.ok()) return false;
          const body = await r.json().catch(() => []);
          const items = Array.isArray(body) ? body : body?.providers ?? [];
          return Array.isArray(items) && items.some((i: any) => i.handle === handle);
        },
      },
    ];

    for (const s of surfaces) {
      const visible = await s.check().catch(() => false);
      fileVisibility({
        content: 'service',
        item: title,
        surface: s.name,
        expected: 'visible',
        actual: visible ? 'visible' : 'hidden',
        filter: 'see $P2/../PHASE0_SUPPLY_DEMAND.md §3(a)',
        journey: 'S1',
      });
      if (!visible) {
        fileFinding({
          journey: 'S1',
          step: `${fx.key}:visibility:${s.name}`,
          class: 'INVISIBLE_RESULT',
          severity: 'P2',
          known: null,
          title: `${title} not visible on ${s.name} after approval`,
          expected: `Listing visible on ${s.name}`,
          actual: 'Not present in response',
          where: 'see $P2/../PHASE0_SUPPLY_DEMAND.md §3(a) for the governing filter',
          evidence: {},
          behavioural: true,
        });
      }
    }

    // Storefront (only if a handle was actually claimed via the UI).
    const acctRow = await userByEmail(email);
    if (acctRow?.handle) {
      const r = await page.request.get(`/api/storefront/${acctRow.handle}`);
      const visible = r.ok();
      fileVisibility({
        content: 'storefront',
        item: title,
        surface: `/s/${acctRow.handle}`,
        expected: 'visible',
        actual: visible ? 'visible' : 'hidden',
        filter: 'server/routes/storefront.routes.ts:600',
        journey: 'S1',
      });
    } else {
      fileFinding({
        journey: 'S1',
        step: `${fx.key}:handle-claim`,
        class: 'SPEC_DIVERGENCE',
        severity: 'P3',
        known: null,
        title: `No handle recorded for ${fx.key} despite entering one at application step 5`,
        expected: 'users.handle set from the application-time handle field',
        actual: 'users.handle is null/absent',
        where: 'client/src/pages/services-provider.tsx:896 (input-public-handle) — ratified as "set up once approved"',
        evidence: {},
        behavioural: true,
      });
    }

    fileFinding({
      journey: 'S1',
      step: `${fx.key}:time-to-visible`,
      class: 'SPEC_DIVERGENCE',
      severity: 'P3',
      known: null,
      title: `Time from submit to admin-approve for ${fx.key}`,
      expected: 'n/a — informational timing record',
      actual: `${timeToApproveMs}ms (harness-driven click latency, not a product SLA)`,
      where: 'e2e/supply-demand/s1-provider-publish.spec.ts',
      evidence: {},
      behavioural: true,
    });

    net.flush();
  });
}
