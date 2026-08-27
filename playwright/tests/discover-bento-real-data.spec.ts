/**
 * discover-bento-real-data.spec.ts — BENTO_ASSEMBLY §6 / §10 proof (real data, no mocks).
 *
 * docs/design/BENTO_ASSEMBLY.md §10 requires section chrome (eyebrow, Fraunces
 * heading, "See all", jump list) to render against REAL Mumbai data, not just
 * the Kyoto fixture. Prior to 2026-08-27-neighbourhood-slug-match, Mumbai's
 * Bandra/Colaba gems and services were seeded with the neighbourhood's
 * display name ("Bandra") instead of its slug ("bandra"); location-view.
 * service.ts joined by raw equality against `cityNeighborhoods.slug`, so the
 * mismatch silently zeroed those neighbourhoods' gemCount/serviceCount/gems,
 * dropping them out of the client feed and taking their chrome with them.
 *
 * This suite hits the live dev DB (no route mocks) and is the regression
 * guard for that fix — it must keep passing against whatever real gems/
 * services are seeded for Mumbai's Bandra/Colaba neighbourhoods.
 *
 * Run with:
 *   npx playwright test playwright/tests/discover-bento-real-data.spec.ts --workers=1
 */
import { test, expect } from '@playwright/test';
import { testAccounts } from '../fixtures/test-accounts';
import { loginAs } from '../utils/auth';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5000';
const signedInTraveler = testAccounts.travelers[0];

