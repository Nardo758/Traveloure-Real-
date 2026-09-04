/**
 * plan-guests.spec.ts — the plan's guest roster surface (/plans/:tripId/guests).
 * Ledger `2026-09-04-guests-per-event`; CLAUDE.md Locked Decision 37.
 *
 * UNAUTHENTICATED BY DESIGN, so this runs on any bench with the app up and no seeded session.
 * The derivation itself is proved purely by `server/__tests__/plan-guest-roster.test.ts` (16
 * proofs, no DB); what a browser can add that a unit test cannot is:
 *
 *   G1  the route is REGISTERED and does not render the SPA's 404 — a new page in App.tsx that
 *       nobody linked is otherwise indistinguishable from a typo'd path.
 *   G2  the roster endpoint REFUSES an anonymous caller. The response carries guest email
 *       addresses and dietary notes, so the gate failing open is the one bug on this surface that
 *       matters more than any layout question. `GET /api/trips/:tripId/guests` is owner-tier
 *       (`authorizeTripOwnerTier`) and must answer 401/403 here — never 200, and never the Vite
 *       catch-all's 200-HTML (CLAUDE.md §9: a dead route is 200-HTML, so a 200 would ALSO mean
 *       the endpoint does not exist).
 *
 * NEGATIVE SPACE (§18d): this spec does not exercise a real roster — that needs a seeded plan with
 * events and invites, which the unit proofs cover far more cheaply and exhaustively.
 */
import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5000';
const NOT_FOUND_HEADING = '404 - Lost at Sea?';

test.describe('plan guest roster', () => {
  test('G1 /plans/:tripId/guests is a registered route, not the SPA 404', async ({ page }) => {
    await page.goto(`${BASE_URL}/plans/1/guests`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(NOT_FOUND_HEADING)).toHaveCount(0);
    // Auth-gated: an anonymous visit bounces to a real page rather than rendering the roster.
    // Either way the document must carry content — a blank shell is the failure this catches.
    await expect(page.locator('h1, h2, h3').first()).toBeVisible();
  });

  test('G2 GET /api/trips/:tripId/guests refuses an anonymous caller', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/trips/1/guests`, {
      headers: { Accept: 'application/json' },
      failOnStatusCode: false,
    });
    expect([401, 403]).toContain(res.status());
  });
});
