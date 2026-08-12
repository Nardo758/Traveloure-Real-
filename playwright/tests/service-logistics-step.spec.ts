/**
 * service-logistics-step.spec.ts
 *
 * Catalog+Distribute ruling 74, lane T1 proof — the polished Transport & Logistics step
 * (ServiceForm step 2). Brings the existing D7 capture (ruling 62/64, migration 195) up to the
 * mock (`artifact ea8cefed`): a SEGMENTED transport-provision choice, an explicit radius/route
 * TOGGLE, and the grouped sections (Getting there · Timing · Capacity · Booking rules). The
 * load-bearing assertion is the NEVER-CLOBBER notice: with a radius AND route stops both saved,
 * the step states out loud that the hidden store's data is preserved on a mode switch — proven in
 * BOTH directions here (the server-side data-survival proof is
 * server/__tests__/service-logistics-never-clobber.http.test.ts).
 *
 * The spec creates a throwaway in-person draft (with a radius + route stops) via the owner API,
 * opens its edit page, and DELETES it in a finally block, so the shared dev DB is left exactly as
 * the C1–C4 catalog specs expect (an untidied draft would shift the "X of Y located" counts).
 *
 * Auth: seeded provider kyoto-interpreter@traveloure.test / TestPass123!.
 */
import { test, expect, type Page, type APIRequestContext } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5000';
const PROVIDER_EMAIL = 'kyoto-interpreter@traveloure.test';
const PROVIDER_PASSWORD = 'TestPass123!';

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
      serviceName: 'T1 logistics step fixture',
      description: 'ruling-74 lane T1 throwaway',
      price: '150.00',
      priceType: 'fixed',
      deliveryMethod: 'in_person',
      meetingPoint: 'Kyoto Station, Karasuma exit',
      status: 'draft',
      location: 'Kyoto',
      transportProvision: 'pickup_available',
      pickupCoverageMode: 'radius',
      pickupAvailable: true,
      serviceRadius: 20,
    },
  });
  expect(res.status(), `fixture create failed: ${await res.text()}`).toBe(201);
  const id = (await res.json()).id as string;

  const put = await req.put(`${BASE_URL}/api/provider/services/${id}/route-points`, {
    headers: { 'Content-Type': 'application/json' },
    data: {
      stops: [
        { name: 'Nishiki Market', latitude: 35.005, longitude: 135.7649 },
        { name: 'Gion Shirakawa', latitude: 35.0055, longitude: 135.7756 },
      ],
    },
  });
  expect(put.status(), `route save failed: ${await put.text()}`).toBe(200);
  return id;
}

test.describe('ServiceForm step 2 — Transport & Logistics (lane T1)', () => {
  test('grouped sections render, provision is segmented, and never-clobber shows both directions', async ({ page }) => {
    await loginProvider(page);
    const serviceId = await createFixtureService(page.request);

    try {
      await page.goto(`${BASE_URL}/provider/services/${serviceId}/edit`, {
        waitUntil: 'networkidle',
        timeout: 30_000,
      });

      // Step 2 is directly clickable in the step indicator. Wait for the form to hydrate (the step
      // nav present) then click and confirm the step actually activated before asserting content.
      const step2 = page.getByTestId('button-step-2');
      await expect(step2).toBeVisible({ timeout: 15_000 });
      await step2.click();
      await expect(step2).toHaveAttribute('aria-current', 'step');

      // The logistics card and all four grouped sections render (the mock's layout).
      await expect(page.getByTestId('card-service-logistics')).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId('logistics-section-transport')).toBeVisible();
      await expect(page.getByTestId('logistics-section-timing')).toBeVisible();
      await expect(page.getByTestId('logistics-section-capacity')).toBeVisible();
      await expect(page.getByTestId('logistics-section-booking-rules')).toBeVisible();

      // Transport provision is a SEGMENTED control (not a dropdown), pre-selected to the saved value.
      const provision = page.getByTestId('segmented-transport-provision');
      await expect(provision).toBeVisible();
      await expect(page.getByTestId('toggle-transport-pickup_available')).toHaveAttribute('data-state', 'on');

      // Coverage is an explicit radius/route toggle, on 'radius' as saved.
      const coverage = page.getByTestId('segmented-pickup-coverage-mode');
      await expect(coverage).toBeVisible();
      await expect(page.getByTestId('toggle-coverage-radius')).toHaveAttribute('data-state', 'on');

      // NEVER-CLOBBER direction 1: on 'radius', the saved ROUTE stops are announced as preserved.
      const notice = page.getByTestId('text-coverage-other-preserved');
      await expect(notice).toBeVisible();
      await expect(notice).toContainText(/route stops? (is|are) saved/i);
      await expect(notice).toContainText(/Nothing was deleted/i);

      // Flip to 'route' — NEVER-CLOBBER direction 2: the saved RADIUS is announced as preserved.
      await page.getByTestId('toggle-coverage-route').click();
      await expect(page.getByTestId('toggle-coverage-route')).toHaveAttribute('data-state', 'on');
      const notice2 = page.getByTestId('text-coverage-other-preserved');
      await expect(notice2).toBeVisible();
      await expect(notice2).toContainText(/service radius is saved/i);
      await expect(notice2).toContainText(/Nothing was deleted/i);
    } finally {
      await page.request.delete(`${BASE_URL}/api/provider/services/${serviceId}`).catch(() => {});
    }
  });
});
