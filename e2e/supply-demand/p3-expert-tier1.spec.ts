/**
 * p3-expert-tier1.spec.ts — Pass 3 batch 1, deliverable 2: the five expert Tier-1 rows of
 * docs/audits/action-effect.json that no supply/demand spec drove, each through the real UI with
 * DB assertions on both sides.
 *
 *   T1  expert-handle:button-claim-handle          (HandleClaimCard on /expert/settings)
 *   T2  expert-quotes:button-withdraw-quote        (SellerQuotesPanel on /expert/catalog)
 *   T3  expert-completion:button-declare-complete  (SellerCompletionPanel, /expert/inbox?tab=history)
 *   T4  expert-inbox:button-confirm-decline        (decline dialog, /expert/inbox queue)
 *   T5  expert-inbox:button-claim-pooled-request   (AgentBookingRequestsSection, /expert/inbox queue)
 *
 * Seeding (R-1): only what has NO UI path in this environment is written directly, and every such
 * write is filed as a P3 SPEC_DIVERGENCE naming the missing path — the two service_bookings rows
 * (T3 confirmed, T4 pending), because no client surface can birth a service_booking without a
 * Stripe PaymentIntent (the only non-Stripe request rail, POST /api/expert-booking-requests, has no
 * client caller that sends a serviceId). Everything else — accounts, the custom-quote listing, the
 * quote request, the pooled booking-agent request — is created through the product's own UI.
 */
import { test, expect, type Page } from '@playwright/test';
import { E2E_PASSWORD, RUN_ID, e2eEmail, e2eHandle, e2eTitle } from './lib/run-id';
import { loginViaUi, signupViaUi } from './lib/accounts';
import {
  applyAsExpert,
  adminApproveExpertApplication,
  adminApproveService,
  createListingBasics,
  selectByTrigger,
  walkServiceFormToReview,
  submitListingForReview,
} from './lib/flows';
import { q, userByEmail, serviceByTitle, feeBand, seedMeetingPin, closeDb } from './lib/db';
import { readState, writeState } from './lib/state';
import { testid, appears } from './lib/ui';
import { shot3, netLogger3, dbStep, file3 } from './lib/p3';

test.describe.configure({ mode: 'serial' });

const ADMIN = { email: 'ci-admin@traveloure.test', password: 'CITestAdmin!99' };

async function settle(page: Page, ms = 800) {
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(ms);
}

async function must(page: Page, j: string, id: string, nn: string, timeoutMs = 10_000) {
  const loc = testid(page, id);
  if (!(await appears(loc, timeoutMs))) {
    await shot3(page, j, nn, `MISSING-${id.slice(0, 60)}`);
    throw new Error(`${j} step ${nn}: [data-testid="${id}"] did not appear within ${timeoutMs}ms`);
  }
  return loc;
}

function preconditions() {
  const s = readState();
  return {
    expertE: s.accounts.expertE,
    expertListing: s.listings.expertOffering,
  };
}

/** A traveler for these rows: L1's when it ran, else a fresh signup (both through the UI). */
async function travelerFor(page: Page): Promise<{ email: string; id: string }> {
  const s = readState();
  if (s.accounts.tlife?.email) {
    const u = await userByEmail(s.accounts.tlife.email);
    if (u) return { email: s.accounts.tlife.email, id: u.id };
  }
  const email = e2eEmail('ttier1');
  await signupViaUi(page, { email, firstName: 'E2E', lastName: 'TTier1' });
  const u = await userByEmail(email);
  writeState((st) => {
    st.accounts.ttier1 = { email, userId: u.id };
  });
  return { email, id: u.id };
}

/**
 * The one seeded write in this file (R-1). `status` is 'confirmed' (T3) or 'pending' (T4); the
 * PaymentIntent column stays NULL (never a fabricated id — §19a) and the fee split is computed from
 * a fee_bands row read at test time (R-2), never a literal.
 */
