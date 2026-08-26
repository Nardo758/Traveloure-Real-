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
});
