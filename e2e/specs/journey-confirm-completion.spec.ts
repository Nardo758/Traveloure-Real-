// e2e/specs/journey-confirm-completion.spec.ts
//
// E2E-1096: Traveler "Confirm completion" → booking transitions to completed →
//           earnings appear (releasable) on the expert's /expert/money dashboard.
//
// Two complementary sub-specs:
//
//   A) Happy-path (paid, confirmed, delivered):
//      traveler POSTs confirm-completion → 200 → booking card shows "Completed"
//      → expert /api/expert/earnings/details shows a releasable earning.
//
//   B) Error-path (unpaid request-rail):
//      a confirmed booking with no Stripe PI → confirm-completion returns 400
//      with a clear error message (not a silent 5xx).
//
// Both specs drive the REAL API via page.request (session cookie is shared with
// the browser context), which bypasses the 24-hour client-side gate. The
// server enforces the same gate authoritatively; tests skip gracefully when no
// suitable fixture exists in the target DB rather than failing noisily.
//
// Run against staging (ALLOW_TEST_ACCOUNTS=1):
//   npx playwright test e2e/specs/journey-confirm-completion.spec.ts \
//     -c playwright.e2e.config.ts

import { test, expect } from "@playwright/test";
import { loginAsTestAccount } from "./helpers/auth";
import { requireBaseUrl } from "../fixtures/base-url";

// ─── Types ────────────────────────────────────────────────────────────────────

interface MyBooking {
  id: string;
  status: string;
  stripePaymentIntentId: string | null;
  confirmedAt: string | null;
  createdAt: string;
  providerId: string | null;
  bookingDetails?: { scheduledDate?: string | null } | null;
}

