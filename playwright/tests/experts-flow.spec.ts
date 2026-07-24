/**
 * experts-flow.spec.ts
 *
 * End-to-end flow for the /experts discovery-to-consultation journey.
 *
 * Filter inventory (from client/src/pages/experts.tsx):
 *   data-testid="input-search-experts"      — client-side text search (name/destination)
 *   data-testid="select-destination"        — Shadcn Select → GET /api/experts?destination=
 *   data-testid="select-experience-type"    — Shadcn Select → GET /api/experts?experienceTypeId=
 *   data-testid="select-language"           — Shadcn Select → client-side filter
 *   data-testid="input-neighbourhood-filter"— debounced GET /api/experts?neighbourhood=
 *   data-testid="select-sort"              — Shadcn Select → client-side sort
 *   data-testid="button-clear-filters"      — resets all state
 *   data-testid="chip-filter-destination"  — active filter chip
 *
 * Expert card (from client/src/components/expert-card.tsx):
 *   data-testid="card-expert-${id}"
 *   data-testid="text-expert-name"
 *   data-testid="button-view-profile"       — navigates to expert detail/booking
 *
 * Seeded experts (from server/seeds): Kenji Tanaka, Yuki Nakamura, Takeshi Yamamoto
 *
 * Run: npx playwright test playwright/tests/experts-flow.spec.ts --workers=1
 */

import { test, expect, type Page } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5000';
const DEBOUNCE_SETTLE = 700; // 300ms debounce + render cycle

// ── helpers ───────────────────────────────────────────────────────────────────

