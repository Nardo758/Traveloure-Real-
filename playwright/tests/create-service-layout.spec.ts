/**
 * create-service-layout.spec.ts
 *
 * Guards the create-service wizard (Basics → Scheduling → Capacity →
 * Logistics) against silent layout regressions that are invisible to the
 * auth-routes smoke test.
 *
 * What it covers:
 *   Basics    — two-column row: "What are you offering?" + "Name it" share
 *               the same immediate grid-container parent (DOM node identity).
 *               Two-column row: Price inputs + description textarea share the
 *               same immediate grid-container parent.
 *   Capacity  — party-size [min] / [max] inputs share the same immediate flex
 *               container. That container and the Seating dropdown share the
 *               same outer Row grid-container.
 *   Logistics — the InfoNote framing banner precedes the map canvas/fallback
 *               (bounding-box Y comparison). The map canvas or map-unavailable
 *               fallback appears above the "Meeting point address" input.
 *
 * Draft hygiene:
 *   The full-flow test (Capacity + Logistics) creates one provider_services
 *   draft. The draft ID is captured from the URL immediately after step 1
 *   advances and is deleted via DELETE /api/provider/services/:id in a
 *   finally block, whether the test passes or fails.
 *
 * Prerequisites:
 *   • Server running at BASE_URL.
 *   • scripts/seed-ci-test-users.ts has run (creates ci-provider@traveloure.test).
 *   • playwright/global-setup.ts has saved playwright/.auth/provider.json
 *     (requires PW_AUTH_SETUP=1).
 *
 * CI home: spec-coverage-gate.yml (runs with PW_AUTH_SETUP=1 + seed-ci-users).
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5000';
const IS_CI = process.env.CI === 'true';
const PROVIDER_AUTH_FILE = path.resolve(process.cwd(), 'playwright/.auth/provider.json');

// ── Shared: advance the wizard one step ───────────────────────────────────────
// Clicks whichever "Next" or "Save draft & continue" button is visible in the
// card footer and waits for the URL to change before returning.
async function clickNext(page: import('@playwright/test').Page): Promise<void> {
  const btn = page.locator('button').filter({
    hasText: /Save draft & continue|Next:/i,
  }).first();
  await expect(btn).toBeVisible({ timeout: 8_000 });
  const currentUrl = page.url();
  await btn.click();
  await page.waitForURL((url) => url.toString() !== currentUrl, { timeout: 15_000 });
}

// ── Shared: session guard ─────────────────────────────────────────────────────
// Verifies the stored cookies yield a real service_provider session.
// In CI mode any failure throws immediately; in local dev it skips the block.
async function assertProviderSession(
  page: import('@playwright/test').Page,
): Promise<void> {
  const res = await page.request.get(`${BASE_URL}/api/auth/session`);
  if (!res.ok()) {
    const msg =
      `[create-service-layout] /api/auth/session returned ${res.status()} ` +
      '— provider auth state is missing or expired. ' +
      'Run scripts/seed-ci-test-users.ts then re-run global-setup.';
    if (IS_CI) throw new Error(msg);
    test.skip(true, msg);
    return;
  }
  const body = await res.json().catch(() => ({}));
  const role: string = body?.user?.role ?? '';
  if (role !== 'service_provider') {
    const msg =
      `[create-service-layout] Session user role is "${role}", expected "service_provider". ` +
      'Check that playwright/.auth/provider.json belongs to ci-provider@traveloure.test.';
    if (IS_CI) throw new Error(msg);
    test.skip(true, msg);
  }
}

// ── Describe block ─────────────────────────────────────────────────────────────
test.describe('Create-service wizard layout', () => {
  test.use({
    storageState: PROVIDER_AUTH_FILE,
    baseURL: BASE_URL,
  });

  test.beforeAll(async ({ browser }) => {
    if (!fs.existsSync(PROVIDER_AUTH_FILE)) {
      console.warn(
        '[create-service-layout] playwright/.auth/provider.json not found — ' +
        'skipping layout tests. Run PW_AUTH_SETUP=1 before this suite.',
      );
      return;
    }
    const ctx = await browser.newContext({ storageState: PROVIDER_AUTH_FILE });
    const page = await ctx.newPage();
    try {
      await assertProviderSession(page);
    } finally {
      await page.close().catch(() => {});
      await ctx.close().catch(() => {});
    }
  });

  // ── Test 1: Basics layout (no draft created — no cleanup needed) ─────────────
  test('Basics step: offering+name and price+description each share a grid-row parent', async ({ page }) => {
    if (!fs.existsSync(PROVIDER_AUTH_FILE)) {
      test.skip(true, 'Auth file missing — run global-setup first.');
      return;
    }

    await page.goto('/provider/services/new', { waitUntil: 'networkidle' });
    await expect(
      page.locator('h3').filter({ hasText: /^Basics$/i }),
    ).toBeVisible({ timeout: 10_000 });

    // ── Row 1 labels ──────────────────────────────────────────────────────────
    await expect(page.getByText('What are you offering?', { exact: true })).toBeVisible();
    await expect(page.getByText('Name it', { exact: true })).toBeVisible();

    // ── Row 1 DOM identity: category select and name input share the same
    //    immediate grid-container (their grandparent = the Row div).
    const row1Shared: boolean = await page.evaluate(() => {
      const catSelect = document.querySelector('select') as HTMLElement | null;
      const nameInput = document.querySelector(
        'input[placeholder*="Morning Tea"]',
      ) as HTMLElement | null;
      if (!catSelect || !nameInput) return false;
      // catSelect → Field div → Row grid
      // nameInput → Field div → Row grid
      return (
        catSelect.parentElement?.parentElement ===
        nameInput.parentElement?.parentElement
      );
    });
    expect(row1Shared).toBe(true);

    // ── Row 2 labels ──────────────────────────────────────────────────────────
    // The Price <label> contains a DotGhost child span ("④"), so its text
    // content is "Price④" — not an exact-text match on "Price" alone.
    // Target the <label> element directly and filter by partial text instead.
    await expect(
      page.locator('label').filter({ hasText: 'Price' }).first(),
    ).toBeVisible();
    await expect(page.getByText('One line about it', { exact: true })).toBeVisible();

    // ── Row 2 DOM identity: price input (inside a flex wrapper) and description
    //    textarea share the same outer grid-container.
    //    price input → flex div → Field div → Row grid
    //    textarea    → Field div → Row grid
    const row2Shared: boolean = await page.evaluate(() => {
      const priceInput = document.querySelector(
        'input[placeholder="$68"]',
      ) as HTMLElement | null;
      const descTextarea = document.querySelector(
        'textarea[placeholder*="90-minute"]',
      ) as HTMLElement | null;
      if (!priceInput || !descTextarea) return false;
      // price input is nested: input → flex-div → Field → Row
      const priceRow =
        priceInput.parentElement?.parentElement?.parentElement ?? null;
      // textarea: textarea → Field → Row
      const descRow = descTextarea.parentElement?.parentElement ?? null;
      return priceRow !== null && priceRow === descRow;
    });
    expect(row2Shared).toBe(true);
  });

  // ── Test 2: Capacity + Logistics layout (creates a draft — cleanup required) ─
  test('Capacity: party-size inline + Seating in same grid row; Logistics: note leads, map above address', async ({ page }) => {
    if (!fs.existsSync(PROVIDER_AUTH_FILE)) {
      test.skip(true, 'Auth file missing — run global-setup first.');
      return;
    }

    // Track the draft ID so we can delete it in the finally block.
    let draftServiceId: string | null = null;

    try {
      // ── Navigate to step 1, fill minimum required data ──────────────────────
      await page.goto('/provider/services/new', { waitUntil: 'networkidle' });
      await expect(
        page.locator('h3').filter({ hasText: /^Basics$/i }),
      ).toBeVisible({ timeout: 10_000 });

      // Delivery method defaults to "in_person" → 5-step flow (the one with
      // Capacity and Logistics). Fill the service name so the draft saves cleanly.
      const nameInput = page.locator('input[placeholder*="Morning Tea"]');
      await nameInput.fill('CI Layout Test Service — delete me');

      // ── Step 1 → Step 2 (Scheduling) ────────────────────────────────────────
      await clickNext(page);

      // Capture the draft ID from the URL immediately after advancing.
      const step2Url = new URL(page.url());
      draftServiceId = step2Url.searchParams.get('id');

      await expect(
        page.locator('h3').filter({ hasText: /^Scheduling$/i }),
      ).toBeVisible({ timeout: 10_000 });

      // ── Step 2 → Step 3 (Capacity) ──────────────────────────────────────────
      await clickNext(page);
      await expect(
        page.locator('h3').filter({ hasText: /^Capacity$/i }),
      ).toBeVisible({ timeout: 10_000 });

      // ── Capacity assertions ──────────────────────────────────────────────────

      // 1. Labels are visible.
      await expect(page.getByText('Party size', { exact: true })).toBeVisible();
      await expect(page.getByText('Seating', { exact: true })).toBeVisible();

      // 2. Both aria-labelled inputs are visible.
      await expect(page.locator('[aria-label="Minimum party size"]')).toBeVisible();
      await expect(page.locator('[aria-label="Maximum party size"]')).toBeVisible();

      // 3. The word "to" separator appears inline between the inputs.
      await expect(page.getByText('to', { exact: true })).toBeVisible();

      // 4. Min + Max inputs share the same immediate flex parent (DOM identity).
      const partySizeInline: boolean = await page.evaluate(() => {
        const minInput = document.querySelector(
          '[aria-label="Minimum party size"]',
        ) as HTMLElement | null;
        const maxInput = document.querySelector(
          '[aria-label="Maximum party size"]',
        ) as HTMLElement | null;
        if (!minInput || !maxInput) return false;
        return minInput.parentElement === maxInput.parentElement;
      });
      expect(partySizeInline).toBe(true);

      // 5. The party-size Field and the Seating select share the same outer Row
      //    grid-container (DOM identity).
      //    minInput → flex div → Field div → Row grid
      //    seatingSelect → Field div → Row grid
      const capacityRowShared: boolean = await page.evaluate(() => {
        const minInput = document.querySelector(
          '[aria-label="Minimum party size"]',
        ) as HTMLElement | null;
        const seatingSelect = Array.from(document.querySelectorAll('select')).find(
          (s) =>
            s.textContent?.includes('Private') ||
            s.textContent?.includes('Shared'),
        ) as HTMLElement | null;
        if (!minInput || !seatingSelect) return false;
        // minInput → flex-div → Field → Row
        const partyRow =
          minInput.parentElement?.parentElement?.parentElement ?? null;
        // seatingSelect → Field → Row
        const seatingRow =
          seatingSelect.parentElement?.parentElement ?? null;
        return partyRow !== null && partyRow === seatingRow;
      });
      expect(capacityRowShared).toBe(true);

      // ── Step 3 → Step 4 (Logistics) ─────────────────────────────────────────
      await clickNext(page);
      await expect(
        page.locator('h3').filter({ hasText: /^Logistics$/i }),
      ).toBeVisible({ timeout: 10_000 });

      // ── Logistics assertions ─────────────────────────────────────────────────

      // 1. InfoNote framing banner leads (unique text from the component).
      const framingNote = page.getByText('One card, one vocabulary.', { exact: false });
      await expect(framingNote).toBeVisible();

      // 2. Map canvas (height:340 wrapper) OR the map-unavailable fallback div.
      //
      //    In CI, VITE_GOOGLE_MAPS_API_KEY is not set → only the fallback renders.
      //    The fallback div is a leaf element whose direct text content IS the
      //    full string below (no children), so getByText with exact:true resolves
      //    to that specific element — not an ancestor — giving a correct bounding box.
      //
      //    When a real API key IS present, the map renders inside a div with
      //    inline style "height: 340px" (set by the map-cursor wrapper in the JSX).
      //
      //    Strategy: attempt to get the real map wrapper's bounding box first.
      //    If it is absent (null), fall through to the exact-text fallback locator.
      const FALLBACK_TEXT =
        'Map unavailable — enter meeting point text below and continue.';

      // The map wrapper div has exactly `height: 340` in its inline style attribute.
      const mapWrapper = page.locator('div[style*="height: 340"]').first();
      // The fallback is a leaf div whose full text equals FALLBACK_TEXT exactly.
      const mapFallbackEl = page.getByText(FALLBACK_TEXT, { exact: true });

      // Wait: at least one of these must become visible.
      await expect(mapWrapper.or(mapFallbackEl).first()).toBeVisible({ timeout: 10_000 });

      // Resolve to the element that is actually in the DOM (stable bounding box).
      const mapBox =
        (await mapWrapper.isVisible().catch(() => false))
          ? await mapWrapper.boundingBox()
          : await mapFallbackEl.boundingBox();

      // 3. "Meeting point address" label + input are visible.
      await expect(
        page.getByText('Meeting point address', { exact: true }),
      ).toBeVisible();

      const meetingInput = page.locator('input[placeholder*="Kennin-ji"]');
      await expect(meetingInput).toBeVisible();

      // 4. DOM order: framing note → map area → meeting-point input (Y-axis).
      const noteBox  = await framingNote.boundingBox();
      const inputBox = await meetingInput.boundingBox();

      if (!noteBox || !mapBox || !inputBox) {
        throw new Error(
          '[create-service-layout] Could not obtain bounding boxes for ' +
          'framing note, map area, or meeting-point input — at least one ' +
          'element is not rendered.',
        );
      }

      // Framing note is above the map.
      expect(noteBox.y).toBeLessThan(mapBox.y);
      // Map area is above the meeting-point input.
      expect(mapBox.y).toBeLessThan(inputBox.y);
    } finally {
      // ── Draft cleanup ────────────────────────────────────────────────────────
      // Always delete the draft — even on test failure / retry — so the CI DB
      // stays clean across runs.
      if (draftServiceId) {
        try {
          await page.request.delete(
            `${BASE_URL}/api/provider/services/${draftServiceId}`,
          );
        } catch {
          // Best-effort: a failed delete doesn't mask a real test failure.
        }
      }
    }
  });
});
