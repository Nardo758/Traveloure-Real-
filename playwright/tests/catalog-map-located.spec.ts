/**
 * catalog-map-located.spec.ts
 *
 * Catalog → Map is a READ-ONLY traveler preview (ruling 22(c) as amended Aug 12, 2026). This spec
 * proves the §13 honesty rules the surface exists to keep, and — since lane M2 (mock conformance
 * round 2) — that the ratified mock's four blocks are actually on the page:
 *   1. the amber read-only notice, carrying the "amends" sentence
 *   2. ONE full-width canvas with the coverage caption UNDER it and "Not located" in the same card
 *   3. "What the traveler sees" — the three rendering rules, drawn from the owner's own listing
 *   4. the ⑫ market-insight placement note and the ⑬ "Render it, or stop collecting it" read-out
 *
 * WHAT THIS SPEC USED TO ASSERT (and why it changed). Lane C4's version expected "X of Y services
 * located on the map" plus a `catalog-map-unpinned-rail` with a "+ Add a pin" button. Lane M
 * replaced all three: the count is over PLACE-ANCHORED listings only (a remote listing happens
 * nowhere — a real answer, not a missing pin), the rail became the mock's "Not located" list, and
 * "+ Add a pin" — which only selected a row and wrote nothing — became a real link into the
 * listing's own Logistics step. The spec was left behind by that lane and is corrected here.
 *
 * THE SEED TRAP (still true): every seeded kyoto-interpreter service — including the remote/async
 * "Business Document Translation" — is born with a NEIGHBORHOOD-CENTROID pin, so all three are
 * located out of the box. To exercise the unlocated path this spec removes ONE service's pin
 * through the SAME owner rail the UI uses (PATCH /api/provider/services/:id { locationPoint: null }),
 * then RESTORES it in a finally block so the shared dev DB is left as the other catalog specs
 * expect it.
 *
 * Auth: seeded provider kyoto-interpreter@traveloure.test / TestPass123!.
 *
 * Relevant source:
 *   client/src/components/provider/catalog-map-view.tsx   (the whole preview surface)
 *   client/src/components/service-location-map.tsx          (located-only render, §13; ruling 22c)
 *   server/utils/service-location.ts                        (locationPoint:null clears the pin)
 */
import { test, expect, type Page } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5000';
const PROVIDER_EMAIL = 'kyoto-interpreter@traveloure.test';
const PROVIDER_PASSWORD = 'TestPass123!';
const REMOTE_SERVICE = 'Business Document Translation'; // async/remote — the one we unpin
const LOCATED_SERVICE = 'Business Meeting Interpretation (Full Day)'; // stays pinned

/**
 * The map surfaces mount Leaflet, which fetches OSM tiles from an external host. Every assertion
 * here is DOM — markers, counts, copy — so the tiles buy the test nothing and cost it a live
 * third-party dependency that simply hangs on a sandboxed or offline runner. Aborted.
 *
 * PRECONDITION, learned the hard way: the seeded provider must have accepted terms
 * (`users.terms_accepted_at` AND `privacy_accepted_at`). Without both, every authenticated console
 * route bounces to `/accept-terms`, so `button-view-map` never renders and the test burns its whole
 * timeout on an auto-waiting click — surfacing as a timeout attributed to the cleanup PATCH in the
 * `finally`, which is the LAST place you would look. If this spec times out with no assertion
 * error, check the terms columns before suspecting the map.
 */
async function blockMapTiles(page: Page) {
  await page.route(/tile\.openstreetmap\.org/, (route) => route.abort());
}

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

