/**
 * google-places-workspace.spec.ts
 *
 * Confirms Google Places browse results appear end-to-end in the expert
 * workspace for a real trip assigned to the seeded test expert.
 *
 * Two scenarios:
 *  1. [GP-1] Happy path — server returns Places results (source=google_places);
 *           at least one card[data-testid^="card-gplace-"] must appear.
 *  2. [GP-2] Unavailable path — server sets placesUnavailable:true; the
 *           data-testid="notice-places-unavailable" notice must appear instead.
 *
 * Auth: real login via POST /api/auth/login using the seeded E2E expert
 * kyoto-food@traveloure.test.  This sets a genuine session cookie so
 * ProtectedRoute passes without any auth mocking.
 *
 * Trip: the seeded expert's first real assigned trip (fetched via the API
 * at test start) so no fake trip ID or workspace-context mock is needed.
 * The workspace and all its real API calls load normally; only the Google
 * Places search arm is intercepted so the test controls what the panel shows.
 */

import { test, expect, type Route, type Page } from "@playwright/test";

// ── Constants ────────────────────────────────────────────────────────────────
const EXPERT_EMAIL    = "kyoto-food@traveloure.test";
const EXPERT_PASSWORD = "TestPass123!";
const BASE_URL = process.env.BASE_URL || "http://localhost:5000";

// ── Fake Places results ───────────────────────────────────────────────────────
const FAKE_PLACES_RESULTS = [
  {
    id: "gp_ChIJhWMsPimGGQ0RoZEUjOHFpcc",
    source: "google_places",
    placeId: "ChIJhWMsPimGGQ0RoZEUjOHFpcc",
    name: "Pastéis de Belém",
    address: "R. de Belém 84-92, 1300-085 Lisboa, Portugal",
    category: "dining",
    rating: 4.7,
    reviewCount: 52341,
    priceLabel: "$",
    location: { lat: 38.6972, lng: -9.2034 },
    photoUrl: null,
    mapsUrl: "https://maps.google.com/?cid=1234",
  },
  {
    id: "gp_ChIJ1c3nZimGGQ0R7ylJf4vRn6E",
    source: "google_places",
    placeId: "ChIJ1c3nZimGGQ0R7ylJf4vRn6E",
    name: "Torre de Belém",
    address: "Av. Brasília, 1400-038 Lisboa, Portugal",
    category: "culture",
    rating: 4.5,
    reviewCount: 88421,
    priceLabel: "$$",
    location: { lat: 38.6916, lng: -9.216 },
    photoUrl: null,
    mapsUrl: "https://maps.google.com/?cid=5678",
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Log in and return the first assigned trip ID from the API. */
async function loginAndGetTripId(page: Page): Promise<string> {
  const loginRes = await page.request.post(`${BASE_URL}/api/auth/login`, {
    data: { email: EXPERT_EMAIL, password: EXPERT_PASSWORD },
  });
  if (loginRes.status() !== 200) {
    throw new Error(
      `Expert login failed (${loginRes.status()}) — ensure ${EXPERT_EMAIL} is seeded in the dev DB`,
    );
  }

  const tripsRes = await page.request.get(`${BASE_URL}/api/expert/assigned-trips`);
  if (!tripsRes.ok()) {
    throw new Error(`Failed to fetch assigned trips: ${tripsRes.status()}`);
  }
  const trips: Array<{ trip_id: string; destination?: string }> = await tripsRes.json();
  if (!trips.length) {
    throw new Error(
      `${EXPERT_EMAIL} has no assigned trips — ensure the dev DB is seeded`,
    );
  }
  return trips[0].trip_id;
}

/**
 * Intercept the Google Places arm of /api/search/experiences.
 * All other arms (platform, viator) are passed through to the real server.
 * Registered after navigation so the route handler targets only the
 * Places fetch that fires after the Google-Places pill is clicked.
 */
async function mockPlacesSearch(page: Page, placesUnavailable: boolean): Promise<void> {
  await page.route("**/api/search/experiences**", (route: Route) => {
    const url = route.request().url();
    if (!url.includes("sources=google")) {
      // Let platform / viator arms reach the real server.
      route.continue();
      return;
    }
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        placesUnavailable
          ? { results: [], count: 0, placesUnavailable: true }
          : {
              results: FAKE_PLACES_RESULTS,
              count: FAKE_PLACES_RESULTS.length,
              placesUnavailable: false,
            },
      ),
    });
  });
}

