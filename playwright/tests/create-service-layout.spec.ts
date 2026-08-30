/**
 * create-service-layout.spec.ts
 *
 * Guards the create-service wizard (Basics → Scheduling → Capacity →
 * Logistics) against silent layout regressions that are invisible to the
 * auth-routes smoke test.
 *
 * ── RE-ANCHOR (2026-08-17, fix/create-service-spec-regression) ────────────────
 * This spec was authored against a DOM that never existed and was wired into the
 * spec-coverage gate WITHOUT ever running green (ruling 121's spec-rot class): it
 * asserted `h3` step headings (the real heading is `<h2 data-testid=
 * "text-step-long-title">`, D-16 / ledger 119), the SHORT step titles (the real
 * heading renders the LONG title, e.g. "Capacity — how many people"), and field
 * placeholders / aria-labels that are nowhere in ServiceForm ("Morning Tea",
 * "$68", "90-minute", "Minimum party size", "Meeting point address", "Kennin-ji").
 * Every assertion below is now anchored on a STABLE id / data-testid verified
 * against client/src/components/ServiceForm.tsx (the DOM has ledger backing —
 * D-16's h2+testid predates this spec — so the spec conforms to the DOM, not the
 * reverse). Anchor map (spec-intent → real hook → ServiceForm.tsx):
 *   step heading        → getByTestId('text-step-long-title') + toContainText   2527
 *   offering (empty)    → data-testid="button-choose-offering"                  2880
 *   name                → #name                                                 2912
 *   price / price-type  → data-testid="input-base-price" / "select-price-type"  3194/3218
 *   description         → #description                                          3361
 *   party min / max     → data-testid="input-party-size-min" / "-max"           4423/4430
 *   capacity row grid   → data-testid="logistics-section-capacity"              4415
 *   seating             → data-testid="select-seating"                          4449
 *   logistics framing   → text "One card, one vocabulary."                      3825
 *   map area (canvas)   → data-testid="card-service-map-authoring"  service-map-authoring:297
 *   meeting details     → data-testid="input-meeting-details"  service-map-authoring:615
 *
 * What it covers (intent unchanged):
 *   Basics    — the offering field and the name input share one two-column grid
 *               row; the price field and the description share another.
 *   Capacity  — party-size [min]/[max] share an immediate flex parent; that field
 *               and the Seating select share the Capacity row grid.
 *   Logistics — the "one card, one vocabulary" framing note precedes the map
 *               (or its unavailable fallback), which precedes the meeting-point
 *               input (bounding-box Y order).
 *
 * Draft hygiene:
 *   The full-flow test walks the wizard via client-state step advance
 *   (goToStep → setCurrentStep), which saves NO server draft — so it leaves no
 *   provider_services row behind. The finally block's DELETE is defensive (inert
 *   unless a future autosave ever persists a draft into an /:id/edit URL).
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

// ── Shared: assert we are ON a given wizard step ──────────────────────────────
// The step header is a single <h2><span data-testid="text-step-long-title"> that
// renders the current step's LONG title (STEP_LONG_TITLES). Only the current step
// renders it, so containment on the step word is an unambiguous "we're here".
async function expectOnStep(
  page: import('@playwright/test').Page,
  word: string,
): Promise<void> {
  await expect(page.getByTestId('text-step-long-title')).toContainText(word, {
    timeout: 10_000,
  });
}

// ── Shared: advance the wizard one step ───────────────────────────────────────
// The footer "Next:" button (data-testid="button-step-next") advances via
// goToStep() → setCurrentStep(), which is CLIENT STATE ONLY: in create mode the
// URL stays /provider/services/new (the ?step= param is an edit-mode deep-link
// concern), and advancing saves no draft and is not gated on required fields.
// So we click and return — the caller confirms the advance via expectOnStep()
// (the step header re-renders), NOT via a URL change (there isn't one).
async function clickNext(page: import('@playwright/test').Page): Promise<void> {
  const btn = page.getByTestId('button-step-next');
  await expect(btn).toBeVisible({ timeout: 8_000 });
  await btn.click();
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
    await expectOnStep(page, 'Basics');

    // ── Row 1 fields present ────────────────────────────────────────────────────
    // "What are you offering?" is a <Label> that carries a trailing " *", so match
    // it non-exactly; the offering control on a fresh (empty) draft is the
    // "Choose an offering" button. Name is the #name input.
    await expect(page.getByText('What are you offering?', { exact: false }).first()).toBeVisible();
    await expect(page.getByTestId('button-choose-offering')).toBeVisible();
    await expect(page.locator('#name')).toBeVisible();

    // ── Row 1 DOM identity: the offering control and the name input resolve to
    //    the SAME two-column grid row (the `.lg:grid-cols-2` container). Uses
    //    Element.closest on the semantic grid class rather than counting parent
    //    hops, so it survives wrapper churn as long as the row stays one grid.
    const row1Shared: boolean = await page.evaluate(() => {
      const offering = document.querySelector('[data-testid="button-choose-offering"]');
      const name = document.getElementById('name');
      if (!offering || !name) return false;
      const grid = (el: Element | null) => el?.closest('.lg\\:grid-cols-2') ?? null;
      const g1 = grid(offering);
      const g2 = grid(name);
      return g1 !== null && g1 === g2;
    });
    expect(row1Shared).toBe(true);

    // ── Row 2 fields present ────────────────────────────────────────────────────
    await expect(page.getByTestId('input-base-price')).toBeVisible();
    await expect(page.getByTestId('select-price-type')).toBeVisible();
    await expect(page.locator('#description')).toBeVisible();

    // ── Row 2 DOM identity: price input (#basePrice) and description (#description)
    //    resolve to the same two-column grid row. The inner price/tier grids use a
    //    bare `grid-cols-2` (no `lg:` prefix), so closest('.lg:grid-cols-2') skips
    //    them and lands on the outer row — distinguishing the two correctly.
    const row2Shared: boolean = await page.evaluate(() => {
      const price = document.getElementById('basePrice');
      const desc = document.getElementById('description');
      if (!price || !desc) return false;
      const grid = (el: Element | null) => el?.closest('.lg\\:grid-cols-2') ?? null;
      const g1 = grid(price);
      const g2 = grid(desc);
      return g1 !== null && g1 === g2;
    });
    expect(row2Shared).toBe(true);
  });

  // ── Test 2: Capacity + Logistics layout (walks the wizard via client-state ──
  //    step advance; creates no server draft, so cleanup is defensively inert) ──
  test('Capacity: party-size inline + Seating in same grid row; Logistics: note leads, map above address', async ({ page }) => {
    if (!fs.existsSync(PROVIDER_AUTH_FILE)) {
      test.skip(true, 'Auth file missing — run global-setup first.');
      return;
    }

    // Walking the wizard advances via client state (goToStep → setCurrentStep),
    // so NO server draft is created and the URL stays /provider/services/new —
    // normally there is nothing to clean up. draftServiceId stays null unless a
    // future autosave ever persists a draft and reflects its id in an /:id/edit
    // URL, in which case the finally block deletes it (defensive, currently inert).
    let draftServiceId: string | null = null;

    try {
      // ── Navigate to step 1 ──────────────────────────────────────────────────
      // Delivery method defaults to "in_person" → 5-step flow (Basics, Scheduling,
      // Capacity, Logistics, Review). Advancing is not gated on required fields,
      // so no data entry is needed to walk to the Capacity/Logistics steps.
      await page.goto('/provider/services/new', { waitUntil: 'networkidle' });
      await expectOnStep(page, 'Basics');

      // ── Step 1 → Step 2 (Scheduling) — client-state advance, no URL change ───
      await clickNext(page);
      await expectOnStep(page, 'Scheduling');

      // Defensive: if the wizard ever begins reflecting a persisted draft's id in
      // the URL, capture it for cleanup. Today the URL is still /new, so this is null.
      const idMatch = page.url().match(/\/provider\/services\/([^/?#]+)\/edit/);
      if (idMatch) draftServiceId = idMatch[1];

      // ── Step 2 → Step 3 (Capacity) ──────────────────────────────────────────
      await clickNext(page);
      await expectOnStep(page, 'Capacity');

      // ── Capacity assertions ──────────────────────────────────────────────────
      const capacityRow = page.getByTestId('logistics-section-capacity');

      // 1. Labels are visible.
      await expect(page.getByText('Party size', { exact: true })).toBeVisible();
      await expect(page.getByText('Seating', { exact: true })).toBeVisible();

      // 2. Both party-size inputs are visible.
      await expect(page.getByTestId('input-party-size-min')).toBeVisible();
      await expect(page.getByTestId('input-party-size-max')).toBeVisible();

      // 3. The "to" separator appears inline between the inputs (scoped to the
      //    capacity row so it can't match a stray "to" elsewhere on the page).
      await expect(capacityRow.getByText('to', { exact: true })).toBeVisible();

      // 4. Min + Max share the same immediate flex parent (DOM identity).
      const partySizeInline: boolean = await page.evaluate(() => {
        const min = document.querySelector('[data-testid="input-party-size-min"]');
        const max = document.querySelector('[data-testid="input-party-size-max"]');
        return !!min && !!max && min.parentElement === max.parentElement;
      });
      expect(partySizeInline).toBe(true);

      // 5. The party-size field and the Seating select live in the SAME Capacity
      //    row grid (both are descendants of logistics-section-capacity, the
      //    grid-cols-2 container). Containment proves they share the row.
      await expect(capacityRow.getByTestId('input-party-size-min')).toBeVisible();
      await expect(capacityRow.getByTestId('select-seating')).toBeVisible();

      // ── Step 3 → Step 4 (Logistics) ─────────────────────────────────────────
      await clickNext(page);
      await expectOnStep(page, 'Logistics');

      // ── Logistics assertions ─────────────────────────────────────────────────

      // 1. The "one card, one vocabulary" framing note leads.
      const framingNote = page.getByText('One card, one vocabulary.', { exact: false });
      await expect(framingNote).toBeVisible();

      // 2. The map area is the ServiceMapAuthoring card — the map-first canvas the
      //    Logistics step leads with. Its Card wrapper (data-testid=
      //    "card-service-map-authoring") always renders on Logistics, with or
      //    without a maps API key, so it's a stable anchor for presence + Y-order.
      const mapArea = page.getByTestId('card-service-map-authoring');
      await expect(mapArea).toBeVisible({ timeout: 10_000 });

      // 3. Meeting free-text input is visible (label renders "Meeting details *").
      //    Post map-authoring refactor this is the meetingDetails textarea rendered
      //    INSIDE the map-authoring card (durable testid input-meeting-details),
      //    replacing the removed standalone #meetingPoint field.
      const meetingInput = page.getByTestId('input-meeting-details');
      await expect(meetingInput).toBeVisible();

      // 4. DOM order (Y-axis): framing note → map card → meeting input. The meeting
      //    input now lives inside the map-authoring card (the card's canvas precedes
      //    its own inner meeting textarea), so the card top is still above the input.
      const noteBox = await framingNote.boundingBox();
      const mapBox = await mapArea.boundingBox();
      const inputBox = await meetingInput.boundingBox();

      if (!noteBox || !mapBox || !inputBox) {
        throw new Error(
          '[create-service-layout] Could not obtain bounding boxes for ' +
          'framing note, map area, or meeting input — at least one ' +
          'element is not rendered.',
        );
      }

      // Framing note is above the map card.
      expect(noteBox.y).toBeLessThan(mapBox.y);
      // Map card (its canvas) is above the meeting input nested within it.
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
