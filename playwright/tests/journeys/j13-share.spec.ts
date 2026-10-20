/**
 * matrix-id: J13
 *
 * J13 — Trip share flow (owner shares → unauthenticated second context renders read-only view).
 *
 * Governing docs: docs/planning/JOURNEY_TEST_SUITE_BRIEF.md §2 (J13).
 * Server authority:
 *   POST /api/trips/:id/share        server/routes/booking-actions.ts (owner-only; upserts shared_trips)
 *   GET  /api/trips/shared/:token    server/routes/booking-actions.ts (PUBLIC; logs a shared_trip_views row)
 *   getTripByShareToken              server/services/booking-actions.service.ts
 *     → synthesises itinerary_data from itinerary_items (live plan) when items exist,
 *       falling back to generated_itineraries.itinerary_data when no items are present.
 *       This means ANY itinerary_item edit (add/remove/reorder) is immediately visible
 *       on the share page without a regenerate call.
 *   Renderer: client/src/pages/shared-trip.tsx  (route /trips/shared/:token, App.tsx:362).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * FINDING J13-renderer (brief drift, recorded not patched): the brief §2 J13 says the share page
 *   "renders ItineraryCard". It does NOT. shared-trip.tsx renders a BESPOKE day/activity list
 *   built from the API response's itinerary_data (testids shared-day-${day} /
 *   shared-activity-${day}-${idx}), never <ItineraryCard/>.
 *   This spec asserts the ACTUAL renderer and its actual testids.
 *
 * Read-only / inertness facts asserted from the renderer source (shared-trip.tsx):
 *   • status pill is a plain <Badge>{trip.status}</Badge> — INERT (no onClick/href).
 *   • NO routing controls exist (no route buttons, no status dropdowns) — the page has no writers.
 *   • NO transition-log / diary footer exists.
 *   • a read-only banner data-testid="banner-shared-view" is always present.
 */
import { test, expect, request as pwRequest, type Page } from "@playwright/test";
import { actAndAwait, testid } from "../../../e2e/supply-demand/lib/ui";
import {
  BASE_URL,
  registerUser,
  createTrip,
  createItem,
  rows,
  scalar,
  closePool,
} from "./_journey-helpers";

test.afterAll(async () => {
  await closePool();
});

// A production model failure returns quickly on a stub key; the DOM leg still renders the share page.
test.setTimeout(180_000);

const DRAFT_FAILURE_STATUSES = [429, 502, 503];

/** The trip generate route on a production bundle: the model failure, and nothing stored. */
async function expectTripGenerateFailure(ctx: { post: (url: string, init: { data: object }) => Promise<{ status: () => number; text: () => Promise<string> }> }, tripId: string): Promise<void> {
  const res = await ctx.post(`${BASE_URL}/api/trips/${tripId}/generate-itinerary`, { data: {} });
  expect(DRAFT_FAILURE_STATUSES, `production ignores E2E_AI_STUB; generate-itinerary answered ${res.status()} ${await res.text()}`).toContain(res.status());
  expect(
    (await rows(`SELECT id FROM itinerary_items WHERE trip_id = $1 AND origin = 'ai'`, [tripId])).length,
    "a production model failure writes no drafted rows",
  ).toBe(0);
  expect(
    Number(await scalar(`SELECT count(*)::int FROM generated_itineraries WHERE trip_id = $1`, [tripId])),
    "a production model failure stores no generated itinerary",
  ).toBe(0);
}

/** The slip's Draft it with AI door: the same failure, and the traveler-facing notice. */
async function expectSlipDraftFailure(page: Page, tripId: string): Promise<void> {
  await page.goto(`${BASE_URL}/plans/${tripId}`);
  await expect(testid(page, "slip-action-draft-ai")).toBeVisible({ timeout: 20_000 });
  const status = await actAndAwait(
    page,
    async () => {
      await testid(page, "slip-action-draft-ai").click();
    },
    { method: "POST", path: /^\/api\/ai\/generate-itinerary$/ },
    60_000,
  );
  expect(DRAFT_FAILURE_STATUSES, `production ignores E2E_AI_STUB; the slip draft answered ${status}`).toContain(status);
  expect(
    (await rows(`SELECT id FROM itinerary_items WHERE trip_id = $1 AND origin = 'ai'`, [tripId])).length,
    "a production model failure writes no drafted rows",
  ).toBe(0);
  await expect(testid(page, "ai-draft-failure")).toBeVisible({ timeout: 20_000 });
}

