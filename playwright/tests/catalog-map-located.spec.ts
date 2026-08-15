/**
 * catalog-map-located.spec.ts
 *
 * Catalog+Distribute ruling 74/78 lane C4, AMENDED BY LANE M (ledger row 119, Aug 15 2026) —
 * the provider Catalog Map view surfaces an HONEST coverage summary and names every off-map
 * listing with its TRUE reason, and an unlocated listing is never guessed onto the canvas (§13).
 *
 * WHY THIS FILE CHANGED (and the lesson it encodes). Lane M replaced three things this spec
 * asserted, and because the spec was in NO CI workflow, all four of the week's PRs merged green
 * while it silently rotted:
 *   · "X of Y services located on the map"  →  "X of Y place-anchored listings located"
 *   · the `catalog-map-unpinned-rail` + `button-add-pin-<id>` affordance (which only SELECTED a
 *     listing and did nothing — audit finding D-1)  →  a `catalog-map-not-located` list whose
 *     rows carry a REAL link into the authoring door (`link-fix-step4-<id>`)
 *   · one canvas per selected listing  →  the whole located FOOTPRINT (D-5 sibling pins)
 * The spec is now gated by .github/workflows/provider-console-gate.yml so this cannot recur.
 *
 * WHAT IT PROVES (the D-3/D-4 honesty rule, both branches — the reason the fixtures below were
 * chosen). "Not located" is TWO different facts and the UI must not conflate them:
 *   (a) a PLACE-ANCHORED listing with no confirmed pin  → counted as missing, reason
 *       "no confirmed pin — not drawn", and it gets a working fix link;
 *   (b) a REMOTE/ARTIFACT listing                        → NOT counted as missing ("they happen
 *       nowhere, and that is a real answer"), reason "<method> — it happens nowhere", and
 *       deliberately NO fix chip, because there is nothing to fix.
 * The seeded interpreter provider carries exactly one of each: `Business Document Translation`
 * is `async_messaging` (branch b) and `Business Meeting Interpretation (Full Day)` is
 * `in_person` (branch a).
 *
 * THE SEED TRAP (unchanged, still true): every seeded kyoto-interpreter service is born with a
 * neighborhood-centroid pin, so the natural state is "all located". To reach the states above
 * this spec temporarily unpins TWO services through the SAME owner rail the UI uses
 * (PATCH /api/provider/services/:id { locationPoint: null } — the confirm-gated Remove) and
 * RESTORES both in a finally block, so the shared dev DB is left byte-identical for other specs.
 *
 * Auth: seeded provider kyoto-interpreter@traveloure.test / TestPass123!.
 *
 * Relevant source:
 *   client/src/components/provider/catalog-map-view.tsx   (summary, not-located list, doors)
 *   client/src/components/service-location-map.tsx        (located-only render, §13; ruling 22c)
 *   shared/service-fundamentals.ts                        (isPlaceAnchored — the shared predicate)
 *   client/src/lib/property-editor-link.ts                (shape-aware door; PR #487)
 */
import { test, expect, type Page } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5000';
const PROVIDER_EMAIL = 'kyoto-interpreter@traveloure.test';
const PROVIDER_PASSWORD = 'TestPass123!';
/** async_messaging — branch (b): happens nowhere, never counted as missing. */
const REMOTE_SERVICE = 'Business Document Translation';
/** in_person — branch (a): place-anchored, so an absent pin IS a real gap with a fix door. */
const ANCHORED_SERVICE = 'Business Meeting Interpretation (Full Day)';
/** in_person and left pinned throughout — proves a real pin still renders. */
const STAYS_PINNED = 'Conference & Event Interpretation';

/** The canonical 7 minus the two place-anchored methods (shared/service-fundamentals.ts). */
const HAPPENS_NOWHERE_METHODS = new Set(['pdf', 'video', 'call', 'voice_notes', 'async_messaging']);

interface Svc {
  id: string;
  serviceName?: string;
  name?: string;
  latitude?: string | null;
  longitude?: string | null;
  deliveryMethod?: string | null;
  productShape?: string | null;
}

function nameOf(s: Svc): string {
  return s.serviceName ?? s.name ?? '';
}

/** Mirrors isPlaceAnchored(): property shape or in_person/hybrid; an UNCLASSIFIABLE row (no
 *  method, no property shape) stays in the place-anchored bucket rather than being excused. */
function isPlaceAnchored(s: Svc): boolean {
  if (s.productShape === 'property') return true;
  if (!s.deliveryMethod) return true;
  return !HAPPENS_NOWHERE_METHODS.has(s.deliveryMethod);
}

async function loginProvider(page: Page) {
  const resp = await page.request.post(`${BASE_URL}/api/auth/login`, {
    headers: { 'Content-Type': 'application/json' },
    data: { email: PROVIDER_EMAIL, password: PROVIDER_PASSWORD },
  });
  expect(resp.ok(), `login failed: ${resp.status()}`).toBeTruthy();
}

async function loadServices(page: Page): Promise<Svc[]> {
  const resp = await page.request.get(`${BASE_URL}/api/provider/services`);
  expect(resp.ok(), `services read failed: ${resp.status()}`).toBeTruthy();
  return (await resp.json()) as Svc[];
}

async function setPin(page: Page, id: string, point: { lat: number; lng: number } | null) {
  const resp = await page.request.patch(`${BASE_URL}/api/provider/services/${id}`, {
    headers: { 'Content-Type': 'application/json' },
    data: { locationPoint: point },
  });
  return resp.ok();
}