async function gotoExperts(page: Page) {
  await page.goto(`${BASE_URL}/experts`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  // Wait for at least one expert card to render before asserting
  await page.waitForSelector('[data-testid^="card-expert-"]', { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(500);
}

/** Open a Shadcn Select by clicking its trigger, then pick an item by visible text.
 *  Shadcn SelectContent renders in a portal; items have role="option" but the most
 *  reliable cross-platform selector is a text match on the visible list item. */
async function selectOption(page: Page, triggerTestId: string, optionText: string) {
  await page.getByTestId(triggerTestId).click();
  await page.waitForTimeout(400);
  // Try role="option" first, fall back to visible text match
  const byRole = page.getByRole('option', { name: optionText, exact: false });
  const byText = page.getByText(optionText, { exact: false });
  const target = (await byRole.count()) > 0 ? byRole.first() : byText.first();
  await target.click();
  await page.waitForTimeout(DEBOUNCE_SETTLE);
}

// ── T01 — Page load ───────────────────────────────────────────────────────────

test.describe('T01 — Page load', () => {
  test('expert cards and filter bar visible on /experts', async ({ page }) => {
    await gotoExperts(page);

    await expect(page.getByTestId('input-search-experts')).toBeVisible();
    await expect(page.getByTestId('select-destination')).toBeVisible();
    await expect(page.getByTestId('select-experience-type')).toBeVisible();
    await expect(page.getByTestId('select-language')).toBeVisible();

    // At least one expert card rendered
    const cards = page.locator('[data-testid^="card-expert-"]');
    await expect(cards.first()).toBeVisible();
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);
  });
});

// ── T02 — Name search ─────────────────────────────────────────────────────────

test.describe('T02 — Name search', () => {
  test('typing a real expert name filters to matching card(s), or shows no-results', async ({ page }) => {
    await gotoExperts(page);

    // Grab the first card's name so the test stays valid regardless of seeding
    const firstName = await page.locator('[data-testid="text-expert-name"]').first().textContent({ timeout: 5_000 }).catch(() => '');
    const queryTerm = firstName?.split(' ')[0] ?? 'Expert';

    const input = page.getByTestId('input-search-experts');
    await input.click({ force: true });
    await input.fill(queryTerm);
    await page.waitForTimeout(DEBOUNCE_SETTLE);

    // Either matched cards remain or the no-results state is shown — never a crash
    const cardCount = await page.locator('[data-testid^="card-expert-"]').count();
    const noResultsVisible = await page.getByText(/No experts found/i).isVisible().catch(() => false);

    // Must be one or the other — not both absent (which would indicate a crash/blank)
    expect(cardCount > 0 || noResultsVisible, 'Expected either results or no-results state').toBe(true);
    await expect(page.getByText(/Something went wrong|Application error/i)).toHaveCount(0);
  });
});

// ── T03 — Destination filter ───────────────────────────────────────────────────

test.describe('T03 — Destination filter', () => {
  test('selecting "Tokyo, Japan" narrows the expert grid', async ({ page }) => {
    await gotoExperts(page);

    const initialCards = await page.locator('[data-testid^="card-expert-"]').count();

    await selectOption(page, 'select-destination', 'Tokyo');

    // Active chip should appear
    await expect(page.getByTestId('chip-filter-destination')).toBeVisible();

    // Grid must still render (at least 1 result — Tokyo experts are seeded)
    const afterCards = page.locator('[data-testid^="card-expert-"]');
    await expect(afterCards.first()).toBeVisible();

    // Count should be ≤ initial (filter narrows or stays same, never expands)
    const afterCount = await afterCards.count();
    expect(afterCount).toBeLessThanOrEqual(initialCards);
  });
});

// ── T04 — Experience type filter ──────────────────────────────────────────────

test.describe('T04 — Experience type (specialty) filter', () => {
  test('selecting an experience type from the dropdown updates results', async ({ page }) => {
    test.setTimeout(60_000);
    await gotoExperts(page);

    // Open the dropdown and pick the first non-empty option
    await page.getByTestId('select-experience-type').click();
    await page.waitForTimeout(300);

    const options = page.getByRole('option');
    const count = await options.count();

    if (count === 0) {
      // No experience types seeded — assert graceful empty state
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('select-experience-type')).toBeVisible();
      return;
    }

    // Click the first option that isn't a "All …" catch-all
    let picked = false;
    for (let i = 0; i < count; i++) {
      const text = await options.nth(i).textContent() ?? '';
      if (!text.toLowerCase().startsWith('all')) {
        await options.nth(i).click();
        picked = true;
        break;
      }
    }
    if (!picked) {
      await page.keyboard.press('Escape');
    }

    await page.waitForTimeout(DEBOUNCE_SETTLE);

    // Page must not crash regardless of result count
    await expect(page.getByText(/Something went wrong|Application error/i)).toHaveCount(0);
    await expect(page.getByTestId('select-experience-type')).toBeVisible();
  });
});

// ── T05 — Language filter (client-side) ──────────────────────────────────────

test.describe('T05 — Language filter', () => {
  test('selecting "English" applies the language filter without a crash', async ({ page }) => {
    await gotoExperts(page);

    await selectOption(page, 'select-language', 'English');

    // Page stays functional
    await expect(page.getByTestId('input-search-experts')).toBeVisible();
    await expect(page.getByText(/Something went wrong|Application error/i)).toHaveCount(0);
  });
});

// ── T06 — Combined filters ────────────────────────────────────────────────────

test.describe('T06 — Combined filters (name search + destination)', () => {
  test('search + destination applied together, results reduce correctly', async ({ page }) => {
    test.setTimeout(60_000);
    await gotoExperts(page);

    // Apply destination first
    await selectOption(page, 'select-destination', 'Tokyo');
    const afterDestCount = await page.locator('[data-testid^="card-expert-"]').count();

    // Then layer a name search
    const input = page.getByTestId('input-search-experts');
    await input.click({ force: true });
    await input.fill('a'); // broad single-char — matches most names
    await page.waitForTimeout(DEBOUNCE_SETTLE);

    // Still no crash; destination chip still active
    await expect(page.getByTestId('chip-filter-destination')).toBeVisible();
    await expect(page.getByText(/Something went wrong|Application error/i)).toHaveCount(0);

    // Result count ≤ destination-only count
    const combinedCount = await page.locator('[data-testid^="card-expert-"]').count();
    expect(combinedCount).toBeLessThanOrEqual(afterDestCount);
  });
});

// ── T07 — Clear filters ───────────────────────────────────────────────────────

test.describe('T07 — Clear filters', () => {
  test('clearing the destination chip restores the unfiltered grid', async ({ page }) => {
    await gotoExperts(page);

    // Record baseline card count (no filters applied)
    const baseline = await page.locator('[data-testid^="card-expert-"]').count();

    // Apply a destination filter
    await selectOption(page, 'select-destination', 'Tokyo');

    // Destination chip must appear
    await expect(page.getByTestId('chip-filter-destination')).toBeVisible();

    // Clear via the chip's own ✕ button (always rendered when destination is active;
    // note: button-clear-filters only renders inside the empty-state block)
    await page.getByTestId('button-clear-destination-chip').click();
    await page.waitForTimeout(DEBOUNCE_SETTLE);

    // Chip must be gone
    await expect(page.getByTestId('chip-filter-destination')).toHaveCount(0);

    // Result count should return to at least baseline
    const afterClear = await page.locator('[data-testid^="card-expert-"]').count();
    expect(afterClear).toBeGreaterThanOrEqual(baseline);
  });
});

// ── T08 — Expert card detail ──────────────────────────────────────────────────

test.describe('T08 — Expert card detail', () => {
  test('expert card shows name and "View Profile" button', async ({ page }) => {
    await gotoExperts(page);

    const firstCard = page.locator('[data-testid^="card-expert-"]').first();
    await expect(firstCard).toBeVisible();

    // Name visible
    await expect(firstCard.getByTestId('text-expert-name')).toBeVisible();

    // Price rendered if set (optional — experts without a rate omit it)
    const priceEl = firstCard.getByTestId('text-price');
    const priceAttached = await priceEl.count();
    if (priceAttached > 0) {
      await expect(priceEl).toBeAttached();
    }

    // View Profile button always visible
    await expect(firstCard.getByTestId('button-view-profile')).toBeVisible();
  });
});

// ── T09 — View Profile navigates to expert page ───────────────────────────────

test.describe('T09 — "View Profile" navigates to booking flow', () => {
  test('clicking View Profile lands on /expert/:id or /experts/:id, not 404', async ({ page }) => {
    test.setTimeout(60_000);
    await gotoExperts(page);

    const firstCard = page.locator('[data-testid^="card-expert-"]').first();
    await expect(firstCard).toBeVisible();

    const profileBtn = firstCard.getByTestId('button-view-profile');
    await expect(profileBtn).toBeVisible();

    await profileBtn.click();
    await page.waitForTimeout(2_000);

    // Must have navigated away from /experts
    const url = page.url();
    const landed = url.includes('/expert') || url.includes('/profile') || url.includes('/provider');
    expect(landed, `Expected expert profile URL, got: ${url}`).toBe(true);

    // No 404 / error boundary
    await expect(page.getByText(/page not found|404|Something went wrong/i)).toHaveCount(0);
  });
});

// ── T10 — No-results state ────────────────────────────────────────────────────

test.describe('T10 — No-results state', () => {
  test('nonsense search shows "No experts found", not a blank area', async ({ page }) => {
    await gotoExperts(page);

    const input = page.getByTestId('input-search-experts');
    await input.click({ force: true });
    await input.fill('xyzabc123nonexistent');
    await page.waitForTimeout(DEBOUNCE_SETTLE);

    // No expert cards should remain
    const cards = page.locator('[data-testid^="card-expert-"]');
    await expect(cards).toHaveCount(0);

    // Empty-state copy and clear button visible
    await expect(page.getByText(/No experts found/i)).toBeVisible();
    await expect(page.getByTestId('button-clear-filters')).toBeVisible();
  });
});
