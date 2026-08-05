// e2e/specs/public-smoke.spec.ts
// PRODUCTION-SAFE SMOKE — strictly UNAUTHENTICATED.
//
// Why this file exists (the split, docs/STAGING.md):
//   Production PURGES every @traveloure.test account on boot (PR #319 P0 fix).
//   That is correct and is enforced by scripts/check-env-allowlist.cjs. So any
//   spec that logs in CANNOT run against production — the old deploy smoke died
//   in global-setup with a 401 on every PR for weeks, which is noise, not signal.
//   Auth-dependent smoke moved to STAGING (e2e/specs/smoke.spec.ts + the journey
//   specs, run by .github/workflows/e2e-staging-auth-smoke.yml).
//
// RULES FOR THIS FILE — do not break them:
//   1. NO login. No storageState. No seeded @traveloure.test account. This file
//      is run by playwright.e2e.public.config.ts, which has NO globalSetup.
//   2. Only public surfaces + unauthenticated health endpoints.
//   3. Assertions must be true of a healthy PRODUCTION deploy, not of a seeded
//      dev database (no "expect N experts" style assertions).
//
// What it proves: the deploy is up, serves real HTML (not a blank shell or a
// 404), and its health/version/readiness endpoints answer.

import { test, expect } from '@playwright/test';

// Explicitly unauthenticated: an empty jar, even if a storageState ever leaks
// into the project config.
test.use({ storageState: { cookies: [], origins: [] } });

// Public routes that must render for an anonymous visitor, each with the
// selector that proves the React app actually MOUNTED that page (as opposed to
// serving an empty shell). Kept deliberately small and stable — this is a smoke
// test, not the route-coverage gate (that is
// .github/workflows/app-routes-gate.yml, which runs in-Actions).
//
// NOTE — verified against client/src/App.tsx, not assumed: /privacy and /terms
// are rendered OUTSIDE `<Layout>` (App.tsx:422-427) and carry their own header,
// so they have NO [data-testid="link-logo"]. A first cut of this spec asserted
// link-logo everywhere and failed on exactly those two against a local build.
const PUBLIC_ROUTES: Array<{ path: string; mount: string }> = [
  { path: '/', mount: '[data-testid="link-logo"]' },
  { path: '/discover', mount: '[data-testid="link-logo"]' },
  { path: '/pricing', mount: '[data-testid="link-logo"]' },
  { path: '/about', mount: '[data-testid="link-logo"]' },
  // Standalone-header pages (no shared nav):
  { path: '/privacy', mount: '[data-testid="text-privacy-title"]' },
  { path: '/terms', mount: '[data-testid="text-terms-title"]' },
];

test.describe('public smoke (unauthenticated — production-safe)', () => {
  for (const { path: route, mount } of PUBLIC_ROUTES) {
    test(`public route renders: ${route}`, async ({ page }) => {
      const response = await page.goto(route, { waitUntil: 'domcontentloaded' });

      // 1. The document itself must not be an error status.
      expect(response, `no response for ${route}`).not.toBeNull();
      const status = response!.status();
      expect(status, `${route} returned HTTP ${status}`).toBeLessThan(400);

      // 2. Not a blank shell: the page's own mount marker must appear. 120 s
      //    because a cold Replit instance can take ~90 s to serve the first JS
      //    bundle.
      await page.waitForSelector(mount, { timeout: 120_000 });

      // 3. Not the 404 surface, and not an empty body.
      const bodyText = (await page.locator('body').innerText().catch(() => '')) ?? '';
      expect(bodyText.trim().length, `${route} rendered an empty body`).toBeGreaterThan(0);
      await expect(
        page.getByText(/404|page not found/i).first(),
        `${route} rendered a 404 surface`,
      ).toHaveCount(0);
    });
  }

  test('GET /health answers with a parseable health document', async ({ request }) => {
    // 200 healthy / 503 unhealthy are BOTH valid answers from a live app — the
    // smoke asserts the endpoint answers and reports a database check, not that
    // every downstream key is configured (that is /api/ready's job, below).
    const res = await request.get('/health');
    expect([200, 503], `/health returned ${res.status()}`).toContain(res.status());
    const body = await res.json();
    expect(body).toHaveProperty('status');
    expect(body).toHaveProperty('checks.database');
  });

  test('GET /api/version reports a build identity', async ({ request }) => {
    const res = await request.get('/api/version');
    expect(res.status(), '/api/version must be 200').toBe(200);
    const body = await res.json();
    expect(typeof body.sha, '/api/version must report a sha').toBe('string');
    expect(String(body.sha).length).toBeGreaterThan(0);
  });

  test('GET /api/ready answers (seeding complete)', async ({ request }) => {
    // 200 = ready + all critical keys present; 503 = either seeding still in
    // progress or a critical key is absent. Both are real answers; a non-JSON
    // body or a 5xx HTML page is not.
    const res = await request.get('/api/ready');
    expect([200, 503], `/api/ready returned ${res.status()}`).toContain(res.status());
    const body = await res.json();
    expect(body).toHaveProperty('ready');
    // If it answers 200 it must claim readiness — a 200 with ready:false would
    // be a contract break in server/index.ts.
    if (res.status() === 200) expect(body.ready).toBe(true);
  });
});
