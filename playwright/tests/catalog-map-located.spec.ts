/**
 * catalog-map-located.spec.ts
 *
 * Catalog+Distribute ruling 74/78, lane C4 proof — the provider Catalog Map view surfaces an
 * HONEST provider-wide coverage summary ("X of Y services located") and an unpinned rail, and
 * an unlocated service stays OFF the map (§13). The map renderer + pin/route write paths already
 * existed pre-C4 (ServiceLocationMap / CatalogMapView, rulings 22/62); C4 adds only the coverage
 * summary + unpinned rail on top of that already-honest surface.
 *
 * THE SEED TRAP (verified this session): every seeded kyoto-interpreter service — including the
 * remote/async "Business Document Translation" — is born with a NEIGHBORHOOD-CENTROID pin
 * (kawaramachi-sanjo resolves), so all three are located out of the box and the natural state is
 * "3 of 3". To prove the §13 negative (an unlocated service in the rail, not on the map) this
 * spec temporarily removes ONE service's pin through the SAME owner rail the UI uses
 * (PATCH /api/provider/services/:id { locationPoint: null } — the confirm-gated Remove), which
 * reproduces the mock's "2 of 3 located" state, then RESTORES the pin in a finally block. A psql
 * step in the runner restores the original neighborhood_centroid precision after the suite, so the
 * shared dev DB is left byte-identical for the other catalog specs.
 *
 * Auth: seeded provider kyoto-interpreter@traveloure.test / TestPass123!.
 *
 * Relevant source:
 *   client/src/components/provider/catalog-map-view.tsx   (summary + unpinned rail, C4)
 *   client/src/components/service-location-map.tsx          (located-only render, §13; ruling 22c)
 *   server/utils/service-location.ts                        (locationPoint:null clears the pin)
 */
import { test, expect, type Page } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5000';
const PROVIDER_EMAIL = 'kyoto-interpreter@traveloure.test';
const PROVIDER_PASSWORD = 'TestPass123!';
const REMOTE_SERVICE = 'Business Document Translation'; // async/remote — the one we unpin
const LOCATED_SERVICE = 'Business Meeting Interpretation (Full Day)'; // stays pinned

async function loginProvider(page: Page) {
  const resp = await page.request.post(`${BASE_URL}/api/auth/login`, {
    headers: { 'Content-Type': 'application/json' },
    data: { email: PROVIDER_EMAIL, password: PROVIDER_PASSWORD },
  });
  expect(resp.ok(), `login failed: ${resp.status()}`).toBeTruthy();
}

interface Svc { id: string; serviceName?: string; name?: string; latitude?: string | null; longitude?: string | null }

async function loadServices(page: Page): Promise<Svc[]> {
  const resp = await page.request.get(`${BASE_URL}/api/provider/services`);
  expect(resp.ok(), `services read failed: ${resp.status()}`).toBeTruthy();
  return (await resp.json()) as Svc[];
}

function nameOf(s: Svc): string {
  return s.serviceName ?? s.name ?? '';
}

test.describe('/provider/services Map — honest located count + unpinned rail (lane C4)', () => {
  test('unlocated service lands in the rail and OFF the map; located service renders its pin', async ({ page }) => {
    await loginProvider(page);

    const services = await loadServices(page);
    const remote = services.find((s) => nameOf(s) === REMOTE_SERVICE);
    const located = services.find((s) => nameOf(s) === LOCATED_SERVICE);
    expect(remote, 'seeded remote service present').toBeTruthy();
    expect(located, 'seeded located service present').toBeTruthy();
    const remoteId = remote!.id;
    const locatedId = located!.id;

    // Capture the remote service's real coordinates so the finally block restores them exactly.
    const origLat = remote!.latitude ?? null;
    const origLng = remote!.longitude ?? null;
    expect(origLat && origLng, 'remote service starts pinned (the seed trap)').toBeTruthy();

    try {
      // ── Remove the remote service's pin through the owner rail (the confirm-gated Remove). ──
      const clr = await page.request.patch(`${BASE_URL}/api/provider/services/${remoteId}`, {
        headers: { 'Content-Type': 'application/json' },
        data: { locationPoint: null },
      });
      expect(clr.ok(), `unpin failed: ${clr.status()}`).toBeTruthy();

      // Sanity: the API now reports the remote service as unlocated and the other as located.
      const after = await loadServices(page);
      const remoteAfter = after.find((s) => s.id === remoteId)!;
      const locatedAfter = after.find((s) => s.id === locatedId)!;
      expect(remoteAfter.latitude ?? null, 'remote is now unlocated').toBeNull();
      expect(locatedAfter.latitude ?? null, 'located service still pinned').not.toBeNull();
      const totalMappable = after.filter((s) => (s as any).productShape !== 'bundle').length;
      const locatedMappable = after.filter(
        (s) => (s as any).productShape !== 'bundle' && (s.latitude ?? null) !== null,
      ).length;

      // ── Open Catalog → Map ──────────────────────────────────────────────────────────────────
      await page.goto(`${BASE_URL}/provider/services`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await page.getByTestId('button-view-map').click();

      // (a) The coverage summary is REAL — it equals the API partition, not a guess.
      const summary = page.getByTestId('catalog-map-located-summary');
      await expect(summary).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId('text-located-count')).toHaveText(
        `${locatedMappable} of ${totalMappable} services located on the map`,
      );

      // (b) The unpinned rail lists the genuinely-unlocated remote service with an add-a-pin affordance.
      const rail = page.getByTestId('catalog-map-unpinned-rail');
      await expect(rail).toBeVisible();
      await expect(page.getByTestId(`unpinned-service-${remoteId}`)).toBeVisible();
      const addPin = page.getByTestId(`button-add-pin-${remoteId}`);
      await expect(addPin).toBeVisible();
      await expect(addPin).toContainText(REMOTE_SERVICE);
      await expect(addPin).toContainText('Add a pin');
      // The still-located service must NOT be in the unpinned rail.
      await expect(page.getByTestId(`unpinned-service-${locatedId}`)).toHaveCount(0);

      // (c) §13 NEGATIVE — selecting the unlocated service shows the honest empty canvas, NO map
      //     pin is drawn (never a city-centre fallback). Clicking "Add a pin" selects it.
      await addPin.click();
      await expect(page.getByTestId('catalog-map-empty')).toBeVisible();
      await expect(page.locator('[data-testid="catalog-map-canvas-pin"]')).toHaveCount(0);

      // (d) A located service renders its real pin on the canvas.
      await page.getByTestId(`map-view-select-${locatedId}`).click();
      await expect(page.getByTestId('catalog-map-empty')).toHaveCount(0);
      await expect(page.locator('[data-testid="catalog-map-canvas-pin"]')).toBeVisible({ timeout: 10_000 });
    } finally {
      // ── RESTORE the remote service's pin so the shared DB matches the other specs' expectations.
      if (origLat && origLng) {
        await page.request.patch(`${BASE_URL}/api/provider/services/${remoteId}`, {
          headers: { 'Content-Type': 'application/json' },
          data: { locationPoint: { lat: Number(origLat), lng: Number(origLng) } },
        });
      }
    }
  });
});