test.describe('Bento section chrome — real Mumbai data (no fixture)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, signedInTraveler.email, signedInTraveler.password);
    // loginAs resolves when the post-login URL changes. Await the document
    // itself before a test replaces that navigation with /discover/location;
    // without this, a direct goto can intermittently abort during handoff.
    await page.waitForLoadState('domcontentloaded');
  });

  test('Bandra section renders eyebrow, heading, and See-all on real data', async ({ page }) => {
    await page.goto(`${BASE_URL}/discover/location/Mumbai`, { waitUntil: 'domcontentloaded', timeout: 30_000 });

    const section = page.getByTestId('bento-section-bandra');
    await expect(section).toBeAttached({ timeout: 15_000 });

    const eyebrow = page.getByTestId('bento-eyebrow-bandra');
    await expect(eyebrow).toBeVisible();
    await expect(eyebrow).toContainText('BANDRA');

    // Heading is the fallback chain (editorialTitle → headline → tagline →
    // description → name); real Mumbai rows have no editorialTitle/headline/
    // tagline columns at all, so asserting *some* non-empty heading text is
    // the correct proof here — the actual fallback value is a seed-data
    // quality question (Bandra's `description` is a placeholder string),
    // tracked separately, not a chrome-rendering question.
    const heading = page.getByTestId('bento-heading-bandra');
    await expect(heading).toBeVisible();
    await expect(heading).not.toHaveText('');

    await expect(page.getByTestId('bento-see-all-bandra')).toBeVisible();
    await expect(page.getByTestId('bento-see-all-bandra')).toContainText('See all in Bandra');
  });

  test('jump list includes both real-data neighbourhoods with seeded content', async ({ page }) => {
    await page.goto(`${BASE_URL}/discover/location/Mumbai`, { waitUntil: 'domcontentloaded', timeout: 30_000 });

    const jumpList = page.getByTestId('neighbourhood-jump-list');
    await expect(jumpList).toBeAttached({ timeout: 15_000 });
    await expect(page.getByTestId('jump-bandra')).toBeAttached();
    await expect(page.getByTestId('jump-colaba')).toBeAttached();
  });

  test('signed-in Mumbai captures the actual priority lead and its profile source link', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${BASE_URL}/discover/location/Mumbai`, { waitUntil: 'domcontentloaded', timeout: 30_000 });

    const anchor = page.locator('[data-bento-role="anchor"]').first();
    await expect(anchor).toBeVisible({ timeout: 15_000 });
    // The current live development data has Priya Shah as Mumbai's
    // neighbourhood-local expert. Raj Patel is a city-scoped travel expert;
    // §2 correctly ranks Priya ahead of Raj. Keep this honest assertion until
    // the data owner reclassifies Raj, rather than bending selection rules.
    await expect(anchor).toContainText(/Priya Shah/i);
    await expect(anchor).not.toContainText(/Rhea Desai/i);
    await expect(anchor.getByRole('link', { name: /view profile/i })).toHaveAttribute('href', /^\/(experts|s)\//);

    await page.screenshot({ path: 'test-results/bento-mumbai-top-feed.png', fullPage: false });
  });

  test('Mumbai in 5 days keeps its teal Get this trip CTA', async ({ page }) => {
    await page.goto(`${BASE_URL}/discover/location/Mumbai`, { waitUntil: 'domcontentloaded', timeout: 30_000 });

    // This is the public Mumbai ready-made row, not a fixture stand-in. It
    // protects the channel rule that ready-made purchase actions stay teal
    // rather than inheriting the navy Add to trip treatment.
    const cta = page.getByTestId('btn-view-package-earn-demo-mumbai-local-template');
    await expect(cta).toBeVisible({ timeout: 15_000 });
    await expect(cta).toHaveText('Get this trip');

    const usesToken = async (token: '--earn-teal' | '--earn-navy') =>
      cta.evaluate((element, cssToken) => {
        const probe = document.createElement('span');
        probe.style.backgroundColor = `var(${cssToken})`;
        document.body.appendChild(probe);
        const matches = getComputedStyle(element).backgroundColor === getComputedStyle(probe).backgroundColor;
        probe.remove();
        return matches;
      }, token);

    expect(await usesToken('--earn-teal')).toBe(true);
    expect(await usesToken('--earn-navy')).toBe(false);
  });

  test('signed-in Bandra and Colaba preserve live Bento action and layout rules', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${BASE_URL}/discover/location/Mumbai`, { waitUntil: 'domcontentloaded', timeout: 30_000 });

    for (const slug of ['bandra', 'colaba']) {
      const section = page.getByTestId(`bento-section-${slug}`);
      const grid = page.getByTestId(`bento-grid-${slug}`);
      await expect(section).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId(`bento-eyebrow-${slug}`)).toBeVisible();
      await expect(page.getByTestId(`bento-heading-${slug}`)).not.toHaveText('');
      await expect(page.getByTestId(`bento-see-all-${slug}`)).toContainText(
        `See all in ${slug[0].toUpperCase()}${slug.slice(1)}`,
      );
      await expect
        .poll(() => grid.evaluate((element) => getComputedStyle(element).gridAutoRows))
        .toMatch(/minmax\(0px,\s*auto\)/);

      const tiles = grid.locator('[data-testid^="bento-tile-"]');
      await expect(tiles).not.toHaveCount(0);
      const proof = await tiles.evaluateAll((elements) =>
        elements.map((tile) => {
          const box = tile.getBoundingClientRect();
          const actionState = tile.getAttribute('data-bento-action-state');
          const colSpan = tile.getAttribute('data-col-span');
          const rowSpan = tile.getAttribute('data-row-span');
          const actions = Array.from(tile.querySelectorAll('button, a')).map((action) => {
            const actionBox = action.getBoundingClientRect();
            return {
              tag: action.tagName,
              label: action.textContent?.trim() ?? '',
              contained:
                actionBox.left >= box.left - 1 &&
                actionBox.right <= box.right + 1 &&
                actionBox.top >= box.top - 1 &&
                actionBox.bottom <= box.bottom + 1,
            };
          });
          return { actionState, colSpan, rowSpan, actions };
        }),
      );

      expect(proof.every((tile) => ['platform', 'affiliate', 'not-bookable'].includes(tile.actionState ?? ''))).toBe(true);
      expect(proof.every((tile) => tile.colSpan === '1' || tile.colSpan === '2')).toBe(true);
      expect(proof.every((tile) => tile.rowSpan === '1' || tile.rowSpan === '2')).toBe(true);
      expect(
        proof.flatMap((tile) => tile.actions).filter((action) => !action.contained),
      ).toEqual([]);

      // A section with an anchor gets the one permitted coral action: its plan
      // CTA. Compact cards themselves must not introduce another coral CTA.
      const anchorCount = await section.locator('[data-bento-role="anchor"]').count();
      const coralPlanActions = section.getByRole('button', { name: /^Plan with /i });
      await expect(coralPlanActions).toHaveCount(anchorCount);

      // These sections currently contain gems/partner supply but no compact
      // expert tile. Their relative detail links still prove the card-body
      // navigation contract; the expert source link is asserted above.
      await expect(section.locator('a[href^="/"]')).not.toHaveCount(0);
      await expect(section.locator('[data-bento-action-state="affiliate"] a[href^="/s/"]')).toHaveCount(0);
    }

    await page.getByTestId('bento-section-colaba').screenshot({
      path: 'test-results/bento-colaba.png',
    });
  });
});
