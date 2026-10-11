// e2e/specs/journey-2.spec.ts
// E2E-2: AI Itinerary Generation → Expert Matching → Advisor Assignment
// Stage 3 exit gate.
//
// Timeouts: Replit Vite dev server needs up to ~50 s cold-start. All link-logo
// and page-element waits use 90 s. Data-dependent flows use conditional skip.

import { test, expect, authFile } from '../fixtures/roles';

const SELECTORS = {
  navLogo: '[data-testid="link-logo"]',
  expertMatchCard: '[data-testid^="card-expert-match-"]',
  tripCard: '[data-testid^="trip-card-"]',
} as const;

/** Wait for the nav logo with a generous cold-start budget. */
async function waitForNav(page) {
  await page.waitForSelector(SELECTORS.navLogo, { timeout: 90_000 });
}

/** Check whether a selector resolves within a short window; return count. */
async function countVisible(page, selector: string, ms = 5_000): Promise<number> {
  try {
    await page.waitForSelector(selector, { timeout: ms });
    return await page.locator(selector).count();
  } catch {
    return 0;
  }
}

// ─── Flow 2A: RETIRED (SS-2 A, ledger `2026-10-10-ss2a-spec-columns`) ──────────
// 2A drove EnhancedPlanningModal, which nothing mounts (LD 33: one planning modal), and
// self-skipped on every run. What it meant to cover is pinned elsewhere, on PR gates:
//   • the free draft on an empty slip (LD 41 (b)) — playwright/tests/slip-rail-actions.spec.ts
//     A5 (slip-rail-actions-gate) and e2e/supply-demand/d4-ai-draft.spec.ts D4, which presses
//     Draft with the AI stub (supply-demand-e2e);
//   • the one planning entry (LD 33) — playwright/tests/planning-entry.spec.ts :63 and :241
//     (unwired-spec-gate).

// ─── Flow 2C: Expert match in discover ───────────────────────────────────

test.describe('Journey 2C — Expert match in discover', () => {
  test.use({ storageState: authFile('traveler') });

  test('ExpertMatchCard renders for destination-aware discover', async ({ page }) => {
    await page.goto('/discover?showExperts=true&destination=Tokyo', { waitUntil: 'domcontentloaded' });
    await waitForNav(page);
    // Scroll to trigger any intersection-observer-gated AIMatchedExpertsSection.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    // 90 s covers Vite cold-start + Grok 8 s abort + fallback cycle.
    await page.waitForSelector(SELECTORS.expertMatchCard, { timeout: 90_000 });
    await expect(page.locator(SELECTORS.expertMatchCard).first()).toBeVisible();
  });
});

// ─── Flow 2D: Expert advisor request from the slip ────────────────────────

test.describe('Journey 2D — Expert advisor request from the slip', () => {
  test.use({ storageState: authFile('traveler') });

  test('advisor-request CTA is reachable on the slip', async ({ page }) => {
    await page.goto('/my-trips', { waitUntil: 'domcontentloaded' });

    const tripCount = await countVisible(page, SELECTORS.tripCard, 30_000);
    if (tripCount === 0) {
      console.log('Journey 2D: no trips found — skipping');
      test.skip();
      return;
    }

    // Trip Card rebuild Phase 3b (ledger 2026-08-31-manifest-is-the-boundary): choosing an
    // expert is a planning decision, so the advisor-request affordance lives on the SLIP
    // (/plans/:tripId).
    //
    // REWRITTEN for ledger `2026-09-05-slip-rail-regroup`: the slip carried TWO advisor pickers
    // (AssignExpertSlot's `button-find-expert` and the pick-based HireExpertDialog), and the rail
    // regroup retired the first — ONE picker (D7). The affordance is now the Build card's
    // "Hand off to a local expert" (`slip-action-hire-expert`), and once an advisor exists the
    // SAME row becomes the one Message control (`slip-action-message-expert`) or, for an expert
    // with no public handle, the honest `slip-expert-no-handle` sentence. Every one of those is a
    // resolved advisor state; what must never happen is a Build card showing none of them.
    const firstCardTestId = await page
      .locator(SELECTORS.tripCard)
      .first()
      .getAttribute('data-testid');
    const tripId = (firstCardTestId ?? '').replace('trip-card-', '');
    expect(tripId, 'derived a trip id from the first card').toBeTruthy();

    await page.goto(`/plans/${tripId}`, { waitUntil: 'domcontentloaded' });
    const slip = page.locator(`[data-testid="slip-view-${tripId}"]`);
    await slip.waitFor({ state: 'visible', timeout: 25_000 });

    // The Build card is the rail's home for the expert row; wait for the card itself, then let
    // its advisor query resolve.
    await page
      .locator('[data-testid="slip-rail-build"]')
      .waitFor({ state: 'visible', timeout: 15_000 })
      .catch(() => null);
    await page
      .waitForSelector('[data-testid="slip-action-hire-expert"]', { timeout: 15_000 })
      .catch(() => null);

    const hasHire = await page
      .locator('[data-testid="slip-action-hire-expert"]')
      .isVisible()
      .catch(() => false);
    const hasMessage = await page
      .locator('[data-testid="slip-action-message-expert"]')
      .isVisible()
      .catch(() => false);
    const hasNoHandleNote =
      (await page.locator('[data-testid="slip-expert-no-handle"]').count()) > 0;

    // Exactly one of the three advisor states is rendered: the picker (no advisor yet), the
    // Message control (an advisor we can address), or the honest sentence for an advisor with no
    // public handle. A Build card showing none of them is the broken slip this asserts against.
    expect(
      hasHire || hasMessage || hasNoHandleNote,
      'the Build card renders one of the three advisor states',
    ).toBe(true);
  });
});