test.describe("J13 — Trip share (owner → public read-only view)", () => {
  // Serial: both tests register users and read the same disposable database.
  test.describe.configure({ mode: "serial" });

  test("owner shares → shared_trips row → unauth context renders read-only view (inert pill, no routing controls, no log) → post-share edit reflects live", async ({ page }) => {
    // ── 1. Fresh owner + trip. The draft fails honestly; the share reads a traveler stop. ─────
    const owner = page.request;
    await registerUser(owner, "j13-owner", "J13", "Owner");
    const tripId = await createTrip(owner, "J13 Shared Kyoto Plan", "Kyoto, Japan");

    // Journey CI boots a production bundle, which ignores E2E_AI_STUB. Both draft doors
    // answer the model failure and store nothing. The share happy path below uses a
    // traveler-authored stop. The stand-in that drafts and then shares is j13-share-stub.
    await expectTripGenerateFailure(owner, tripId);
    await expectSlipDraftFailure(page, tripId);
    await createItem(owner, tripId, "J13 Shared Stop", 1);

    // ── 2. Owner creates the share link (owner-only endpoint) ──────────────────────────────────
    const shareRes = await owner.post(`${BASE_URL}/api/trips/${tripId}/share`, { data: {} });
    expect(shareRes.status(), await shareRes.text()).toBe(200);
    const shareBody = await shareRes.json();
    const token = shareBody.shareToken as string;
    expect(token, "share endpoint must return a canonical share token").toBeTruthy();

    // DB FACT: exactly one shared_trips row for this trip carries the returned token, owned by owner.
    const stRows = await rows<{ share_token: string; trip_id: string; shared_by: string | null; expires_at: string | null }>(
      `SELECT share_token, trip_id, shared_by, expires_at FROM shared_trips WHERE trip_id = $1`,
      [tripId],
    );
    expect(stRows.length).toBeGreaterThan(0);
    const canonical = stRows.find((r) => r.share_token === token);
    expect(canonical, "the returned token must exist as a shared_trips row").toBeTruthy();
    expect(canonical!.trip_id).toBe(tripId);
    // 90-day expiry stamped by the route.
    expect(canonical!.expires_at).not.toBeNull();

    // ── 3. Owner-only guard: a DIFFERENT authenticated user cannot mint a link for this trip ────
    const stranger = await pwRequest.newContext();
    await registerUser(stranger, "j13-stranger", "J13", "Stranger");
    const strangerShare = await stranger.post(`${BASE_URL}/api/trips/${tripId}/share`, { data: {} });
    expect(strangerShare.status(), "non-owner share must be forbidden").toBe(403);
    await stranger.dispose();

    // ── 4. Unauthenticated second CONTEXT opens the public share view ──────────────────────────
    // Brand-new browser context = no auth cookies. This is the viewer surface.
    const viewer = await pwRequest.newContext();
    const publicApi = await viewer.get(`${BASE_URL}/api/trips/shared/${token}`);
    expect(publicApi.status(), "public share GET must succeed unauthenticated").toBe(200);
    const publicBody = await publicApi.json();
    expect(publicBody.trip.id).toBe(tripId);
    const sharedTitles = (publicBody.trip.itinerary_data?.days ?? []).flatMap(
      (day: { activities?: Array<{ title?: string }> }) => (day.activities ?? []).map((activity) => activity.title),
    );
    expect(sharedTitles, "the public payload names the traveler's stop").toContain("J13 Shared Stop");
    await viewer.dispose();

    // DB FACT: the public GET logged a shared_trip_views row and bumped shared_trips.views.
    const viewCount = await scalar<string>(
      `SELECT count(*)::text FROM shared_trip_views stv
         JOIN shared_trips st ON st.id = stv.shared_trip_id
        WHERE st.share_token = $1`,
      [token],
    );
    expect(Number(viewCount)).toBeGreaterThanOrEqual(1);
    // The DOM render + inertness + live-reflection leg is the next test (uses a browser context).
  });

  // The DOM leg lives in its own test so the API-only journey above stays fast + isolated.
  test("public share PAGE renders read-only: inert status pill, day/activity testids, NO routing controls, NO log footer", async ({ browser, page }) => {
    const owner = page.request;
    await registerUser(owner, "j13-ui-owner", "J13", "UiOwner");
    const tripId = await createTrip(owner, "J13 UI Shared Plan", "Lisbon, Portugal");
    await expectSlipDraftFailure(page, tripId);
    await createItem(owner, tripId, "J13 Shared Stop", 1);

    const shareRes = await owner.post(`${BASE_URL}/api/trips/${tripId}/share`, { data: {} });
    expect(shareRes.status()).toBe(200);
    const token = (await shareRes.json()).shareToken as string;

    const expectedDays = Number(
      await scalar<string>(
        `SELECT count(DISTINCT day_number)::text FROM itinerary_items WHERE trip_id = $1`,
        [tripId],
      ),
    );
    expect(expectedDays).toBeGreaterThan(0);

    // Fresh UNAUTHENTICATED context (no storage state, no cookies).
    const viewerContext = await browser.newContext();
    const viewerPage = await viewerContext.newPage();
    await viewerPage.goto(`${BASE_URL}/trips/shared/${token}`, { waitUntil: "domcontentloaded" });

    // Read-only banner present (waits for the SPA to fetch + render).
    await expect(viewerPage.getByTestId("banner-shared-view")).toBeVisible({ timeout: 30_000 });

    // At least the first day + its first activity render (bespoke list, NOT ItineraryCard).
    await expect(viewerPage.getByTestId("shared-day-1")).toBeVisible();
    await expect(viewerPage.getByTestId("shared-activity-1-0")).toBeVisible();

    // The number of day blocks equals the days that hold a stop.
    const renderedDays = await viewerPage.locator('[data-testid^="shared-day-"]').count();
    expect(renderedDays).toBe(expectedDays);

    // Inert status pill: the {trip.status} badge is present but is NOT a button/link/control.
    // Assert the page exposes NO interactive routing surface.
    expect(await viewerPage.getByRole("button", { name: /route|checkout|with expert|ready for/i }).count()).toBe(0);
    // No status <select>/dropdown controls.
    expect(await viewerPage.locator("select").count()).toBe(0);
    // No transition-log / diary footer on the public view.
    expect(await viewerPage.getByText(/transition log|status history|diary/i).count()).toBe(0);
    // The ONLY CTAs are the plan-your-own buttons (no owner/edit affordances).
    await expect(viewerPage.getByTestId("button-plan-own-trip")).toBeVisible();

    // ── Post-share edit reflection: add an itinerary_item, reload public view, see it appear ─────
    // The share page now reads from itinerary_items (live plan), not generated_itineraries.
    // Any item edit by the owner must be visible on the next page load — no regenerate required.
    const beforeItemCount = await scalar<string>(
      `SELECT count(*)::text FROM itinerary_items WHERE trip_id = $1`,
      [tripId],
    );

    // Owner adds a new activity directly (no regenerate).
    const addItemRes = await owner.post(`${BASE_URL}/api/trips/${tripId}/itinerary-items`, {
      data: {
        title: "J13 Live-Edit Activity",
        description: "Added after sharing to verify live reflection.",
        itemType: "sightseeing",
        dayNumber: 1,
        startTime: "03:00 PM",
        locationName: "Lisbon waterfront",
        // decimal columns parse as STRINGS (drizzle-zod) — a bare number is a 400 "Invalid data".
        // This exact line broke the suite from 7f6ba474 (the PR #440 rescue) until now.
        estimatedCost: "12.00",
        status: "planned",
      },
    });
    expect(addItemRes.status(), `add item failed: ${await addItemRes.text()}`).toBe(201);

    const afterItemCount = await scalar<string>(
      `SELECT count(*)::text FROM itinerary_items WHERE trip_id = $1`,
      [tripId],
    );
    expect(Number(afterItemCount)).toBe(Number(beforeItemCount) + 1);

    // Reload the public share page — the new item must appear without any regenerate call.
    await viewerPage.reload({ waitUntil: "domcontentloaded" });
    await expect(viewerPage.getByTestId("banner-shared-view")).toBeVisible({ timeout: 30_000 });

    // Day 1 block must still render and the new activity must be findable by title.
    await expect(viewerPage.getByTestId("shared-day-1")).toBeVisible();
    await expect(viewerPage.getByText("J13 Live-Edit Activity")).toBeVisible();

    await viewerContext.close();
  });
});
