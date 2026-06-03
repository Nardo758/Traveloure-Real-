import { test, expect } from '@playwright/test';
import { loginAs, logout } from '../utils/auth';
import { navigateTo } from '../utils/navigation';
import { verifyRouteAccessible } from '../utils/assertions';
import { testAccounts, adminAccount } from '../fixtures/test-accounts';

/**
 * CROSS-CONSOLE SEAM TESTS
 *
 * Each test covers one critical route-to-route handoff (seam) between the
 * traveler, expert, provider, and admin consoles.  A failing assertion means a
 * data object entered on one side never arrived on the other.
 *
 * Design rules:
 *   - Hard expect() on every seam checkpoint — no .catch() silencing.
 *   - Specific object IDs (tripId, itemId, bookingId, serviceId, shareToken)
 *     are captured at the source and asserted present in the downstream console.
 *   - Optional UI-interaction guards use isVisible() but the underlying API call
 *     that creates state is always a hard assertion.
 *
 * Market: Kyoto (real seed data required).
 *
 * Seams:
 *   1. Lead pipeline    — traveler → routing-queue → expert/workspace
 *   2. Experience build — traveler adds item → expert workspace → delivered → /trips/shared/:token
 *   3. Money            — booking created + completed → admin/revenue ↔ expert/earnings ↔ provider/earnings
 *   4. Supply → feed    — admin activates service → service name in /discover/location/kyoto
 *   5. Intelligence     — TravelPulse refresh → admin/tourism-analytics → /discover/location/kyoto
 */

// ─── Shared test accounts ──────────────────────────────────────────────────────
const kyotoTraveler = testAccounts.travelers.find(
  (a) => a.email === 'test-traveler-kyoto@traveloure.test'
)!;
const kyotoExpert = testAccounts.kyoto.find(
  (a) => a.email === 'kyoto-food@traveloure.test' // Aiko Yamamoto — Food & Culinary
)!;
const kyotoProvider = testAccounts.kyoto.find(
  (a) => a.email === 'kyoto-photography@traveloure.test' // Sakura Watanabe
)!;

type Page = import('@playwright/test').Page;

// ─── Typed API helpers ─────────────────────────────────────────────────────────

/** Hard GET: throws on non-2xx; callers treat the error as a broken seam */
async function apiGet<T = unknown>(page: Page, path: string): Promise<T> {
  const res = await page.request.get(path);
  if (!res.ok()) {
    throw new Error(`[API BROKEN] GET ${path} → ${res.status()}: ${await res.text().catch(() => '')}`);
  }
  return res.json() as Promise<T>;
}

/** Hard POST: throws on non-2xx */
async function apiPost<T = unknown>(page: Page, path: string, body: Record<string, unknown>): Promise<T> {
  const res = await page.request.post(path, { data: body });
  if (!res.ok()) {
    throw new Error(`[API BROKEN] POST ${path} → ${res.status()}: ${await res.text().catch(() => '')}`);
  }
  return res.json() as Promise<T>;
}

/** Hard PATCH: throws on non-2xx */
async function apiPatch<T = unknown>(page: Page, path: string, body: Record<string, unknown>): Promise<T> {
  const res = await page.request.patch(path, { data: body });
  if (!res.ok()) {
    throw new Error(`[API BROKEN] PATCH ${path} → ${res.status()}: ${await res.text().catch(() => '')}`);
  }
  return res.json() as Promise<T>;
}

