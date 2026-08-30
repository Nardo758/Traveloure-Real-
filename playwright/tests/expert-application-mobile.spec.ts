// e2e/specs/expert-application-mobile.spec.ts
//
// Regression guard for the Task 1160 layout fix: grids in the expert
// application form must stack to a single column on small phones (375 px wide)
// rather than cramming two fields side-by-side.
//
// Three sections are verified:
//   • Name step    — first-name / last-name pair (Step 1)
//   • Location step — country / city pair (Step 1)
//   • Review step  — summary grid + benefits grid (Step 6, travel_expert funnel)
//
// The page is public (no auth needed to render the form), so no storageState
// is required.  A sessionStorage draft is injected to jump straight to the
// review step without filling every field manually.

import { test, expect } from '@playwright/test';

const DRAFT_KEY = 'traveloure_expert_application_draft';

// Minimal form data that satisfies the review step rendering path.
const REVIEW_DRAFT_FORM = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  phone: '+1 555 000 1111',
  country: 'UK',
  city: 'London',
  destinations: ['Paris, France', 'London, UK'],
  specialties: ['Cultural Tours'],
  languages: ['English'],
  experienceTypes: ['Solo Travel'],
  specializations: [],
  selectedServices: ['Itinerary Planning'],
  yearsExperience: '5',
  bio: 'Experienced travel planner with a passion for cultural immersion.',
  portfolio: '',
  certifications: '',
  availability: '10-20',
  responseTime: '4',
  hourlyRate: '75',
  expertType: 'travel_expert',
  agreeToTerms: false,
  neighborhoods: [],
  localityProof: '',
  knowledgeProofAnswers: ['', '', ''],
  localSpecialties: [],
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
 * Returns true when the element's rendered width does not exceed the viewport
 * width, meaning it is not clipped or causing horizontal overflow.
 */
async function isWithinViewport(
  page: import('@playwright/test').Page,
  testId: string,
): Promise<boolean> {
  const loc = page.getByTestId(testId);
  const box = await loc.boundingBox();
  if (!box) return false; // not visible
  const viewportWidth = page.viewportSize()?.width ?? 375;
  // Allow 1 px rounding tolerance.
  return box.x >= 0 && box.x + box.width <= viewportWidth + 1;
}

/** Returns the page's maximum horizontal scroll extent (0 = no overflow). */
async function pageScrollWidth(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

// -------------------------------------------------------------------------
// Tests
// -------------------------------------------------------------------------

test.describe('Expert application form — mobile layout (375 px)', () => {
  test.use({
    storageState: { cookies: [], origins: [] },
    viewport: { width: 375, height: 812 },
  });

  test('Step 1 — name fields stack vertically and do not overflow', async ({ page }) => {
    await page.goto('/travel-experts', { waitUntil: 'domcontentloaded' });

    // Wait for the form to mount (back-link is the earliest stable marker on
    // this standalone-header page).
    await page.waitForSelector('[data-testid="link-back"]', { timeout: 120_000 });

    // Both name inputs must be visible and fit inside the 375 px viewport.
    await expect(page.getByTestId('input-first-name')).toBeVisible();
    await expect(page.getByTestId('input-last-name')).toBeVisible();

    expect(await isWithinViewport(page, 'input-first-name')).toBe(true);
    expect(await isWithinViewport(page, 'input-last-name')).toBe(true);

    // The two name inputs must stack vertically — i.e. their left edges should
    // both be at (or near) the same x-position, not offset by half the width.
    const firstBox = await page.getByTestId('input-first-name').boundingBox();
    const lastBox  = await page.getByTestId('input-last-name').boundingBox();
    expect(firstBox).not.toBeNull();
    expect(lastBox).not.toBeNull();
    // Stacked: they share roughly the same left edge (within 4 px).
    expect(Math.abs((firstBox!.x) - (lastBox!.x))).toBeLessThan(4);
    // Stacked: last-name appears below first-name, not beside it.
    expect(lastBox!.y).toBeGreaterThan(firstBox!.y);

    // No horizontal scroll on the page.
    expect(await pageScrollWidth(page)).toBe(0);
  });

  test('Step 1 — country/city fields stack vertically and do not overflow', async ({ page }) => {
    await page.goto('/travel-experts', { waitUntil: 'domcontentloaded' });
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

  test('Review step — summary and benefits grids do not overflow', async ({ page }) => {
    // Inject a completed draft so the form opens directly on the review step
    // (step 6 for the travel_expert funnel) without having to navigate through
    // every preceding step.
    await page.addInitScript(
      ({ key, draft }: { key: string; draft: string }) => {
        sessionStorage.setItem(key, draft);
      },
      {
        key: DRAFT_KEY,
        draft: JSON.stringify({
          formData: REVIEW_DRAFT_FORM,
          currentStep: 6,
          savedAt: new Date().toISOString(),
        }),
      },
    );

    await page.goto('/travel-experts', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="link-back"]', { timeout: 120_000 });

    // The review step renders "Review Your Application".
    await expect(page.getByText('Review Your Application')).toBeVisible({ timeout: 15_000 });

    // The submit button must be in the viewport — it is the last focusable item
    // on the review step and its visibility confirms the card rendered fully.
    await expect(page.getByTestId('button-submit')).toBeVisible();

    // The checkbox and the Back navigation button must both fit on screen.
    await expect(page.getByTestId('checkbox-terms')).toBeVisible();
    await expect(page.getByTestId('button-back')).toBeVisible();

    expect(await isWithinViewport(page, 'button-submit')).toBe(true);
    expect(await isWithinViewport(page, 'button-back')).toBe(true);

    // No horizontal scrolling caused by the review summary or benefits grids.
    expect(await pageScrollWidth(page)).toBe(0);
  });
});