test.describe('/provider/services Map — honest coverage + true per-row reasons (C4 + lane M)', () => {
  test('place-anchored gaps get a fix door; remote listings are never counted as missing', async ({ page }) => {
    await loginProvider(page);

    const before = await loadServices(page);
    const remote = before.find((s) => nameOf(s) === REMOTE_SERVICE);
    const anchored = before.find((s) => nameOf(s) === ANCHORED_SERVICE);
    const pinned = before.find((s) => nameOf(s) === STAYS_PINNED);
    expect(remote, `seeded fixture present: ${REMOTE_SERVICE}`).toBeTruthy();
    expect(anchored, `seeded fixture present: ${ANCHORED_SERVICE}`).toBeTruthy();
    expect(pinned, `seeded fixture present: ${STAYS_PINNED}`).toBeTruthy();

    // Fixture sanity — if the seed's delivery methods ever change, this spec's two branches stop
    // meaning what their names say, so assert the classification rather than trusting it.
    expect(isPlaceAnchored(remote!), `${REMOTE_SERVICE} is a happens-nowhere method`).toBe(false);
    expect(isPlaceAnchored(anchored!), `${ANCHORED_SERVICE} is place-anchored`).toBe(true);

    const origRemote = { lat: Number(remote!.latitude), lng: Number(remote!.longitude) };
    const origAnchored = { lat: Number(anchored!.latitude), lng: Number(anchored!.longitude) };
    expect(Number.isFinite(origRemote.lat) && Number.isFinite(origAnchored.lat), 'both start pinned (seed trap)').toBeTruthy();

    try {
      expect(await setPin(page, remote!.id, null), 'unpin remote').toBeTruthy();
      expect(await setPin(page, anchored!.id, null), 'unpin place-anchored').toBeTruthy();

      // Derive the EXPECTED partition from the API, so the assertion is a real cross-check of the
      // UI's arithmetic rather than a restatement of it.
      const after = await loadServices(page);
      const mappable = after.filter((s) => s.productShape !== 'bundle');
      const placeAnchored = mappable.filter(isPlaceAnchored);
      const placeAnchoredLocated = placeAnchored.filter((s) => (s.latitude ?? null) !== null);
      expect(placeAnchored.length, 'the remote row is EXCLUDED from the place-anchored total').toBeLessThan(mappable.length);

      await page.goto(`${BASE_URL}/provider/services`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await page.getByTestId('button-view-map').click();

      // ── D-2: the read-only posture is stated up front, and the canvas closes with it. ──
      await expect(page.getByTestId('catalog-map-readonly-notice')).toContainText('Traveler preview — read-only');
      await expect(page.getByTestId('catalog-map-readonly-caption')).toContainText(
        'Nothing here can be dragged, armed or placed',
      );

      // ── D-3: the count is over PLACE-ANCHORED listings only, and equals the API partition. ──
      await expect(page.getByTestId('text-located-count')).toHaveText(
        `${placeAnchoredLocated.length} of ${placeAnchored.length} place-anchored listing${placeAnchored.length === 1 ? '' : 's'} located`,
        { timeout: 15_000 },
      );

      const notLocated = page.getByTestId('catalog-map-not-located');
      await expect(notLocated).toBeVisible();

      // ── D-4 branch (a): a place-anchored gap is named as a MISSING PIN and gets a real door. ──
      await expect(page.getByTestId(`not-located-${anchored!.id}`)).toContainText('no confirmed pin — not drawn');
      const fixLink = page.getByTestId(`link-fix-step4-${anchored!.id}`);
      await expect(fixLink).toBeVisible();
      // D-1: the link is REAL navigation into the authoring door — not a no-op selector.
      await expect(fixLink).toHaveAttribute('href', `/provider/services/${anchored!.id}/edit?step=logistics`);

      // ── D-4 branch (b): a remote listing states it happens nowhere and gets NO fix chip. ──
      await expect(page.getByTestId(`nowhere-reason-${remote!.id}`)).toContainText('it happens nowhere');
      await expect(page.getByTestId(`link-fix-step4-${remote!.id}`)).toHaveCount(0);

      // ── §13 NEGATIVE: the unlocated selection is never drawn. Note the canvas still RENDERS
      //    (D-5 draws every OTHER located listing as a sibling — the footprint), so the property
      //    that matters is the absence of a primary pin, not the absence of a map. ──
      await page.getByTestId(`map-view-select-${anchored!.id}`).click();
      await expect(page.locator('[data-testid="catalog-map-canvas-pin"]')).toHaveCount(0);

      // ── A genuinely located listing still renders its real pin. ──
      await page.getByTestId(`map-view-select-${pinned!.id}`).click();
      await expect(page.locator('[data-testid="catalog-map-canvas-pin"]')).toBeVisible({ timeout: 10_000 });

      // ── D-6: the notice's door carries the SELECTED listing's identity, not a generic page. ──
      await expect(page.getByTestId('link-open-logistics')).toHaveAttribute(
        'href',
        `/provider/services/${pinned!.id}/edit?step=logistics`,
      );
    } finally {
      // RESTORE both pins so the shared dev DB matches every other spec's expectations.
      await setPin(page, remote!.id, origRemote).catch(() => {});
      await setPin(page, anchored!.id, origAnchored).catch(() => {});
    }
  });
});