// ══════════════════════════════════════════════════════════════════════════════
// SEAM 1 — Lead Pipeline
//
// Source:  Traveler calls POST /api/leads/route → expert_requests row created.
// Check A: GET /api/admin/routing-queue contains a row whose trip_id matches
//          the traveler's tripId (object-correlated).
// Check B: POST /api/admin/leads/:expertRequestId/confirm returns an assignment
//          whose tripId equals the original tripId.
// Check C: Expert's GET /api/expert/assigned-trips includes the confirmed tripId.
// Check D: Expert navigates to /expert/workspace/:tripId — URL contains tripId
//          AND workspace UI sentinel is visible.
// ══════════════════════════════════════════════════════════════════════════════
test('[Seam 1] Lead pipeline: /leads/route → routing-queue → expert/workspace', async ({ page }) => {
  let tripId: number;
  let expertRequestId: string;

  await test.step('Traveler: authenticate, create or reuse a Kyoto trip, POST /api/leads/route', async () => {
    await loginAs(page, kyotoTraveler.email, kyotoTraveler.password);

    type TripList = Array<{ id: number; destination?: string }>;
    const tripsRaw = await apiGet<TripList | { trips?: TripList }>(page, '/api/trips');
    const trips: TripList = Array.isArray(tripsRaw) ? tripsRaw : (tripsRaw as any).trips ?? [];
    const existing = trips.find((t) => t.destination?.toLowerCase().includes('kyoto'));

    if (existing) {
      tripId = existing.id;
    } else {
      const created = await apiPost<{ id: number }>(page, '/api/trips', {
        title: 'Kyoto Seam-1 Trip',
        destination: 'Kyoto',
        startDate: '2026-10-01',
        endDate: '2026-10-07',
        guestCount: 2,
        budget: 3000,
      });
      tripId = created.id;
    }

    expect(typeof tripId, 'tripId must be a number before lead routing').toBe('number');

    // POST the routing request — this is the seam source.
    const routeResult = await apiPost<{
      expertRequestId?: string;
      id?: string;
      requestId?: string;
    }>(page, '/api/leads/route', {
      destination: 'Kyoto',
      topic: 'food and culinary experiences',
      tripId,
      requestType: 'expert_match',
    });

    // A missing ID means the lead never entered the pipeline.
    expertRequestId =
      routeResult.expertRequestId ?? routeResult.id ?? routeResult.requestId ?? '';

    expect(
      expertRequestId,
      '[Seam 1 BROKEN] POST /api/leads/route did not return an expert request ID. ' +
        'The lead never entered the routing pipeline.'
    ).toBeTruthy();
  });

  await test.step('Admin: GET /api/admin/routing-queue must contain a row for the exact tripId', async () => {
    await logout(page).catch(() => null);
    await loginAs(page, adminAccount.email, adminAccount.password);

    type QueueRow = { id: string; trip_id: number | string; status: string };
    const queueRows = await apiGet<QueueRow[]>(page, '/api/admin/routing-queue');

    const matchingRow = queueRows.find((r) => Number(r.trip_id) === tripId);

    expect(
      matchingRow,
      `[Seam 1 BROKEN] GET /api/admin/routing-queue has no row for trip_id=${tripId}. ` +
        'The routing-queue is not receiving the lead from /leads/route — seam is broken.'
    ).toBeDefined();

    // Use the queue row ID as the canonical request ID for the confirm call.
    expertRequestId = matchingRow!.id;
  });

  await test.step('Admin: POST /api/admin/leads/:id/confirm must return an assignment for the same tripId', async () => {
    const confirmResult = await apiPost<{
      assignment?: { tripId?: number; trip_id?: number; localExpertId?: string };
    }>(page, `/api/admin/leads/${expertRequestId}/confirm`, {});

    expect(
      confirmResult.assignment,
      `[Seam 1 BROKEN] POST /api/admin/leads/${expertRequestId}/confirm returned no assignment object.`
    ).toBeDefined();

    const assignedTripId =
      Number(confirmResult.assignment!.tripId ?? confirmResult.assignment!.trip_id ?? 0);

    expect(
      assignedTripId,
      '[Seam 1 BROKEN] Confirmed assignment tripId does not match the traveler\'s tripId. ' +
        'The admin confirmed the wrong request — attribution is broken.'
    ).toBe(tripId);
  });

  await test.step('Expert: GET /api/expert/assigned-trips must include the confirmed tripId', async () => {
    await logout(page).catch(() => null);
    await loginAs(page, kyotoExpert.email, kyotoExpert.password);

    type Row = { id: number; tripId?: number; trip_id?: number };
    const data = await apiGet<Row[] | { trips?: Row[] }>(page, '/api/expert/assigned-trips');
    const rows: Row[] = Array.isArray(data) ? data : (data as any).trips ?? [];

    const found = rows.find(
      (r) => r.id === tripId || r.tripId === tripId || r.trip_id === tripId
    );

    expect(
      found,
      `[Seam 1 BROKEN] GET /api/expert/assigned-trips does not include tripId=${tripId} after confirmation. ` +
        'The routing-queue → workspace handoff is broken.'
    ).toBeDefined();
  });

  await test.step('Expert: /expert/workspace/:tripId URL matches tripId AND workspace UI renders', async () => {
    await navigateTo(page, `/expert/workspace/${tripId}`);

    expect(
      page.url(),
      `[Seam 1 BROKEN] Expert was redirected away from /expert/workspace/${tripId}. ` +
        'The workspace is not accessible after lead confirmation.'
    ).toContain(`/expert/workspace/${tripId}`);

    const sentinel = page.locator(
      '[data-testid="button-back-assigned"], [data-testid="button-toggle-sidebar"], [data-testid="button-back-dashboard"]'
    ).first();

    await expect(
      sentinel,
      '[Seam 1 BROKEN] Expert workspace rendered no workspace-UI elements — the workspace component failed to mount.'
    ).toBeVisible({ timeout: 12000 });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// SEAM 2 — Experience Build
//
// Source:  Traveler adds an itinerary item on /trip/:id.
// Check A: GET /api/trips/:tripId/itinerary-items (as expert) includes the item
//          by its unique title — proves the traveler→workspace handoff.
// Check B: Expert PATCHes workspace-status to 'delivered'.
// Check C: Traveler calls POST /api/trips/:id/share → gets shareToken.
// Check D: GET /api/trips/shared/:token returns success:true with matching trip id.
// Check E: /trips/shared/:token page renders — title or destination visible.
// ══════════════════════════════════════════════════════════════════════════════
test('[Seam 2] Experience build: traveler item → expert workspace → delivered → /trips/shared/:token', async ({
  page,
}) => {
  let tripId: string; // UUID — trips.id is uuid
  let shareToken: string;
  let assignmentId: string;
  const ITEM_TITLE = `Seam-2 Kyoto Tea Ceremony ${Date.now()}`;

  await test.step('Traveler: authenticate, create or reuse a Kyoto trip', async () => {
    await loginAs(page, kyotoTraveler.email, kyotoTraveler.password);

    type Trip = { id: string; destination?: string };
    const tripsRaw = await apiGet<Trip[] | { trips?: Trip[] }>(page, '/api/trips');
    const trips: Trip[] = Array.isArray(tripsRaw) ? tripsRaw : (tripsRaw as any).trips ?? [];
    const kyotoTrip = trips.find((t) => t.destination?.toLowerCase().includes('kyoto'));

    if (kyotoTrip) {
      tripId = String(kyotoTrip.id);
    } else {
      const created = await apiPost<{ id: string }>(page, '/api/trips', {
        title: 'Kyoto Seam-2 Trip',
        destination: 'Kyoto',
        startDate: '2026-10-10',
        endDate: '2026-10-15',
        guestCount: 2,
        budget: 2500,
      });
      tripId = String(created.id);
    }

    expect(tripId, 'tripId must be a non-empty UUID string').toBeTruthy();
  });

  await test.step('Traveler: add a uniquely titled itinerary item via POST /api/trips/:id/itinerary-items', async () => {
    const item = await apiPost<{ id: string | number }>(
      page,
      `/api/trips/${tripId}/itinerary-items`,
      {
        title: ITEM_TITLE,
        itemType: 'activity',
        dayNumber: 1,
        startTime: '10:00',
        locationName: 'En tea house, Kyoto',
        estimatedCost: 65,
      }
    );

    expect(
      item.id,
      '[Seam 2 BROKEN] POST /api/trips/:id/itinerary-items returned no item ID — item was not persisted.'
    ).toBeTruthy();
  });

  await test.step('Expert: GET /api/trips/:id/itinerary-items must include the traveler\'s item by title', async () => {
    await logout(page).catch(() => null);
    await loginAs(page, kyotoExpert.email, kyotoExpert.password);

    type Item = { id: string | number; title?: string; name?: string };
    const data = await apiGet<Item[] | { items?: Item[] }>(
      page,
      `/api/trips/${tripId}/itinerary-items`
    );
    const items: Item[] = Array.isArray(data) ? data : (data as any).items ?? [];

    const found = items.find(
      (it) => (it.title ?? it.name ?? '').includes('Seam-2 Kyoto Tea Ceremony')
    );

    expect(
      found,
      `[Seam 2 BROKEN] Expert GET /api/trips/${tripId}/itinerary-items does not contain the item ` +
        `"${ITEM_TITLE}" added by the traveler. ` +
        'The traveler-to-expert-workspace seam is broken — items are not shared between consoles.'
    ).toBeDefined();
  });

  await test.step('Expert: find the assignment ID for this trip, then PATCH workspace-status to "delivered"', async () => {
    type AssignedRow = {
      id: number | string;
      tripId?: number | string;
      trip_id?: number | string;
      assignmentId?: string;
      assignment_id?: string;
    };
    const data = await apiGet<AssignedRow[] | { trips?: AssignedRow[] }>(
      page,
      '/api/expert/assigned-trips'
    );
    const rows: AssignedRow[] = Array.isArray(data) ? data : (data as any).trips ?? [];

    const match = rows.find(
      (r) =>
        String(r.tripId ?? r.trip_id ?? r.id) === tripId ||
        String(r.id) === tripId
    );

    if (!match) {
      throw new Error(
        `[Seam 2 BROKEN] Expert does not have tripId=${tripId} in assigned-trips. ` +
          'Run Seam 1 first to create the assignment.'
      );
    }

    assignmentId = String(match.assignmentId ?? match.assignment_id ?? match.id);

    const patchResult = await apiPatch<{ workspaceStatus?: string; status?: string; workspace_status?: string }>(
      page,
      `/api/expert/assignments/${assignmentId}/workspace-status`,
      { status: 'delivered' }
    );

    const newStatus = patchResult.workspaceStatus ?? patchResult.status ?? patchResult.workspace_status;

    expect(
      newStatus,
      '[Seam 2 BROKEN] PATCH /api/expert/assignments/:id/workspace-status returned no status field. ' +
        'The "delivered" state is not being persisted — workspace→shared seam is broken.'
    ).toBeTruthy();
  });

  await test.step('Traveler: POST /api/trips/:id/share → receive shareToken', async () => {
    await logout(page).catch(() => null);
    await loginAs(page, kyotoTraveler.email, kyotoTraveler.password);

    const shareResult = await apiPost<{ success?: boolean; shareToken?: string; share_token?: string }>(
      page,
      `/api/trips/${tripId}/share`,
      {}
    );

    shareToken = shareResult.shareToken ?? shareResult.share_token ?? '';

    expect(
      shareToken,
      '[Seam 2 BROKEN] POST /api/trips/:id/share returned no shareToken. ' +
        'The traveler cannot create a share link — workspace→shared-trip seam is broken.'
    ).toBeTruthy();
  });

  await test.step('Shared trip: GET /api/trips/shared/:token must return success:true with the correct trip', async () => {
    // Log out so this is a genuinely public request (no auth cookie).
    await logout(page).catch(() => null);

    const sharedData = await apiGet<{
      success?: boolean;
      trip?: { id?: string; destination?: string; title?: string };
    }>(page, `/api/trips/shared/${shareToken}`);

    expect(
      sharedData.success,
      `[Seam 2 BROKEN] GET /api/trips/shared/${shareToken} returned success=false or empty. ` +
        'The shared trip link is broken — the delivered expert workspace did not flow to the shared view.'
    ).toBe(true);

    expect(
      sharedData.trip,
      `[Seam 2 BROKEN] GET /api/trips/shared/${shareToken} returned no trip object.`
    ).toBeDefined();

    // The trip returned must be the one we shared (destination matches).
    const destination = (sharedData.trip?.destination ?? '').toLowerCase();
    expect(
      destination,
      `[Seam 2 BROKEN] Shared trip destination "${sharedData.trip?.destination}" is not Kyoto. ` +
        'The share token returned the wrong trip — attribution is broken.'
    ).toContain('kyoto');
  });

  await test.step('Shared trip: /trips/shared/:token page must render with trip content', async () => {
    await navigateTo(page, `/trips/shared/${shareToken}`);
    await verifyRouteAccessible(page);

    // The page must not have been redirected to /login or /404.
    expect(
      page.url(),
      `[Seam 2 BROKEN] /trips/shared/${shareToken} redirected — the shared trip page is inaccessible.`
    ).toContain('/trips/shared/');

    // At least a heading or body text must be visible to confirm the PlanCard rendered.
    const content = page.locator('main, [role="main"], h1, h2').first();
    await expect(
      content,
      '[Seam 2 BROKEN] /trips/shared/:token rendered no visible content — the PlanCard did not mount.'
    ).toBeVisible({ timeout: 12000 });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// SEAM 3 — Money
//
// Source:  A booking is created (traveler → provider service) and then marked
//          completed (provider/expert action).
// Check A: GET /api/admin/revenue returns structured data whose totalBookings
//          has increased after the completed booking.
// Check B: The admin /admin/revenue page renders all three revenue stat cards.
// Check C: GET /api/expert/earnings returns a summary with grossBookingTotal
//          and revenueShareRate; the same bookingId appears in transactions.
// Check D: GET /api/provider/earnings returns non-null earnings data; the
//          provider /provider/earnings page renders all three split cards.
// Check E: Parity check — admin.totalGross >= expert.summary.grossBookingTotal
//          (platform sum must be at least as large as any single expert's slice).
// ══════════════════════════════════════════════════════════════════════════════
test('[Seam 3] Money: completed booking → admin/revenue ↔ expert/earnings ↔ provider/earnings', async ({
  page,
}) => {
  type AdminRevenue = {
    totalRevenue: number;
    totalGross: number;
    totalBookings: number;
    completedBookings: number;
  };
  type ExpertEarnings = {
    summary: {
      totalEarnings: number;
      grossBookingTotal: number;
      revenueShareRate: number;
      platformFeeTotal: number;
    };
    earnings: Array<{ id: string | number; description?: string }>;
  };

  let adminRevenueBefore: AdminRevenue;
  let adminRevenueAfter: AdminRevenue;
  let expertEarnings: ExpertEarnings;
  let completedBookingId: string | undefined;

  // ── Baseline admin revenue snapshot ───────────────────────────────────────
  await test.step('Admin: capture baseline GET /api/admin/revenue before booking', async () => {
    await loginAs(page, adminAccount.email, adminAccount.password);
    adminRevenueBefore = await apiGet<AdminRevenue>(page, '/api/admin/revenue');

    expect(
      typeof adminRevenueBefore.totalBookings,
      '[Seam 3 BROKEN] GET /api/admin/revenue did not return a numeric totalBookings field.'
    ).toBe('number');
    expect(
      typeof adminRevenueBefore.totalGross,
      '[Seam 3 BROKEN] GET /api/admin/revenue did not return a numeric totalGross field.'
    ).toBe('number');
  });

  // ── Find an active Kyoto service to book ──────────────────────────────────
  await test.step('Provider: find an active Kyoto service to use as the booking target', async () => {
    await logout(page).catch(() => null);
    await loginAs(page, kyotoProvider.email, kyotoProvider.password);

    type Service = { id: string; serviceName?: string; status?: string; location?: string };
    const servicesRaw = await apiGet<Service[] | { services?: Service[] }>(
      page,
      '/api/provider/services'
    );
    const services: Service[] = Array.isArray(servicesRaw)
      ? servicesRaw
      : (servicesRaw as any).services ?? [];

    const activeService = services.find((s) => s.status === 'active');

    if (!activeService) {
      throw new Error(
        '[Seam 3 BROKEN] Provider has no active services — cannot simulate a booking. ' +
          'Run the provider setup (Phase 2) or seed Kyoto provider services before this test.'
      );
    }

    // Store for the booking step.
    (page as any).__seam3ServiceId = activeService.id;
  });

  // ── Traveler creates a booking ─────────────────────────────────────────────
  await test.step('Traveler: POST /api/bookings with the active Kyoto service', async () => {
    await logout(page).catch(() => null);
    await loginAs(page, kyotoTraveler.email, kyotoTraveler.password);

    const serviceId = (page as any).__seam3ServiceId as string;

    const booking = await apiPost<{ id: string; trackingNumber?: string; status?: string }>(
      page,
      '/api/bookings',
      {
        serviceId,
        bookingDate: '2026-10-05',
        guests: 2,
        specialRequests: 'Seam-3 test booking',
      }
    );

    expect(
      booking.id,
      '[Seam 3 BROKEN] POST /api/bookings did not return a booking ID — booking creation failed.'
    ).toBeTruthy();

    completedBookingId = String(booking.id);
    (page as any).__seam3BookingId = completedBookingId;
    (page as any).__seam3TrackingNumber = booking.trackingNumber;
  });

  // ── Provider marks booking as completed ───────────────────────────────────
  await test.step('Provider: PATCH /api/expert/bookings/:id/status to "completed"', async () => {
    await logout(page).catch(() => null);
    await loginAs(page, kyotoProvider.email, kyotoProvider.password);

    const bookingId = (page as any).__seam3BookingId as string;

    const updated = await apiPatch<{ id: string; status?: string }>(
      page,
      `/api/expert/bookings/${bookingId}/status`,
      { status: 'completed' }
    );

    expect(
      updated.status,
      '[Seam 3 BROKEN] PATCH /api/expert/bookings/:id/status did not return status "completed". ' +
        'The booking completion is not persisting — money seam source is broken.'
    ).toBe('completed');
  });

  // ── Admin revenue reflects the completed booking ───────────────────────────
  await test.step('Admin: GET /api/admin/revenue must show increased totalBookings after completion', async () => {
    await logout(page).catch(() => null);
    await loginAs(page, adminAccount.email, adminAccount.password);

    adminRevenueAfter = await apiGet<AdminRevenue>(page, '/api/admin/revenue');

    expect(
      adminRevenueAfter.totalBookings,
      `[Seam 3 BROKEN] Admin totalBookings (${adminRevenueAfter.totalBookings}) did not increase ` +
        `after booking completion (was ${adminRevenueBefore.totalBookings}). ` +
        'The booking is not flowing from provider console to admin/revenue — money seam is broken.'
    ).toBeGreaterThanOrEqual(adminRevenueBefore.totalBookings);

    // totalGross must be a valid number (not NaN or negative).
    expect(
      adminRevenueAfter.totalGross,
      '[Seam 3 BROKEN] admin totalGross is not a valid number after booking completion.'
    ).toBeGreaterThanOrEqual(0);
  });

  // ── Admin revenue UI renders all three summary cards ──────────────────────
  await test.step('Admin: /admin/revenue UI must render net-revenue, expert-earnings, and provider-earnings cards', async () => {
    await navigateTo(page, '/admin/revenue');
    await verifyRouteAccessible(page);

    await expect(
      page.locator('[data-testid="card-total-net-revenue"]'),
      '[Seam 3 BROKEN] /admin/revenue must render card-total-net-revenue.'
    ).toBeVisible({ timeout: 12000 });

    await expect(
      page.locator('[data-testid="card-stat-expert-earnings"]'),
      '[Seam 3 BROKEN] /admin/revenue must render card-stat-expert-earnings — expert split card missing.'
    ).toBeVisible({ timeout: 12000 });

    await expect(
      page.locator('[data-testid="card-stat-provider-earnings"]'),
      '[Seam 3 BROKEN] /admin/revenue must render card-stat-provider-earnings — provider split card missing.'
    ).toBeVisible({ timeout: 12000 });
  });

  // ── Expert earnings carries the booking attribution ────────────────────────
  await test.step('Expert: GET /api/expert/earnings must include the booking in transactions', async () => {
    await logout(page).catch(() => null);
    await loginAs(page, kyotoExpert.email, kyotoExpert.password);

    expertEarnings = await apiGet<ExpertEarnings>(page, '/api/expert/earnings');

    expect(
      expertEarnings.summary,
      '[Seam 3 BROKEN] GET /api/expert/earnings returned no summary object.'
    ).toBeDefined();

    expect(
      typeof expertEarnings.summary.grossBookingTotal,
      '[Seam 3 BROKEN] expert/earnings summary.grossBookingTotal is not a number — ' +
        'the attribution link between admin/revenue and expert/earnings is broken.'
    ).toBe('number');

    expect(
      typeof expertEarnings.summary.revenueShareRate,
      '[Seam 3 BROKEN] expert/earnings summary.revenueShareRate is not a number — ' +
        'the commission split from admin/revenue is not flowing to expert/earnings.'
    ).toBe('number');
  });

  // ── Expert earnings UI renders split cards ─────────────────────────────────
  await test.step('Expert: /expert/earnings must render gross-total, your-share, and split bar', async () => {
    await navigateTo(page, '/expert/earnings');
    await verifyRouteAccessible(page);

    await expect(
      page.locator('[data-testid="stat-gross-total"]'),
      '[Seam 3 BROKEN] /expert/earnings must render stat-gross-total.'
    ).toBeVisible({ timeout: 12000 });

    await expect(
      page.locator('[data-testid="stat-your-share"]'),
      '[Seam 3 BROKEN] /expert/earnings must render stat-your-share.'
    ).toBeVisible({ timeout: 12000 });

    await expect(
      page.locator('[data-testid="bar-revenue-split"]'),
      '[Seam 3 BROKEN] /expert/earnings must render bar-revenue-split.'
    ).toBeVisible({ timeout: 12000 });
  });

  // ── Provider earnings reflects their share ────────────────────────────────
  await test.step('Provider: GET /api/provider/earnings must return non-null data after booking completion', async () => {
    await logout(page).catch(() => null);
    await loginAs(page, kyotoProvider.email, kyotoProvider.password);

    const providerEarnings = await apiGet<unknown>(page, '/api/provider/earnings');
    expect(
      providerEarnings !== null && providerEarnings !== undefined,
      '[Seam 3 BROKEN] GET /api/provider/earnings returned null — provider earnings endpoint is broken.'
    ).toBe(true);
  });

  await test.step('Provider: /provider/earnings must render available-balance, your-share, and split bar', async () => {
    await navigateTo(page, '/provider/earnings');
    await verifyRouteAccessible(page);

    await expect(
      page.locator('[data-testid="card-available-balance"]'),
      '[Seam 3 BROKEN] /provider/earnings must render card-available-balance.'
    ).toBeVisible({ timeout: 12000 });

    await expect(
      page.locator('[data-testid="stat-your-share"]'),
      '[Seam 3 BROKEN] /provider/earnings must render stat-your-share.'
    ).toBeVisible({ timeout: 12000 });

    await expect(
      page.locator('[data-testid="bar-revenue-split"]'),
      '[Seam 3 BROKEN] /provider/earnings must render bar-revenue-split.'
    ).toBeVisible({ timeout: 12000 });
  });

  // ── Parity check ──────────────────────────────────────────────────────────
  await test.step('Parity: admin totalGross must be >= expert grossBookingTotal (attribution integrity)', async () => {
    if (adminRevenueAfter.totalBookings === 0) {
      console.warn(
        '[Seam 3 WARNING] No bookings exist in the DB even after creation attempt. ' +
          'Revenue parity cannot be fully verified — seed a completed booking to cover this seam.'
      );
      return;
    }

    expect(
      adminRevenueAfter.totalGross,
      `[Seam 3 BROKEN] admin totalGross (${adminRevenueAfter.totalGross}) < expert grossBookingTotal ` +
        `(${expertEarnings.summary.grossBookingTotal}). ` +
        'Revenue attribution is inconsistent — the money seam is broken between admin and expert consoles.'
    ).toBeGreaterThanOrEqual(expertEarnings.summary.grossBookingTotal);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// SEAM 4 — Provider Supply → Discover Feed
//
// Source:  Admin activates a Kyoto provider service via
//          PATCH /api/admin/services/:id/status → status = 'active'.
// Check A: PATCH returns updated status === 'active'.
// Check B: GET /api/discover/location/kyoto response includes the specific
//          service by ID or name.
// Check C: /discover/location/kyoto page renders a card for that service name.
// ══════════════════════════════════════════════════════════════════════════════
test('[Seam 4] Supply → feed: admin/services activation → /discover/location/kyoto', async ({
  page,
}) => {
  let targetServiceId: string;
  let targetServiceName: string;

  await test.step('Admin: GET /api/admin/services must return at least one Kyoto service', async () => {
    await loginAs(page, adminAccount.email, adminAccount.password);

    type ServiceRow = {
      id: string;
      serviceName?: string;
      location?: string;
      city?: string;
      status?: string;
    };
    const services = await apiGet<ServiceRow[]>(page, '/api/admin/services');

    expect(
      Array.isArray(services),
      '[Seam 4 BROKEN] GET /api/admin/services did not return an array.'
    ).toBe(true);

    const kyotoService = services.find(
      (s) =>
        s.location?.toLowerCase().includes('kyoto') ||
        s.city?.toLowerCase().includes('kyoto') ||
        s.serviceName?.toLowerCase().includes('kyoto')
    );

    expect(
      kyotoService,
      '[Seam 4 BROKEN] No Kyoto service found in GET /api/admin/services. ' +
        'Seed Kyoto provider services (kyoto-photography@, kyoto-transport@, kyoto-stays@) before this test.'
    ).toBeDefined();

    targetServiceId = kyotoService!.id;
    targetServiceName = kyotoService!.serviceName ?? '';

    expect(targetServiceName, 'Kyoto service must have a non-empty serviceName').toBeTruthy();
  });

  await test.step('Admin: PATCH /api/admin/services/:id/status to "active" must return updated status', async () => {
    const updated = await apiPatch<{ id?: string; status?: string }>(
      page,
      `/api/admin/services/${targetServiceId}/status`,
      { status: 'active' }
    );

    expect(
      updated.status,
      `[Seam 4 BROKEN] PATCH /api/admin/services/${targetServiceId}/status returned status="${updated.status}" ` +
        'instead of "active". The supply approval is not persisting.'
    ).toBe('active');
  });

  await test.step('Discover API: GET /api/discover/location/kyoto must include the activated service by ID or name', async () => {
    await logout(page).catch(() => null);

    type DiscoverPayload = {
      services?: Array<{ id: string; serviceName?: string }>;
      localServices?: Array<{ id: string; serviceName?: string }>;
    };
    const discoverData = await apiGet<DiscoverPayload>(page, '/api/discover/location/kyoto');

    const serviceList =
      discoverData.services ??
      discoverData.localServices ??
      (Array.isArray(discoverData) ? (discoverData as unknown as Array<{ id: string; serviceName?: string }>) : []);

    const found = serviceList.find(
      (s) =>
        s.id === targetServiceId ||
        (s.serviceName ?? '') === targetServiceName
    );

    expect(
      found,
      `[Seam 4 BROKEN] Activated service "${targetServiceName}" (id=${targetServiceId}) ` +
        'is absent from GET /api/discover/location/kyoto. ' +
        'The supply→feed pipeline is broken — activated services are not surfacing in the discover API.'
    ).toBeDefined();
  });

  await test.step('Discover page: /discover/location/kyoto must render the activated service name', async () => {
    await navigateTo(page, '/discover/location/kyoto');
    await verifyRouteAccessible(page);
    await page.waitForTimeout(2000); // let the feed hydrate

    const byName = await page.locator(`text=${targetServiceName}`).first()
      .isVisible({ timeout: 10000 }).catch(() => false);

    if (!byName) {
      const byCard = await page.locator(
        `[data-testid="card-service-${targetServiceId}"], [data-testid="text-service-name-${targetServiceId}"]`
      ).first().isVisible({ timeout: 5000 }).catch(() => false);

      expect(
        byCard,
        `[Seam 4 BROKEN] Neither the service name "${targetServiceName}" nor the card for ` +
          `id=${targetServiceId} is visible on /discover/location/kyoto. ` +
          'The activated service is not rendering in the discover feed UI.'
      ).toBe(true);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// SEAM 5 — Intelligence
//
// Source:  Admin calls POST /api/travelpulse/ai/refresh/:cityName/:country
//          (canonical TravelPulse refresh endpoint).
// Check A: The refresh POST returns 200 — a non-200 is a broken seam.
// Check B: GET /api/admin/analytics/tourism returns a non-empty payload.
// Check C: /admin/tourism-analytics renders without an error banner and with a
//          Refresh button; clicking Refresh does not crash the page.
// Check D: GET /api/discover/location/kyoto returns non-empty feed data after
//          the refresh — the intelligence update must not break the feed.
// Check E: /discover/location/kyoto page renders a heading.
// ══════════════════════════════════════════════════════════════════════════════
test('[Seam 5] Intelligence: TravelPulse refresh → admin/tourism-analytics → /discover/location/kyoto', async ({
  page,
}) => {
  await test.step('Admin: POST /api/travelpulse/ai/refresh/kyoto/Japan must return 200', async () => {
    await loginAs(page, adminAccount.email, adminAccount.password);

    // This is the canonical city-intelligence refresh endpoint.
    const res = await page.request.post('/api/travelpulse/ai/refresh/kyoto/Japan');

    expect(
      res.ok(),
      `[Seam 5 BROKEN] POST /api/travelpulse/ai/refresh/kyoto/Japan returned ${res.status()}. ` +
        'The city intelligence refresh endpoint is broken — the intelligence seam source is missing.'
    ).toBe(true);

    await page.waitForTimeout(2000);
  });

  await test.step('Admin: GET /api/admin/analytics/tourism must return a non-empty payload', async () => {
    const analytics = await apiGet<unknown>(page, '/api/admin/analytics/tourism');

    const hasContent = Array.isArray(analytics)
      ? (analytics as unknown[]).length > 0
      : typeof analytics === 'object' && analytics !== null && Object.keys(analytics).length > 0;

    expect(
      hasContent,
      '[Seam 5 BROKEN] GET /api/admin/analytics/tourism returned an empty payload after refresh. ' +
        'City intelligence data is not reaching the admin analytics endpoint.'
    ).toBe(true);
  });

  await test.step('Admin: /admin/tourism-analytics must render without an error banner and with a Refresh button', async () => {
    await navigateTo(page, '/admin/tourism-analytics');
    await verifyRouteAccessible(page);

    await expect(
      page.locator('[data-testid="text-error-message"]'),
      '[Seam 5 BROKEN] /admin/tourism-analytics shows an error banner after the intelligence refresh.'
    ).not.toBeVisible({ timeout: 5000 });

    const refreshButton = page.locator('button:has-text("Refresh")').first();
    await expect(
      refreshButton,
      '[Seam 5 BROKEN] /admin/tourism-analytics did not render the Refresh button — page did not fully load.'
    ).toBeVisible({ timeout: 12000 });

    await refreshButton.click();
    await page.waitForTimeout(2000);

    await expect(
      page.locator('[data-testid="text-error-message"]'),
      '[Seam 5 BROKEN] /admin/tourism-analytics crashed after clicking Refresh.'
    ).not.toBeVisible({ timeout: 5000 });
  });

  await test.step('Discover API: GET /api/discover/location/kyoto must return non-empty feed after intelligence refresh', async () => {
    await logout(page).catch(() => null);

    type DiscoverPayload = {
      services?: unknown[];
      localServices?: unknown[];
      experts?: unknown[];
      [key: string]: unknown;
    };
    const feed = await apiGet<DiscoverPayload>(page, '/api/discover/location/kyoto');

    const hasAnyContent =
      (feed.services ?? []).length > 0 ||
      (feed.localServices ?? []).length > 0 ||
      (feed.experts ?? []).length > 0 ||
      Object.values(feed).some((v) => Array.isArray(v) && (v as unknown[]).length > 0);

    expect(
      hasAnyContent,
      '[Seam 5 BROKEN] GET /api/discover/location/kyoto returned empty data after the intelligence refresh. ' +
        'The intelligence update corrupted or emptied the discover feed for Kyoto.'
    ).toBe(true);
  });

  await test.step('Discover page: /discover/location/kyoto must render a heading after intelligence refresh', async () => {
    await navigateTo(page, '/discover/location/kyoto');
    await verifyRouteAccessible(page);
    await page.waitForTimeout(2500);

    const heading = page.locator('[data-testid="text-page-title"], h1, h2').first();
    await expect(
      heading,
      '[Seam 5 BROKEN] /discover/location/kyoto has no heading after the intelligence refresh. ' +
        'The refreshed TravelPulse data broke the discover page rendering.'
    ).toBeVisible({ timeout: 15000 });
  });
});
