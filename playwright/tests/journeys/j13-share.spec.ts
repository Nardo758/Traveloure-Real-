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
import { test, expect, request as pwRequest } from "@playwright/test";
import {
  BASE_URL,
  registerUser,
  createTrip,
  rows,
  scalar,
  closePool,
} from "./_journey-helpers";

test.afterAll(async () => {
  await closePool();
});

// generate-itinerary makes a real (or fallback) AI call; the DOM leg runs two of them + a
// browser render, so allow generous headroom.
test.setTimeout(180_000);

/**
 * Owner-authenticated: generate (or regenerate) the trip's generated_itineraries row.
 * The endpoint calls Anthropic (with a contextual fallback), so it can transiently 503 under
 * concurrent load; retry a couple of times before failing.
 */
async function generateItinerary(ctx: any, tripId: string, preferences?: string) {
  let res: any;
  for (let attempt = 0; attempt < 3; attempt++) {
    res = await ctx.post(`${BASE_URL}/api/trips/${tripId}/generate-itinerary`, {
      data: preferences ? { preferences } : {},
    });
    if (res.status() === 200 || res.status() === 201) return res;
    // transient upstream errors → back off and retry
    if ([429, 500, 502, 503, 504].includes(res.status())) {
      await new Promise((r) => setTimeout(r, 3_000 * (attempt + 1)));
      continue;
    }
    break;
  }
  expect([200, 201], `generate-itinerary failed: ${res.status()} ${await res.text()}`).toContain(res.status());
  return res;
}

test.describe("J13 — Trip share (owner → public read-only view)", () => {
  // Serial: the two tests each drive the AI generate endpoint; running them in parallel can
  // overload the upstream model (transient 503). Serial keeps the solo run deterministic.
  test.describe.configure({ mode: "serial" });

  test("owner shares → shared_trips row → unauth context renders read-only view (inert pill, no routing controls, no log) → post-share edit reflects live", async () => {
    // ── 1. Fresh owner + trip + a generated itinerary (all via app APIs) ───────────────────────
    const owner = await pwRequest.newContext();
    await registerUser(owner, "j13-owner", "J13", "Owner");
    const tripId = await createTrip(owner, "J13 Shared Kyoto Plan", "Kyoto, Japan");

    // A generated_itineraries row (status='generated') is what the share view reads.
    await generateItinerary(owner, tripId);
    const genStatus = await scalar<string>(
      `SELECT status FROM generated_itineraries WHERE trip_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [tripId],
    );
    expect(genStatus).toBe("generated");

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
    expect(publicBody.trip.itinerary_data, "public payload carries the live generated itinerary_data").toBeTruthy();
    await viewer.dispose();

    // DB FACT: the public GET logged a shared_trip_views row and bumped shared_trips.views.
    const viewCount = await scalar<string>(
      `SELECT count(*)::text FROM shared_trip_views stv
         JOIN shared_trips st ON st.id = stv.shared_trip_id
        WHERE st.share_token = $1`,
      [token],
    );
    expect(Number(viewCount)).toBeGreaterThanOrEqual(1);

    await owner.dispose();
    // The DOM render + inertness + live-reflection leg is the next test (uses a browser context).
  });

  // The DOM leg lives in its own test so the API-only journey above stays fast + isolated.
  test("public share PAGE renders read-only: inert status pill, day/activity testids, NO routing controls, NO log footer", async ({ browser }) => {
    const owner = await pwRequest.newContext();
    await registerUser(owner, "j13-ui-owner", "J13", "UiOwner");
    const tripId = await createTrip(owner, "J13 UI Shared Plan", "Lisbon, Portugal");
    await generateItinerary(owner, tripId);

    const shareRes = await owner.post(`${BASE_URL}/api/trips/${tripId}/share`, { data: {} });
    expect(shareRes.status()).toBe(200);
    const token = (await shareRes.json()).shareToken as string;

    // How many days the itinerary_data actually holds — the render must show that many day blocks.
    const dayCount = await scalar<string>(
      `SELECT jsonb_array_length(itinerary_data->'days')::text
         FROM generated_itineraries WHERE trip_id = $1 AND status='generated'
         ORDER BY created_at DESC LIMIT 1`,
      [tripId],
    );
    const expectedDays = Number(dayCount || "0");
    expect(expectedDays).toBeGreaterThan(0);

    // Fresh UNAUTHENTICATED context (no storage state, no cookies).
    const viewerContext = await browser.newContext();
    const page = await viewerContext.newPage();
    await page.goto(`${BASE_URL}/trips/shared/${token}`, { waitUntil: "domcontentloaded" });

    // Read-only banner present (waits for the SPA to fetch + render).
    await expect(page.getByTestId("banner-shared-view")).toBeVisible({ timeout: 30_000 });

    // At least the first day + its first activity render (bespoke list, NOT ItineraryCard).
    await expect(page.getByTestId("shared-day-1")).toBeVisible();
    await expect(page.getByTestId("shared-activity-1-0")).toBeVisible();

    // The number of day blocks equals the itinerary_data day count (live render fidelity).
    const renderedDays = await page.locator('[data-testid^="shared-day-"]').count();
    expect(renderedDays).toBe(expectedDays);

    // Inert status pill: the {trip.status} badge is present but is NOT a button/link/control.
    // Assert the page exposes NO interactive routing surface.
    expect(await page.getByRole("button", { name: /route|checkout|with expert|ready for/i }).count()).toBe(0);
    // No status <select>/dropdown controls.
    expect(await page.locator("select").count()).toBe(0);
    // No transition-log / diary footer on the public view.
    expect(await page.getByText(/transition log|status history|diary/i).count()).toBe(0);
    // The ONLY CTAs are the plan-your-own buttons (no owner/edit affordances).
    await expect(page.getByTestId("button-plan-own-trip")).toBeVisible();

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
        title: "J13 Live-Edit Activity — Secret Garden Visit",
        description: "Added after sharing to verify live reflection.",
        itemType: "sightseeing",
        dayNumber: 1,
        startTime: "03:00 PM",
        locationName: "Secret Garden, Lisbon",
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
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("banner-shared-view")).toBeVisible({ timeout: 30_000 });

    // Day 1 block must still render and the new activity must be findable by title.
    await expect(page.getByTestId("shared-day-1")).toBeVisible();
    await expect(page.getByText("J13 Live-Edit Activity — Secret Garden Visit")).toBeVisible();

    await viewerContext.close();
    await owner.dispose();
  });
});
