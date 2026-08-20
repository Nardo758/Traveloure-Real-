/**
 * market-research-fidelity.spec.ts — REVIEW-MODE visual capture for Partner
 * Demand · STEP 3.7 Part B (A4 visual deltas).
 *
 * This is NOT a regression gate yet. Per Leon's B4 sequencing ruling
 * (docs/findings/partner-demand-3.7-partB-verification.md), the pixel gate is
 * built with baseline-freezing OFF: its FIRST job is producing screenshots for
 * human eyes, compared against docs/planning/partner-demand-visual-target.html.
 * It uses page.screenshot({ path }) — NOT toHaveScreenshot() — so nothing is
 * frozen as a baseline and no run can "fail as a regression" against the
 * still-unfixed UI. Once Leon approves the captured fidelity, a follow-up flips
 * these to toHaveScreenshot() and the gate becomes a regression guard.
 *
 * What it photographs (logged in as the seeded CI provider, whose Kyoto
 * fixture — scripts/seed-demand-fidelity-fixture.ts — populates the $240
 * early-signal hero):
 *   - the whole /provider/market-research page (Fraunces headline, layout)
 *   - the hero card (gold-wash top band + early-signal tag)
 *   - the ±90-day scrubber band (gold/grey split at today, navy today marker)
 *   - the requested-windows card (calendar↗ row links)
 *
 * The assertions are minimal and structural: they exist only so a genuinely
 * broken page (crash, blank shell, auth failure) fails the capture loudly
 * rather than uploading a screenshot of an error state.
 */

import { test, expect } from '@playwright/test';
import { loginAs } from '../utils/auth';
import * as fs from 'fs';
import * as path from 'path';

const PROVIDER_EMAIL = 'ci-provider@traveloure.test';
const PROVIDER_PASSWORD = 'CITestProvider!99';

const SHOT_DIR = path.resolve(process.cwd(), 'playwright/fidelity-screenshots');

test.beforeAll(() => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
});

test.describe('Partner Demand · Market Research — fidelity capture (review mode)', () => {
  test('capture market-research surfaces', async ({ page }) => {
    await loginAs(page, PROVIDER_EMAIL, PROVIDER_PASSWORD);

    await page.goto('/provider/market-research');

    // Page shell must mount, and the loading skeleton must clear, before we
    // photograph anything — otherwise we capture a skeleton.
    const shell = page.getByTestId('market-research-page');
    await expect(shell).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('market-research-loading')).toBeHidden({ timeout: 30_000 });

    // Give fonts (Fraunces) and any entry transitions a beat to settle so the
    // headline is photographed in its final face, not a fallback flash.
    await page.evaluate(() => (document as any).fonts?.ready).catch(() => {});
    await page.waitForTimeout(500);

    // Whole page.
    await page.screenshot({
      path: path.join(SHOT_DIR, 'market-research-full.png'),
      fullPage: true,
    });

    // Hero card — gold-wash band + (with the fixture) "$240 … early signal".
    const hero = page.getByTestId('market-research-hero');
    if (await hero.isVisible().catch(() => false)) {
      await hero.screenshot({ path: path.join(SHOT_DIR, 'market-research-hero.png') });
    }

    // ±90 scrubber band.
    const scrubber = page.getByTestId('demand-scrubber');
    if (await scrubber.isVisible().catch(() => false)) {
      await scrubber.screenshot({ path: path.join(SHOT_DIR, 'market-research-scrubber.png') });
    }

    // Requested-windows card (row links).
    const windows = page.getByTestId('requested-windows');
    if (await windows.isVisible().catch(() => false)) {
      await windows.screenshot({ path: path.join(SHOT_DIR, 'market-research-windows.png') });
    }
  });
});
