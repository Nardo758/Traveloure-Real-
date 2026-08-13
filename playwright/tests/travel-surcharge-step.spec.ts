/**
 * travel-surcharge-step.spec.ts
 *
 * Lane B1 proof (DECISIONS.md ruling 81) — the provider ServiceForm surcharge section. A provider
 * picks a per-listing `surchargeMode` (none|flat|zones|per_km) in the Transport & Logistics step; the
 * section renders only for a place-anchored listing with a pickup provision. This spec proves the UI
 * RENDERS and INTERACTS (the SS-1 "proved reachable, not just correct" lesson) and that a mode switch
 * PERSISTS while preserving the other mode's config (NEVER-CLOBBER, ruling 62) — the server-side money
 * proof lives in server/__tests__/travel-surcharge.db.test.ts.
 *
 * The spec creates a throwaway in-person draft (pickup on, flat surcharge set) via the owner API,
 * opens its edit page, switches the mode to per_km in the UI, saves, and verifies via the API that
 * per_km persisted AND the flat amount survived. Deleted in a finally block so the shared dev DB is
 * left as the other catalog specs expect.
 *
 * Auth: seeded provider ci-provider@traveloure.test (has a password + mixed-status catalog;
 * kyoto-interpreter is OAuth-only in CI). Per DECISIONS.md ruling 81 lane B1 build instructions.
 */
import { test, expect, type Page, type APIRequestContext } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5000';
const PROVIDER_EMAIL = 'ci-provider@traveloure.test';
const PROVIDER_PASSWORD = 'CITestProvider!99';

async function loginProvider(page: Page) {
  const resp = await page.request.post(`${BASE_URL}/api/auth/login`, {
    headers: { 'Content-Type': 'application/json' },
    data: { email: PROVIDER_EMAIL, password: PROVIDER_PASSWORD },
  });
  expect(resp.ok(), `login failed: ${resp.status()}`).toBeTruthy();
}

async function createFixtureService(req: APIRequestContext): Promise<string> {
  const res = await req.post(`${BASE_URL}/api/provider/services`, {
    headers: { 'Content-Type': 'application/json' },
    data: {
      serviceName: 'B1 surcharge step fixture',
      description: 'ruling-81 lane B1 throwaway',
      price: '150.00',
      priceType: 'fixed',
      deliveryMethod: 'in_person',
      meetingPoint: 'Kyoto Station, Karasuma exit',
      status: 'draft',
      location: 'Kyoto',
      transportProvision: 'pickup_available',
      pickupAvailable: true,
      serviceRadius: 10,
      surchargeMode: 'flat',
      surchargeFlatAmount: '20.00',
    },
  });
  expect(res.status(), `fixture create failed: ${await res.text()}`).toBe(201);
  return (await res.json()).id as string;
}

test.describe('ServiceForm — travel-surcharge section (lane B1)', () => {
  test('surcharge section renders on a pickup listing; a mode switch persists and never-clobbers', async ({ page }) => {
    await loginProvider(page);
    const serviceId = await createFixtureService(page.request);

    try {
      await page.goto(`${BASE_URL}/provider/services/${serviceId}/edit`, {
        waitUntil: 'networkidle',
        timeout: 30_000,
      });

      // A1: the surcharge moved with the rest of the spatial block onto step 4, "Logistics"
      // (in-person is a 5-step flow: Basics · Scheduling · Capacity · Logistics · Review).
      const step4 = page.getByTestId('button-step-4');
      await expect(step4).toBeVisible({ timeout: 15_000 });
      await expect(step4).toHaveAttribute('data-step-key', 'logistics');
      await step4.click();
      await expect(step4).toHaveAttribute('aria-current', 'step');

      // The surcharge section renders (place-anchored + pickup provision), the mode is a SEGMENTED
      // control pre-selected to the saved 'flat', and the flat amount input carries the saved value.
      await expect(page.getByTestId('block-travel-surcharge')).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId('segmented-surcharge-mode')).toBeVisible();
      await expect(page.getByTestId('toggle-surcharge-flat')).toHaveAttribute('data-state', 'on');
      await expect(page.getByTestId('input-surcharge-flat-amount')).toHaveValue('20.00');

      // Switch to per_km — the per-km rate field appears; enter a rate.
      await page.getByTestId('toggle-surcharge-per-km').click();
      await expect(page.getByTestId('toggle-surcharge-per-km')).toHaveAttribute('data-state', 'on');
      const rate = page.getByTestId('input-surcharge-per-km');
      await expect(rate).toBeVisible();
      await rate.fill('1.50');

      // Save the draft.
      await page.getByTestId('button-save-draft').click();
      // The mutation navigates back to the catalog on success.
      await page.waitForURL(/\/provider\/services\b/, { timeout: 20_000 }).catch(() => {});

      // Verify via the owner API: per_km persisted, and the flat amount SURVIVED (never-clobber).
      const after = await page.request.get(`${BASE_URL}/api/provider/services/${serviceId}`);
      expect(after.ok()).toBeTruthy();
      const row = await after.json();
      expect(row.surchargeMode).toBe('per_km');
      expect(Number(row.surchargePerKm)).toBe(1.5);
      expect(Number(row.surchargeFlatAmount)).toBe(20); // preserved across the mode switch
    } finally {
      await page.request.delete(`${BASE_URL}/api/provider/services/${serviceId}`).catch(() => {});
    }
  });
});
