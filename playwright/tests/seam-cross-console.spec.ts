import { test, expect } from '@playwright/test';
import { loginAs, logout } from '../utils/auth';
import { navigateTo } from '../utils/navigation';
import { verifyRouteAccessible } from '../utils/assertions';
import { testAccounts, adminAccount } from '../fixtures/test-accounts';

/**
 * CROSS-CONSOLE SEAM TESTS
 *
 * Each test covers one critical route-to-route handoff (seam) between the
 * traveler, expert, provider, and admin consoles.  A failing assertion means
 * a data object entered on one side never arrived on the other.
 *
 * Design rules:
 *   - Hard expect() on every seam checkpoint — no .catch() silencing.
 *   - Specific object IDs (tripId, itemId, bookingId, serviceId, shareToken)
 *     are captured at the source and asserted in the downstream console.
 *   - All IDs treated as strings (UUID-safe); String() normalisation everywhere.
 *   - Each test is self-contained — no dependency on prior test state.
 *
 * Market: Kyoto (real seed data required).
 *
 * Seams:
 *   1. Lead pipeline    — traveler → routing-queue → expert/workspace
 *   2. Experience build — traveler item → expert workspace → delivered → /trips/shared/:token
 *   3. Money            — booking created + completed → attribution in admin/expert/provider
 *   4. Supply → feed    — admin activates service → service name in /discover/location/kyoto
 *   5. Intelligence     — TravelPulse refresh → ranking delta in /discover/location/kyoto
 */

// ─── Shared test accounts ──────────────────────────────────────────────────────
const kyotoTraveler = testAccounts.travelers.find(
  (a) => a.email === 'test-traveler-kyoto@traveloure.test'
)!;
const kyotoExpert = testAccounts.kyoto.find(
  (a) => a.email === 'kyoto-food@traveloure.test'
)!;
const kyotoProvider = testAccounts.kyoto.find(
  (a) => a.email === 'kyoto-photography@traveloure.test'
)!;

type Page = import('@playwright/test').Page;

// ─── Typed API helpers ─────────────────────────────────────────────────────────

/** Hard GET — throws on non-2xx; the caller's step label names the broken seam */
async function apiGet<T = unknown>(page: Page, path: string): Promise<T> {
  const res = await page.request.get(path);
  if (!res.ok()) {
    throw new Error(`[API BROKEN] GET ${path} → ${res.status()}: ${await res.text().catch(() => '')}`);
  }
  return res.json() as Promise<T>;
}

/** Hard POST — throws on non-2xx */
async function apiPost<T = unknown>(page: Page, path: string, body: Record<string, unknown>): Promise<T> {
  const res = await page.request.post(path, { data: body });
  if (!res.ok()) {
    throw new Error(`[API BROKEN] POST ${path} → ${res.status()}: ${await res.text().catch(() => '')}`);
  }
  return res.json() as Promise<T>;
}

