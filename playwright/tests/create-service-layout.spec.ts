/**
 * create-service-layout.spec.ts
 *
 * Guards the create-service wizard (Basics → Scheduling → Capacity →
 * Logistics → Review) against silent layout regressions.
 *
 * What it covers:
 *   Basics    — two-column row: "What are you offering?" + "Name it"
 *               two-column row: Price inputs + "One line about it" textarea
 *   Capacity  — party-size [min] "to" [max] inputs inline in the same grid
 *               cell, Seating dropdown in the adjacent cell (same Row grid)
 *   Logistics — InfoNote framing banner leads (before map canvas)
 *               map canvas or map-unavailable fallback present above the
 *               "Meeting point address" input
 *
 * Prerequisites:
 *   • Server running
 *   • scripts/seed-ci-test-users.ts has run (creates ci-provider@traveloure.test)
 *   • playwright/global-setup.ts has saved playwright/.auth/provider.json
 *
 * Run alongside auth-routes in the PW_AUTH_SETUP=1 gate.
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5000';
const IS_CI = process.env.CI === 'true';
const PROVIDER_AUTH_FILE = path.resolve(process.cwd(), 'playwright/.auth/provider.json');

// ── Session guard ──────────────────────────────────────────────────────────────
// Verifies that the stored cookies yield a real authenticated session.
// In CI this throws if the session check fails so the gate cannot silently pass
// with guest sessions. In local dev it skips the whole describe so the developer
// workflow is not blocked.
async function assertProviderSession(
  page: import('@playwright/test').Page,
): Promise<void> {
  const res = await page.request.get(`${BASE_URL}/api/auth/session`);
  if (!res.ok()) {
    const msg =
      '[create-service-layout] /api/auth/session returned ' +
      `${res.status()} — provider auth state is missing or expired. ` +
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

// ── Helper: advance the wizard one step ───────────────────────────────────────
// Clicks whichever "Next" or "Save draft & continue" button is visible in the
// card footer and waits for the URL to update before returning.
async function clickNext(page: import('@playwright/test').Page): Promise<void> {
  // The footer button text is either "Save draft & continue →" (step 1, new)
  // or "Next: <StepName> →" for subsequent steps.
  const btn = page.locator('button').filter({
    hasText: /Save draft & continue|Next:/i,
  }).first();
  await expect(btn).toBeVisible({ timeout: 8_000 });
  const currentUrl = page.url();
  await btn.click();
  // Wait for navigation to a new step (URL changes)
  await page.waitForURL((url) => url.toString() !== currentUrl, { timeout: 15_000 });
}

// ── Describe block: runs as the ci-provider user ───────────────────────────────
test.describe('Create-service wizard layout', () => {
  test.use({
    storageState: PROVIDER_AUTH_FILE,
    baseURL: BASE_URL,
  });

  // Verify auth state is present before any test in this block runs.
  test.beforeAll(async ({ browser }) => {
    // Skip entire block gracefully if the auth file was never written (local dev
    // without a running server).
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

  // ── Test 1: Basics step layout ───────────────────────────────────────────────
  test('Basics step shows two two-column rows (offering+name, price+description)', async ({ page }) => {
    if (!fs.existsSync(PROVIDER_AUTH_FILE)) {
      test.skip(true, 'Auth file missing — run global-setup first.');
      return;
    }

    await page.goto('/provider/services/new', { waitUntil: 'networkidle' });

    // ── The card header should show "Basics" ──────────────────────────────────
    await expect(
      page.locator('h3').filter({ hasText: /^Basics$/i }),
    ).toBeVisible({ timeout: 10_000 });

    // ── Row 1: "What are you offering?" select + "Name it" input ─────────────
    // Both labels must be present and the two fields must share a CSS grid row.
    const offeringLabel = page.getByText('What are you offering?', { exact: true });
    const nameLabel = page.getByText('Name it', { exact: true });
    await expect(offeringLabel).toBeVisible();
    await expect(nameLabel).toBeVisible();

    // Verify the two fields are siblings inside the same grid container.
    // The Row component renders: <div style="display:grid;grid-template-columns:1fr 1fr">
    // We locate the category <select> and service-name <input> and assert they
    // share the same parent element.
    const categorySelect = page.locator('select').first();
    const nameInput = page.locator('input[placeholder*="Morning Tea"]');
    await expect(categorySelect).toBeVisible();
    await expect(nameInput).toBeVisible();

    const catParent = await categorySelect.evaluate((el) => el.parentElement?.parentElement?.outerHTML?.slice(0, 80) ?? '');
    const nameParent = await nameInput.evaluate((el) => el.parentElement?.parentElement?.outerHTML?.slice(0, 80) ?? '');
    // Both Field wrappers share a common grid container: their grandparent should be the same node.
    const catGrand = await categorySelect.evaluate((el) =>
      el.parentElement?.parentElement?.parentElement?.getAttribute('style') ?? '',
    );
    const nameGrand = await nameInput.evaluate((el) =>
      el.parentElement?.parentElement?.parentElement?.getAttribute('style') ?? '',
    );
    // Both should sit inside a `display: grid` container with 1fr 1fr columns.
    expect(catGrand).toMatch(/grid/i);
    expect(nameGrand).toMatch(/grid/i);
    // The grid container style must be the same string (same element).
    expect(catGrand).toBe(nameGrand);

    // ── Row 2: Price input + short-description textarea ───────────────────────
    const priceLabel = page.getByText('Price', { exact: true });
    const descLabel  = page.getByText('One line about it', { exact: true });
    await expect(priceLabel).toBeVisible();
    await expect(descLabel).toBeVisible();

    // Price input (placeholder "$68") and textarea share the same grid row.
    const priceInput = page.locator('input[placeholder="$68"]');
    const descTextarea = page.locator('textarea[placeholder*="90-minute"]');
    await expect(priceInput).toBeVisible();
    await expect(descTextarea).toBeVisible();

    const priceGrand = await priceInput.evaluate((el) =>
      // price input is nested inside a flex div, then the Field div, then the Row grid
      el.parentElement?.parentElement?.parentElement?.getAttribute('style') ?? '',
    );
    const descGrand = await descTextarea.evaluate((el) =>
      el.parentElement?.parentElement?.getAttribute('style') ?? '',
    );
    expect(priceGrand).toMatch(/grid/i);
    expect(descGrand).toMatch(/grid/i);
    // Same grid container — confirms side-by-side layout.
    expect(priceGrand).toBe(descGrand);
  });

  // ── Test 2: full wizard flow — Capacity and Logistics layout ─────────────────
  test('Capacity shows party-size inline inputs and Seating side-by-side; Logistics leads with framing note then map', async ({ page }) => {
    if (!fs.existsSync(PROVIDER_AUTH_FILE)) {
      test.skip(true, 'Auth file missing — run global-setup first.');
      return;
    }

    // ── Navigate to step 1 and fill minimum required data ────────────────────
    await page.goto('/provider/services/new', { waitUntil: 'networkidle' });
    await expect(
      page.locator('h3').filter({ hasText: /^Basics$/i }),
    ).toBeVisible({ timeout: 10_000 });

    // Delivery method defaults to "in_person" — the 5-step flow is already
    // selected. Fill in a service name so the draft saves without issues.
    const nameInput = page.locator('input[placeholder*="Morning Tea"]');
    await nameInput.fill('CI Layout Test Service');

    // ── Step 1 → Step 2 (Scheduling) ─────────────────────────────────────────
    await clickNext(page);
    await expect(
      page.locator('h3').filter({ hasText: /^Scheduling$/i }),
    ).toBeVisible({ timeout: 10_000 });

    // ── Step 2 → Step 3 (Capacity) ───────────────────────────────────────────
    await clickNext(page);
    await expect(
      page.locator('h3').filter({ hasText: /^Capacity$/i }),
    ).toBeVisible({ timeout: 10_000 });

    // ── Assert Capacity layout ─────────────────────────────────────────────────
    // 1. "Party size" label is visible.
    await expect(page.getByText('Party size', { exact: true })).toBeVisible();

    // 2. Min and max inputs are both visible.
    const minInput = page.locator('[aria-label="Minimum party size"]');
    const maxInput = page.locator('[aria-label="Maximum party size"]');
    await expect(minInput).toBeVisible();
    await expect(maxInput).toBeVisible();

    // 3. The word "to" appears between them (inline layout).
    await expect(page.getByText('to', { exact: true })).toBeVisible();

    // 4. Both inputs sit inside the same flex container (the inline row).
    const minFlex = await minInput.evaluate((el) =>
      el.parentElement?.getAttribute('style') ?? '',
    );
    const maxFlex = await maxInput.evaluate((el) =>
      el.parentElement?.getAttribute('style') ?? '',
    );
    // Both share the same flex container.
    expect(minFlex).toMatch(/flex/i);
    expect(minFlex).toBe(maxFlex);

    // 5. "Seating" label is visible — its column is in the adjacent grid cell.
    await expect(page.getByText('Seating', { exact: true })).toBeVisible();

    // 6. The Seating select is visible.
    const seatingSelect = page.locator('select').filter({ hasText: /Private|Shared/i }).first();
    await expect(seatingSelect).toBeVisible();

    // 7. Party-size container and Seating field share the same outer Row grid.
    const partyGrid = await minInput.evaluate((el) =>
      // flex div → Field div → Row grid
      el.parentElement?.parentElement?.parentElement?.getAttribute('style') ?? '',
    );
    const seatingGrid = await seatingSelect.evaluate((el) =>
      // select → Field div → Row grid
      el.parentElement?.parentElement?.getAttribute('style') ?? '',
    );
    expect(partyGrid).toMatch(/grid/i);
    expect(seatingGrid).toMatch(/grid/i);
    expect(partyGrid).toBe(seatingGrid);

    // ── Step 3 → Step 4 (Logistics) ───────────────────────────────────────────
    await clickNext(page);
    await expect(
      page.locator('h3').filter({ hasText: /^Logistics$/i }),
    ).toBeVisible({ timeout: 10_000 });

    // ── Assert Logistics layout ────────────────────────────────────────────────
    // 1. The InfoNote framing banner leads — text "One card, one vocabulary."
    const framingNote = page.getByText('One card, one vocabulary.', { exact: false });
    await expect(framingNote).toBeVisible();

    // 2. Map canvas OR the map-unavailable fallback div appears above the
    //    "Meeting point address" input.
    //    The map canvas is a <div> containing the Google Map; the fallback is a
    //    <div> with text "Map unavailable".
    const mapArea = page.locator(
      '[style*="height: 340px"], [style*="height:340px"], div:has-text("Map unavailable")',
    ).first();
    await expect(mapArea).toBeVisible({ timeout: 10_000 });

    // 3. "Meeting point address" label is visible below the map.
    const meetingLabel = page.getByText('Meeting point address', { exact: true });
    await expect(meetingLabel).toBeVisible();

    // 4. The meeting-point input is visible and below (later in DOM) the map area.
    const meetingInput = page.locator('input[placeholder*="Kennin-ji"]');
    await expect(meetingInput).toBeVisible();

    // 5. Confirm DOM order: map area appears before the meeting-point input.
    //    Evaluate both bounding boxes and assert map has a smaller Y coordinate.
    const mapBox     = await mapArea.boundingBox();
    const inputBox   = await meetingInput.boundingBox();
    if (mapBox && inputBox) {
      expect(mapBox.y).toBeLessThan(inputBox.y);
    } else {
      // If either box is null the element is not rendered — fail explicitly.
      throw new Error(
        '[create-service-layout] Could not obtain bounding boxes for map area or ' +
        'meeting-point input — one of them is not rendered.',
      );
    }

    // 6. InfoNote framing banner is above (smaller Y) the map area.
    const noteBox = await framingNote.boundingBox();
    if (noteBox && mapBox) {
      expect(noteBox.y).toBeLessThan(mapBox.y);
    }
  });
});
