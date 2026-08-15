import { test, expect } from '@playwright/test';
import { loginAs } from '../utils/auth';

/**
 * Task #1222 — Short description: save in wizard + display on browse cards
 *
 * Three concerns verified here:
 *
 *   A) ServiceCard on /discover shows `shortDescription` (not the full
 *      description) when the field is populated, and falls back to
 *      `description` when it is absent.
 *
 *   B) The wizard Basics step exposes `input[data-testid="input-short-description"]`
 *      and accepts input.
 *
 *   C) POST /api/provider/services persists `shortDescription` — confirmed by
 *      submitting directly via `page.request` (inherits the provider session cookie)
 *      and asserting the returned record carries the value back.
 */

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5000';

// ── A: Browse card rendering ──────────────────────────────────────────────────

test.describe('ServiceCard short description display on /discover', () => {
  const MOCK_ID = 'svc-short-desc-mock-001';
  const SHORT = 'Compact card summary — one sentence only.';
  const FULL = 'A much longer full description that must never appear on the browse card when a short description is present.';

  function discoverPayload(shortDescription: string | null) {
    return {
      services: [
        {
          id: MOCK_ID,
          userId: 'user-001',
          serviceName: 'Mock Service',
          shortDescription,
          description: FULL,
          categoryId: 'cat-001',
          price: '99',
          location: 'Kyoto',
          averageRating: '4.5',
          reviewCount: 10,
          status: 'active',
          deliveryMethod: 'in-person',
          deliveryTimeframe: '2h',
          revisionsIncluded: 0,
          includesExpertNotes: false,
          providerFirstName: 'Test',
          providerLastName: 'Provider',
          providerImageUrl: null,
        },
      ],
      total: 1,
    };
  }

  test.beforeEach(async ({ page }) => {
    // Keep the categories call from failing; an empty list is fine for these tests.
    await page.route('**/api/service-categories**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
    );
  });

  test('shows shortDescription on the card when it is populated', async ({ page }) => {
    await page.route('**/api/discover**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(discoverPayload(SHORT)),
      }),
    );

    await page.goto(`${BASE_URL}/discover`, { waitUntil: 'domcontentloaded' });

    const card = page.locator(`[data-testid="card-service-${MOCK_ID}"]`);
    await expect(card).toBeVisible({ timeout: 15_000 });

    const desc = page.locator(`[data-testid="text-service-description-${MOCK_ID}"]`);
    await expect(desc).toBeVisible();
    await expect(desc).toContainText(SHORT);
    await expect(desc).not.toContainText(FULL);
  });

  test('falls back to description when shortDescription is absent', async ({ page }) => {
    await page.route('**/api/discover**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(discoverPayload(null)),
      }),
    );

    await page.goto(`${BASE_URL}/discover`, { waitUntil: 'domcontentloaded' });

    const card = page.locator(`[data-testid="card-service-${MOCK_ID}"]`);
    await expect(card).toBeVisible({ timeout: 15_000 });

    const desc = page.locator(`[data-testid="text-service-description-${MOCK_ID}"]`);
    await expect(desc).toBeVisible();
    await expect(desc).toContainText(FULL);
    await expect(desc).not.toContainText(SHORT);
  });
});

// ── B: Wizard Basics step exposes the input ───────────────────────────────────

test.describe('ServiceForm wizard — Basics step has input-short-description', () => {
  test('input is visible and accepts input on the new-service wizard', async ({ page }) => {
    await loginAs(page, 'test-provider@traveloure.test', 'TestPass123!');

    await page.goto(`${BASE_URL}/provider/services/new`, { waitUntil: 'domcontentloaded' });

    // The Basics step is step 1; the field must be immediately visible.
    const input = page.locator('[data-testid="input-short-description"]');
    await expect(input).toBeVisible({ timeout: 20_000 });

    const VALUE = 'Wizard-level short description for task-1222.';
    await input.fill(VALUE);
    await expect(input).toHaveValue(VALUE);
  });
});

// ── C: API persists shortDescription ─────────────────────────────────────────

test.describe('POST /api/provider/services persists shortDescription', () => {
  test('shortDescription is stored and echoed back by the API', async ({ page }) => {
    await loginAs(page, 'test-provider@traveloure.test', 'TestPass123!');

    // Resolve a real categoryId so the service can be created.
    const catsRes = await page.request.get(`${BASE_URL}/api/service-categories`);
    expect(catsRes.ok()).toBe(true);
    const cats = await catsRes.json() as Array<{ id: string }>;
    expect(cats.length, 'At least one service category must exist').toBeGreaterThan(0);
    const categoryId = cats[0].id;

    const SHORT_DESC = `API-confirmed short desc — ${Date.now()}`;

    const res = await page.request.post(`${BASE_URL}/api/provider/services`, {
      data: {
        serviceName: 'Short Desc E2E Test Service',
        description: 'Full description used only as the fallback on browse cards.',
        shortDescription: SHORT_DESC,
        deliveryMethod: 'in_person',
        price: '50',
        status: 'draft',
        categoryId,
      },
    });

    expect(res.status(), `POST /api/provider/services failed: ${await res.text()}`).toBe(201);

    const body = await res.json() as Record<string, unknown>;
    expect(
      body['shortDescription'],
      'shortDescription must be echoed back in the creation response',
    ).toBe(SHORT_DESC);

    // Clean up: delete the draft so it doesn't pollute discover results.
    if (body['id']) {
      await page.request.delete(`${BASE_URL}/api/provider/services/${body['id']}`).catch(() => {});
    }
  });
});
