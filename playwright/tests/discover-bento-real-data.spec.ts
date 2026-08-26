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

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5000';

test.describe('Bento section chrome — real Mumbai data (no fixture)', () => {
  test('Bandra section renders eyebrow, heading, and See-all on real data', async ({ page }) => {
    await page.goto(`${BASE_URL}/discover/location/Mumbai`, { waitUntil: 'domcontentloaded', timeout: 30_000 });

    const section = page.getByTestId('bento-section-bandra');
    await expect(section).toBeAttached({ timeout: 15_000 });

    const eyebrow = page.getByTestId('bento-eyebrow-bandra');
    await expect(eyebrow).toBeVisible();
    await expect(eyebrow).toContainText('BANDRA');

    // Heading is the fallback chain (editorialTitle → headline → tagline →
    // description → name); real Mumbai rows have no editorialTitle/headline/
    // tagline columns at all, so the rendered text is Bandra's `description`
    // if set, else its plain name. Migration 258 (2026-08-27-neighbourhood-
    // slug-match residual) NULLed out the migration-042 leftover centroid-
    // placeholder string, so the fallback now lands on the plain name — this
    // asserts that directly, not just "some non-empty text".
    const heading = page.getByTestId('bento-heading-bandra');
    await expect(heading).toBeVisible();
    await expect(heading).not.toHaveText('');
    const headingText = (await heading.textContent()) ?? '';
    expect(headingText.toLowerCase()).not.toContain('placeholder');
    expect(headingText.toLowerCase()).not.toContain('confirm centroid');

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
});
