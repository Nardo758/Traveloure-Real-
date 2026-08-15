/**
 * expert-booking-decline-dialog.spec.ts
 *
 * Verifies the decline confirmation dialog on /expert/inbox (queue tab) behaves
 * correctly:
 *
 *   T01 — Cancelling the dialog does NOT fire a PATCH request.
 *   T02 — Confirming the dialog fires PATCH /api/expert/bookings/:id/status
 *          with { status: "cancelled" }.
 *
 * Auth strategy: page.route() network intercepts — catches all fetch calls
 * before they reach the server, including the very first auth check.
 *
 * Mocked routes:
 *   GET  /api/auth/user             -> expert user (terms accepted)
 *   GET  /api/expert/bookings      -> single pending booking
 *   GET  /api/expert/assigned-trips -> empty array (prevents 401 noise)
 *   PATCH bookings/:id/status      -> captured + fulfilled 200
 *   Everything else                -> passthrough to real server
 *
 * Run: npx playwright test playwright/tests/expert-booking-decline-dialog.spec.ts --workers=1
 */

import { test, expect, type Page } from "@playwright/test";

const BASE = "http://localhost:5000";
const BOOKING_ID = "test-booking-abc123";

const EXPERT_USER = {
  id: 42,
  firstName: "Sam",
  lastName: "Expert",
  email: "sam-expert@traveloure.test",
  role: "travel_expert",
  profileImageUrl: null,
  termsAcceptedAt: "2025-01-01T00:00:00.000Z",
  privacyAcceptedAt: "2025-01-01T00:00:00.000Z",
};

const FAKE_BOOKINGS = [
  {
    id: BOOKING_ID,
    traveler: { displayName: "Alice Traveler" },
    createdAt: new Date().toISOString(),
    status: "pending",
    notes: "Looking forward to the trip",
  },
];

// ── Shared setup ──────────────────────────────────────────────────────────────

/**
 * Register page.route() intercepts for auth + bookings.
 * Must be called before page.goto() so routes are in place before requests fire.
 */
async function setupRoutes(page: Page) {
  // Auth: always return the expert user
  await page.route("**/api/auth/user", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(EXPERT_USER),
    });
  });

  // Bookings list: return one pending booking
  await page.route("**/api/expert/bookings", (route) => {
    if (route.request().method() !== "GET") {
      route.fallback();
      return;
    }
    // Don't intercept sub-paths like /api/expert/bookings/:id/status
    const url = route.request().url();
    if (url.match(/\/api\/expert\/bookings\/[^/]+/)) {
      route.fallback();
      return;
    }
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(FAKE_BOOKINGS),
    });
  });

  // Assigned trips: return empty (prevents 401 noise on the Assignments tab query)
  await page.route("**/api/expert/assigned-trips", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });
}

/** Navigate to /expert/inbox (queue tab default) and wait for the Decline button. */
async function gotoInbox(page: Page) {
  await page.goto(`${BASE}/expert/inbox`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector(`[data-testid="button-decline-booking-${BOOKING_ID}"]`, {
    timeout: 15_000,
  });
}

// ── T01 — Cancel the dialog → no PATCH ───────────────────────────────────────

test.describe("T01 — Cancel the decline dialog", () => {
  test("clicking Cancel (Keep booking) does NOT fire a PATCH /api/expert/bookings/:id/status request", async ({
    page,
  }) => {
    await setupRoutes(page);

    // Track any PATCH to the status endpoint
    let patchFired = false;
    await page.route(`**/api/expert/bookings/${BOOKING_ID}/status`, (route) => {
      if (route.request().method() === "PATCH") {
        patchFired = true;
      }
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
    });

    await gotoInbox(page);

    // Open the decline dialog
    await page.getByTestId(`button-decline-booking-${BOOKING_ID}`).click();

    // Dialog must be visible
    await expect(page.getByTestId("dialog-decline-booking")).toBeVisible({ timeout: 5_000 });

    // Click the cancel button ("Keep booking")
    await page.getByTestId("button-cancel-decline").click();

    // Dialog must close
    await expect(page.getByTestId("dialog-decline-booking")).not.toBeVisible({ timeout: 5_000 });

    // Allow any async request a moment to fire (it should not)
    await page.waitForTimeout(500);

    expect(patchFired).toBe(false);
  });
});

// ── T02 — Confirm the dialog → PATCH fired ────────────────────────────────────

test.describe("T02 — Confirm the decline dialog", () => {
  test("clicking Decline booking fires PATCH with { status: 'cancelled' }", async ({ page }) => {
    await setupRoutes(page);

    // Capture the PATCH body
    let capturedBody: Record<string, unknown> | null = null;
    await page.route(`**/api/expert/bookings/${BOOKING_ID}/status`, async (route) => {
      if (route.request().method() === "PATCH") {
        try {
          capturedBody = JSON.parse(route.request().postData() ?? "{}");
        } catch {
          capturedBody = {};
        }
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    });

    await gotoInbox(page);

    // Open the decline dialog
    await page.getByTestId(`button-decline-booking-${BOOKING_ID}`).click();

    // Dialog must be visible
    await expect(page.getByTestId("dialog-decline-booking")).toBeVisible({ timeout: 5_000 });

    // Click the confirm button ("Decline booking")
    await page.getByTestId("button-confirm-decline").click();

    // Wait for the PATCH to be captured
    await page.waitForTimeout(1_000);

    expect(capturedBody).not.toBeNull();
    expect((capturedBody as Record<string, unknown>).status).toBe("cancelled");
  });
});
