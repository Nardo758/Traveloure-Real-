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
export async function applyAsExpert(
  page: Page,
  opts: { firstName: string; lastName: string; email: string; city?: string; country?: string; handle?: string },
): Promise<void> {
  await page.goto('/become-expert');
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

  await fillIfVisible(page, 'input-first-name', opts.firstName);
  await fillIfVisible(page, 'input-last-name', opts.lastName);
  await fillIfVisible(page, 'input-email', opts.email);
  await fillIfVisible(page, 'input-phone', '+81-3-0000-0001');
  await fillIfVisible(page, 'input-country', opts.country ?? 'Japan');
  await fillIfVisible(page, 'input-city', opts.city ?? 'Kyoto');
  await fillIfVisible(page, 'input-local-city', opts.city ?? 'Kyoto');
  await fillIfVisible(page, 'textarea-bio', `${opts.firstName} ${opts.lastName} — e2e Kyoto local expert fixture.`);
  await fillIfVisible(page, 'input-portfolio', 'https://example.com/portfolio');
  await checkIfVisible(page, 'checkbox-terms');
  await clickIfVisible(page, 'checkbox-neighborhood-consent');

  // Walk forward via button-next-step (present across multi-step variants of this form)
  // until either it disappears or the final handle-claim/submit step is reached.
  for (let i = 0; i < 12; i++) {
    if (await testid(page, 'button-submit').isVisible().catch(() => false)) break;
    const next = testid(page, 'button-next-step');
    if (!(await next.isVisible().catch(() => false))) break;
    if (await next.isDisabled().catch(() => false)) break;
    await next.click().catch(() => {});
    await page.waitForTimeout(300);
  }

  if (opts.handle) {
    await fillIfVisible(page, 'input-public-handle', opts.handle);
  }
  await testid(page, 'button-submit').click();
  await page.waitForTimeout(1000);
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
  await page.waitForTimeout(500);
  const card = page.locator('[data-testid^="card-application-"]', { hasText: matchText });
  if ((await card.count()) === 0) return false;
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
    deliveryMethod?: string; // ServiceForm UI value, e.g. 'in-person'
    priceCents?: number;
    description: string;
  },
): Promise<void> {
  const path = opts.role === 'provider' ? '/provider/services/new' : '/expert/services/new';
  await page.goto(path);
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

  // The offering picker dialog auto-opens on a new provider create (ServiceForm.tsx ~2963).
  if (opts.offeringTypeKey) {
    const picker = testid(page, 'provider-offering-picker');
    if (await picker.isVisible({ timeout: 3000 }).catch(() => false)) {
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
}

export async function walkServiceFormToReview(page: Page, maxSteps = 8): Promise<number> {
  let clicks = 0;
  for (let i = 0; i < maxSteps; i++) {
    if (await testid(page, 'card-review-summary').isVisible().catch(() => false)) break;
    const next = testid(page, 'button-step-next');
    if (!(await next.isVisible().catch(() => false))) break;
    if (await next.isDisabled().catch(() => false)) break;
    await next.click().catch(() => {});
    clicks += 1;
    await page.waitForTimeout(400);
  }
  return clicks;
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
export async function submitListingForReview(page: Page): Promise<SubmitOutcome> {
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