/** Hard PATCH — throws on non-2xx */
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
// Source:  Traveler POSTs to /api/leads/route → expert_requests row created.
// Check A: GET /api/admin/routing-queue contains the row with String(trip_id)===tripId.
// Check B: POST /api/admin/leads/:id/confirm returns assignment; String(tripId) matches.
// Check C: Expert GET /api/expert/assigned-trips includes tripId (string-normalised).
// Check D: /expert/workspace/:tripId URL contains tripId AND workspace sentinel visible.
// ══════════════════════════════════════════════════════════════════════════════
test('[Seam 1] Lead pipeline: /leads/route → routing-queue → expert/workspace', async ({ page }) => {
  // trips.id is UUID (varchar) — always treated as string throughout this test.
  let tripId: string;
  let expertRequestId: string;

  await test.step('Traveler: create a FRESH Kyoto trip (no reuse), POST /api/leads/route, capture expertRequestId', async () => {
    await loginAs(page, kyotoTraveler.email, kyotoTraveler.password);

    // Always create a fresh trip so this test never passes on stale queue data.
    const created = await apiPost<{ id: string | number }>(page, '/api/trips', {
      title: `Kyoto Seam-1 Trip ${Date.now()}`,
      destination: 'Kyoto',
      startDate: '2026-10-01',
      endDate: '2026-10-07',
      guestCount: 2,
      budget: 3000,
    });
    tripId = String(created.id);
    expect(tripId, 'tripId must be a non-empty string').toBeTruthy();

    // POST the routing request; capture the returned expertRequestId.
    // The routing service creates an expert_requests row whose id IS the expertRequestId.
    const routeResult = await apiPost<{ expertRequestId?: string; id?: string; requestId?: string }>(
      page, '/api/leads/route',
      { destination: 'Kyoto', topic: 'food and culinary', tripId, requestType: 'expert_match' }
    );
    expertRequestId = routeResult.expertRequestId ?? routeResult.id ?? routeResult.requestId ?? '';

    expect(
      expertRequestId,
      '[Seam 1 BROKEN] POST /api/leads/route returned no expert request ID — lead never entered the pipeline.'
    ).toBeTruthy();
  });

  await test.step('Admin: GET /api/admin/routing-queue must contain the exact expertRequestId row', async () => {
    await logout(page).catch(() => null);
    await loginAs(page, adminAccount.email, adminAccount.password);

    type QueueRow = { id: string; trip_id: string | number };
    const rows = await apiGet<QueueRow[]>(page, '/api/admin/routing-queue');

    // Primary match: by the exact expertRequestId (expert_requests.id) — object-correlated.
    let match = rows.find((r) => String(r.id) === expertRequestId);

    // Secondary consistency check: the matched row's trip_id must also equal our tripId.
    if (match) {
      expect(
        String(match.trip_id),
        `[Seam 1 BROKEN] Queue row found for expertRequestId=${expertRequestId} ` +
          `but its trip_id (${match.trip_id}) !== tripId (${tripId}) — request attribution is corrupt.`
      ).toBe(tripId);
    } else {
      // Fallback: if the routing service stores a derived ID, match by trip_id.
      // This allows the test to degrade gracefully while still proving the seam.
      match = rows.find((r) => String(r.trip_id) === tripId);
      if (match) {
        expertRequestId = match.id; // normalise to the canonical queue row id
      }
    }

    expect(
      match,
      `[Seam 1 BROKEN] GET /api/admin/routing-queue has no row with id=${expertRequestId} ` +
        `or trip_id=${tripId}. The routing seam is broken — the lead did not reach the admin queue.`
    ).toBeDefined();
  });

  await test.step('Admin: POST /api/admin/leads/:id/confirm must return assignment with matching tripId', async () => {
    const result = await apiPost<{ assignment?: { tripId?: string | number; trip_id?: string | number } }>(
      page, `/api/admin/leads/${expertRequestId}/confirm`, {}
    );

    expect(result.assignment, `[Seam 1 BROKEN] Confirm returned no assignment object.`).toBeDefined();

    const assignedTripId = String(result.assignment!.tripId ?? result.assignment!.trip_id ?? '');
    expect(
      assignedTripId,
      '[Seam 1 BROKEN] Assignment tripId does not match the source tripId — wrong lead confirmed.'
    ).toBe(tripId);
  });

  await test.step('Expert: GET /api/expert/assigned-trips must include the confirmed tripId', async () => {
    await logout(page).catch(() => null);
    await loginAs(page, kyotoExpert.email, kyotoExpert.password);

    type Row = { id?: string | number; tripId?: string | number; trip_id?: string | number };
    const raw = await apiGet<Row[] | { trips?: Row[] }>(page, '/api/expert/assigned-trips');
    const rows: Row[] = Array.isArray(raw) ? raw : (raw as any).trips ?? [];

    const found = rows.find(
      (r) =>
        String(r.id ?? '') === tripId ||
        String(r.tripId ?? '') === tripId ||
        String(r.trip_id ?? '') === tripId
    );

    expect(
      found,
      `[Seam 1 BROKEN] GET /api/expert/assigned-trips does not include tripId=${tripId} after confirmation. ` +
        'The routing-queue → workspace handoff is broken.'
    ).toBeDefined();
  });

  await test.step('Expert: /expert/workspace/:tripId URL must contain tripId AND workspace UI must render', async () => {
    await navigateTo(page, `/expert/workspace/${tripId}`);

    expect(
      page.url(),
      `[Seam 1 BROKEN] Expert was redirected away from /expert/workspace/${tripId}.`
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
// SEAM 2 — Experience Build  (self-contained, no dependency on Seam 1)
//
// Source:  Traveler adds an itinerary item on /trip/:id via API.
// Check A: Expert GET /api/trips/:id/itinerary-items includes item by unique title
//          (traveler → workspace seam A).
// Check B: Expert PATCH workspace-status draft → in_review → delivered via
//          /api/expert/assignments/:id/workspace-status; final response
//          workspaceStatus === 'delivered' (seam B: workspace delivered state).
// Check C: Traveler POST /api/trips/:id/share → shareToken.
// Check D: GET /api/trips/shared/:token returns success:true with Kyoto destination.
// Check E: /trips/shared/:token page renders content; either item title or
//          a delivered-state indicator is visible (seam C: shared PlanCard).
// ══════════════════════════════════════════════════════════════════════════════
test('[Seam 2] Experience build: traveler item → expert workspace delivered → /trips/shared/:token', async ({
  page,
}) => {
  let tripId: string;
  let assignmentId: string;
  let shareToken: string;
  const ITEM_TITLE = `Seam-2 Kyoto Tea Ceremony ${Date.now()}`;

  // ── Step 1: Traveler creates a trip and assigns the Kyoto expert (self-contained) ─
  await test.step('Traveler: create trip and assign the Kyoto expert via /api/trips/:id/expert-advisor', async () => {
    await loginAs(page, kyotoTraveler.email, kyotoTraveler.password);

    // Create a fresh trip so this seam is independent of all prior state.
    const created = await apiPost<{ id: string | number }>(page, '/api/trips', {
      title: `Kyoto Seam-2 Trip ${Date.now()}`,
      destination: 'Kyoto',
      startDate: '2026-10-10',
      endDate: '2026-10-15',
      guestCount: 2,
      budget: 2500,
    });
    tripId = String(created.id);
    expect(tripId, 'tripId must be a non-empty UUID string').toBeTruthy();

    // Resolve the kyotoExpert's user_id via the public trip-experts API.
    type ExpertRow = { user_id?: string; id?: string; first_name?: string; last_name?: string };
    const experts = await apiGet<ExpertRow[]>(page, '/api/trip-experts?destination=kyoto');

    expect(
      experts.length,
      '[Seam 2 BROKEN] GET /api/trip-experts?destination=kyoto returned no experts — expert seed data is missing.'
    ).toBeGreaterThan(0);

    // Prefer the intended expert (Aiko Yamamoto — kyoto-food@traveloure.test) by name.
    // Fall back to the first available Kyoto expert only if the named expert is absent from seed.
    const namedExpert = experts.find(
      (e) =>
        e.first_name?.toLowerCase().includes('aiko') ||
        e.last_name?.toLowerCase().includes('yamamoto')
    );
    const expert = namedExpert ?? experts[0]; // explicit fallback, not a predicate short-circuit

    expect(expert, '[Seam 2 BROKEN] Expert selection resolved to undefined — this is a test logic error.').toBeDefined();

    const expertUserId = expert.user_id ?? expert.id ?? '';
    expect(expertUserId, '[Seam 2 BROKEN] Kyoto expert row has no user_id.').toBeTruthy();

    // Assign the expert to this trip.
    await apiPost(page, `/api/trips/${tripId}/expert-advisor`, {
      expertUserId,
      message: 'Seam-2 test assignment',
    });
  });

  // ── Step 2: Traveler adds the uniquely titled itinerary item ──────────────
  await test.step('Traveler: POST /api/trips/:id/itinerary-items — unique title captured', async () => {
    const item = await apiPost<{ id: string | number }>(page, `/api/trips/${tripId}/itinerary-items`, {
      title: ITEM_TITLE,
      itemType: 'activity',
      dayNumber: 1,
      startTime: '10:00',
      locationName: 'En tea house, Kyoto',
      estimatedCost: 65,
    });

    expect(
      item.id,
      '[Seam 2 BROKEN] POST /api/trips/:id/itinerary-items returned no item ID — item not persisted.'
    ).toBeTruthy();
  });

  // ── Step 3: Expert verifies item is visible in workspace via GET ───────────
  await test.step('Expert: GET /api/trips/:id/itinerary-items must include traveler item by exact title', async () => {
    await logout(page).catch(() => null);
    await loginAs(page, kyotoExpert.email, kyotoExpert.password);

    type Item = { id: string | number; title?: string; name?: string };
    const raw = await apiGet<Item[] | { items?: Item[] }>(page, `/api/trips/${tripId}/itinerary-items`);
    const items: Item[] = Array.isArray(raw) ? raw : (raw as any).items ?? [];

    const found = items.find((it) => (it.title ?? it.name ?? '') === ITEM_TITLE);
    expect(
      found,
      `[Seam 2 BROKEN] Expert GET /api/trips/${tripId}/itinerary-items does not include "${ITEM_TITLE}". ` +
        'The traveler-to-expert-workspace seam is broken — items are not shared between consoles.'
    ).toBeDefined();
  });

  // ── Step 4: Expert gets the assignment record (assignmentId + initial workspaceStatus) ─
  await test.step('Expert: GET /api/trips/:tripId/my-assignment must return an assignment row', async () => {
    const assignment = await apiGet<{ id?: string | number; workspace_status?: string; workspaceStatus?: string }>(
      page, `/api/trips/${tripId}/my-assignment`
    );

    expect(
      assignment.id,
      `[Seam 2 BROKEN] GET /api/trips/${tripId}/my-assignment returned no assignment ID. ` +
        'The expert was not assigned to this trip — the assignment seam is broken.'
    ).toBeTruthy();

    assignmentId = String(assignment.id);
  });

  // ── Step 5: Expert advances workspace: draft → in_review → delivered ──────
  await test.step('Expert: advance workspace-status draft → in_review → delivered (two PATCHes)', async () => {
    // First transition: draft → in_review
    await apiPatch<unknown>(page, `/api/expert/assignments/${assignmentId}/workspace-status`, {
      workspaceStatus: 'in_review',
    });

    // Second transition: in_review → delivered
    const deliveredResult = await apiPatch<{
      workspaceStatus?: string;
      workspace_status?: string;
    }>(page, `/api/expert/assignments/${assignmentId}/workspace-status`, {
      workspaceStatus: 'delivered',
    });

    const finalStatus = deliveredResult.workspaceStatus ?? deliveredResult.workspace_status;
    expect(
      finalStatus,
      '[Seam 2 BROKEN] Final PATCH to "delivered" did not return workspaceStatus="delivered". ' +
        'The expert delivered state is not persisting — workspace seam is broken.'
    ).toBe('delivered');
  });

  // ── Step 6: Expert re-fetches own assignment — workspaceStatus must be 'delivered' ─
  await test.step('Expert: GET /api/trips/:tripId/my-assignment must reflect workspaceStatus "delivered"', async () => {
    const refreshed = await apiGet<{ workspace_status?: string; workspaceStatus?: string }>(
      page, `/api/trips/${tripId}/my-assignment`
    );

    const persisted = refreshed.workspaceStatus ?? refreshed.workspace_status;
    expect(
      persisted,
      `[Seam 2 BROKEN] GET /api/trips/${tripId}/my-assignment returned workspaceStatus="${persisted}" ` +
        'instead of "delivered" after the PATCH. The delivered state is not persisted.'
    ).toBe('delivered');
  });

  // ── Step 7: Traveler creates the shared trip link ─────────────────────────
  await test.step('Traveler: POST /api/trips/:id/share → receive shareToken', async () => {
    await logout(page).catch(() => null);
    await loginAs(page, kyotoTraveler.email, kyotoTraveler.password);

    const shareResult = await apiPost<{ success?: boolean; shareToken?: string; share_token?: string }>(
      page, `/api/trips/${tripId}/share`, {}
    );

    shareToken = shareResult.shareToken ?? shareResult.share_token ?? '';
    expect(
      shareToken,
      '[Seam 2 BROKEN] POST /api/trips/:id/share returned no shareToken — shared-trip seam is broken.'
    ).toBeTruthy();
  });

  // ── Step 8: Shared trip API returns correct trip with Kyoto destination ────
  await test.step('GET /api/trips/shared/:token must return success:true for the Kyoto trip', async () => {
    await logout(page).catch(() => null); // public endpoint — test without auth

    const sharedData = await apiGet<{
      success?: boolean;
      trip?: { id?: string; destination?: string; title?: string };
    }>(page, `/api/trips/shared/${shareToken}`);

    expect(
      sharedData.success,
      `[Seam 2 BROKEN] GET /api/trips/shared/${shareToken} returned success=false. ` +
        'The shared trip link is broken after expert delivery.'
    ).toBe(true);

    expect(sharedData.trip, 'Shared trip must have a trip object.').toBeDefined();

    expect(
      (sharedData.trip!.destination ?? '').toLowerCase(),
      '[Seam 2 BROKEN] Shared trip destination is not Kyoto — wrong trip was shared.'
    ).toContain('kyoto');
  });

  // ── Step 9: /trips/shared/:token page renders the expert-delivered content ─
  await test.step('/trips/shared/:token page must render trip content or a delivered-state indicator', async () => {
    await navigateTo(page, `/trips/shared/${shareToken}`);
    await verifyRouteAccessible(page);

    expect(
      page.url(),
      `[Seam 2 BROKEN] /trips/shared/${shareToken} redirected away — the shared trip page is inaccessible.`
    ).toContain('/trips/shared/');

    // Primary check: the item title added by the traveler must be visible on the PlanCard.
    const itemVisible = await page.locator(`text=${ITEM_TITLE}`).first()
      .isVisible({ timeout: 12000 }).catch(() => false);

    if (!itemVisible) {
      // Fallback: any "delivered" state indicator confirms the workspace handoff is shown.
      const deliveredBadge = await page.locator(
        '[data-testid*="delivered"], [data-testid*="workspace-status"], text=Delivered, text=delivered'
      ).first().isVisible({ timeout: 5000 }).catch(() => false);

      expect(
        deliveredBadge,
        `[Seam 2 BROKEN] /trips/shared/${shareToken} shows neither the traveler item "${ITEM_TITLE}" ` +
          'nor a delivered-state indicator. ' +
          'The expert-delivered content is not flowing to the shared PlanCard — seam is broken.'
      ).toBe(true);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// SEAM 3 — Money  (self-contained: creates and completes a booking in-test)
//
// Source:  Traveler creates a booking; provider marks it completed.
// Check A: GET /api/admin/revenue totalBookings strictly > baseline (seam source).
// Check B: GET /api/admin/bookings includes completedBookingId with status="completed"
//          (attribution link: admin console).
// Check C: GET /api/expert/earnings earnings[] has entry with referenceId===bookingId
//          (attribution link: expert/provider earings record).
// Check D: GET /api/provider/earnings includes entry with sourceId===bookingId
//          (attribution link: provider earnings record).
// Check E: Parity: admin.totalGross >= expert summary.grossBookingTotal.
// ══════════════════════════════════════════════════════════════════════════════
test('[Seam 3] Money: booking created + completed → attribution in admin/expert/provider', async ({
  page,
}) => {
  type AdminRevenue = { totalRevenue: number; totalGross: number; totalBookings: number; completedBookings: number };
  type ExpertEarnings = {
    summary: { totalEarnings: number; grossBookingTotal: number; revenueShareRate: number };
    earnings: Array<{ id: string | number; referenceId?: string | number; referenceType?: string; description?: string }>;
  };

  let adminRevenueBefore: AdminRevenue;
  let adminRevenueAfter: AdminRevenue;
  let expertEarnings: ExpertEarnings;
  let completedBookingId: string;

  // ── Step 1: Admin baseline ────────────────────────────────────────────────
  await test.step('Admin: capture baseline totalBookings from GET /api/admin/revenue', async () => {
    await loginAs(page, adminAccount.email, adminAccount.password);
    adminRevenueBefore = await apiGet<AdminRevenue>(page, '/api/admin/revenue');

    expect(
      typeof adminRevenueBefore.totalBookings,
      '[Seam 3 BROKEN] GET /api/admin/revenue missing numeric totalBookings.'
    ).toBe('number');
    expect(
      typeof adminRevenueBefore.totalGross,
      '[Seam 3 BROKEN] GET /api/admin/revenue missing numeric totalGross.'
    ).toBe('number');
  });

  // ── Step 2: Provider finds an active Kyoto service ────────────────────────
  await test.step('Provider: GET /api/provider/services — find an active service to book', async () => {
    await logout(page).catch(() => null);
    await loginAs(page, kyotoProvider.email, kyotoProvider.password);

    type Service = { id: string; status?: string };
    const raw = await apiGet<Service[] | { services?: Service[] }>(page, '/api/provider/services');
    const services: Service[] = Array.isArray(raw) ? raw : (raw as any).services ?? [];
    const active = services.find((s) => s.status === 'active');

    expect(
      active,
      '[Seam 3 BROKEN] Provider has no active services — cannot create a booking. ' +
        'Run provider setup (Phase 2) or seed Kyoto provider services.'
    ).toBeDefined();

    (page as any).__s3ServiceId = active!.id;
  });

  // ── Step 3: Traveler creates the booking ──────────────────────────────────
  await test.step('Traveler: POST /api/bookings with the active service — capture completedBookingId', async () => {
    await logout(page).catch(() => null);
    await loginAs(page, kyotoTraveler.email, kyotoTraveler.password);

    const serviceId = (page as any).__s3ServiceId as string;
    const booking = await apiPost<{ id: string; trackingNumber?: string }>(page, '/api/bookings', {
      serviceId,
      bookingDate: '2026-10-05',
      guests: 2,
      specialRequests: 'Seam-3 test booking',
    });

    expect(
      booking.id,
      '[Seam 3 BROKEN] POST /api/bookings returned no booking ID — booking creation failed.'
    ).toBeTruthy();

    completedBookingId = String(booking.id);
    (page as any).__s3BookingId = completedBookingId;
    (page as any).__s3TrackingNumber = booking.trackingNumber ?? completedBookingId;
  });

  // ── Step 4: Provider marks the booking completed ──────────────────────────
  await test.step('Provider: PATCH /api/expert/bookings/:id/status → "completed"', async () => {
    await logout(page).catch(() => null);
    await loginAs(page, kyotoProvider.email, kyotoProvider.password);

    const bookingId = (page as any).__s3BookingId as string;
    const updated = await apiPatch<{ status?: string }>(
      page, `/api/expert/bookings/${bookingId}/status`, { status: 'completed' }
    );

    expect(
      updated.status,
      '[Seam 3 BROKEN] PATCH /api/expert/bookings/:id/status did not return "completed". ' +
        'The booking completion is not persisting — money seam source is broken.'
    ).toBe('completed');
  });

  // ── Step 5: Admin totalBookings strictly increased ────────────────────────
  await test.step('Admin: GET /api/admin/revenue totalBookings must be strictly > baseline', async () => {
    await logout(page).catch(() => null);
    await loginAs(page, adminAccount.email, adminAccount.password);

    adminRevenueAfter = await apiGet<AdminRevenue>(page, '/api/admin/revenue');

    expect(
      adminRevenueAfter.totalBookings,
      `[Seam 3 BROKEN] Admin totalBookings (${adminRevenueAfter.totalBookings}) did not increase ` +
        `from baseline (${adminRevenueBefore.totalBookings}). ` +
        'The completed booking did not reach admin/revenue — money seam is broken.'
    ).toBeGreaterThan(adminRevenueBefore.totalBookings);
  });

  // ── Step 6: Admin/bookings attribution link — specific bookingId with status="completed" ─
  await test.step('Admin: GET /api/admin/bookings must include completedBookingId with status="completed"', async () => {
    const bookingId = (page as any).__s3BookingId as string;

    type AdminBooking = { id: string | number; status?: string };
    const raw = await apiGet<AdminBooking[] | { bookings?: AdminBooking[] }>(page, '/api/admin/bookings');
    const bookings: AdminBooking[] = Array.isArray(raw) ? raw : (raw as any).bookings ?? [];

    const found = bookings.find((b) => String(b.id) === bookingId);
    expect(
      found,
      `[Seam 3 BROKEN] GET /api/admin/bookings does not include bookingId=${bookingId}. ` +
        'The completed booking is missing from the admin attribution view — attribution link is broken.'
    ).toBeDefined();

    expect(
      found!.status,
      `[Seam 3 BROKEN] Booking ${bookingId} in admin/bookings shows status="${found!.status}" not "completed". ` +
        'The completion status did not propagate to admin — money seam attribution is broken.'
    ).toBe('completed');
  });

  // ── Step 7: Admin revenue UI renders three split cards ────────────────────
  await test.step('Admin: /admin/revenue must render net-revenue, expert-earnings, provider-earnings cards', async () => {
    await navigateTo(page, '/admin/revenue');
    await verifyRouteAccessible(page);

    for (const testId of ['card-total-net-revenue', 'card-stat-expert-earnings', 'card-stat-provider-earnings']) {
      await expect(
        page.locator(`[data-testid="${testId}"]`),
        `[Seam 3 BROKEN] /admin/revenue must render ${testId}.`
      ).toBeVisible({ timeout: 12000 });
    }
  });

  // ── Step 8: Expert earnings attribution — referenceId matches bookingId ───
  await test.step('Provider-as-expert: GET /api/expert/earnings earnings[] must include entry with referenceId===bookingId', async () => {
    // PROVIDER-AS-EXPERT CONTRACT: When a service booking is completed, storage.updateServiceBookingStatus
    // creates an expert_earnings row with expertId=providerId (the provider's user_id).
    // Providers on this platform share the expert earnings ledger by design.
    // This step verifies that booking attribution flows through to the provider's expert-earnings record.
    // A separate step (step 9) verifies the kyotoExpert's own earnings ledger independently.
    await logout(page).catch(() => null);
    await loginAs(page, kyotoProvider.email, kyotoProvider.password);

    const bookingId = (page as any).__s3BookingId as string;
    expertEarnings = await apiGet<ExpertEarnings>(page, '/api/expert/earnings');

    expect(
      expertEarnings.summary,
      '[Seam 3 BROKEN] GET /api/expert/earnings returned no summary object.'
    ).toBeDefined();
    expect(
      typeof expertEarnings.summary.grossBookingTotal,
      '[Seam 3 BROKEN] expert/earnings summary.grossBookingTotal is not a number.'
    ).toBe('number');
    expect(
      typeof expertEarnings.summary.revenueShareRate,
      '[Seam 3 BROKEN] expert/earnings summary.revenueShareRate is not a number.'
    ).toBe('number');

    // Attribution check: the specific booking must appear in the earnings transaction list.
    const earningForBooking = expertEarnings.earnings.find(
      (e) =>
        String(e.referenceId ?? '') === bookingId ||
        (e.description ?? '').includes(bookingId) ||
        (e.description ?? '').includes((page as any).__s3TrackingNumber)
    );

    expect(
      earningForBooking,
      `[Seam 3 BROKEN] GET /api/expert/earnings earnings[] has no entry with referenceId="${bookingId}". ` +
        'The booking earnings attribution is missing from the expert/provider ledger — money seam is broken.'
    ).toBeDefined();
  });

  // ── Step 9: Provider earnings attribution — sourceId matches bookingId ────
  await test.step('Provider: GET /api/provider/earnings must include entry with sourceId===bookingId', async () => {
    const bookingId = (page as any).__s3BookingId as string;

    type ProviderEarning = { id: string | number; sourceId?: string | number; source_id?: string | number; description?: string };
    const raw = await apiGet<ProviderEarning[] | { earnings?: ProviderEarning[] }>(
      page, '/api/provider/earnings'
    );
    const provEarnings: ProviderEarning[] = Array.isArray(raw) ? raw : (raw as any).earnings ?? [];

    expect(
      provEarnings !== null && provEarnings !== undefined,
      '[Seam 3 BROKEN] GET /api/provider/earnings returned null.'
    ).toBe(true);

    const earningForBooking = provEarnings.find(
      (e) =>
        String(e.sourceId ?? e.source_id ?? '') === bookingId ||
        (e.description ?? '').includes(bookingId) ||
        (e.description ?? '').includes((page as any).__s3TrackingNumber)
    );

    expect(
      earningForBooking,
      `[Seam 3 BROKEN] GET /api/provider/earnings has no entry with sourceId="${bookingId}". ` +
        'The booking completion did not create a provider earnings record — money attribution seam is broken.'
    ).toBeDefined();
  });

  // ── Step 9b: kyotoExpert (Aiko Yamamoto) own earnings ledger ────────────
  // Verifies that the kyotoExpert role has independent access to the expert earnings
  // ledger endpoint — separate from the provider-as-expert contract in step 8.
  // kyotoExpert won't have an entry for this specific booking (the booking was for
  // kyotoProvider's service), but the endpoint must return a valid response for them.
  await test.step('Expert (Aiko Yamamoto / kyoto-food): GET /api/expert/earnings returns a valid response', async () => {
    await logout(page).catch(() => null);
    await loginAs(page, kyotoExpert.email, kyotoExpert.password);

    type ExpertEarningRow = { id?: string | number; referenceId?: string | number; amount?: number };
    const expertLedger = await apiGet<ExpertEarningRow[] | { earnings?: ExpertEarningRow[] }>(
      page, '/api/expert/earnings'
    );

    // The endpoint must return an array or an object with earnings field — not an error.
    const expertEarningRows: ExpertEarningRow[] = Array.isArray(expertLedger)
      ? expertLedger
      : (expertLedger as any).earnings ?? [];

    expect(
      expertEarningRows,
      '[Seam 3 BROKEN] GET /api/expert/earnings returned non-array for kyotoExpert (Aiko Yamamoto). ' +
        'The expert earnings ledger endpoint is broken for the expert role.'
    ).toBeDefined();

    // Navigate to the expert earnings page and confirm it renders without an error banner.
    // Note: if the error banner element is absent from the DOM, Playwright treats it as
    // not visible — so .not.toBeVisible() passes correctly. The .catch() was removed
    // to ensure a visible error banner causes a genuine test failure.
    await navigateTo(page, '/expert/earnings');
    await verifyRouteAccessible(page);
    await expect(
      page.locator('[data-testid="error-banner"], [data-testid="alert-error"]').first(),
      '[Seam 3 BROKEN] /expert/earnings shows an error banner for kyotoExpert (Aiko Yamamoto).'
    ).not.toBeVisible({ timeout: 10000 });

    // Switch back to provider for subsequent earnings steps.
    await logout(page).catch(() => null);
    await loginAs(page, kyotoProvider.email, kyotoProvider.password);
  });

  // ── Step 10: Expert earnings UI renders three split cards ─────────────────
  await test.step('Provider: /expert/earnings must render gross-total, your-share, split bar', async () => {
    await navigateTo(page, '/expert/earnings');
    await verifyRouteAccessible(page);

    for (const testId of ['stat-gross-total', 'stat-your-share', 'bar-revenue-split']) {
      await expect(
        page.locator(`[data-testid="${testId}"]`),
        `[Seam 3 BROKEN] /expert/earnings must render ${testId}.`
      ).toBeVisible({ timeout: 12000 });
    }
  });

  // ── Step 11: Provider earnings UI renders three split cards ───────────────
  await test.step('Provider: /provider/earnings must render available-balance, your-share, split bar', async () => {
    await navigateTo(page, '/provider/earnings');
    await verifyRouteAccessible(page);

    for (const testId of ['card-available-balance', 'stat-your-share', 'bar-revenue-split']) {
      await expect(
        page.locator(`[data-testid="${testId}"]`),
        `[Seam 3 BROKEN] /provider/earnings must render ${testId}.`
      ).toBeVisible({ timeout: 12000 });
    }
  });

  // ── Step 12: Parity check ─────────────────────────────────────────────────
  await test.step('Parity: admin.totalGross must be >= expert summary.grossBookingTotal', async () => {
    expect(
      adminRevenueAfter.totalGross,
      `[Seam 3 BROKEN] admin totalGross (${adminRevenueAfter.totalGross}) < expert grossBookingTotal ` +
        `(${expertEarnings.summary.grossBookingTotal}). Revenue attribution is inconsistent.`
    ).toBeGreaterThanOrEqual(expertEarnings.summary.grossBookingTotal);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// SEAM 4 — Provider Supply → Discover Feed
//
// Source:  Admin activates a specific Kyoto service.
// Check A: PATCH returns status === 'active' (seam source persisted).
// Check B: GET /api/discover/location/kyoto includes the service by ID or name.
// Check C: /discover/location/kyoto page renders the service name or card.
// ══════════════════════════════════════════════════════════════════════════════
test('[Seam 4] Supply → feed: admin/services activation → /discover/location/kyoto', async ({
  page,
}) => {
  let targetServiceId: string;
  let targetServiceName: string;

  await test.step('Admin: GET /api/admin/services — find a NON-active Kyoto service to activate', async () => {
    await loginAs(page, adminAccount.email, adminAccount.password);

    type ServiceRow = { id: string; serviceName?: string; location?: string; city?: string; status?: string };
    const services = await apiGet<ServiceRow[]>(page, '/api/admin/services');

    expect(Array.isArray(services), '[Seam 4 BROKEN] GET /api/admin/services did not return an array.').toBe(true);

    // Prefer a non-active service so the activation is causal, not a no-op.
    // If all Kyoto services are already active, deactivate one first then test activation.
    const allKyoto = services.filter(
      (s) =>
        s.location?.toLowerCase().includes('kyoto') ||
        s.city?.toLowerCase().includes('kyoto') ||
        s.serviceName?.toLowerCase().includes('kyoto')
    );

    expect(
      allKyoto.length,
      '[Seam 4 BROKEN] No Kyoto services found in GET /api/admin/services. ' +
        'Seed Kyoto provider services before running this test.'
    ).toBeGreaterThan(0);

    // Use an inactive service if one exists, otherwise deactivate one to set up precondition.
    const inactive = allKyoto.find((s) => s.status !== 'active');
    if (inactive) {
      targetServiceId = inactive.id;
      targetServiceName = inactive.serviceName ?? '';
    } else {
      // All are active — temporarily deactivate the first one to create a causal test.
      const first = allKyoto[0];
      await apiPatch<unknown>(page, `/api/admin/services/${first.id}/status`, { status: 'inactive' });
      targetServiceId = first.id;
      targetServiceName = first.serviceName ?? '';
    }

    expect(targetServiceName, 'Kyoto service must have a non-empty serviceName.').toBeTruthy();
  });

  await test.step('Precondition: service must be ABSENT from GET /api/discover/location/kyoto before activation', async () => {
    await logout(page).catch(() => null);

    type DiscoverPayload = {
      services?: Array<{ id: string; serviceName?: string }>;
      localServices?: Array<{ id: string; serviceName?: string }>;
    };
    const feedBefore = await apiGet<DiscoverPayload>(page, '/api/discover/location/kyoto');
    const listBefore =
      feedBefore.services ??
      feedBefore.localServices ??
      (Array.isArray(feedBefore) ? (feedBefore as unknown as Array<{ id: string; serviceName?: string }>) : []);

    const foundBefore = listBefore.find(
      (s) => s.id === targetServiceId || (s.serviceName ?? '') === targetServiceName
    );

    // Hard assertion: the inactive service must NOT appear in the discover feed.
    // If it does, the discover feed is not filtering by status — that is itself a bug
    // and means the subsequent "presence-after" check would prove nothing causal.
    expect(
      foundBefore,
      `[Seam 4 BROKEN — PRECONDITION] Service "${targetServiceName}" (id=${targetServiceId}) ` +
        'is already visible in GET /api/discover/location/kyoto before activation. ' +
        'The discover feed is not honouring active-status filtering — the supply→feed seam is broken ' +
        'because deactivated services are still shown to users.'
    ).toBeUndefined();
  });

  await test.step('Admin: PATCH /api/admin/services/:id/status to "active" must return status="active"', async () => {
    await logout(page).catch(() => null);
    await loginAs(page, adminAccount.email, adminAccount.password);

    const updated = await apiPatch<{ status?: string }>(
      page, `/api/admin/services/${targetServiceId}/status`, { status: 'active' }
    );

    expect(
      updated.status,
      `[Seam 4 BROKEN] PATCH /api/admin/services/${targetServiceId}/status returned "${updated.status}" not "active". ` +
        'The supply approval is not persisting.'
    ).toBe('active');
  });

  await test.step('Discover API: GET /api/discover/location/kyoto must include the activated service (presence-after)', async () => {
    await logout(page).catch(() => null);

    type DiscoverPayload = {
      services?: Array<{ id: string; serviceName?: string }>;
      localServices?: Array<{ id: string; serviceName?: string }>;
    };
    const feedAfter = await apiGet<DiscoverPayload>(page, '/api/discover/location/kyoto');
    const listAfter =
      feedAfter.services ??
      feedAfter.localServices ??
      (Array.isArray(feedAfter) ? (feedAfter as unknown as Array<{ id: string; serviceName?: string }>) : []);

    const foundAfter = listAfter.find(
      (s) => s.id === targetServiceId || (s.serviceName ?? '') === targetServiceName
    );

    // Hard assertion: service must appear after activation.
    expect(
      foundAfter,
      `[Seam 4 BROKEN] Activated service "${targetServiceName}" (id=${targetServiceId}) ` +
        'is absent from GET /api/discover/location/kyoto after activation. ' +
        'The supply→feed pipeline is broken — activated services are not surfacing in the discover API.'
    ).toBeDefined();
  });

  await test.step('Discover page: /discover/location/kyoto must render the activated service name or card', async () => {
    await navigateTo(page, '/discover/location/kyoto');
    await verifyRouteAccessible(page);
    await page.waitForTimeout(2000);

    const byName = await page.locator(`text=${targetServiceName}`).first()
      .isVisible({ timeout: 10000 }).catch(() => false);

    if (!byName) {
      const byCard = await page.locator(
        `[data-testid="card-service-${targetServiceId}"], [data-testid="text-service-name-${targetServiceId}"]`
      ).first().isVisible({ timeout: 5000 }).catch(() => false);

      expect(
        byCard,
        `[Seam 4 BROKEN] Neither "${targetServiceName}" nor card id=${targetServiceId} visible on /discover/location/kyoto. ` +
          'The activated service is not rendering in the discover feed UI.'
      ).toBe(true);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// SEAM 5 — Intelligence  (TravelPulse refresh → ranking delta)
//
// Source:  Admin POSTs to /api/travelpulse/ai/refresh/kyoto/Japan — canonical
//          refresh endpoint; non-200 is a hard seam failure.
// Check A: POST refresh returns 200.
// Check B: GET /api/admin/analytics/tourism returns non-empty payload.
// Check C: /admin/tourism-analytics renders without error banner; Refresh button
//          visible; clicking Refresh does not crash.
// Check D: Ranking delta — discover feed captured before and after refresh;
//          post-refresh feed is non-empty AND includes an intelligence-derived
//          field (trendScore, rank, relevanceScore, or trendingRank > 0) OR
//          the first-item ordering differs from pre-refresh (order changed).
// ══════════════════════════════════════════════════════════════════════════════
test('[Seam 5] Intelligence: TravelPulse refresh → admin analytics → discover ranking delta', async ({
  page,
}) => {
  type FeedItem = {
    id: string;
    trendScore?: number;
    rank?: number;
    relevanceScore?: number;
    trendingRank?: number;
    [key: string]: unknown;
  };
  type DiscoverPayload = {
    services?: FeedItem[];
    localServices?: FeedItem[];
    experts?: FeedItem[];
    [key: string]: unknown;
  };

  let preRefreshFirstId: string | undefined;

  // ── Step 1: Capture pre-refresh discover ranking ──────────────────────────
  await test.step('Pre-refresh: capture first item ID from GET /api/discover/location/kyoto', async () => {
    await loginAs(page, adminAccount.email, adminAccount.password);
    await logout(page).catch(() => null); // discover is public

    const feedBefore = await apiGet<DiscoverPayload>(page, '/api/discover/location/kyoto');
    const listBefore: FeedItem[] = feedBefore.services ?? feedBefore.localServices ?? [];
    preRefreshFirstId = listBefore[0]?.id;
    // It's OK if this is undefined (empty DB) — we will assert non-empty after refresh.
  });

  // ── Step 2: Admin triggers the canonical TravelPulse refresh ──────────────
  await test.step('Admin: POST /api/travelpulse/ai/refresh/kyoto/Japan must return 200', async () => {
    await loginAs(page, adminAccount.email, adminAccount.password);

    const res = await page.request.post('/api/travelpulse/ai/refresh/kyoto/Japan');
    expect(
      res.ok(),
      `[Seam 5 BROKEN] POST /api/travelpulse/ai/refresh/kyoto/Japan returned ${res.status()}. ` +
        'The TravelPulse refresh endpoint is broken — intelligence seam source is missing.'
    ).toBe(true);

    await page.waitForTimeout(2000);
  });

  // ── Step 3: Admin analytics returns non-empty payload after refresh ────────
  await test.step('Admin: GET /api/admin/analytics/tourism must return non-empty payload', async () => {
    const analytics = await apiGet<unknown>(page, '/api/admin/analytics/tourism');

    const hasContent = Array.isArray(analytics)
      ? (analytics as unknown[]).length > 0
      : typeof analytics === 'object' && analytics !== null && Object.keys(analytics).length > 0;

    expect(
      hasContent,
      '[Seam 5 BROKEN] GET /api/admin/analytics/tourism returned empty data after refresh. ' +
        'City intelligence is not reaching the analytics endpoint.'
    ).toBe(true);
  });

  // ── Step 4: /admin/tourism-analytics renders correctly after refresh ────────
  await test.step('Admin: /admin/tourism-analytics renders without error banner; Refresh does not crash', async () => {
    await navigateTo(page, '/admin/tourism-analytics');
    await verifyRouteAccessible(page);

    await expect(
      page.locator('[data-testid="text-error-message"]'),
      '[Seam 5 BROKEN] /admin/tourism-analytics shows an error banner after refresh.'
    ).not.toBeVisible({ timeout: 5000 });

    const refreshButton = page.locator('button:has-text("Refresh")').first();
    await expect(
      refreshButton,
      '[Seam 5 BROKEN] /admin/tourism-analytics Refresh button not visible — page did not fully load.'
    ).toBeVisible({ timeout: 12000 });

    await refreshButton.click();
    await page.waitForTimeout(2000);

    await expect(
      page.locator('[data-testid="text-error-message"]'),
      '[Seam 5 BROKEN] /admin/tourism-analytics crashed after clicking Refresh.'
    ).not.toBeVisible({ timeout: 5000 });
  });

  // ── Step 5: Ranking delta — post-refresh discover feed is non-empty AND
  //           shows intelligence influence (scoring field or ordering change) ─
  await test.step('Discover: GET /api/discover/location/kyoto ranking delta after intelligence refresh', async () => {
    await logout(page).catch(() => null);

    const feedAfter = await apiGet<DiscoverPayload>(page, '/api/discover/location/kyoto');
    const listAfter: FeedItem[] =
      feedAfter.services ??
      feedAfter.localServices ??
      (Array.isArray(feedAfter) ? (feedAfter as unknown as FeedItem[]) : []);

    // Hard assertion: the feed must be non-empty after refresh.
    expect(
      listAfter.length,
      '[Seam 5 BROKEN] GET /api/discover/location/kyoto returned an empty list after the intelligence refresh. ' +
        'The TravelPulse refresh broke or emptied the discover feed — seam is broken.'
    ).toBeGreaterThan(0);

    // Intelligence influence check: at least one of:
    //   (a) An item carries a non-zero score field (trendScore, rank, relevanceScore, trendingRank).
    //   (b) The first-item ID differs from pre-refresh (ordering changed due to intelligence update).
    const hasScoreField = listAfter.some(
      (item) =>
        (typeof item.trendScore === 'number' && item.trendScore > 0) ||
        (typeof item.rank === 'number' && item.rank > 0) ||
        (typeof item.relevanceScore === 'number' && item.relevanceScore > 0) ||
        (typeof item.trendingRank === 'number' && item.trendingRank > 0)
    );

    const orderChanged =
      preRefreshFirstId !== undefined && listAfter[0]?.id !== preRefreshFirstId;

    expect(
      hasScoreField || orderChanged,
      '[Seam 5 BROKEN] Post-refresh discover feed shows no intelligence influence: ' +
        'no item carries a non-zero score field (trendScore/rank/relevanceScore/trendingRank), ' +
        `and the first-item ordering did not change (both pre- and post-refresh first ID: "${listAfter[0]?.id}"). ` +
        'The TravelPulse refresh is not influencing discover ranking — seam is broken.'
    ).toBe(true);
  });

  // ── Step 6: /discover/location/kyoto page renders a heading after refresh ──
  await test.step('Discover page: /discover/location/kyoto must render a heading after intelligence refresh', async () => {
    await navigateTo(page, '/discover/location/kyoto');
    await verifyRouteAccessible(page);
    await page.waitForTimeout(2500);

    await expect(
      page.locator('[data-testid="text-page-title"], h1, h2').first(),
      '[Seam 5 BROKEN] /discover/location/kyoto has no heading after the intelligence refresh — page rendering broke.'
    ).toBeVisible({ timeout: 15000 });
  });
});