test.describe('/provider/services Map — read-only traveler preview (lanes C4 + M + M2)', () => {
  test('unlocated listing is named off-canvas with its true reason; located listing draws its pin', async ({ page }) => {
    await blockMapTiles(page);
    await loginProvider(page);

    const services = await loadServices(page);
    const remote = services.find((s) => nameOf(s) === REMOTE_SERVICE);
    const located = services.find((s) => nameOf(s) === LOCATED_SERVICE);
    expect(remote, 'seeded remote service present').toBeTruthy();
    expect(located, 'seeded located service present').toBeTruthy();
    const remoteId = remote!.id;
    const locatedId = located!.id;

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

      const after = await loadServices(page);
      expect(after.find((s) => s.id === remoteId)!.latitude ?? null, 'remote is now unlocated').toBeNull();
      expect(after.find((s) => s.id === locatedId)!.latitude ?? null, 'located service still pinned').not.toBeNull();

      // ── Open Catalog → Map ──────────────────────────────────────────────────────────────────
      await page.goto(`${BASE_URL}/provider/services`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await page.getByTestId('button-view-map').click();
      await expect(page.getByTestId('catalog-map-preview')).toBeVisible({ timeout: 15_000 });

      // (a) M-10 — the mock's second crumb level.
      await expect(page.getByTestId('text-map-crumbs')).toContainText('Map · Traveler preview');

      // (b) M-2/M-3 — the read-only notice, with the sentence that records this as an AMENDMENT
      //     of ruling 22(b) rather than a silent contradiction of it.
      const notice = page.getByTestId('catalog-map-readonly-notice');
      await expect(notice).toBeVisible();
      await expect(notice).toContainText('Traveler preview — read-only.');
      await expect(notice).toContainText('amends');
      // The "open it →" door is a real link into a listing's own step 4 — never a bare console page.
      await expect(page.getByTestId('link-open-logistics')).toHaveAttribute('href', /\/provider\/(services\/.+\/edit\?step=logistics|workstation\?property=)/);

      // (c) M-4 — the coverage caption counts PLACE-ANCHORED listings and sits under the canvas.
      const count = page.getByTestId('text-located-count');
      await expect(count).toBeVisible();
      await expect(count).toHaveText(/^\d+ of \d+ place-anchored listings? located\.$/);

      // (d) D-4/M-5 — the unpinned REMOTE listing is named with "it happens nowhere", NOT as a
      //     missing pin, and carries no fix affordance (there is nothing to fix).
      const remoteRow = page.getByTestId(`not-located-${remoteId}`);
      await expect(remoteRow).toBeVisible();
      await expect(remoteRow).toContainText('it happens nowhere');
      await expect(page.getByTestId(`link-fix-step4-${remoteId}`)).toHaveCount(0);
      // The still-located service is not in the off-canvas list at all.
      await expect(page.getByTestId(`not-located-${locatedId}`)).toHaveCount(0);

      // (e) §13 NEGATIVE — selecting the unlocated listing draws NO pin for it, and the
      //     "no coordinates — no map" card states the rule rather than guessing a location.
      await page.getByTestId(`map-view-select-${remoteId}`).click();
      await expect(page.getByTestId('tcard-pin-empty')).toBeVisible();
      await expect(page.getByTestId('tcard-nomap-panel')).toContainText('Location shared after booking');

      // (f) A located listing renders its real pin on the one canvas.
      await page.getByTestId(`map-view-select-${locatedId}`).click();
      await expect(page.locator('[data-testid="catalog-map-canvas-pin"]').first()).toBeVisible({ timeout: 10_000 });

      // (g) M-8/M-9 — the two blocks the shipped surface was missing entirely.
      await expect(page.getByTestId('map-insights-placement-note')).toContainText('analytics, not authoring');
      const renderIt = page.getByTestId('render-it-section');
      await expect(renderIt).toBeVisible();
      await expect(renderIt).toContainText('Render it, or stop collecting it');
      // gap #13's open half is NAMED, never faked into a row.
      await expect(page.getByTestId('traveler-facts-unbacked')).toContainText('no field behind them yet');
    } finally {
      if (origLat && origLng) {
        await page.request.patch(`${BASE_URL}/api/provider/services/${remoteId}`, {
          headers: { 'Content-Type': 'application/json' },
          data: { locationPoint: { lat: Number(origLat), lng: Number(origLng) } },
        });
      }
    }
  });
});
