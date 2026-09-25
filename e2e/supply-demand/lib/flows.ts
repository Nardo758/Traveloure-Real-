/**
 * flows.ts — best-effort UI flows shared by the supply specs (application,
 * admin approval, listing creation via ServiceForm). Written from the real
 * page source (data-testid greps against client/src on 2026-09-25); a step
 * whose selector has drifted is the spec's own job to catch and file as a
 * finding, not to silently skip.
 */
import type { Page } from '@playwright/test';
import { testid, fillIfVisible, clickIfVisible, checkIfVisible } from './ui';

export async function selectByTrigger(page: Page, triggerTestId: string, optionText?: string): Promise<void> {
  await testid(page, triggerTestId).click();
  await page.waitForTimeout(200);
  const options = page.getByRole('option');
  const count = await options.count();
  if (count === 0) return;
  if (optionText) {
    const match = page.getByRole('option', { name: optionText, exact: false });
    if ((await match.count()) > 0) {
      await match.first().click();
      return;
    }
  }
  await options.first().click();
}

/** services-provider.tsx application: 5 steps, `button-next-step` then `button-submit`. */
export async function applyAsProvider(
  page: Page,
  opts: { businessName: string; categoryKey: string; email: string; city?: string; country?: string; handle?: string },
): Promise<void> {
  await page.goto('/become-provider');
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

  // Step 1: Business Info
  await fillIfVisible(page, 'input-business-name', opts.businessName);
  await selectByTrigger(page, 'select-business-type');
  await fillIfVisible(page, 'input-email', opts.email);
  await fillIfVisible(page, 'input-phone', '+81-3-0000-0000');
  await testid(page, 'button-next-step').click();
  await page.waitForTimeout(300);

  // Step 2: Service Categories
  await clickIfVisible(page, `button-category-${opts.categoryKey}`);
  await fillIfVisible(page, 'textarea-description', `${opts.businessName} — e2e supply-demand fixture.`);
  await testid(page, 'button-next-step').click();
  await page.waitForTimeout(300);

  // Step 3: Location & Details
  await fillIfVisible(page, 'input-address', '1 Kyoto Fixture Street');
  await fillIfVisible(page, 'input-city', opts.city ?? 'Kyoto');
  await fillIfVisible(page, 'input-country', opts.country ?? 'Japan');
  await checkIfVisible(page, 'checkbox-insurance');
  await checkIfVisible(page, 'checkbox-license');
  await testid(page, 'button-next-step').click();
  await page.waitForTimeout(300);

  // Step 4: Review + terms
  await checkIfVisible(page, 'checkbox-terms');
  await testid(page, 'button-next-step').click();
  await page.waitForTimeout(300);

  // Step 5: handle claim (optional)
  if (opts.handle) {
    await fillIfVisible(page, 'input-public-handle', opts.handle);
  }
  await testid(page, 'button-submit').click();
  await page.waitForTimeout(1000);
}

/** travel-experts.tsx application: multi-step, ends at `button-submit` (step-handle-claim before it). */
const KNOWLEDGE_PROOF_WORD_BANK = [
  'Head to the small izakaya two streets back from the main shrine gate rather than the row of ' +
    'tourist restaurants right outside it — the queue looks longer everywhere else, but locals ' +
    'know this one turns tables fast and the grilled skewers come off the same charcoal the famous ' +
    'place next door uses, at half the price and none of the photo-taking crowd blocking the counter.',
  'Almost every first-time visitor tries to cram the whole old town into one morning and misses ' +
    'that most shops and the best small museum stay shut until mid-morning — the local move is to ' +
    'start at the hillside overlook at opening time for empty photos, then come back down once the ' +
    'street actually wakes up, rather than arriving early to streets that are still closed.',
  'Two blocks past where the guidebook map stops there is a covered arcade of family-run shops that ' +
    'never shows up in any write-up because it has no single "must-see" anchor — it rewards someone ' +
    'willing to browse slowly, is best for a traveler who already did the highlights and wants a ' +
    'quieter afternoon, and is exactly the kind of place a guidebook photo cannot really capture.',
];

/**
 * travel-experts.tsx: LOCAL EXPERT branch only (`?type=local_expert` — the S2 fixture is
 * explicitly "Expert E, Kyoto local"), 7 gated steps (`canProceed()`'s `isLocalExpert` switch).
 * Fills EXACTLY what each step's own gate requires — not a blind sweep of every field on the
 * page — then advances with `button-next-step`, checking the gate is actually satisfied before
 * each click so a missed field fails fast with a clear step number rather than hanging on
 * `button-next-step` staying disabled for the rest of the test's timeout budget.
 */
