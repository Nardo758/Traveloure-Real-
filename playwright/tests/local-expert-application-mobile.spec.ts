// playwright/tests/local-expert-application-mobile.spec.ts
//
// Regression guard for the Task 1160 layout fix — local_expert funnel variant.
// The travel_expert funnel is covered by expert-application-mobile.spec.ts;
// this file covers the 7-step local_expert funnel which has three unique steps
// containing 2-column grids:
//   • Step 2 "Your Locality"     — locality-proof grid (grid-cols-1 sm:grid-cols-2)
//   • Step 4 "Local Specialties" — specialty tile grid  (grid-cols-2 sm:grid-cols-3)
//   • Step 7 "Review"            — summary + benefits grids (grid-cols-1 sm:grid-cols-2)
//
// All assertions run at 375 px wide viewport (small phone).
// The page is public — no auth or storageState required.
// SessionStorage drafts are injected to jump to specific steps without manually
// navigating through every preceding step.

import { test, expect } from '@playwright/test';

const DRAFT_KEY = 'traveloure_expert_application_draft';

// Base form data covering every field the local_expert funnel references.
const BASE_LOCAL_FORM = {
  firstName: 'Hana',
  lastName: 'Tanaka',
  email: 'hana@example.com',
  phone: '+81 90 1234 5678',
  country: 'Japan',
  city: 'Tokyo',
  destinations: [],
  specialties: [],
  languages: ['English', 'Japanese'],
  experienceTypes: ['Solo travellers'],
  specializations: [],
  selectedServices: ['Local Tour Guide'],
  yearsExperience: '',
  bio: '',
  portfolio: '',
  certifications: '',
  availability: '10-20',
  responseTime: '4',
  hourlyRate: '60',
  expertType: 'local_expert',
  agreeToTerms: false,
  neighborhoods: ['Shimokitazawa', 'Yanaka'],
  localityProof: 'born_raised',
  knowledgeProofAnswers: [
    'Shimokitazawa has a hidden izakaya called Suzu-ya tucked in the covered arcade just north of the south exit. Stay away from the tourist ramen chains near Shinjuku. The broth is thin and the prices are padded for foreigners.',
    'Most visitors queue at Senso-ji before 10 am, but locals know Yanaka cemetery is peaceful all morning. Walk south through the graveyard and exit into Yanaka Ginza for proper shitamachi breakfast at Yanaka Beer Hall.',
    'Koenji is consistently overlooked. Its covered shotengai hosts vintage shops, a jazz kissa, and a Sunday farmers market that closes by noon. Best for vintage fashion hunters and anyone wanting to avoid Harajuku crowds entirely.',
  ],
  localSpecialties: ['food_drink', 'hidden_gems'],
  isInfluencer: false,
  instagramLink: '',
  tiktokLink: '',
  youtubeLink: '',
  instagramFollowers: '',
  tiktokFollowers: '',
  youtubeFollowers: '',
};

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------

/**
 * Returns true when the element fits inside the viewport horizontally
 * (not clipped, not causing horizontal overflow).
 */
async function isWithinViewport(
  page: import('@playwright/test').Page,
  testId: string,
): Promise<boolean> {
  const loc = page.getByTestId(testId);
  const box = await loc.boundingBox();
  if (!box) return false;
  const viewportWidth = page.viewportSize()?.width ?? 375;
  // Allow 1 px rounding tolerance.
  return box.x >= 0 && box.x + box.width <= viewportWidth + 1;
}

