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
 *
 * ── THE TRAVELING PARTY, SAME PATTERN (ledger `2026-09-04-plan-islands`) ────────────────────
 * `trip_participants` is the OTHER list of people on a plan — who is TRAVELING, as against who
 * is INVITED — and Locked Decision 37 keeps the two apart. Its surface is a section on the slip
 * (`SlipTravelingParty`, mounted by `SlipLogisticsSection`, itself owner-only), so a browser
 * cannot see it render without a seeded owner session. What it CAN prove, unauthenticated, is
 * the property that matters most about it: the rails it writes through refuse a caller who is
 * not the plan's owner. Those rows carry names, arrival days, accessibility notes and per-person
 * emergency contacts — the L20 tier-4 disclosure the owner-only gate exists for — so a gate
 * failing open is the one bug on this surface that outranks any layout question.
 *
 * T3's contract read is included for the same reason and with the same shape: the contract board
 * is a read-only surface over `vendor_contracts`, and the endpoint behind it must not answer an
 * anonymous caller either.
 *
 * NEGATIVE SPACE for the party cases: they do NOT prove the section renders, that a write lands,
 * or that the money columns are absent from the screen. The first needs a seeded owner; the last
 * two are proved over the real artifacts by `client/src/lib/__tests__/plan-islands.test.ts` (the
 * body's key list) and `server/__tests__/participant-write-rail.test.ts` (the §19 allowlists).
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

test.describe('plan traveling party', () => {
  test('T1 GET /api/trips/:tripId/participants refuses an anonymous caller', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/trips/1/participants`, {
      headers: { Accept: 'application/json' },
      failOnStatusCode: false,
    });
    // 200 would mean either the gate failed open OR — per CLAUDE.md §9 — the route does not
    // exist and something answered with the catch-all. Both are failures here.
    expect([401, 403]).toContain(res.status());
  });

  test('T2 POST /api/trips/:tripId/participants refuses an anonymous caller', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/trips/1/participants`, {
      headers: { Accept: 'application/json' },
      data: { name: 'Anonymous' },
      failOnStatusCode: false,
    });
    expect([401, 403]).toContain(res.status());
  });

  test('T3 GET /api/trips/:tripId/contracts refuses an anonymous caller', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/trips/1/contracts`, {
      headers: { Accept: 'application/json' },
      failOnStatusCode: false,
    });
    expect([401, 403]).toContain(res.status());
  });
});