/**
 * Navigate to the workspace for the given trip and wait until the right-panel
 * "Add" tab button is visible — the reliable indicator that the workspace has
 * passed its isLoading skeleton and its "Build not found" guard.
 */
async function openWorkspace(page: Page, tripId: string): Promise<void> {
  await page.goto(`${BASE_URL}/expert/workspace/${tripId}`);
  // waitForLoadState("networkidle") is unreliable here: the workspace keeps
  // live connections open (coordination polling, WebSocket, TravelPulse).
  // Wait for a concrete element that only appears after isLoading clears.
  await page.waitForSelector('[data-testid="tab-right-add"]', { timeout: 25_000 });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe("[Google Places] Expert workspace browse", () => {
  /**
   * [GP-1] Happy path — real Places results appear.
   * At least one card[data-testid^="card-gplace-"] must be visible.
   */
  test("[GP-1] Google Places pill shows result cards", async ({ page }) => {
    const tripId = await loginAndGetTripId(page);
    await mockPlacesSearch(page, /* placesUnavailable */ false);
    await openWorkspace(page, tripId);

    // rightTab defaults to "add", source pills are already rendered.
    const googlePill = page.locator('[data-testid="button-add-source-google"]');
    await expect(
      googlePill,
      "Google Places pill must be visible in the Add panel",
    ).toBeVisible({ timeout: 8_000 });
    await googlePill.click();

    // The search fires immediately: either destination or browseQuery is set
    // (destination comes from the trip's workspaceCtx).
    const firstCard = page.locator('[data-testid^="card-gplace-"]').first();
    await expect(
      firstCard,
      'At least one Google Places result card (data-testid^="card-gplace-") must appear',
    ).toBeVisible({ timeout: 10_000 });

    const cardCount = await page.locator('[data-testid^="card-gplace-"]').count();
    expect(cardCount, "Expected ≥1 Places result").toBeGreaterThan(0);

    // Unavailable notice must NOT appear when results are present.
    await expect(
      page.locator('[data-testid="notice-places-unavailable"]'),
      "Unavailable notice must NOT appear when results are returned",
    ).not.toBeVisible();

    // Spot-check: the first fake result's name must appear inside a card.
    await expect(
      page
        .locator('[data-testid^="card-gplace-"]')
        .filter({ hasText: FAKE_PLACES_RESULTS[0].name })
        .first(),
      `Card for "${FAKE_PLACES_RESULTS[0].name}" must be visible`,
    ).toBeVisible({ timeout: 5_000 });

    console.log(`[GP-1] ${cardCount} Google Places card(s) rendered ✓`);
  });

  /**
   * [GP-2] Unavailable path — server sets placesUnavailable:true.
   * data-testid="notice-places-unavailable" must appear; no result cards.
   */
  test("[GP-2] Google Places pill shows unavailable notice when API fails", async ({ page }) => {
    const tripId = await loginAndGetTripId(page);
    await mockPlacesSearch(page, /* placesUnavailable */ true);
    await openWorkspace(page, tripId);

    const googlePill = page.locator('[data-testid="button-add-source-google"]');
    await expect(
      googlePill,
      "Google Places pill must be visible",
    ).toBeVisible({ timeout: 8_000 });
    await googlePill.click();

    // When placesUnavailable is true the client renders the notice and
    // suppresses the results list entirely.
    const notice = page.locator('[data-testid="notice-places-unavailable"]');
    await expect(
      notice,
      "notice-places-unavailable must appear when server returns placesUnavailable:true",
    ).toBeVisible({ timeout: 10_000 });

    // No result cards should leak through.
    expect(
      await page.locator('[data-testid^="card-gplace-"]').count(),
      "No card-gplace-* cards should render when placesUnavailable is true",
    ).toBe(0);

    // Notice text must communicate unavailability.
    await expect(notice).toContainText(/unavailable/i);

    console.log("[GP-2] Places unavailable notice rendered correctly ✓");
  });

  /**
   * [GP-3] Manual search path — expert types a query into the browse search
   * box after clicking the Google Places pill.  The debounced query fires a
   * new fetch that must also produce result cards distinct from the initial
   * auto-triggered destination search.
   *
   * Key design choices:
   *  - A query-aware route intercept returns DIFFERENT cards for requests that
   *    contain "q=pastel" vs the initial destination-only call.  This ensures
   *    the manual-query response — not the pre-existing initial cards — is what
   *    satisfies the assertions.
   *  - page.waitForResponse() synchronises with the actual debounced network
   *    request, so no fixed sleep is needed and the test cannot pass without
   *    the request firing.
   */
  test("[GP-3] Google Places pill shows result cards after manual search query", async ({ page }) => {
    const tripId = await loginAndGetTripId(page);

    // Distinct fake result returned ONLY for the manual "pastel" query.
    // Its name does not appear in FAKE_PLACES_RESULTS, so the assertion below
    // can only pass when the manual-query response is rendered.
    const PASTEL_RESULT = {
      id: "gp_pastel_unique_001",
      source: "google_places",
      placeId: "ChIJPastelUnique001",
      name: "Pastel de Nata Workshop",
      address: "Rua do Forno 12, 1200-001 Lisboa, Portugal",
      category: "dining",
      rating: 4.9,
      reviewCount: 312,
      priceLabel: "$",
      location: { lat: 38.71, lng: -9.14 },
      photoUrl: null,
      mapsUrl: "https://maps.google.com/?cid=99991",
    };

    // Query-aware intercept: return PASTEL_RESULT when the URL contains
    // "q=pastel" (the debounced manual search), FAKE_PLACES_RESULTS for the
    // initial destination-only call, and pass through all non-google arms.
    await page.route("**/api/search/experiences**", (route: Route) => {
      const url = route.request().url();
      if (!url.includes("sources=google")) {
        route.continue();
        return;
      }
      // Decode query string so "q=pastel" is found regardless of encoding.
      const searchParams = new URL(url).searchParams;
      const q = (searchParams.get("q") ?? "").toLowerCase();
      if (q.includes("pastel")) {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            results: [PASTEL_RESULT],
            count: 1,
            placesUnavailable: false,
          }),
        });
      } else {
        // Initial auto-triggered search (destination, no manual q).
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            results: FAKE_PLACES_RESULTS,
            count: FAKE_PLACES_RESULTS.length,
            placesUnavailable: false,
          }),
        });
      }
    });

    await openWorkspace(page, tripId);

    // Click the Google Places pill to activate the google source.
    const googlePill = page.locator('[data-testid="button-add-source-google"]');
    await expect(
      googlePill,
      "Google Places pill must be visible in the Add panel",
    ).toBeVisible({ timeout: 8_000 });
    await googlePill.click();

    // Wait for the initial auto-triggered results to settle so we can
    // later distinguish them from the manual-query results.
    await expect(
      page.locator('[data-testid^="card-gplace-"]').first(),
      "Initial auto-triggered cards must appear before the manual query is typed",
    ).toBeVisible({ timeout: 10_000 });

    // Locate the browse search input that drives debouncedQuery.
    const searchInput = page.locator('[data-testid="input-browse-search-google"]');
    await expect(
      searchInput,
      'input-browse-search-google must be visible after clicking the Google Places pill',
    ).toBeVisible({ timeout: 8_000 });

    // Type the manual query and wait for the debounced request to actually
    // hit the network — page.waitForResponse synchronises with the debounce.
    const [queryResponse] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().includes("sources=google") &&
          res.url().includes("pastel") &&
          res.status() === 200,
        { timeout: 8_000 },
      ),
      searchInput.fill("pastel"),
    ]);

    // Confirm the request URL carried the manual query parameter.
    const requestedUrl = queryResponse.url();
    expect(
      requestedUrl,
      "The debounced request URL must contain q=pastel",
    ).toMatch(/[?&]q=pastel/i);

    // The pastel-specific card must now be visible.
    await expect(
      page
        .locator('[data-testid^="card-gplace-"]')
        .filter({ hasText: PASTEL_RESULT.name })
        .first(),
      `Card for "${PASTEL_RESULT.name}" must appear after typing the manual query`,
    ).toBeVisible({ timeout: 10_000 });

    // Unavailable notice must NOT appear when results are returned.
    await expect(
      page.locator('[data-testid="notice-places-unavailable"]'),
      "Unavailable notice must NOT appear when results are returned",
    ).not.toBeVisible();

    const cardCount = await page.locator('[data-testid^="card-gplace-"]').count();
    expect(cardCount, "Expected ≥1 Places result after manual search").toBeGreaterThan(0);

    console.log(`[GP-3] Manual search "pastel" fired correctly; ${cardCount} card(s) rendered ✓`);
  });
});