/** Returns the page's horizontal scroll extent (0 = no overflow). */
async function pageScrollWidth(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

/**
 * Injects a sessionStorage draft and navigates to the local_expert funnel.
 * Waits for the back-link (earliest stable mount marker on this page).
 */
async function gotoWithDraft(
  page: import('@playwright/test').Page,
  step: number,
): Promise<void> {
  const draft = JSON.stringify({
    formData: { ...BASE_LOCAL_FORM },
    currentStep: step,
    savedAt: new Date().toISOString(),
  });

  await page.addInitScript(
    ({ key, value }: { key: string; value: string }) => {
      sessionStorage.setItem(key, value);
    },
    { key: DRAFT_KEY, value: draft },
  );

  await page.goto('/become-expert?type=local_expert', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="link-back"]', { timeout: 120_000 });
}

// -------------------------------------------------------------------------
// Tests
// -------------------------------------------------------------------------

test.describe('Local expert application form — mobile layout (375 px)', () => {
  test.use({
    storageState: { cookies: [], origins: [] },
    viewport: { width: 375, height: 812 },
  });

  // ------------------------------------------------------------------
  // Step 1 — Basic Info (same grids as travel_expert funnel)
  // ------------------------------------------------------------------

  test('Step 1 — name fields stack vertically and do not overflow', async ({ page }) => {
    await page.goto('/become-expert?type=local_expert', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="link-back"]', { timeout: 120_000 });

    await expect(page.getByTestId('input-first-name')).toBeVisible();
    await expect(page.getByTestId('input-last-name')).toBeVisible();

    expect(await isWithinViewport(page, 'input-first-name')).toBe(true);
    expect(await isWithinViewport(page, 'input-last-name')).toBe(true);

    const firstBox = await page.getByTestId('input-first-name').boundingBox();
    const lastBox  = await page.getByTestId('input-last-name').boundingBox();
    expect(firstBox).not.toBeNull();
    expect(lastBox).not.toBeNull();

    // Stacked: both inputs share the same left edge (within 4 px).
    expect(Math.abs(firstBox!.x - lastBox!.x)).toBeLessThan(4);
    // Stacked: last-name sits below first-name.
    expect(lastBox!.y).toBeGreaterThan(firstBox!.y);

    expect(await pageScrollWidth(page)).toBe(0);
  });

  test('Step 1 — country/city fields stack vertically and do not overflow', async ({ page }) => {
    await page.goto('/become-expert?type=local_expert', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="link-back"]', { timeout: 120_000 });

    await expect(page.getByTestId('input-country')).toBeVisible();
    await expect(page.getByTestId('input-city')).toBeVisible();

    expect(await isWithinViewport(page, 'input-country')).toBe(true);
    expect(await isWithinViewport(page, 'input-city')).toBe(true);

    const countryBox = await page.getByTestId('input-country').boundingBox();
    const cityBox    = await page.getByTestId('input-city').boundingBox();
    expect(countryBox).not.toBeNull();
    expect(cityBox).not.toBeNull();

    // Stacked: same left edge.
    expect(Math.abs(countryBox!.x - cityBox!.x)).toBeLessThan(4);
    // Stacked: city appears below country.
    expect(cityBox!.y).toBeGreaterThan(countryBox!.y);

    expect(await pageScrollWidth(page)).toBe(0);
  });

  // ------------------------------------------------------------------
  // Step 2 — Your Locality (locality-proof grid: grid-cols-1 sm:grid-cols-2)
  // ------------------------------------------------------------------

  test('Step 2 — locality-proof buttons stack vertically and do not overflow', async ({ page }) => {
    await gotoWithDraft(page, 2);

    await expect(page.getByText('Your Local Knowledge')).toBeVisible({ timeout: 15_000 });

    // The locality-proof section renders four option buttons.
    // On a 375 px phone the grid must collapse to 1 column.
    const bornRaised   = page.getByTestId('button-locality-born_raised');
    const longTerm10yr = page.getByTestId('button-locality-long_term_10yr');

    await expect(bornRaised).toBeVisible();
    await expect(longTerm10yr).toBeVisible();

    expect(await isWithinViewport(page, 'button-locality-born_raised')).toBe(true);
    expect(await isWithinViewport(page, 'button-locality-long_term_10yr')).toBe(true);

    const topBox    = await bornRaised.boundingBox();
    const secondBox = await longTerm10yr.boundingBox();
    expect(topBox).not.toBeNull();
    expect(secondBox).not.toBeNull();

    // Stacked: both buttons share the same left edge (within 4 px).
    expect(Math.abs(topBox!.x - secondBox!.x)).toBeLessThan(4);
    // Stacked: second option sits below the first.
    expect(secondBox!.y).toBeGreaterThan(topBox!.y);

    expect(await pageScrollWidth(page)).toBe(0);
  });

  // ------------------------------------------------------------------
  // Step 4 — Local Specialties (grid-cols-2 sm:grid-cols-3)
  // ------------------------------------------------------------------

  test('Step 4 — specialty tiles fit within viewport and do not overflow', async ({ page }) => {
    await gotoWithDraft(page, 4);

    await expect(page.getByText('Your Local Specialties')).toBeVisible({ timeout: 15_000 });

    // Verify two representative tiles fit inside the 375 px viewport.
    await expect(page.getByTestId('button-local-specialty-food_drink')).toBeVisible();
    await expect(page.getByTestId('button-local-specialty-hidden_gems')).toBeVisible();

    expect(await isWithinViewport(page, 'button-local-specialty-food_drink')).toBe(true);
    expect(await isWithinViewport(page, 'button-local-specialty-hidden_gems')).toBe(true);

    // On a 375 px phone, the grid renders 2 tiles per row (grid-cols-2).
    // Confirm tiles in the same row share the same top edge (within 4 px).
    const foodBox   = await page.getByTestId('button-local-specialty-food_drink').boundingBox();
    const safetyBox = await page.getByTestId('button-local-specialty-safety_navigation').boundingBox();
    expect(foodBox).not.toBeNull();
    expect(safetyBox).not.toBeNull();

    // Same row: tops should be within 4 px of each other.
    expect(Math.abs(foodBox!.y - safetyBox!.y)).toBeLessThan(4);
    // Side-by-side: safety tile's left edge is to the right of food tile's right edge.
    expect(safetyBox!.x).toBeGreaterThan(foodBox!.x);

    // Neither tile overflows the viewport.
    expect(foodBox!.x + foodBox!.width).toBeLessThanOrEqual(376);
    expect(safetyBox!.x + safetyBox!.width).toBeLessThanOrEqual(376);

    expect(await pageScrollWidth(page)).toBe(0);
  });

  // ------------------------------------------------------------------
  // Step 7 — Review (summary grid + benefits grid: grid-cols-1 sm:grid-cols-2)
  // ------------------------------------------------------------------

  test('Step 7 — review summary and benefits grids do not overflow', async ({ page }) => {
    // Inject a fully-populated draft so the review step renders without
    // redirecting to an earlier step due to missing required fields.
    await gotoWithDraft(page, 7);

    await expect(page.getByText('Review Your Application')).toBeVisible({ timeout: 15_000 });

    // The submit button and navigation controls must be reachable and on-screen.
    await expect(page.getByTestId('button-submit')).toBeVisible();
    await expect(page.getByTestId('checkbox-terms')).toBeVisible();
    await expect(page.getByTestId('button-back')).toBeVisible();

    expect(await isWithinViewport(page, 'button-submit')).toBe(true);
    expect(await isWithinViewport(page, 'button-back')).toBe(true);

    // No horizontal scrolling caused by the review summary or benefits grids.
    expect(await pageScrollWidth(page)).toBe(0);
  });
});