export async function applyAsExpert(
  page: Page,
  opts: { firstName: string; lastName: string; email: string; city?: string; country?: string; handle?: string },
): Promise<{ reachedFinalStep: boolean; stoppedAtStep?: number }> {
  const city = opts.city ?? 'Kyoto';
  await page.goto(`/become-expert?type=local_expert&city=${encodeURIComponent(city)}`);
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

  const nextBtn = testid(page, 'button-next-step');
  const advance = async (): Promise<boolean> => {
    if (!(await nextBtn.isVisible().catch(() => false))) return false;
    if (await nextBtn.isDisabled().catch(() => false)) return false;
    await nextBtn.click().catch(() => {});
    await page.waitForTimeout(300);
    return true;
  };

  // Step 1 — First/last name, email, phone.
  await fillIfVisible(page, 'input-first-name', opts.firstName);
  await fillIfVisible(page, 'input-last-name', opts.lastName);
  await fillIfVisible(page, 'input-email', opts.email);
  await fillIfVisible(page, 'input-phone', '+81-3-0000-0001');
  if (!(await advance())) return { reachedFinalStep: false, stoppedAtStep: 1 };

  // Step 2 — City, locality proof, languages, neighborhood claim (only if the catalog has rows).
  await fillIfVisible(page, 'input-local-city', city);
  await page.waitForTimeout(800); // debounced neighborhood-options fetch keyed on the city text
  await clickIfVisible(page, 'button-locality-born_raised');
  await clickIfVisible(page, 'badge-language-english');
  const anyNeighborhood = page.locator('[data-testid^="badge-neighborhood-"]');
  if ((await anyNeighborhood.count()) > 0) {
    await anyNeighborhood.first().click({ timeout: 3000 }).catch(() => {});
    await checkIfVisible(page, 'checkbox-neighborhood-consent');
  }
  if (!(await advance())) return { reachedFinalStep: false, stoppedAtStep: 2 };

  // Step 3 — Knowledge proof, 3 fixed questions, 50+ words each.
  for (let i = 0; i < KNOWLEDGE_PROOF_WORD_BANK.length; i++) {
    await fillIfVisible(page, `textarea-knowledge-proof-${i}`, KNOWLEDGE_PROOF_WORD_BANK[i]);
  }
  if (!(await advance())) return { reachedFinalStep: false, stoppedAtStep: 3 };

  // Step 4 — At least one local specialty (knowledge area).
  const anySpecialty = page.locator('[data-testid^="button-local-specialty-"]');
  if ((await anySpecialty.count()) > 0) {
    await anySpecialty.first().click({ timeout: 3000 }).catch(() => {});
  }
  if (!(await advance())) return { reachedFinalStep: false, stoppedAtStep: 4 };

  // Step 5 — At least one selected service/offering.
  const anyService = page.locator('[data-testid^="badge-service-"]');
  if ((await anyService.count()) > 0) {
    await anyService.first().click({ timeout: 3000 }).catch(() => {});
  }
  if (!(await advance())) return { reachedFinalStep: false, stoppedAtStep: 5 };

  // Step 6 — Availability, response time, hourly rate.
  await selectByTrigger(page, 'select-availability');
  await selectByTrigger(page, 'select-response-time');
  await fillIfVisible(page, 'input-hourly-rate', '40');
  if (!(await advance())) return { reachedFinalStep: false, stoppedAtStep: 6 };

  // Step 7 — Terms, then the optional handle-claim step, then submit.
  await checkIfVisible(page, 'checkbox-terms');
  await advance(); // -> handle-claim step, if the wizard renders one as a separate step

  if (opts.handle) {
    await fillIfVisible(page, 'input-public-handle', opts.handle);
  }

  const submitBtn = testid(page, 'button-submit');
  if (!(await submitBtn.isVisible().catch(() => false))) {
    return { reachedFinalStep: false, stoppedAtStep: 7 };
  }
  await submitBtn.click({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(1000);
  return { reachedFinalStep: true };
}

/** /admin/providers → Applications tab → approve by matching business name text within a card. */
export async function adminApproveProviderApplication(page: Page, businessName: string): Promise<boolean> {
  await page.goto('/admin/providers');
  await testid(page, 'button-tab-applications').click().catch(() => {});
  await page.waitForTimeout(500);
  const card = page.locator('[data-testid^="card-application-"]', { hasText: businessName });
  if ((await card.count()) === 0) return false;

  page.once('dialog', (d) => d.accept('e2e supply-demand fixture: admin override, verifications not completed (Stripe stubbed).'));
  const approveBtn = card.first().locator('[data-testid^="button-approve-"]');
  await approveBtn.click();
  await page.waitForTimeout(1000);
  return true;
}

/** /admin/experts → Applications tab → approve by matching applicant name/email text. */
export async function adminApproveExpertApplication(page: Page, matchText: string): Promise<boolean> {
  await page.goto('/admin/experts');
  await testid(page, 'button-tab-applications').click().catch(() => {});
  const card = page.locator('[data-testid^="card-application-"]', { hasText: matchText });
  // "applications" is already the page's default tab (admin/experts.tsx useState default), and
  // the card DOES render the email (app.email at line ~406) — a prior "not found" reading was a
  // pure RACE: the list is an async useQuery that resolves after navigation, and a flat 500ms
  // sleep after page.goto does not reliably outlast that fetch under load. Poll instead of
  // guessing a fixed delay, matching every other admin-list lookup in this harness.
  let found = false;
  for (let i = 0; i < 10 && !found; i++) {
    found = (await card.count()) > 0;
    if (!found) await page.waitForTimeout(1000);
  }
  if (!found) return false;
  // admin/experts.tsx's Approve handler opens a window.prompt() override-reason dialog
  // whenever identity verification is incomplete (always true here, HELD:stripe) — same
  // pattern as adminApproveProviderApplication. Missing this handler is exactly why an
  // earlier run's "approve" click silently did nothing (the unhandled prompt auto-dismissed,
  // cancelling the mutation) while reporting success.
  page.once('dialog', (d) => d.accept('e2e supply-demand fixture: admin override, verifications not completed (Stripe stubbed).'));
  const approveBtn = card.first().locator('[data-testid^="button-approve-"]');
  await approveBtn.click();
  await page.waitForTimeout(1000);
  return true;
}

/** /admin/providers → Platform tab → "Mark Verified" (background check) for a provider row matching businessName. */
export async function adminMarkProviderVerified(page: Page, businessName: string): Promise<boolean> {
  await page.goto('/admin/providers');
  await testid(page, 'button-tab-platform').click().catch(() => {});
  await page.waitForTimeout(500);
  const card = page.locator('[data-testid^="card-provider-"]', { hasText: businessName });
  if ((await card.count()) === 0) return false;
  const verifyBtn = card.first().locator('[data-testid^="button-verify-"]');
  if ((await verifyBtn.count()) === 0) return false;
  await verifyBtn.click();
  await page.waitForTimeout(1000);
  return true;
}

/** /admin/service-approvals → approve by matching listing title text. */
export async function adminApproveService(page: Page, titleMatch: string): Promise<boolean> {
  await page.goto('/admin/service-approvals');
  await page.waitForTimeout(500);
  const card = page.locator('[data-testid^="pending-service-"]', { hasText: titleMatch });
  if ((await card.count()) === 0) return false;
  const approveBtn = card.first().locator('[data-testid^="button-approve-"]');
  await approveBtn.click();
  await page.waitForTimeout(300);
  const confirmBtn = page.locator('[data-testid^="button-approve-confirm-"]');
  if (await confirmBtn.isVisible().catch(() => false)) {
    await confirmBtn.click();
  }
  await page.waitForTimeout(1000);
  return true;
}

/** /admin/service-approvals → reject by matching listing title text, with a reason. */
export async function adminRejectService(page: Page, titleMatch: string, reason: string): Promise<boolean> {
  await page.goto('/admin/service-approvals');
  await page.waitForTimeout(500);
  const card = page.locator('[data-testid^="pending-service-"]', { hasText: titleMatch });
  if ((await card.count()) === 0) return false;
  const reasonBox = card.first().locator('[data-testid^="reject-reason-"]');
  if ((await reasonBox.count()) > 0) await reasonBox.fill(reason).catch(() => {});
  const rejectBtn = card.first().locator('[data-testid^="button-reject-"]');
  await rejectBtn.click();
  await page.waitForTimeout(1000);
  return true;
}

/**
 * ServiceForm wizard (/provider/services/new or /expert/services/new).
 * Best-effort: fills the fields ServiceForm exposes at the Basics/Details
 * steps this fixture needs, walks forward with button-step-next, and stops
 * at the review step without submitting (submit is a separate call so the
 * spec can screenshot/assert the pre-submit state).
 */
export async function createListingBasics(
  page: Page,
  opts: {
    role: 'provider' | 'expert';
    title: string;
    /** service_offering_types.offering_type_key — ServiceForm is offering-first (picker auto-opens on create); category derives from it. */
    offeringTypeKey?: string;
    /** expert_offering_types.offering_type_key — ServiceForm.tsx's "What you sell" tile picker
     *  (option-tier-<key>), the ONE canonical offering column for role='expert' (§4/migration 292).
     *  Required for an expert's final submit (service-form-required.ts "tier" row). */
    expertOfferingTypeKey?: string;
    /** A category NAME to pick from the native `#category` Select — role='expert' only. Providers
     *  never see this control (their category is DERIVED from offeringTypeKey). Required for both
     *  roles' final submit (service-form-required.ts "category" row, applicable: true). */
    expertCategoryName?: string;
    deliveryMethod?: string; // ServiceForm UI value, e.g. 'in-person'
    priceCents?: number;
    description: string;
  },
): Promise<void> {
  const path = opts.role === 'provider' ? '/provider/services/new' : '/expert/services/new';
  await page.goto(path);
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

  // The offering picker is a Dialog that opens ONLY on clicking button-choose-offering
  // (ServiceForm.tsx ~3157) — it does NOT auto-open on a fresh create, despite an
  // earlier reading of the component assuming it did. "Pick an offering from the /earn
  // catalog first" stayed the publish gate's reason for every S1 provider until this
  // was corrected: the harness never opened the picker, so serviceOfferingTypeId was
  // always unset.
  if (opts.role === 'provider' && opts.offeringTypeKey) {
    const opener = testid(page, 'button-choose-offering');
    if (await opener.isVisible({ timeout: 3000 }).catch(() => false)) {
      await opener.click();
      const picker = testid(page, 'provider-offering-picker');
      await picker.isVisible({ timeout: 3000 }).catch(() => false);
      const opt = testid(page, `option-offering-${opts.offeringTypeKey}`);
      if (await opt.isVisible({ timeout: 3000 }).catch(() => false)) {
        await opt.click();
      } else {
        // Offering absent from this catalog view (search/filter drift) — fall back to
        // the first offering rather than blocking Basics entirely; the spec records this.
        await fillIfVisible(page, 'input-offering-search', '');
        const anyOption = page.locator('[data-testid^="option-offering-"]');
        if ((await anyOption.count()) > 0) await anyOption.first().click();
      }
      await page.waitForTimeout(300);
    }
  }

  await fillIfVisible(page, 'service-name', opts.title);

  if (opts.deliveryMethod) {
    await clickIfVisible(page, `method-tile-${opts.deliveryMethod}`);
  }

  if (opts.priceCents !== undefined) {
    const dollars = (opts.priceCents / 100).toFixed(2);
    // ServiceForm.tsx: the price input's testid depends on priceType ("Fixed" default ⇒
    // input-base-price; "Hourly" ⇒ input-hourly-rate; "Per-event" ⇒ input-event-rate).
    await fillIfVisible(page, 'input-base-price', dollars);
    await fillIfVisible(page, 'input-hourly-rate', dollars);
    await fillIfVisible(page, 'input-event-rate', dollars);
  }

  await fillIfVisible(page, 'service-description', opts.description);

  // The EXPERT-only "What you sell" tile picker (ServiceForm.tsx ~3686, `option-tier-<key>`,
  // required for role='expert' final submit) and the native `#category` Select (both roles,
  // required: `service-form-required.ts` "category" row is `applicable: true` for everyone,
  // but only role='provider' derives it automatically from an offering — an expert must pick
  // one directly). Neither was ever driven before this fix, which is why the expert wizard's
  // final-step control (`button-submit-service`) stayed permanently disabled behind "Still
  // needed: Category, What you sell" with no error the harness ever read.
  if (opts.role === 'expert' && opts.expertOfferingTypeKey) {
    const tile = testid(page, `option-tier-${opts.expertOfferingTypeKey}`);
    if (await tile.isVisible({ timeout: 3000 }).catch(() => false)) {
      await tile.click({ timeout: 3000 }).catch(() => {});
    } else {
      const anyTile = page.locator('[data-testid^="option-tier-"]');
      if ((await anyTile.count()) > 0) await anyTile.first().click({ timeout: 3000 }).catch(() => {});
    }
  }

  if (opts.role === 'expert' && opts.expertCategoryName) {
    const trigger = page.locator('#category');
    if (await trigger.isVisible({ timeout: 3000 }).catch(() => false)) {
      await trigger.click({ timeout: 3000 }).catch(() => {});
      const option = page.getByRole('option', { name: opts.expertCategoryName, exact: false });
      if (await option.first().isVisible({ timeout: 3000 }).catch(() => false)) {
        await option.first().click({ timeout: 3000 }).catch(() => {});
      } else {
        // Named category not in the list (drift) — pick the first real option rather than
        // leaving the required field permanently empty.
        const anyOption = page.getByRole('option');
        if ((await anyOption.count()) > 0) await anyOption.first().click({ timeout: 3000 }).catch(() => {});
      }
    }
  }
}

/**
 * ONE neighborhood picker (ServiceForm.tsx ~1889, `renderNeighborhoodPicker`), rendered on the
 * Logistics step in EITHER the "Meeting Location" card (in-person/hybrid) or the "Where you're
 * based" card (every other delivery method) — same testids either way
 * (`option-neighborhood-<slug>`). Composes `provider_services.location`/`city` server-side
 * (ServiceForm.tsx ~1440); skipping it is exactly why every S1/S2 listing in the prior pass was
 * born `location='Unknown'`, `city=NULL` and invisible on every location-scoped surface.
 * Deliberately a SEPARATE call from `walkServiceFormToReview` (not baked into every wizard walk)
 * so a spec can choose NOT to call it — S3's throwaway listing stays deliberately
 * neighbourhood-less, the one proof for the product finding this gap causes.
 */
export async function pickNeighborhood(page: Page, slug: string): Promise<boolean> {
  const opt = testid(page, `option-neighborhood-${slug}`);
  if (process.env.PN_DEBUG) {
    const anyOpt = page.locator('[data-testid^="option-neighborhood-"]');
    const cnt = await anyOpt.count().catch(() => -1);
    const specificVisible = cnt > 0 ? await opt.isVisible({ timeout: 500 }).catch(() => false) : false;
    const specificCount = cnt > 0 ? await opt.count().catch(() => -1) : -1;
    let sampleIds = '';
    if (cnt > 0) {
      const ids = await anyOpt.evaluateAll((els) => els.slice(0, 15).map((e) => e.getAttribute('data-testid'))).catch(() => []);
      sampleIds = ids.join(',');
    }
    // eslint-disable-next-line no-console
    console.log(
      `[PN_DEBUG] slug=${slug} url=${page.url()} anyOptCount=${cnt} gionCount=${specificCount} gionVisible=${specificVisible} sample=${sampleIds}`,
    );
    if (cnt > 0) await page.screenshot({ path: `/tmp/claude-0/sp/pn-debug-${Date.now()}.png`, fullPage: true }).catch(() => {});
  }

  // Part 1a (Pass 2 finding candidate P2-S1-31/32, private_transportation fixture): the picker's
  // options come from a fetched list (`allNeighborhoods`), and the "Getting there" transport card
  // on the same Logistics step can still be settling its own async state (transportProvision
  // gates, attestations) when `walkServiceFormToReview`'s flat per-step wait fires — a plain
  // `isVisible` + click can land on a node an in-flight re-render is about to replace, so the click
  // fires but never registers (`selected` stays false, `aria-pressed="false"`). Verified live via
  // probe: the option and click both work reliably once the step settles; the fix here is to wait
  // for the option to be STABLE (present across a short poll) and to VERIFY + RETRY the click
  // against the button's own `aria-pressed` state (ServiceForm.tsx ~1958) rather than trusting a
  // single fire-and-forget click.
  // NOTE (found live, second iteration): the option is a TOGGLE
  // (`onClick={() => set("neighborhood", selected ? "" : n.slug)}`), so a retry-on-not-yet-true
  // scheme that RE-CLICKS is dangerous — if the first click genuinely succeeded but the
  // `aria-pressed` re-render just lags, a second click flips it straight back OFF. So this polls
  // the ALREADY-clicked state for longer before ever clicking again, and clicks at most twice.
  const clickAndVerify = async (): Promise<boolean> => {
    if (!(await opt.isVisible({ timeout: 8000 }).catch(() => false))) return false;
    for (let click = 0; click < 2; click++) {
      let clickErr: string | null = null;
      await opt.click({ timeout: 5000 }).catch((e) => { clickErr = String(e?.message ?? e); });
      if (process.env.PN_DEBUG) {
        // eslint-disable-next-line no-console
        console.log(`[PN_DEBUG] click#${click} err=${clickErr}`);
      }
      for (let poll = 0; poll < 10; poll++) {
        await page.waitForTimeout(300);
        const pressed = await opt.getAttribute('aria-pressed').catch((e) => `ERR:${e?.message ?? e}`);
        if (process.env.PN_DEBUG && poll === 0) {
          // eslint-disable-next-line no-console
          console.log(`[PN_DEBUG] click#${click} poll#${poll} pressed=${pressed}`);
        }
        if (pressed === 'true') return true;
      }
    }
    return false;
  };

  if (await opt.isVisible({ timeout: 3000 }).catch(() => false)) {
    return await clickAndVerify();
  }
  // The picker may be behind a search box filtering the same list down — try the search first.
  const search = testid(page, 'input-neighborhood-search');
  if (await search.isVisible({ timeout: 2000 }).catch(() => false)) {
    await search.fill(slug.replace(/[-_]/g, ' '), { timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(300);
    if (await opt.isVisible({ timeout: 2000 }).catch(() => false)) {
      return await clickAndVerify();
    }
  }
  return false;
}

/**
 * HandleClaimBanner (client/src/components/backoffice/handle-claim-banner.tsx), mounted once in
 * BackofficeShell and shown on every provider/expert console page until `users.handle` is set.
 * The input is pre-filled by `suggestHandle` from the account's name, so this only needs to open
 * and submit it — never type over the run-id-tagged handle the spec already minted, since the
 * server derives the canonical value itself and a mismatch would just be a second, unused guess.
 */
export async function claimHandle(page: Page, consoleHome: '/provider/dashboard' | '/expert/dashboard'): Promise<boolean> {
  await page.goto(consoleHome);
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  const banner = testid(page, 'handle-claim-banner');
  if (!(await banner.isVisible({ timeout: 5000 }).catch(() => false))) {
    // No banner at all — either already claimed, or the account isn't recognized as an earner
    // role yet. Either way there is nothing this call can do; the caller checks users.handle.
    return false;
  }
  await clickIfVisible(page, 'button-open-handle-claim');
  const submit = testid(page, 'handle-claim-submit');
  if (!(await submit.isVisible({ timeout: 3000 }).catch(() => false))) return false;
  if (await submit.isDisabled().catch(() => false)) {
    // Prefilled suggestion was too short/empty — the input still needs a value.
    await fillIfVisible(page, 'handle-claim-input', `e2eh${Date.now().toString(36)}`.slice(0, 20));
  }
  if (await submit.isDisabled().catch(() => false)) return false;
  await submit.click({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(1000);
  return true;
}

export async function walkServiceFormToReview(
  page: Page,
  maxSteps = 8,
  opts: { neighborhoodSlug?: string } = {},
): Promise<number> {
  // The listing-home checklist's "Describe it in 140+ characters" row lands here — top it up
  // if it's short, regardless of how this function was reached (create or edit-mode entry).
  const descField = testid(page, 'service-description');
  if (await descField.isVisible({ timeout: 2000 }).catch(() => false)) {
    const current = (await descField.inputValue().catch(() => '')) ?? '';
    if (current.length < 140) {
      const filler =
        ' A hands-on, small-group experience led by a named local, with clear meeting details ' +
        'and everything travelers need to know before they book, written out in full so nothing ' +
        'is left unclear or unexplained here.';
      await descField.fill((current + filler).slice(0, 400), { timeout: 3000 }).catch(() => {});
    }
  }

  let clicks = 0;
  let neighborhoodPicked = false;
  for (let i = 0; i < maxSteps; i++) {
    if (await testid(page, 'card-review-summary').isVisible().catch(() => false)) break;
    // Let the step's own async state (neighborhood list fetch, category-specific cards like
    // "Getting there" for place-anchored transport listings) settle before probing it — a flat
    // per-step wait alone was not enough for the private_transportation fixture (Part 1a).
    await page.waitForLoadState('networkidle', { timeout: 2000 }).catch(() => {});

    // The neighborhood picker (Meeting Location or "Where you're based" card) lands on whichever
    // step the Logistics/"place" section resolves to — branch-dependent (service-form-steps.ts),
    // so this checks every step rather than assuming a step number. A no-op when not present or
    // when the caller passed no slug (S3's throwaway listing deliberately stays unset).
    if (opts.neighborhoodSlug) {
      const picked = await pickNeighborhood(page, opts.neighborhoodSlug);
      if (picked) neighborhoodPicked = true;
    }

    const next = testid(page, 'button-step-next');
    if (!(await next.isVisible().catch(() => false))) break;
    if (await next.isDisabled().catch(() => false)) break;
    await next.click().catch(() => {});
    clicks += 1;
    await page.waitForTimeout(400);
  }
  // Last-chance retry: if the picker was never confirmed selected (aria-pressed="true") anywhere
  // in the walk above, the wizard may still be on the Logistics step (e.g. Next stayed enabled and
  // the loop moved past it before the click was verified) — try once more here before moving on.
  if (opts.neighborhoodSlug && !neighborhoodPicked) {
    await pickNeighborhood(page, opts.neighborhoodSlug);
  }
  // D9 attestations (service-attestations-card.tsx): a publish-blocking gate on the
  // Review & submit step, separate from identity/business verification. Renders one
  // `checkbox-attestation-<key>` per applicable attestation; tick every one present.
  const attestationBoxes = page.locator('[data-testid^="checkbox-attestation-"]');
  const count = await attestationBoxes.count();
  for (let i = 0; i < count; i++) {
    const box = attestationBoxes.nth(i);
    const already = await box.getAttribute('data-state').then((s) => s === 'checked').catch(() => false);
    if (!already) await box.click({ timeout: 3000 }).catch(() => {});
  }

  // Part 1a follow-on (Pass 2, found live via a PN_DEBUG network trace): category-specific
  // REQUIRED fields (`GET /api/service-categories/:key/fields`, rendered on the Review step —
  // e.g. private_transportation's `vehicle_type`/`seats`) keep `button-publish-service`
  // permanently DISABLED when unfilled. Because F2 (migration 111) births every
  // `provider_services` row `approval_status='submitted'` already, admin can approve straight
  // off the Save-Draft snapshot with NO further PATCH ever required — so a category with such a
  // field went live anyway, but carrying only whatever Save Draft wrote BEFORE the wizard was
  // ever entered (in particular, no neighborhood: the picker's client-side state was set
  // correctly — confirmed via `aria-pressed` — but the PATCH that would have sent it never
  // fired, because Publish stayed disabled). Fill every category field generically here so
  // Publish can become enabled and the picked neighborhood actually reaches the server.
  const selectCatFields = page.locator('[data-testid^="select-cat-"]');
  const selectCatCount = await selectCatFields.count().catch(() => 0);
  for (let i = 0; i < selectCatCount; i++) {
    const trigger = selectCatFields.nth(i);
    if (await trigger.isVisible({ timeout: 1000 }).catch(() => false)) {
      await trigger.click({ timeout: 2000 }).catch(() => {});
      const firstOption = page.getByRole('option').first();
      if (await firstOption.isVisible({ timeout: 2000 }).catch(() => false)) {
        await firstOption.click({ timeout: 2000 }).catch(() => {});
      } else {
        await page.keyboard.press('Escape').catch(() => {});
      }
    }
  }
  const inputCatFields = page.locator('[data-testid^="input-cat-"]');
  const inputCatCount = await inputCatFields.count().catch(() => 0);
  for (let i = 0; i < inputCatCount; i++) {
    const field = inputCatFields.nth(i);
    if (await field.isVisible({ timeout: 1000 }).catch(() => false)) {
      const current = await field.inputValue().catch(() => '');
      if (!current) {
        const type = await field.getAttribute('type').catch(() => null);
        await field.fill(type === 'number' ? '2' : 'e2e supply-demand fixture', { timeout: 2000 }).catch(() => {});
      }
    }
  }
  const switchCatFields = page.locator('[data-testid^="switch-cat-"]');
  // Booleans are left at their default (never forced true) — a required boolean gate is not a
  // shape this fixture set has hit yet, and forcing every switch on would be guessing an answer
  // (§13 posture) rather than filling a blank the provider genuinely must state.
  void switchCatFields;

  return clicks;
}

/**
 * Catalog's `?availability=<id>` deep link opens `ProviderAvailabilityManager`
 * (client/src/components/logistics/provider-availability-manager.tsx) preselected
 * to the listing. Fills the first recurring-pattern row (Mon default) and saves —
 * "2 availability slots" per the Phase 0 fixture plan is read as "a saved weekly
 * pattern", since the manager has no bare N-slot picker.
 */
/**
 * REWRITTEN (lead review): `card-availability-patterns` / `input-pattern-start-0` /
 * `button-save-patterns` do not exist anywhere in the current client — that testid set was a
 * stale reading of `ProviderAvailabilityManager`, a component `/provider/services` explicitly
 * no longer mounts (its own comment: "No drawer import: availability is the standalone
 * /provider/availability page"). The real, currently-live editor is
 * `client/src/pages/provider/availability.tsx`'s `WeeklyPatternsRail`, which mounts only when
 * `needsScheduling({deliveryMethod, productShape})` is true (shared/service-fundamentals.ts) —
 * true for `in_person`/`hybrid`/`call`/`video`, false for `pdf`/`voice_notes`/`async_messaging`
 * (those render `NoCalendarPanel` instead, honestly: "This listing sells without a calendar").
 * Its day toggles and Save button carry no `data-testid` (style-only buttons), so they are
 * targeted by accessible name instead.
 *
 * Provider-only: no expert-facing availability route exists in this codebase (grepped) — an
 * expert offering is `draft`-only until admin approval and carries no calendar UI in this pass.
 */
export async function addAvailabilityViaUi(page: Page, role: 'provider' | 'expert', serviceId: string): Promise<boolean> {
  if (role !== 'provider') return false;
  await page.goto(`/provider/availability?serviceId=${serviceId}`);
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  const mondayToggle = page.getByRole('button', { name: 'Mo', exact: true });
  if (!(await mondayToggle.isVisible({ timeout: 6000 }).catch(() => false))) {
    // Either NoCalendarPanel rendered (this delivery method carries no calendar — not a bug) or
    // the page never resolved the service. The caller can't tell which without reading the
    // delivery method itself, so it reports both possibilities.
    return false;
  }
  await mondayToggle.click({ timeout: 3000 }).catch(() => {});
  await fillIfVisible(page, 'input-patterns-start', '09:00');
  await fillIfVisible(page, 'input-patterns-capacity', '2');
  const saveBtn = page.getByRole('button', { name: /Save schedule/i });
  if (await saveBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await saveBtn.click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(1000);
    return true;
  }
  return false;
}

export type SubmitOutcome = { submitted: boolean; blockedByVerification: boolean; reason?: string };

/**
 * ServiceForm's final-step control differs by role: the EXPERT branch
 * (`button-submit-service`) always submits for review, unverified or not
 * (submitting is never blocked while unverified — only going live is). The
 * PROVIDER branch (`button-publish-service`) does BOTH create-and-submit in
 * one click and IS disabled while identity/business verification
 * (`verificationGateBlocked`) or the category's background check
 * (`publishBlocked`) is outstanding — in this environment that is EVERY
 * provider, since Stripe Identity/Connect cannot complete against the CI
 * stub key (HELD:stripe, see PHASE0_SUPPLY_DEMAND.md §1). Never blindly
 * click a disabled control — it never becomes enabled, and Playwright's
 * default actionability wait would burn the full test timeout retrying.
 */
/**
 * Clicks button-save-draft (present on every step's footer, createMutation.mutate("draft"))
 * and returns once the wizard's own draft indicators show it took. Draft save is NOT gated
 * on the Logistics step's required meeting pin (only Submit is), so this is the earliest
 * point a provider_services row id exists to seed against (see the meeting-pin fallback in
 * the S1 spec).
 */
export async function saveDraft(page: Page): Promise<boolean> {
  const btn = testid(page, 'button-save-draft');
  if (!(await btn.isVisible().catch(() => false))) return false;
  await btn.click({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(1200);
  return true;
}

/**
 * A cold load of /provider/services/:id/edit renders the LISTING HOME summary/checklist
 * view (ServiceForm.tsx `view-listing-home`), NOT the step wizard — the wizard is reached
 * only by clicking a checklist row (`openChecklistRow`, which flips `viewListingHome` to
 * false and jumps to that row's step) or the "Photos" row, which opens a drawer INSTEAD of
 * a step. Cover photo is filled here, on listing-home, before ever entering the wizard.
 */
export async function fillCoverPhotoFromListingHome(page: Page, url: string): Promise<boolean> {
  const openBtn = testid(page, 'button-open-listing-photos');
  if (!(await openBtn.isVisible().catch(() => false))) return false;
  await openBtn.click({ timeout: 3000 }).catch(() => {});
  const linkInput = testid(page, 'input-photos-paste-link');
  if (!(await linkInput.isVisible({ timeout: 3000 }).catch(() => false))) return false;
  await linkInput.fill(url, { timeout: 3000 }).catch(() => {});
  await testid(page, 'button-photos-save-link').click({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(600);
  // Close the drawer (Sheet) however it closes — Escape is the reliable cross-component way.
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(300);
  return true;
}

/** Enters the wizard from listing-home via any step-targeted checklist row (description140 is always present pre-fill). */
export async function enterWizardFromListingHome(page: Page): Promise<boolean> {
  const row = testid(page, 'checklist-row-description140');
  if (await row.isVisible({ timeout: 3000 }).catch(() => false)) {
    await row.click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(500);
    return true;
  }
  // Fallback: any row that is not the photos/availability special targets.
  const anyRow = page.locator('[data-testid^="checklist-row-"]:not([data-testid="checklist-row-coverPhoto"]):not([data-testid="checklist-row-availability"])');
  if ((await anyRow.count()) > 0) {
    await anyRow.first().click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(500);
    return true;
  }
  return false;
}

export async function submitListingForReview(page: Page): Promise<SubmitOutcome> {
  if (process.env.PN_DEBUG) {
    page.on('request', (req) => {
      if (/\/api\/(provider|expert)\/services/.test(req.url()) && ['POST', 'PATCH'].includes(req.method())) {
        const body = req.postData();
        let neighborhoodField: string | undefined;
        let locationField: string | undefined;
        try {
          const parsed = body ? JSON.parse(body) : null;
          neighborhoodField = parsed?.neighborhood;
          locationField = parsed?.location;
        } catch {}
        // eslint-disable-next-line no-console
        console.log(
          `[PN_DEBUG submit] ${req.method()} ${req.url()} neighborhood=${JSON.stringify(neighborhoodField)} location=${JSON.stringify(locationField)}`,
        );
      }
    });
  }
  const btn = testid(page, 'button-submit-service');
  if (await btn.isVisible().catch(() => false)) {
    if (await btn.isDisabled().catch(() => false)) {
      return { submitted: false, blockedByVerification: false, reason: 'button-submit-service present but disabled' };
    }
    await btn.click();
    await page.waitForTimeout(1000);
    return { submitted: true, blockedByVerification: false };
  }
  const publishBtn = testid(page, 'button-publish-service');
  if (await publishBtn.isVisible().catch(() => false)) {
    if (await publishBtn.isDisabled().catch(() => false)) {
      const title = await publishBtn.getAttribute('title').catch(() => null);
      return {
        submitted: false,
        blockedByVerification: true,
        reason: title ?? 'button-publish-service disabled (verification/background-check gate)',
      };
    }
    await publishBtn.click();
    await page.waitForTimeout(1000);
    return { submitted: true, blockedByVerification: false };
  }
  return { submitted: false, blockedByVerification: false, reason: 'neither submit control found' };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Demand-journey helpers (Pass 2, Part 2 / D1-D7). Adapted from the lead's own proven driver
// `docs/audits/journeys/harness/lib.mjs` fillPlanModal — same selectors, same walk shape — so the
// modal-driving recipe is not re-guessed from scratch for a second harness.
// ─────────────────────────────────────────────────────────────────────────────────────────────

export function futureDateRange(offsetDays = 40, lenDays = 5): { start: string; end: string } {
  const s = new Date();
  s.setDate(s.getDate() + offsetDays);
  const e = new Date(s);
  e.setDate(e.getDate() + lenDays);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { start: iso(s), end: iso(e) };
}

/**
 * Walks the ONE planning modal (ruling 33/42/45) from whatever step it opens on to its finish
 * row, filling occasion/destination/dates as each becomes visible. Stops as soon as ANY finish
 * CTA (`planning-option-*`) is visible, WITHOUT clicking one — the caller picks which branch.
 */
export async function fillPlanModalToFinish(
  page: Page,
  destination: string,
  opts: { occasionSlug?: string; offsetDays?: number; lenDays?: number } = {},
): Promise<boolean> {
  const modal = testid(page, 'plan-modal');
  if (!(await modal.isVisible({ timeout: 10_000 }).catch(() => false))) return false;
  const { start, end } = futureDateRange(opts.offsetDays ?? 40, opts.lenDays ?? 5);
  const occasionSlug = opts.occasionSlug ?? 'travel';

  for (let i = 0; i < 8; i++) {
    if (await page.locator('[data-testid^="planning-option-"]').first().isVisible().catch(() => false)) break;

    const preferredOccasion = testid(page, `option-occasion-${occasionSlug}`);
    if (await preferredOccasion.isVisible({ timeout: 1500 }).catch(() => false)) {
      await preferredOccasion.click().catch(() => {});
    } else {
      const anyOccasion = page.locator('[data-testid^="option-occasion-"]').first();
      if (await anyOccasion.isVisible({ timeout: 1000 }).catch(() => false)) await anyOccasion.click().catch(() => {});
    }

    const dest = testid(page, 'input-etp-destination');
    if (await dest.isVisible({ timeout: 1500 }).catch(() => false)) {
      await dest.fill(destination).catch(() => {});
    }

    const sd = testid(page, 'input-etp-start-date');
    if (await sd.isVisible({ timeout: 1500 }).catch(() => false)) {
      await sd.fill(start).catch(() => {});
      const ed = testid(page, 'input-etp-end-date');
      if (await ed.isVisible({ timeout: 1500 }).catch(() => false)) await ed.fill(end).catch(() => {});
    }

    const next = testid(page, 'button-planning-next');
    if (await next.isVisible({ timeout: 1500 }).catch(() => false)) {
      if (await next.isDisabled().catch(() => false)) {
        // Occasion step's Next is disabled until an occasion is picked (plan-modal.tsx:2656) —
        // give the click above one more beat to register before giving up on this step.
        await page.waitForTimeout(400);
        if (await next.isDisabled().catch(() => false)) break;
      }
      await next.click().catch(() => {});
      await page.waitForTimeout(500);
    } else {
      break;
    }
  }
  return page.locator('[data-testid^="planning-option-"]').first().isVisible({ timeout: 3000 }).catch(() => false);
}

/**
 * Clicks a finish branch (`planning-option-myself` / `-local` / `-ai` / `-occasion`) and waits
 * for the resulting navigation, returning the tripId parsed from the landing URL when one mints
 * (`/plans/:tripId`, `/expert/...?tripId=`, etc. — callers check the shape they expect).
 */
export async function clickPlanFinish(page: Page, branch: 'myself' | 'local' | 'ai' | 'occasion'): Promise<string | null> {
  const btn = testid(page, `planning-option-${branch}`);
  if (!(await btn.isVisible({ timeout: 3000 }).catch(() => false))) return null;
  await btn.click().catch(() => {});
  // The finish mutation shows its own in-dialog spinner (`disabled={saving}`) while it mints the
  // trip server-side, then navigates — a single `waitForLoadState('networkidle')` can resolve
  // WHILE that save is still in flight (a screenshot caught this live: the modal still showing
  // its saving overlay 15s later is one thing; the real fix is to poll for the URL to actually
  // change rather than trust one snapshot of "idle"). Poll up to ~25s.
  const startUrl = page.url();
  let url = startUrl;
  for (let i = 0; i < 25; i++) {
    await page.waitForTimeout(1000);
    url = page.url();
    if (url !== startUrl && (/\/plans\//.test(url) || /[?&]tripId=/.test(url))) break;
  }
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  const m = url.match(/\/plans\/([a-zA-Z0-9-]+)/) || url.match(/[?&]tripId=([a-zA-Z0-9-]+)/);
  return m ? m[1] : null;
}

/** Opens the plan modal from the hero "Plan a trip" button on the given page (usually "/"). */
export async function openPlanModalFromHero(page: Page): Promise<boolean> {
  const btn = testid(page, 'button-plan-trip');
  if (!(await btn.isVisible({ timeout: 5000 }).catch(() => false))) return false;
  await btn.click().catch(() => {});
  return await testid(page, 'plan-modal').isVisible({ timeout: 5000 }).catch(() => false);
}