async function seedBooking(opts: {
  serviceId: string;
  travelerId: string;
  providerId: string;
  status: 'confirmed' | 'pending';
  note: string;
}): Promise<{ id: string; band: string; rate: string; total: number }> {
  const svc = (await q(`SELECT price FROM provider_services WHERE id = $1`, [opts.serviceId]))[0];
  const band = await feeBand('moderate');
  const total = Number(svc?.price ?? 0);
  const fee = Math.round(total * Number(band.defaultRate) * 100) / 100;
  const earn = Math.round((total - fee) * 100) / 100;
  const rows = await q(
    `INSERT INTO service_bookings
       (id, service_id, traveler_id, provider_id, status, total_amount, platform_fee, provider_earnings,
        stripe_payment_intent_id, confirmed_at, booking_details, source)
     VALUES (gen_random_uuid()::text, $1, $2, $3, $4::text, $5, $6, $7, NULL,
             CASE WHEN $4::text = 'confirmed' THEN NOW() ELSE NULL END, $8::jsonb, 'direct')
     RETURNING id`,
    [opts.serviceId, opts.travelerId, opts.providerId, opts.status, total, fee, earn,
     JSON.stringify({ notes: opts.note })],
  );
  return { id: rows[0].id, band: band.bandKey, rate: band.defaultRate, total };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
test('T1 expert-handle:button-claim-handle — a new expert claims a handle through HandleClaimCard', async ({ page }) => {
  test.setTimeout(6 * 60_000);
  const J = 'T1';
  const net = netLogger3(page, J);
  const email = e2eEmail('experth');
  const handle = e2eHandle('hcard');
  await signupViaUi(page, { email, firstName: 'E2E', lastName: 'ExpertH' });
  // No handle passed to the application wizard — the optional last-step claim is skipped, so the
  // card is the ONLY place this expert claims one.
  const applied = await applyAsExpert(page, { firstName: 'E2E', lastName: 'ExpertH', email, city: 'Kyoto', country: 'Japan' });
  expect(applied.reachedFinalStep, `expert application wizard (stopped at ${applied.stoppedAtStep})`).toBeTruthy();
  await loginViaUi(page, ADMIN.email, ADMIN.password);
  expect(await adminApproveExpertApplication(page, email), 'admin approves the application').toBeTruthy();
  const acct = await userByEmail(email);
  expect(acct?.role && acct.role !== 'user', `users.role flipped (${acct?.role})`).toBeTruthy();
  expect(acct.handle ?? null, 'no handle before the card is used').toBeNull();
  writeState((s) => {
    s.accounts.expertH = { email, userId: acct.id };
  });

  await loginViaUi(page, email, E2E_PASSWORD);
  // The expert's public profile BEFORE a handle exists (the legacy by-id read, which waives the
  // inventory gate for a handle-less expert — storefront.routes.ts:964-971).
  const byIdBefore = (await page.request.get(`/api/storefront/by-id/${acct.id}`)).status();
  await page.goto('/expert/settings');
  await settle(page, 1200);
  await must(page, J, 'card-handle-claim', '01', 12_000);
  await shot3(page, J, '01', 'settings-card-before');
  const d = await dbStep(J, '02', 'claim handle: users.handle', `SELECT id, handle FROM users WHERE id = $1`, [acct.id]);
  await (await must(page, J, 'input-handle', '02')).fill(handle);
  await (await must(page, J, 'button-save-handle', '02b')).click();
  await settle(page, 1200);
  await shot3(page, J, '02', 'settings-card-after-save');
  const after = await d.after();
  expect(after[0].handle).toBe(handle);
  expect(net.find('/api/me/handle', 'PATCH').some((e) => e.status < 300)).toBeTruthy();
  const urlText = (await appears(testid(page, 'text-storefront-url'), 5000))
    ? await testid(page, 'text-storefront-url').innerText()
    : null;
  expect(urlText ?? '').toContain(`/s/${handle}`);

  // Downstream readers: the public storefront on the new handle, and the by-id profile.
  const apiRes = await page.request.get(`/api/storefront/${handle}`);
  const byIdAfter = (await page.request.get(`/api/storefront/by-id/${acct.id}`)).status();
  const approvedListings = (await q(
    `SELECT count(*)::int AS n FROM provider_services WHERE user_id = $1 AND approval_status = 'approved' AND status = 'active'`,
    [acct.id],
  ))[0].n;
  await page.goto(`/s/${handle}`);
  await settle(page, 1200);
  await shot3(page, J, '03', 'public-storefront');
  file3({
    id: 'P3-T1-CLAIM-HANDLE',
    journey: J,
    step: 'claim handle through the card',
    class: 'SPEC_DIVERGENCE',
    severity: after[0].handle === handle ? 'PASS' : 'P1',
    known: null,
    title: `HandleClaimCard writes users.handle=${after[0].handle} (PATCH /api/me/handle 2xx) and the card shows /s/${handle}`,
    expected: 'PATCH /api/me/handle 2xx writes users.handle; the card shows /s/<handle>',
    actual: `users.handle=${after[0].handle}; card url text=${JSON.stringify(urlText)}`,
    where: 'client/src/components/backoffice/handle-claim-card.tsx:109; server/routes/storefront.routes.ts:95',
    evidence: { shot: 'pass3/shots/T1-02-settings-card-after-save.png', net: net.ref, db: d.ref },
    behavioural: true,
  });
  const profileLost = byIdBefore === 200 && byIdAfter === 404 && apiRes.status() === 404;
  file3({
    id: 'P3-T1-HANDLE-HIDES-PROFILE',
    journey: J,
    step: 'claim handle: public profile',
    class: 'INVISIBLE_RESULT',
    severity: profileLost ? 'P2' : apiRes.status() === 200 ? 'PASS' : 'P3',
    known: null,
    title: profileLost
      ? 'Claiming a handle before any listing is approved takes an approved expert\'s public profile OFFLINE: by-id 200 → 404, and the new /s/<handle> link the card offers is "Storefront not found"'
      : `Storefront after claim: /api/storefront/${handle} → ${apiRes.status()}, by-id ${byIdBefore} → ${byIdAfter}`,
    expected:
      'The card promises "One public link that lists your approved offerings" and offers Open/Copy for it. Claiming the link should not make the ' +
      'expert less visible than before; at minimum the card should say the link is dark until an offering is approved (§13).',
    actual:
      `approved+active listings=${approvedListings}; GET /api/storefront/by-id/${acct.id}: before=${byIdBefore}, after=${byIdAfter}; ` +
      `GET /api/storefront/${handle}=${apiRes.status()}. loadStorefrontById waives the inventory gate ONLY while users.handle IS NULL ` +
      '(storefront.routes.ts:970 `waiveInventoryGates = !owner.handle && isExpertRole`), so the act of claiming removes the waiver; ' +
      'the /s/:handle page then renders "Storefront not found … the owner has no bookable offerings yet" (T1-03). The card says nothing about this.',
    where: 'server/routes/storefront.routes.ts:964-971, 600-620; client/src/components/backoffice/handle-claim-card.tsx:85-160',
    evidence: { shot: 'pass3/shots/T1-03-public-storefront.png', net: net.ref },
    behavioural: true,
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
test('T2 expert-quotes:button-withdraw-quote — request → issue → withdraw a custom quote', async ({ page }) => {
  test.setTimeout(10 * 60_000);
  const J = 'T2';
  const { expertE } = preconditions();
  test.skip(!expertE?.email, 'S2 did not persist Expert E');
  const net = netLogger3(page, J);
  const expert = await userByEmail(expertE.email);
  const title = e2eTitle('Kyoto Bespoke Quote Planning');

  // 1. Expert E builds a custom-quote listing through the wizard (same recipe as S2's offering).
  await loginViaUi(page, expertE.email, E2E_PASSWORD);
  await createListingBasics(page, {
    role: 'expert',
    title,
    expertOfferingTypeKey: 'itinerary_2nd_opinion',
    expertCategoryName: 'Tours & Experiences',
    deliveryMethod: 'in-person',
    description: `Custom-quoted Kyoto planning — e2e P3 T2 fixture (run ${RUN_ID}).`,
  });
  await selectByTrigger(page, 'select-price-type', 'custom quote');
  await page.waitForTimeout(300);
  const quoteNote = await appears(testid(page, 'text-custom-quote-note'), 3000);
  await shot3(page, J, '01', 'wizard-custom-quote-selected');
  expect(quoteNote, 'price type switched to custom quote').toBeTruthy();
  await (await must(page, J, 'button-save-draft', '01b')).click();
  await settle(page, 1200);
  const draft = await serviceByTitle(title);
  expect(draft?.id, 'draft row').toBeTruthy();
  // Same R-1 meeting-pin class S1/S2 already filed once for the run (map click-to-place is not
  // headless-reliable) — reused, not re-filed.
  await seedMeetingPin(draft.id, 35.0116, 135.7681, 'Meet at the station exit — e2e P3 T2 fixture.');
  await page.goto(`/expert/services/${draft.id}/edit`);
  await settle(page);
  await walkServiceFormToReview(page, 8, { neighborhoodSlug: 'gion' });
  const outcome = await submitListingForReview(page);
  await shot3(page, J, '02', 'wizard-after-submit');
  expect(outcome.submitted, `submit (${outcome.reason ?? ''})`).toBeTruthy();
  await loginViaUi(page, ADMIN.email, ADMIN.password);
  expect(await adminApproveService(page, title), 'admin approves the quote listing').toBeTruthy();
  const listing = (await q(`SELECT id, status, approval_status, price_type, price, booking_mode FROM provider_services WHERE id = $1`, [draft.id]))[0];
  expect(listing.approval_status).toBe('approved');
  expect(listing.price_type).toBe('custom_quote');
  writeState((s) => {
    s.listings.expertQuote = { id: listing.id, title, providerServiceId: listing.id };
  });

  // 2. A traveler asks for a quote on the service page.
  const traveler = await travelerFor(page);
  await loginViaUi(page, traveler.email, E2E_PASSWORD);
  const quoteSql = `SELECT id, status, amount_cents, expires_at, withdrawn_at FROM service_quotes WHERE service_id = $1 ORDER BY created_at`;
  const dReq = await dbStep(J, '03', 'request: service_quotes', quoteSql, [listing.id]);
  await page.goto(`/services/${listing.id}`);
  await settle(page, 1200);
  await shot3(page, J, '03', 'traveler-service-page');
  await (await must(page, J, 'button-request-to-book', '03', 12_000)).click();
  await settle(page, 1200);
  const aReq = await dReq.after();
  expect(aReq.length, 'one service_quotes row requested').toBe(1);
  const quoteId: string = aReq[0].id;
  expect(aReq[0].status).toBe('requested');

  // 3. Expert issues a price, then withdraws it — both from the Catalog's SellerQuotesPanel.
  await loginViaUi(page, expertE.email, E2E_PASSWORD);
  await page.goto('/expert/catalog');
  await settle(page, 1500);
  await must(page, J, `seller-quote-card-${quoteId}`, '04', 12_000);
  await (await must(page, J, `button-open-issue-${quoteId}`, '04b')).click();
  await (await must(page, J, `input-quote-amount-${quoteId}`, '04c')).fill('420');
  await (await must(page, J, `button-issue-quote-${quoteId}`, '04d')).click();
  await settle(page, 1500);
  await shot3(page, J, '04', 'expert-quote-issued');
  const issued = (await q(quoteSql, [listing.id]))[0];
  expect(issued.status).toBe('quoted');
  expect(Number(issued.amount_cents)).toBe(42000);

  // 3b. What the traveler can see of the ISSUED quote (the one they would accept) — My Bookings'
  // Quotes tab is the only mount of TravelerQuotesPanel.
  const travelerView = async (nn: string, slug: string) => {
    await loginViaUi(page, traveler.email, E2E_PASSWORD);
    await page.goto('/my-bookings');
    await settle(page, 1500);
    const tab = testid(page, 'tab-quotes');
    const tabShown = await appears(tab, 8000);
    let badge: string | null = null;
    let acceptButtons = 0;
    if (tabShown) {
      await tab.click();
      await page.waitForTimeout(1000);
      const b = testid(page, `quote-status-${quoteId}`);
      badge = (await appears(b, 8000)) ? (await b.innerText()).trim() : null;
      acceptButtons = await page.locator(`[data-testid="quote-card-${quoteId}"] button`, { hasText: /accept/i }).count();
    }
    const bookingsCount = (await q(`SELECT count(*)::int AS n FROM service_bookings WHERE traveler_id = $1`, [traveler.id]))[0].n;
    // READ-ONLY cross-check through the traveler's own session: what the panel WOULD render.
    const apiQuotes = await page.evaluate(async () => {
      const r = await fetch('/api/me/quotes', { credentials: 'include' });
      return r.ok ? r.json() : { status: r.status };
    });
    const apiRow = (apiQuotes?.quotes ?? []).find((x: any) => x.id === quoteId) ?? null;
    const shotRef = await shot3(page, J, nn, slug);
    return { tabShown, badge, acceptButtons, bookingsCount, apiLifecycle: apiRow?.lifecycle ?? null, shotRef };
  };
  const whileQuoted = await travelerView('04t', 'traveler-my-bookings-while-quoted');
  file3({
    id: 'P3-T2-QUOTE-INVISIBLE-WITHOUT-BOOKINGS',
    journey: J,
    step: 'issued quote: traveler view',
    class: 'INVISIBLE_RESULT',
    severity: whileQuoted.tabShown ? 'PASS' : 'P1',
    known: null,
    title: whileQuoted.tabShown
      ? 'The traveler sees the issued quote on My Bookings → Quotes'
      : 'A traveler with no bookings cannot see or accept an issued quote: My Bookings renders "No bookings yet" and hides the Quotes tab',
    expected:
      "LD 49 surfaces: the traveler's Quotes tab on /my-bookings (TravelerQuotesPanel, its ONLY mount) shows a quoted row with its Accept control — " +
      "my-bookings.tsx's own comment says a quote 'gets its own tab' precisely because it is not a booking.",
    actual:
      `service_quotes row status=quoted (amount_cents=${issued.amount_cents}); GET /api/me/quotes (same session) lifecycle=${whileQuoted.apiLifecycle}; ` +
      `traveler service_bookings=${whileQuoted.bookingsCount}; tab-quotes rendered=${whileQuoted.tabShown}. my-bookings.tsx:424 swaps the WHOLE Tabs ` +
      'block for the "No bookings yet" empty state when bookings and ready-made purchases are both empty, so the Quotes tab — and with it the ' +
      'only Accept control for a quote (TravelerQuotesPanel) — never mounts for a traveler whose first purchase would BE this quote. ' +
      'The quote-born booking (LD 49) therefore cannot be created by that traveler through the UI.',
    where: 'client/src/pages/my-bookings.tsx:424 (empty-state gate) vs :463-466 (Quotes tab) and :507 (TravelerQuotesPanel mount)',
    evidence: { shot: whileQuoted.shotRef, net: net.ref },
    behavioural: true,
  });

  await loginViaUi(page, expertE.email, E2E_PASSWORD);
  await page.goto('/expert/catalog');
  await settle(page, 1500);
  const dW = await dbStep(J, '05', 'withdraw: service_quotes', quoteSql, [listing.id]);
  await (await must(page, J, `button-withdraw-quote-${quoteId}`, '05', 12_000)).click();
  await settle(page, 1500);
  await shot3(page, J, '05', 'expert-quote-withdrawn');
  const aW = await dW.after();
  expect(aW[0].status, 'withdraw flips quoted → withdrawn').toBe('withdrawn');
  expect(aW[0].withdrawn_at).toBeTruthy();
  expect(net.find(`/api/provider/quotes/${quoteId}/withdraw`, 'POST').some((e) => e.status < 300)).toBeTruthy();
  const sellerBadge = (await testid(page, `seller-quote-status-${quoteId}`).innerText().catch(() => '')).trim();
  const withdrawStillShown = await appears(testid(page, `button-withdraw-quote-${quoteId}`), 1500);

  // 4. Downstream: the traveler's side after the withdrawal.
  const afterW = await travelerView('06', 'traveler-my-bookings-after-withdraw');
  expect(afterW.apiLifecycle, "the traveler's own quote read reports the withdrawal").toBe('withdrawn');
  file3({
    id: 'P3-T2-WITHDRAW-QUOTE',
    journey: J,
    step: 'withdraw quote',
    class: 'SPEC_DIVERGENCE',
    severity: !withdrawStillShown && afterW.apiLifecycle === 'withdrawn' ? 'PASS' : 'P2',
    known: null,
    title:
      `Withdraw flips service_quotes ${issued.status}→${aW[0].status} (withdrawn_at set); seller badge "${sellerBadge}", ` +
      `withdraw control gone=${!withdrawStillShown}; traveler read lifecycle=${afterW.apiLifecycle}, Quotes tab rendered=${afterW.tabShown}`,
    expected: "POST /api/provider/quotes/:id/withdraw moves 'quoted' → 'withdrawn'; the seller loses the control; the traveler can no longer accept",
    actual: JSON.stringify({ row: aW[0], sellerBadge, withdrawStillShown, traveler: afterW }),
    where: 'client/src/components/quotes/SellerQuotesPanel.tsx:244; server/routes/service-quotes.routes.ts:174',
    evidence: { shot: 'pass3/shots/T2-05-expert-quote-withdrawn.png', net: net.ref, db: dW.ref },
    behavioural: true,
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
test('T3 expert-completion:button-declare-complete — owner declares a confirmed booking done', async ({ page }) => {
  test.setTimeout(5 * 60_000);
  const J = 'T3';
  const { expertE, expertListing } = preconditions();
  test.skip(!expertE?.email || !expertListing?.id, 'S2 did not persist Expert E / its offering');
  const net = netLogger3(page, J);
  const expert = await userByEmail(expertE.email);
  const traveler = await travelerFor(page);
  const seeded = await seedBooking({
    serviceId: expertListing.id!,
    travelerId: traveler.id,
    providerId: expert.id,
    status: 'confirmed',
    note: `P3 T3 declare-complete fixture (run ${RUN_ID})`,
  });
  file3({
    id: 'P3-T3-SEEDED-CONFIRMED-BOOKING',
    journey: J,
    step: 'seed: confirmed service_booking',
    class: 'SPEC_DIVERGENCE',
    severity: 'P3',
    known: null,
    title: 'seeded confirmed booking (HELD:stripe) — no UI path births a confirmed service_booking without a PaymentIntent',
    expected: 'n/a — R-1 fallback',
    actual:
      `INSERT service_bookings id=${seeded.id} service_id=${expertListing.id} (Expert E's in-person offering) status='confirmed', ` +
      `total=${seeded.total}, split from fee_bands '${seeded.band}' rate=${seeded.rate} (R-2), stripe_payment_intent_id=NULL, ` +
      'no slot and no scheduledDate — so the in-person timer has no date and the owner\'s no-date declare arm applies ' +
      '(booking-completion.service.ts:633-641, routes.ts:7638).',
    where: 'e2e/supply-demand/p3-expert-tier1.spec.ts seedBooking',
    evidence: {},
    behavioural: true,
  });

  const sql = `SELECT id, status, completion_declared_at, completed_at, booking_details->'completionDeclaration' AS declaration
                 FROM service_bookings WHERE id = $1`;
  const earnSql = `SELECT count(*)::int AS n FROM expert_earnings WHERE reference_id = $1`;
  const earnBefore = (await q(earnSql, [seeded.id]).catch(() => [{ n: null }]))[0].n;
  const d = await dbStep(J, '01', 'declare complete: service_bookings', sql, [seeded.id]);
  await loginViaUi(page, expertE.email, E2E_PASSWORD);
  await page.goto('/expert/inbox?tab=history');
  await settle(page, 1500);
  await must(page, J, `inbox-history-${seeded.id}`, '01', 12_000);
  await shot3(page, J, '01', 'expert-history-before-declare');
  await (await must(page, J, `button-declare-complete-${seeded.id}`, '01b')).click();
  await settle(page, 1500);
  await shot3(page, J, '02', 'expert-history-after-declare');
  const after = await d.after();
  expect(after[0].status, 'confirmed → completion_declared').toBe('completion_declared');
  expect(after[0].completion_declared_at).toBeTruthy();
  expect(after[0].completed_at, 'a declaration is not a completion (LD 47)').toBeNull();
  const earnAfter = (await q(earnSql, [seeded.id]).catch(() => [{ n: null }]))[0].n;
  expect(earnAfter, 'declaring mints nothing (LD 47)').toBe(earnBefore);
  const toast = (await page.locator('[data-state="open"]', { hasText: 'Marked as done' }).first().innerText().catch(() => '')).replace(/\s+/g, ' ');
  await page.reload();
  await settle(page, 1500);
  await shot3(page, J, '02b', 'expert-history-after-reload');
  const rowStillListed = await appears(testid(page, `inbox-history-${seeded.id}`), 6000);
  const declaredLine = rowStillListed && (await appears(testid(page, `seller-declared-${seeded.id}`), 3000))
    ? (await testid(page, `seller-declared-${seeded.id}`).innerText()).trim()
    : null;
  const totalTile = (await testid(page, 'stat-total').innerText().catch(() => '')).replace(/\s+/g, ' ');

  await loginViaUi(page, traveler.email, E2E_PASSWORD);
  await page.goto('/my-bookings');
  await settle(page, 1500);
  await shot3(page, J, '03', 'traveler-my-bookings-after-declare');
  const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  // Is the DECLARED booking filed under the Completed tab? (Read the tab's own content, so other
  // bookings this traveler holds cannot make the answer true.)
  let travelerSaysCompleted = false;
  const completedTabBtn = testid(page, 'tab-completed');
  if (await appears(completedTabBtn, 5000)) {
    await completedTabBtn.click();
    await page.waitForTimeout(800);
    const panel = page.locator('[role="tabpanel"][data-state="active"]');
    travelerSaysCompleted = /Completion Declared/i.test(await panel.innerText().catch(() => ''));
    await shot3(page, J, '03b', 'traveler-completed-tab');
  }
  file3({
    id: 'P3-T3-DECLARE-COMPLETE',
    journey: J,
    step: 'declare complete',
    class: 'SPEC_DIVERGENCE',
    severity: after[0].status === 'completion_declared' && earnAfter === earnBefore ? 'PASS' : 'P1',
    known: null,
    title: `Declare complete writes confirmed → ${after[0].status}, completion_declared_at set, no earning minted (${earnBefore}→${earnAfter}); toast "${toast.slice(0, 120)}"`,
    expected: 'POST /api/expert/bookings/:id/complete moves confirmed → completion_declared and mints nothing (LD 47)',
    actual: JSON.stringify({ row: after[0] }),
    where: 'client/src/components/bookings/SellerCompletionPanel.tsx:123; server/routes.ts handleOwnerBookingComplete; server/services/booking-completion.service.ts:960',
    evidence: { shot: 'pass3/shots/T3-02-expert-history-after-declare.png', net: net.ref, db: d.ref },
    behavioural: true,
  });
  file3({
    id: 'P3-T3-DECLARED-VANISHES-FROM-SELLER',
    journey: J,
    step: 'declare complete: seller view',
    class: 'INVISIBLE_RESULT',
    severity: rowStillListed ? 'PASS' : 'P2',
    known: null,
    title: rowStillListed
      ? 'The declared booking stays on the expert\'s Inbox History with its review-window line'
      : 'Once declared complete, the booking disappears from the expert\'s Inbox entirely — the review-window read-out built for it never renders',
    expected:
      'SellerCompletionPanel (mounted in HistorySection) draws `seller-declared-<id>` — "You marked this done on … The traveler\'s review window closes …" — ' +
      'for a completion_declared row (LD 47 surfaces, ledger 2026-09-17-surfaces-acceptance-completion).',
    actual:
      `row listed after reload=${rowStillListed}; seller-declared line=${JSON.stringify(declaredLine)}; stat tiles "${totalTile}". ` +
      "HistorySection filters by isHistoryBooking (shared/booking-visibility.ts:117-120 = RECORD ∪ CLOSED), and neither list contains " +
      "'completion_declared' (nor 'awaiting_acceptance' / 'partially_completed'), so the row falls out of History while Queue shows only 'pending'. " +
      'The seller keeps the Total count but loses the booking until the window closes and it reads completed.',
    where: 'shared/booking-visibility.ts:63-68,117-120; client/src/pages/expert/inbox.tsx:1153 (history filter), 1260 (SellerCompletionPanel mount)',
    evidence: { shot: 'pass3/shots/T3-02b-expert-history-after-reload.png', db: d.ref },
    behavioural: true,
  });
  file3({
    id: 'P3-T3-TRAVELER-COMPLETED-TAB',
    journey: J,
    step: 'declare complete: traveler view',
    class: 'SPEC_DIVERGENCE',
    severity: travelerSaysCompleted ? 'P2' : 'PASS',
    known: null,
    title: travelerSaysCompleted
      ? 'My Bookings files a completion_declared booking under "Completed (n)" while its own badge says "Completion Declared" and the review window is open'
      : 'My Bookings does not count the declared booking as Completed',
    expected: 'LD 47: "\'Completed\' is never rendered before the window closes."',
    actual:
      `tabs text: ${JSON.stringify((body.match(/All \(\d+\).*?Quotes/) ?? [''])[0])}. my-bookings.tsx:405-407 puts every status outside ` +
      "PENDING_STATUSES ['pending','payment_pending'] and ACTIVE_STATUSES ['confirmed','in_progress'] into the Completed tab, so " +
      "'completion_declared' is counted as Completed; the card itself (T3-03) correctly says \"Your review window closes …\".",
    where: 'client/src/pages/my-bookings.tsx:168-170, 399-407',
    evidence: { shot: 'pass3/shots/T3-03b-traveler-completed-tab.png' },
    behavioural: true,
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
test('T4 expert-inbox:button-confirm-decline — expert declines a pending booking with a reason', async ({ page }) => {
  test.setTimeout(5 * 60_000);
  const J = 'T4';
  const { expertE, expertListing } = preconditions();
  test.skip(!expertE?.email || !expertListing?.id, 'S2 did not persist Expert E / its offering');
  const net = netLogger3(page, J);
  const expert = await userByEmail(expertE.email);
  const traveler = await travelerFor(page);
  const seeded = await seedBooking({
    serviceId: expertListing.id!,
    travelerId: traveler.id,
    providerId: expert.id,
    status: 'pending',
    note: `P3 T4 decline fixture (run ${RUN_ID})`,
  });
  file3({
    id: 'P3-T4-SEEDED-PENDING-BOOKING',
    journey: J,
    step: 'seed: pending service_booking',
    class: 'SPEC_DIVERGENCE',
    severity: 'P3',
    known: null,
    title: 'seeded pending booking request — no client surface births one (POST /api/expert-booking-requests has no caller that sends a serviceId)',
    expected: 'n/a — R-1 fallback',
    actual:
      `INSERT service_bookings id=${seeded.id} status='pending', stripe_payment_intent_id=NULL, fee_bands '${seeded.band}' rate=${seeded.rate}. ` +
      'This is the exact shape routes.ts:2067-2083 births for a storefront request with a serviceId; ' +
      'grep shows the three client callers (itinerary.tsx:222, itinerary-comparison.tsx:830, PlanningContext) never send one.',
    where: 'server/routes.ts:1957-2083; client/src/pages/itinerary.tsx:222; client/src/pages/itinerary-comparison.tsx:830',
    evidence: {},
    behavioural: false,
  });

  const sql = `SELECT id, status, cancelled_at, cancellation_reason FROM service_bookings WHERE id = $1`;
  const d = await dbStep(J, '01', 'confirm decline: service_bookings', sql, [seeded.id]);
  await loginViaUi(page, expertE.email, E2E_PASSWORD);
  await page.goto('/expert/inbox');
  await settle(page, 1500);
  await must(page, J, `inbox-booking-${seeded.id}`, '01', 12_000);
  await shot3(page, J, '01', 'expert-queue-pending-booking');
  await (await must(page, J, `button-decline-booking-${seeded.id}`, '01b')).click();
  const reason = `Fully booked that week — e2e ${RUN_ID}`;
  await (await must(page, J, 'input-decline-reason', '01c')).fill(reason);
  await shot3(page, J, '02', 'expert-decline-dialog');
  await (await must(page, J, 'button-confirm-decline', '01d')).click();
  await settle(page, 1500);
  await shot3(page, J, '03', 'expert-after-decline');
  const after = await d.after();
  expect(after[0].status, 'pending → cancelled').toBe('cancelled');
  expect(after[0].cancellation_reason).toBe(reason);
  expect(after[0].cancelled_at).toBeTruthy();
  expect(net.find(`/api/expert/bookings/${seeded.id}/status`, 'PATCH').some((e) => e.status < 300)).toBeTruthy();
  const goneFromQueue = !(await appears(testid(page, `inbox-booking-${seeded.id}`), 2000));

  await loginViaUi(page, traveler.email, E2E_PASSWORD);
  await page.goto('/my-bookings');
  await settle(page, 1500);
  await shot3(page, J, '04', 'traveler-my-bookings-after-decline');
  const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  const reasonShown = body.includes('Fully booked that week');
  const notif = await q(
    `SELECT type, title, message FROM notifications WHERE user_id = $1 AND created_at >= NOW() - interval '5 minutes' AND (message ILIKE '%declin%' OR title ILIKE '%declin%' OR title ILIKE '%cancel%')`,
    [traveler.id],
  );
  file3({
    id: 'P3-T4-CONFIRM-DECLINE',
    journey: J,
    step: 'confirm decline',
    class: 'INVISIBLE_RESULT',
    severity: reasonShown ? 'PASS' : 'P3',
    known: null,
    title: `Decline writes status=cancelled + cancellation_reason; expert queue cleared=${goneFromQueue}; traveler sees the reason=${reasonShown}; traveler notifications=${notif.length}`,
    expected: 'action-effect row downstream reader: "traveler sees the booking cancelled on My Bookings, with the decline reason where surfaced"',
    actual: JSON.stringify({ row: after[0], goneFromQueue, reasonShown, notif }),
    where: 'client/src/pages/expert/inbox.tsx:174-181,277; server/routes.ts:7234 handleOwnerBookingStatus; client/src/pages/my-bookings.tsx',
    evidence: { shot: 'pass3/shots/T4-04-traveler-my-bookings-after-decline.png', net: net.ref, db: d.ref },
    behavioural: true,
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
test('T5 expert-inbox:button-claim-pooled-request — traveler asks the booking agent, expert claims it', async ({ page }) => {
  test.setTimeout(5 * 60_000);
  const J = 'T5';
  const { expertE } = preconditions();
  test.skip(!expertE?.email, 'S2 did not persist Expert E');
  const net = netLogger3(page, J);
  const expert = await userByEmail(expertE.email);
  const traveler = await travelerFor(page);
  const sql = `SELECT id, status, expert_id, partner_name, item_name FROM affiliate_booking_requests WHERE user_id = $1 ORDER BY created_at`;

  // 1. Traveler requests a partner booking through the booking-agent rail (12Go on /transportation).
  await loginViaUi(page, traveler.email, E2E_PASSWORD);
  const dReq = await dbStep(J, '01', 'agent request: affiliate_booking_requests', sql, [traveler.id]);
  await page.goto('/transportation');
  await settle(page, 1200);
  await (await must(page, J, 'button-twelve-go-agent-book', '01', 12_000)).click();
  await settle(page, 1500);
  await shot3(page, J, '01', 'traveler-12go-agent-requested');
  const aReq = await dReq.after();
  const fresh = aReq.filter((r) => !dReq.before.some((b) => b.id === r.id));
  expect(fresh.length, 'one new pooled request').toBe(1);
  const reqId: string = fresh[0].id;
  expect(fresh[0].expert_id, 'born unclaimed (LD 44 assignment-is-claimed)').toBeNull();

  // 2. Expert claims it from the pooled queue.
  const byId = `SELECT id, status, expert_id FROM affiliate_booking_requests WHERE id = $1`;
  const d = await dbStep(J, '02', 'claim: affiliate_booking_requests.expert_id', byId, [reqId]);
  await loginViaUi(page, expertE.email, E2E_PASSWORD);
  await page.goto('/expert/inbox');
  await settle(page, 1500);
  await must(page, J, `inbox-agent-booking-${reqId}`, '02', 12_000);
  const badgeBefore = (await testid(page, `badge-claim-${reqId}`).innerText().catch(() => '')).trim();
  await shot3(page, J, '02', 'expert-pool-before-claim');
  await (await must(page, J, `button-claim-${reqId}`, '02b')).click();
  await settle(page, 1500);
  await shot3(page, J, '03', 'expert-after-claim');
  const after = await d.after();
  expect(after[0].expert_id, 'claim stamps the session expert').toBe(expert.id);
  expect(net.find(`/api/affiliate-booking-requests/${reqId}/claim`, 'POST').some((e) => e.status < 300)).toBeTruthy();
  const badgeAfter = (await testid(page, `badge-claim-${reqId}`).innerText().catch(() => '')).trim();

  // 3. Another expert (the CI seed expert) no longer gets a Claim control for it.
  await loginViaUi(page, 'ci-expert@traveloure.test', 'CITestExpert!99');
  await page.goto('/expert/inbox');
  await settle(page, 1500);
  await shot3(page, J, '04', 'other-expert-pool-after-claim');
  const otherCanClaim = await appears(testid(page, `button-claim-${reqId}`), 2000);
  const otherSees = await appears(testid(page, `inbox-agent-booking-${reqId}`), 2000);
  file3({
    id: 'P3-T5-CLAIM-POOLED',
    journey: J,
    step: 'claim pooled request',
    class: 'SPEC_DIVERGENCE',
    severity: !otherCanClaim && badgeAfter !== badgeBefore ? 'PASS' : 'P2',
    known: null,
    title: `Claim stamps expert_id; badge "${badgeBefore}" → "${badgeAfter}"; a second expert still sees the row=${otherSees}, can claim=${otherCanClaim}`,
    expected: 'POST /api/affiliate-booking-requests/:id/claim sets expert_id=session user atomically; the row stops offering Claim to anyone else',
    actual: JSON.stringify({ row: after[0], badgeBefore, badgeAfter, otherSees, otherCanClaim }),
    where: 'client/src/pages/expert/inbox.tsx:500-590; server/routes/content.routes.ts (claim rail)',
    evidence: { shot: 'pass3/shots/T5-03-expert-after-claim.png', net: net.ref, db: d.ref },
    behavioural: true,
  });
});

test.afterAll(async () => {
  await closeDb();
});