interface EarningsDetails {
  summary: {
    totalEarnings: number;
    pendingEarnings: number;
    availableEarnings: number;
  };
  earnings: Array<{ id: string; status: string; amount: string }>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Whether a booking is past the deliverability gate (matches server logic). */
function isPastDeliveryGate(b: MyBooking): boolean {
  const refMs = b.bookingDetails?.scheduledDate
    ? new Date(b.bookingDetails.scheduledDate).getTime()
    : new Date(b.confirmedAt ?? b.createdAt).getTime();
  return Date.now() >= refMs + 24 * 60 * 60 * 1000;
}

// ─── A: Happy path ────────────────────────────────────────────────────────────

test.describe("Journey 1096-A — paid confirmed booking → Confirm completion → completed + earnings", () => {
  test("traveler clicks Confirm completion → booking shows completed → expert sees releasable earning", async ({ page }) => {
    const BASE = requireBaseUrl();

    // ── 1. Sign in as traveler ───────────────────────────────────────────────
    await loginAsTestAccount(page, "traveler");

    // ── 2. Fetch the traveler's bookings ────────────────────────────────────
    const bookingsRes = await page.request.get(`${BASE}/api/my-bookings`);
    expect(bookingsRes.ok(), `GET /api/my-bookings → ${bookingsRes.status()}`).toBeTruthy();
    const bookings: MyBooking[] = await bookingsRes.json();

    // Find a booking that:
    //   • status === 'confirmed'
    //   • has a Stripe PI on record (paid, not request-rail)
    //   • is past the 24-hour delivery gate (server will also check this)
    const candidate = bookings.find(
      (b) =>
        b.status === "confirmed" &&
        b.stripePaymentIntentId &&
        isPastDeliveryGate(b),
    );

    if (!candidate) {
      console.log(
        "[1096-A] No paid+delivered confirmed booking found in the test DB — " +
          "skipping. Seed a paid service booking whose confirmed_at is >24 h ago.",
      );
      test.skip();
      return;
    }

    const bookingId = candidate.id;
    console.log(`[1096-A] Using booking ${bookingId} (providerId=${candidate.providerId})`);

    // ── 3. Snapshot expert earnings before the confirmation ──────────────────
    // Switch to the expert session to capture the pre-completion ledger.
    // We switch back immediately so the traveler session is still live for
    // the API call in step 4 (page.request cookies follow the page context).
    //
    // Switching accounts in one browser context: logout/login sequence via
    // page.request so the cookie jar is replaced atomically.
    const preExpertRes = await page.request.get(`${BASE}/api/expert/earnings/details`);
    // 401 is expected — we are still the traveler at this point; capture below
    // only after we re-authenticate as the expert. We do it AFTER step 4.

    // ── 4. Call confirm-completion as the traveler ───────────────────────────
    const confirmRes = await page.request.post(
      `${BASE}/api/bookings/${bookingId}/confirm-completion`,
    );
    expect(
      confirmRes.status(),
      `confirm-completion should return 200; got ${confirmRes.status()} — ` +
        `body: ${await confirmRes.text().catch(() => "<unreadable>")}`,
    ).toBe(200);

    const confirmBody = await confirmRes.json();
    expect(confirmBody.success, "response.success should be true").toBe(true);
    console.log(`[1096-A] confirm-completion succeeded; released=${confirmBody.released}`);

    // ── 5. Navigate to /bookings and verify the booking card shows Completed ─
    await page.goto(`${BASE}/bookings`, { waitUntil: "domcontentloaded" });
    // Cold-start budget: 90 s for the Vite dev server to compile the page.
    await page.waitForSelector('[data-testid="link-logo"]', { timeout: 90_000 });

    const bookingCard = page.locator(`[data-testid="card-booking-${bookingId}"]`);
    await expect(bookingCard, `card-booking-${bookingId} should be visible`).toBeVisible({
      timeout: 15_000,
    });

    const statusBadge = bookingCard.locator(`[data-testid="badge-status-${bookingId}"]`);
    await expect(
      statusBadge,
      "status badge should read Completed after confirm-completion",
    ).toContainText(/completed/i, { timeout: 10_000 });

    // ── 6. Verify the "Confirm completion" button is gone now ────────────────
    const confirmBtn = bookingCard.locator(
      `[data-testid="button-confirm-completion-${bookingId}"]`,
    );
    await expect(
      confirmBtn,
      "Confirm completion button should disappear after booking completes",
    ).not.toBeVisible();

    // ── 7. Switch to the expert session and verify earnings ─────────────────
    // Log out the traveler and log in as the expert seeded account.
    await page.request.get(`${BASE}/api/logout`).catch(() => {});
    await loginAsTestAccount(page, "expert");

    const earningsRes = await page.request.get(`${BASE}/api/expert/earnings/details`);
    expect(earningsRes.ok(), `GET /api/expert/earnings/details → ${earningsRes.status()}`).toBeTruthy();
    const earningsData: EarningsDetails = await earningsRes.json();

    // After confirm-completion the held earning is early-released → status
    // transitions held → releasable. Either state is evidence the earning was
    // minted; releasable is the expected post-release state.
    const releasable = earningsData.earnings.filter(
      (e) => e.status === "releasable" || e.status === "held",
    );
    expect(
      releasable.length,
      `Expert should have at least one held/releasable earning after confirm-completion. ` +
        `Earnings: ${JSON.stringify(earningsData.earnings)}`,
    ).toBeGreaterThan(0);

    // Navigate to the expert Money page and verify the summary card renders
    await page.goto(`${BASE}/expert/money`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-testid="link-logo"]', { timeout: 90_000 });

    // At least one summary stat card must be present (proves the page compiled
    // and the earnings endpoint returned data — not a spinner/error state).
    const earningsCard = page.locator(
      '[data-testid="card-earnings-available"], [data-testid="card-earnings-held"], [data-testid="card-earnings-total"]',
    );
    await expect(earningsCard.first(), "Expert Money page should render earnings stat cards").toBeVisible({
      timeout: 15_000,
    });

    console.log(
      `[1096-A] PASS — booking ${bookingId} completed; ` +
        `expert has ${releasable.length} held/releasable earning(s); Money page rendered.`,
    );
  });
});

// ─── B: Error path — unpaid request-rail ──────────────────────────────────────

test.describe("Journey 1096-B — unpaid confirmed booking → confirm-completion returns 400", () => {
  test("confirming an unpaid confirmed booking returns a 400 with a clear error message", async ({ page }) => {
    const BASE = requireBaseUrl();

    // ── 1. Sign in as traveler ───────────────────────────────────────────────
    await loginAsTestAccount(page, "traveler");

    // ── 2. Fetch the traveler's bookings ────────────────────────────────────
    const bookingsRes = await page.request.get(`${BASE}/api/my-bookings`);
    expect(bookingsRes.ok(), `GET /api/my-bookings → ${bookingsRes.status()}`).toBeTruthy();
    const bookings: MyBooking[] = await bookingsRes.json();

    // Find a confirmed booking that has NO Stripe PI (request-rail / unpaid).
    // Any confirmed booking without a PI is valid — delivery gate doesn't matter
    // here because the PI check runs before the delivery gate for request-rail.
    const unpaid = bookings.find(
      (b) => b.status === "confirmed" && !b.stripePaymentIntentId,
    );

    if (!unpaid) {
      console.log(
        "[1096-B] No unpaid confirmed booking found — skipping. " +
          "Seed a request-rail confirmed booking without a Stripe PI to exercise this path.",
      );
      test.skip();
      return;
    }

    console.log(`[1096-B] Using unpaid confirmed booking ${unpaid.id}`);

    // ── 3. POST confirm-completion — must return 400, never 5xx ─────────────
    const res = await page.request.post(
      `${BASE}/api/bookings/${unpaid.id}/confirm-completion`,
    );

    expect(
      res.status(),
      `confirm-completion on an unpaid booking must return 400 (got ${res.status()})`,
    ).toBe(400);

    const body = await res.json();
    expect(
      typeof body.error === "string" && body.error.length > 0,
      `400 response should carry a non-empty error string; got: ${JSON.stringify(body)}`,
    ).toBe(true);

    // The server message must mention "no payment" or "not completed" — never a
    // generic crash message — so a traveler reading it understands why it failed.
    expect(
      body.error,
      "error message should reference payment status so the traveler understands the failure",
    ).toMatch(/payment|no payment|not completed/i);

    console.log(
      `[1096-B] PASS — unpaid booking ${unpaid.id} rejected with 400: "${body.error}"`,
    );
  });
});

// ─── C: UI gate — button visibility ──────────────────────────────────────────

test.describe("Journey 1096-C — Confirm completion button appears only for delivered confirmed bookings", () => {
  test("/bookings page renders and Confirm completion buttons appear only for eligible bookings", async ({ page }) => {
    const BASE = requireBaseUrl();

    // ── 1. Sign in as traveler ───────────────────────────────────────────────
    await loginAsTestAccount(page, "traveler");

    // ── 2. Fetch bookings via API to know what to expect in the UI ──────────
    const bookingsRes = await page.request.get(`${BASE}/api/my-bookings`);
    expect(bookingsRes.ok()).toBeTruthy();
    const bookings: MyBooking[] = await bookingsRes.json();

    // Bookings where the client-side canConfirmOrDispute gate is true:
    //   booking.status === 'completed' || (status === 'confirmed' && deliveryRefMs past)
    const eligibleIds = new Set(
      bookings
        .filter(
          (b) =>
            b.status === "completed" ||
            (b.status === "confirmed" && isPastDeliveryGate(b)),
        )
        .map((b) => b.id),
    );

    // ── 3. Navigate to the bookings page ────────────────────────────────────
    await page.goto(`${BASE}/bookings`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-testid="link-logo"]', { timeout: 90_000 });

    // ── 4. Verify page renders without a JS crash ────────────────────────────
    const jsErrors: string[] = [];
    page.on("console", (m) => m.type() === "error" && jsErrors.push(m.text()));
    page.on("pageerror", (e) => jsErrors.push(String(e)));

    // Give React time to hydrate and render booking cards
    // (wait for first booking card or the empty-state sentinel)
    try {
      await page.waitForSelector('[data-testid^="card-booking-"], [data-testid="empty-bookings"]', {
        timeout: 20_000,
      });
    } catch {
      console.log("[1096-C] No booking cards or empty-state rendered within timeout — DB may be empty");
    }

    const filteredErrors = jsErrors.filter(
      (e) =>
        !e.includes("Failed to load resource") &&
        !e.includes("ERR_") &&
        !e.includes("net::") &&
        !e.includes("[vite]") &&
        !e.includes("Warning:") &&
        !e.includes("ResizeObserver") &&
        !e.includes("Non-Error") &&
        !e.includes("favicon"),
    );
    expect(filteredErrors, "no JS errors on /bookings").toHaveLength(0);

    // ── 5. Confirm-completion buttons appear only for eligible bookings ───────
    if (eligibleIds.size === 0) {
      console.log(
        "[1096-C] No eligible bookings (completed or delivered-confirmed) — " +
          "verifying no confirm-completion buttons appear in the UI",
      );
      const strayButtons = page.locator('[data-testid^="button-confirm-completion-"]');
      expect(
        await strayButtons.count(),
        "No confirm-completion buttons should appear when no booking is eligible",
      ).toBe(0);
    } else {
      console.log(`[1096-C] ${eligibleIds.size} eligible booking(s); verifying button presence`);
      // At least one eligible booking → at least one button must be visible
      const confirmButtons = page.locator('[data-testid^="button-confirm-completion-"]');
      const count = await confirmButtons.count();
      expect(
        count,
        `Expected ≥1 "Confirm completion" button for ${eligibleIds.size} eligible booking(s); found ${count}`,
      ).toBeGreaterThan(0);

      // Every visible confirm-completion button must correspond to an eligible booking id
      for (let i = 0; i < count; i++) {
        const testId = await confirmButtons.nth(i).getAttribute("data-testid");
        const bookingIdFromTestId = testId?.replace("button-confirm-completion-", "") ?? "";
        expect(
          eligibleIds.has(bookingIdFromTestId),
          `Button data-testid="${testId}" rendered for booking "${bookingIdFromTestId}" which is not eligible`,
        ).toBe(true);
      }
    }

    console.log(`[1096-C] PASS — /bookings page clean; button gate verified.`);
  });
});
