/**
 * market-research-fidelity.spec.ts — REGRESSION guard for Partner Demand ·
 * STEP 3.7 Part B (A4 visual deltas). Frozen on Leon's fidelity sign-off
 * (docs/findings/partner-demand-3.7-partB-verification.md, B4 step 4).
 *
 * ── Why this is HERMETIC (frozen clock + mocked API), not live-DB ──────────
 * These surfaces render LIVE dates: the ±90 scrubber endpoints, the "today"
 * marker position (a % of the window), and the requested-window row date all
 * move every day. A pixel baseline captured against the real clock would fail
 * CI every following day — a different flavour of the very trap the B4
 * sequencing rule guards against. So the regression render is deterministic:
 *   - page.clock freezes the browser clock to a fixed instant, so the
 *     scrubber geometry and every rendered date are stable forever;
 *   - the API is mocked with a fixed payload — the SAME $240/n=3 R29 payload
 *     the read layer returns and that Leon approved — so the gate guards the
 *     RENDERING of these surfaces (Fraunces, gold-wash, scrubber band,
 *     early-signal tag, row links, layout), which is what a fidelity guard is
 *     for. Data correctness is guarded elsewhere (demand suite 33/33, the ⚑
 *     read-layer checks, the reconciliation gates).
 *
 * ── Baselines are linux, CI-validated ──────────────────────────────────────
 * Playwright snapshots are platform-specific (font rasterisation differs). The
 * *-linux baselines under market-research-fidelity.spec.ts-snapshots/ are seeded
 * from a linux runner with this exact Playwright build and then VALIDATED by the
 * gate's own compare run on ubuntu-latest. The canonical refresh path is the
 * workflow's `update_baselines: true` dispatch, which regenerates them on the CI
 * runner and commits them from there — use it if a runner-image change ever
 * drifts the pixels past tolerance. Never eyeball-edit a baseline PNG.
 *
 * ── Font-load gate ────────────────────────────────────────────────────────
 * The hero headline is Fraunces. We wait until the real face is actually
 * loaded before screenshotting, so a font-fetch blip fails the test loudly
 * rather than silently baselining the Georgia fallback.
 */

import { test, expect, type Page } from '@playwright/test';

// Fixed instant — every rendered date derives from this, so the baseline never
// drifts with the calendar.
const FROZEN = new Date('2026-08-20T12:00:00Z');
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (base: Date, n: number) => {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
};
const WINDOW_DAYS = 90;
const fromISO = iso(addDays(FROZEN, -WINDOW_DAYS)); // 2026-05-22
const toISO = iso(addDays(FROZEN, WINDOW_DAYS)); //   2026-11-18
const reqISO = iso(addDays(FROZEN, 2)); //            2026-08-22 (requested, in-window)

// The R29 fixture: one Kyoto market-level unmet_demand_slip cell, $240 over 3
// priced items at n=3 — clears the own-book ENUMERABLE floor (3) as ok + lowN.
const rollup = {
  cadence: 'updated daily',
  window: { from: fromISO, to: toISO },
  historySince: fromISO,
  markets: ['kyoto'],
  rows: [
    {
      marketSlug: 'kyoto',
      date: reqISO,
      metric: 'unmet_demand_slip',
      value: { count: 3, amount: 240, valuedCount: 3 },
      n: 3,
      status: 'ok',
      kind: 'requested',
      lowN: true,
      partnerId: null,
      serviceId: null,
    },
  ],
  summary: [
    {
      marketSlug: 'kyoto',
      requested: {
        slipAmount: 240, slipCount: 3, slipValuedCount: 3, slipLowN: true,
        stayTrips: 0, stayNights: 0, stayTravelers: null, stayLowN: false,
      },
      missed: {
        slipAmount: null, slipCount: 0, slipValuedCount: 0, slipLowN: false,
        stayTrips: 0, stayNights: 0, stayTravelers: null, stayLowN: false,
      },
    },
  ],
};

const user = {
  id: 'fidelity-provider',
  email: 'kyoto-demo@traveloure.test',
  role: 'service_provider', // isProviderRole → passes ProtectedRoute requiredRole="provider"
  firstName: 'Kyoto',
  lastName: 'Provider',
  username: 'kyotoprovider',
  termsAcceptedAt: '2026-01-01T00:00:00Z',
  privacyAcceptedAt: '2026-01-01T00:00:00Z',
  profileImageUrl: null,
};

// A stable viewport so the baseline geometry is fixed regardless of runner defaults.
test.use({ viewport: { width: 1280, height: 1600 }, deviceScaleFactor: 2 });

async function primeAndGoto(page: Page) {
  await page.clock.install({ time: FROZEN });
  // Playwright matches the LAST-registered route first → catch-all first, specifics last.
  await page.route('**/api/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.route('**/api/auth/user', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) }),
  );
  await page.route('**/api/me/demand-rollup**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rollup) }),
  );

  await page.goto('/provider/market-research', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="market-research-page"]', { timeout: 30_000 });
  await page.waitForSelector('[data-testid="market-research-loading"]', { state: 'detached', timeout: 30_000 }).catch(() => {});
  await page.getByTestId('market-research-hero').waitFor({ timeout: 30_000 });

  // Wait for the REAL Fraunces face — fail loudly rather than baseline the fallback.
  await page.waitForFunction(
    () => (document as any).fonts?.check('700 30px Fraunces') === true,
    null,
    { timeout: 15_000 },
  );
  await page.evaluate(() => (document as any).fonts?.ready).catch(() => {});
}

const SHOT_OPTS = { animations: 'disabled' as const, maxDiffPixelRatio: 0.01 };

test.describe('Partner Demand · Market Research — A4 fidelity (frozen)', () => {
  test('hero — $240 early-signal on the gold-wash band', async ({ page }) => {
    await primeAndGoto(page);
    await expect(page.getByTestId('market-research-hero')).toHaveScreenshot('hero.png', SHOT_OPTS);
  });

  test('scrubber — ±90 band, today marker, kind toggles', async ({ page }) => {
    await primeAndGoto(page);
    await expect(page.getByTestId('demand-scrubber')).toHaveScreenshot('scrubber.png', SHOT_OPTS);
  });

  test('requested windows — row + calendar↗ / create links', async ({ page }) => {
    await primeAndGoto(page);
    await expect(page.getByTestId('requested-windows')).toHaveScreenshot('windows.png', SHOT_OPTS);
  });
});
