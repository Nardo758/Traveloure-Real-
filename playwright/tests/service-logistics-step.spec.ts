/**
 * service-logistics-step.spec.ts
 *
 * Catalog+Distribute ruling 74, lane T1 proof — the Transport & Logistics step, AMENDED BY
 * LANE L's D-9 COLLAPSE (ledger row 119, ratified Aug 15 2026).
 *
 * WHAT D-9 CHANGED HERE. T1 originally asserted a four-value SEGMENTED transport-provision
 * control (`segmented-transport-provision`) beside a separate "do you transport them" dropdown.
 * The step-4 mock's whole thesis is "one transport question, one vocabulary, one step", and the
 * build had re-expanded to six questions, so the ratified collapse reduced them to ONE toggle
 * ("I collect travelers and drop them back") with the spatial detail revealed beneath it. The
 * two ruling-62 columns are no longer ASKED but are NOT derived either — they hydrate and
 * round-trip untouched, which is why the coverage block below still opens for this fixture (its
 * STORED provision says pickup_available) and why the never-clobber assertions still hold.
 * Because this spec was in no CI workflow it kept asserting the removed control through four
 * merged PRs; it is now gated by .github/workflows/provider-console-gate.yml.
 *
 * The load-bearing assertion is unchanged: the NEVER-CLOBBER notice. With a radius AND route
 * stops both saved, the step states out loud that the hidden store's data is preserved on a mode
 * switch — proven in BOTH directions here (the server-side data-survival proof is
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

// WAVE 2 / LANE A1 UPDATE: the wizard branches on the delivery method now, and the four grouped
// sections this spec was written against are no longer one card on one step. For an in-person
// listing (5 steps: Basics · Scheduling · Capacity · Logistics · Review) they are:
//   step 2 "Scheduling" — timing + booking rules   (card-service-logistics)
//   step 3 "Capacity"   — party size               (card-capacity)
//   step 4 "Logistics"  — transport + surcharge    (card-getting-there)
// Same controls, same testids, same write path — only the step that holds each one changed.
test.describe('ServiceForm — Transport & Logistics across the branched steps (lane T1 / A1)', () => {
  test('grouped sections render on their steps, transport is ONE toggle, and never-clobber shows both directions', async ({ page }) => {
    await loginProvider(page);
    const serviceId = await createFixtureService(page.request);

    try {
      // WAVE 2 / LANE S2: `/provider/services/:id/edit` with no `?step=` now lands on the
      // listing home (hero + derived checklist) instead of the wizard — this spec proves the
      // wizard's OWN steps, so it enters the flow the same way a checklist row would, via the
      // A1 deep link.
      await page.goto(`${BASE_URL}/provider/services/${serviceId}/edit?step=scheduling`, {
        waitUntil: 'networkidle',
        timeout: 30_000,
      });

      // A1: this is a 5-step in-person flow, and the indicator says so.
      await expect(page.getByTestId('service-form-steps')).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId('button-step-5')).toBeVisible();
      await expect(page.getByTestId('button-step-6')).toHaveCount(0);
      await expect(page.getByTestId('button-step-2')).toHaveAttribute('data-step-key', 'scheduling');
      await expect(page.getByTestId('button-step-3')).toHaveAttribute('data-step-key', 'capacity');
      await expect(page.getByTestId('button-step-4')).toHaveAttribute('data-step-key', 'logistics');

      // Step 2 "Scheduling" — timing + booking rules.
      const step2 = page.getByTestId('button-step-2');
      await step2.click();
      await expect(step2).toHaveAttribute('aria-current', 'step');
      await expect(page.getByTestId('card-service-logistics')).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId('logistics-section-timing')).toBeVisible();
      await expect(page.getByTestId('logistics-section-booking-rules')).toBeVisible();

      // Step 3 "Capacity" — its own step now (it used to share a card with the rest).
      const step3 = page.getByTestId('button-step-3');
      await step3.click();
      await expect(step3).toHaveAttribute('aria-current', 'step');
      await expect(page.getByTestId('logistics-section-capacity')).toBeVisible({ timeout: 15_000 });

      // Step 4 "Logistics" — everything spatial, including the transport block.
      const step4 = page.getByTestId('button-step-4');
      await step4.click();
      await expect(step4).toHaveAttribute('aria-current', 'step');
      await expect(page.getByTestId('card-getting-there')).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId('logistics-section-transport')).toBeVisible();
      // The map authoring component lives here now (Catalog's map is a traveler preview).
      await expect(page.getByTestId('card-service-map-authoring')).toBeVisible();

      // D-9: transport is ONE toggle. The two questions T1 used to assert are gone from the UI
      // (their columns still round-trip — see the header), and their absence is the ruling.
      await expect(page.getByTestId('switch-collect-travelers')).toBeVisible();
      await expect(page.getByTestId('segmented-transport-provision')).toHaveCount(0);
      await expect(page.getByTestId('select-transport-provided')).toHaveCount(0);
      // The step says WHY pickup lives here and duration does not — the mock's own framing.
      await expect(page.getByTestId('card-getting-there')).toContainText(
        'One transport question, one vocabulary, one step',
      );

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

  /**
   * LANE L (ledger row 119) — the step-4 map-authoring surface itself. None of this had
   * committed coverage before: D-16 the step header, D-10 the Layers card, D-13 the located
   * pill, and — the riskiest change of the batch — D-12, which REMOVED the explicit "Save route"
   * button in favour of a debounced autosave over the unchanged ruling-22a replace-list PUT.
   * A silent write path needs a test more than a button-driven one did, and the assertion that
   * matters is the round-trip: reorder in the UI, then read the row back over the API and prove
   * the new order persisted WITH both stops' coordinates intact (a replace-list that dropped
   * lat/lng would look identical on screen).
   */
  test('map authoring: step header, Layers card, located pill, and stops autosave (lane L)', async ({ page }) => {
    await loginProvider(page);
    const serviceId = await createFixtureService(page.request);

    try {
      await page.goto(`${BASE_URL}/provider/services/${serviceId}/edit?step=logistics`, {
        waitUntil: 'networkidle',
        timeout: 30_000,
      });

      // Land on step 4 DETERMINISTICALLY. The `?step=` deep link raced the row's hydration on the
      // CI runner (the header was still reading "Basics" 15s in, while the same mechanism with
      // `?step=scheduling` landed fine in the test above), and this test's subject is the step's
      // own surface — not the router. Clicking the chip is idempotent when the deep link already
      // won, and deep-link arrival stays covered by the first test in this file.
      await expect(page.getByTestId('service-form-steps')).toBeVisible({ timeout: 20_000 });
      const step4 = page.getByTestId('button-step-4');
      await expect(step4).toHaveAttribute('data-step-key', 'logistics');
      await step4.click();
      await expect(step4).toHaveAttribute('aria-current', 'step');

      // ── D-16: the step names itself and its position in THIS branch's flow. ──
      await expect(page.getByTestId('text-step-long-title')).toHaveText('Logistics — where it happens', {
        timeout: 15_000,
      });
      await expect(page.getByTestId('text-step-position')).toHaveText('Step 4 of 5');

      const authoring = page.getByTestId('card-service-map-authoring');
      await expect(authoring).toBeVisible();

      // ── D-11: a bare canvas click does nothing — placing anything needs an armed mode. ──
      await expect(page.getByTestId('text-arm-state')).toHaveText('Nothing armed. Pick a mode, then click the map.');
      await expect(page.getByTestId('button-place-pin-mode')).toBeVisible();
      await expect(page.getByTestId('button-place-stop-mode')).toBeVisible();

      // ── D-10: the Layers card — three display toggles, zones stated display-only with the
      //    real Pricing & fees door (the listing HOME is the /edit route, not /provider/services/:id
      //    — that href was a 404 caught by the dynamic-links gate on first push). ──
      await expect(page.getByTestId('card-map-layers')).toBeVisible();
      await expect(page.getByTestId('switch-layer-radius')).toBeVisible();
      await expect(page.getByTestId('switch-layer-stops')).toBeVisible();
      await expect(page.getByTestId('switch-layer-zones')).toBeVisible();
      await expect(page.getByTestId('text-layer-zones-note')).toContainText('display only');
      // The testid sits on the <span> INSIDE wouter's <Link>, so the href lives on the enclosing
      // anchor — assert that, not the span (which carries no href at all).
      await expect(page.locator('a', { has: page.getByTestId('link-pricing-fees') })).toHaveAttribute(
        'href',
        `/provider/services/${serviceId}/edit`,
      );

      // ── D-13: the located pill counts the fixture's two located stops. ──
      await expect(page.getByTestId('badge-stops-located')).toHaveText('2 of 2 located');

      // ── D-10 behaviour: a layer toggle really hides its markers (display state only). ──
      const stopMarkers = page.locator('[data-testid^="flow-map-canvas-stop-"]');
      await expect(stopMarkers).toHaveCount(2, { timeout: 15_000 });
      await page.getByTestId('switch-layer-stops').click();
      await expect(stopMarkers).toHaveCount(0);
      await page.getByTestId('switch-layer-stops').click();
      await expect(stopMarkers).toHaveCount(2);

      // ── D-12: the explicit save button is GONE — its absence is the ruling. ──
      await expect(page.getByTestId('button-save-route')).toHaveCount(0);

      // Reorder stop 1 → the debounced autosave fires on settle and reports itself.
      const before = await page.request.get(`${BASE_URL}/api/provider/services/${serviceId}`);
      const beforeStops = ((await before.json()).routePoints ?? []) as Array<{ position: number; name: string }>;
      const firstNameBefore = [...beforeStops].sort((a, b) => a.position - b.position)[0]?.name;

      await page.locator('[data-testid="route-stop-row-1"] button[title="Move down"]').click();
      await expect(page.getByTestId('text-route-autosave-status')).toContainText('autosaved', { timeout: 20_000 });

      // The round-trip proof: the new order PERSISTED and both stops kept their coordinates.
      const after = await page.request.get(`${BASE_URL}/api/provider/services/${serviceId}`);
      const afterStops = ((await after.json()).routePoints ?? []) as Array<{
        position: number;
        name: string;
        latitude: string | null;
        longitude: string | null;
      }>;
      const ordered = [...afterStops].sort((a, b) => a.position - b.position);
      expect(ordered.length, 'both stops survived the replace-list').toBe(2);
      expect(ordered[0].name, 'the reorder persisted without a save click').not.toBe(firstNameBefore);
      for (const s of ordered) {
        expect(s.latitude, `${s.name} kept its latitude through autosave`).not.toBeNull();
        expect(s.longitude, `${s.name} kept its longitude through autosave`).not.toBeNull();
      }
    } finally {
      await page.request.delete(`${BASE_URL}/api/provider/services/${serviceId}`).catch(() => {});
    }
  });
});
