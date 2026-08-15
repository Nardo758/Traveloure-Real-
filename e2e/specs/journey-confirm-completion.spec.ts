// e2e/specs/journey-confirm-completion.spec.ts
//
// E2E-1096: Traveler "Confirm completion" → booking transitions to completed →
//           earnings appear (releasable) on the expert's /expert/money dashboard.
//
// Three sub-specs:
//
//   A) Happy-path (paid, confirmed, delivered):
//      traveler clicks the "Confirm completion" UI button → POST to
//      /api/bookings/:id/confirm-completion returns 200 → booking card shows
//      "Completed" → expert earnings ledger gains a row referencing the booking.
//
//   B) Error-path (unpaid, delivered request-rail):
//      a confirmed booking that is past the delivery gate but has no Stripe PI →
//      confirm-completion returns 400 with a message that mentions "payment".
//
//   C) UI gate:
//      "Confirm completion" buttons appear only for eligible bookings (completed or
//      past-the-delivery-gate confirmed); absent for ineligible ones.
//
// All three skip gracefully with a console note when no suitable fixture exists.
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
  trackingNumber?: string | null;
  status: string;
  stripePaymentIntentId: string | null;
  confirmedAt: string | null;
  createdAt: string;
  providerId: string | null;
  bookingDetails?: { scheduledDate?: string | null } | null;
}

interface EarningRow {
  id: string;
  amount: string;
  type: string;
  status: string;
  description?: string | null;
  disputeState?: string | null;
  createdAt: string;
}

interface EarningsDetails {
  summary: {
    totalEarnings: number;
    pendingEarnings: number;
    availableEarnings: number;
    paidOut: number;
  };
  earnings: EarningRow[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** True when a booking is past the server-side deliverability gate. */
function isPastDeliveryGate(b: MyBooking): boolean {
  const refMs = b.bookingDetails?.scheduledDate
    ? new Date(b.bookingDetails.scheduledDate).getTime()
    : new Date(b.confirmedAt ?? b.createdAt).getTime();
  return Date.now() >= refMs + 24 * 60 * 60 * 1000;
}

// ─── A: Happy path ────────────────────────────────────────────────────────────

test.describe("Journey 1096-A — traveler clicks Confirm completion → completed + expert earning minted", () => {
  test("Confirm completion button click → booking shows Completed → expert earning row appears", async ({ page }) => {
    const BASE = requireBaseUrl();

    // ── 1. Log in as the seeded expert and capture their user-id + pre-snap ─
    await loginAsTestAccount(page, "expert");

    const expertMeRes = await page.request.get(`${BASE}/api/auth/user`);
    expect(expertMeRes.ok(), `GET /api/auth/user as expert → ${expertMeRes.status()}`).toBeTruthy();
    const expertMe = await expertMeRes.json();
    // Passport/email-auth exposes .id; claims-based exposes .claims.sub
    const expertUserId: string = expertMe.id ?? expertMe.claims?.sub;
    expect(expertUserId, "expert userId must be resolvable from /api/auth/user").toBeTruthy();

    // Snapshot expert earnings BEFORE the traveler confirms.
    const preEarningsRes = await page.request.get(`${BASE}/api/expert/earnings/details`);
    expect(preEarningsRes.ok(), `GET /api/expert/earnings/details → ${preEarningsRes.status()}`).toBeTruthy();
    const preEarnings: EarningsDetails = await preEarningsRes.json();
    const preEarningIds = new Set(preEarnings.earnings.map((e) => e.id));
    console.log(`[1096-A] expert ${expertUserId} pre-confirmation earnings count: ${preEarningIds.size}`);

    // ── 2. Switch to traveler, fetch bookings, pick a suitable fixture ───────
    await page.request.get(`${BASE}/api/logout`).catch(() => {});
    await loginAsTestAccount(page, "traveler");

    const bookingsRes = await page.request.get(`${BASE}/api/my-bookings`);
    expect(bookingsRes.ok(), `GET /api/my-bookings → ${bookingsRes.status()}`).toBeTruthy();
    const bookings: MyBooking[] = await bookingsRes.json();

    // Fixture requirements:
    //   • status === 'confirmed'            (the rail that mints earnings)
    //   • stripePaymentIntentId present     (paid, not request-rail)
    //   • past the 24-hour delivery gate    (server will enforce the same)
    //   • providerId === expertUserId       (so we can verify the earning on this expert)
    const candidate = bookings.find(
      (b) =>
        b.status === "confirmed" &&
        b.stripePaymentIntentId &&
        isPastDeliveryGate(b) &&
        b.providerId === expertUserId,
    );

    if (!candidate) {
      console.log(
        "[1096-A] No paid+delivered confirmed booking owned by the seeded expert account — " +
          "skipping. Seed a service booking for the kyoto-food expert with confirmed_at >24h ago " +
          "and a succeeded Stripe test-mode PI. (See task 1292.)",
      );
      test.skip();
      return;
    }

    const bookingId = candidate.id;
    console.log(`[1096-A] Using booking ${bookingId} (providerId=${candidate.providerId})`);

    // ── 3. Navigate to /bookings and verify the button is visible ────────────
    await page.goto(`${BASE}/bookings`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-testid="link-logo"]', { timeout: 90_000 });

    const confirmBtn = page.locator(`[data-testid="button-confirm-completion-${bookingId}"]`);
    await expect(
      confirmBtn,
      `"Confirm completion" button must be visible for booking ${bookingId} (past gate, confirmed)`,
    ).toBeVisible({ timeout: 15_000 });

    // ── 4. Click the button and intercept the resulting POST ─────────────────
    const [apiRes] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes(`/api/bookings/${bookingId}/confirm-completion`) &&
          r.request().method() === "POST",
        { timeout: 15_000 },
      ),
      confirmBtn.click(),
    ]);

    expect(
      apiRes.status(),
      `confirm-completion POST must return 200; got ${apiRes.status()} — ` +
        `body: ${await apiRes.text().catch(() => "<unreadable>")}`,
    ).toBe(200);

    const apiBody = await apiRes.json();
    expect(apiBody.success, "response.success must be true").toBe(true);
    console.log(`[1096-A] confirm-completion → 200; released=${apiBody.released}`);

    // ── 5. Verify the booking card now shows "Completed" ────────────────────
    // After the mutation the UI invalidates /api/my-bookings and re-renders.
    const statusBadge = page.locator(`[data-testid="badge-status-${bookingId}"]`);
    await expect(
      statusBadge,
      `booking ${bookingId} status badge must read "Completed" after confirm-completion`,
    ).toContainText(/completed/i, { timeout: 10_000 });

    // ── 6. Switch to the expert and verify a new earning row appeared ────────
    await page.request.get(`${BASE}/api/logout`).catch(() => {});
    await loginAsTestAccount(page, "expert");

    const postEarningsRes = await page.request.get(`${BASE}/api/expert/earnings/details`);
    expect(postEarningsRes.ok(), `GET /api/expert/earnings/details post-confirmation → ${postEarningsRes.status()}`).toBeTruthy();
    const postEarnings: EarningsDetails = await postEarningsRes.json();

    // The storage layer writes the description as:
    //   `Service booking earnings from ${booking.trackingNumber || booking.id}`
    // Most service bookings have a tracking number, so we match against it first,
    // falling back to the UUID for fixtures that lack one.
    const descKey = candidate.trackingNumber ?? bookingId;
    const bookingEarning = postEarnings.earnings.find(
      (e) => e.description?.includes(descKey),
    );
    expect(
      bookingEarning,
      `Expert earnings must include a row whose description contains "${descKey}". ` +
        `Rows present: ${JSON.stringify(postEarnings.earnings.map((e) => ({ id: e.id, status: e.status, desc: e.description })))}`,
    ).toBeTruthy();

    // The matched row must be NEW — absent from the pre-confirmation snapshot —
    // proving that confirm-completion minted it rather than it being a stale entry.
    expect(
      preEarningIds.has(bookingEarning!.id),
      `Earning ${bookingEarning!.id} was already present before confirm-completion; ` +
        `it must be a new row minted by the completion transition`,
    ).toBe(false);

    // After confirm-completion the held earning is early-released → 'releasable'.
    // 'held' is also accepted: it means the release ran but the hold window hasn't
    // cleared yet (edge case where DB time differs from test runner).
    expect(
      bookingEarning?.status,
      `Earning for booking ${bookingId} should be releasable or held (got "${bookingEarning?.status}")`,
    ).toMatch(/^(releasable|held)$/);

    // ── 7. Verify the expert Money page renders the stat cards ───────────────
    await page.goto(`${BASE}/expert/money`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-testid="link-logo"]', { timeout: 90_000 });

    await expect(
      page.locator(
        '[data-testid="card-earnings-available"], [data-testid="card-earnings-held"], [data-testid="card-earnings-total"]',
      ).first(),
      "Expert Money page must render earnings stat cards (not a spinner or error state)",
    ).toBeVisible({ timeout: 15_000 });

    console.log(
      `[1096-A] PASS — booking ${bookingId} → completed; ` +
        `expert earning ${bookingEarning?.id} status="${bookingEarning?.status}"; Money page rendered.`,
    );
  });
});

// ─── B: Error path — unpaid past-gate booking ────────────────────────────────

test.describe("Journey 1096-B — unpaid delivered booking → confirm-completion returns 400 with payment error", () => {
  test("confirming a past-gate unpaid booking returns 400 mentioning payment", async ({ page }) => {
    const BASE = requireBaseUrl();

    // ── 1. Sign in as traveler ───────────────────────────────────────────────
    await loginAsTestAccount(page, "traveler");

    // ── 2. Fetch bookings and find a suitable fixture ────────────────────────
    const bookingsRes = await page.request.get(`${BASE}/api/my-bookings`);
    expect(bookingsRes.ok(), `GET /api/my-bookings → ${bookingsRes.status()}`).toBeTruthy();
    const bookings: MyBooking[] = await bookingsRes.json();

    // Fixture requirements:
    //   • status === 'confirmed'
    //   • NO Stripe PI (request-rail / never charged)
    //   • PAST the 24-hour delivery gate — so the server clears the delivery
    //     check and proceeds to the PI check, which is what we're testing.
    //     A fixture that is NOT past the gate would return "not_yet_deliverable"
    //     instead of the payment error we're asserting here.
    const unpaid = bookings.find(
      (b) =>
        b.status === "confirmed" &&
        !b.stripePaymentIntentId &&
        isPastDeliveryGate(b),
    );

    if (!unpaid) {
      console.log(
        "[1096-B] No past-gate unpaid confirmed booking found — skipping. " +
          "Seed a request-rail confirmed booking without a Stripe PI whose confirmed_at is >24h ago.",
      );
      test.skip();
      return;
    }

    console.log(`[1096-B] Using unpaid+past-gate confirmed booking ${unpaid.id}`);

    // ── 3. POST confirm-completion — must return 400 (payment check) ─────────
    const res = await page.request.post(
      `${BASE}/api/bookings/${unpaid.id}/confirm-completion`,
    );

    expect(
      res.status(),
      `confirm-completion on an unpaid past-gate booking must return 400 (got ${res.status()})`,
    ).toBe(400);

    const body = await res.json();
    expect(
      typeof body.error === "string" && body.error.length > 0,
      `400 response must carry a non-empty error string; got: ${JSON.stringify(body)}`,
    ).toBe(true);

    // Server message: "This booking has no payment on record, so it cannot be confirmed as completed."
    expect(
      body.error,
      "Error message must reference payment so the traveler understands the failure",
    ).toMatch(/payment/i);

    console.log(`[1096-B] PASS — unpaid booking ${unpaid.id} rejected 400: "${body.error}"`);
  });
});

// ─── C: UI gate — button eligibility ─────────────────────────────────────────

test.describe("Journey 1096-C — Confirm completion button visible only for eligible bookings", () => {
  test("/bookings renders cleanly and Confirm completion buttons match API-derived eligibility", async ({ page }) => {
    const BASE = requireBaseUrl();

    // ── 1. Sign in as traveler ───────────────────────────────────────────────
    await loginAsTestAccount(page, "traveler");

    // ── 2. Fetch bookings to derive expected eligibility ─────────────────────
    const bookingsRes = await page.request.get(`${BASE}/api/my-bookings`);
    expect(bookingsRes.ok()).toBeTruthy();
    const bookings: MyBooking[] = await bookingsRes.json();

    // canConfirmOrDispute = status === 'completed'
    //                     || (status === 'confirmed' && past delivery gate)
    const eligibleIds = new Set(
      bookings
        .filter(
          (b) =>
            b.status === "completed" ||
            (b.status === "confirmed" && isPastDeliveryGate(b)),
        )
        .map((b) => b.id),
    );

    // ── 3. Navigate to /bookings ─────────────────────────────────────────────
    const jsErrors: string[] = [];
    page.on("console", (m) => m.type() === "error" && jsErrors.push(m.text()));
    page.on("pageerror", (e) => jsErrors.push(String(e)));

    await page.goto(`${BASE}/bookings`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-testid="link-logo"]', { timeout: 90_000 });

    // Wait for booking cards or the empty-state sentinel
    try {
      await page.waitForSelector(
        '[data-testid^="card-booking-"], [data-testid="empty-bookings"]',
        { timeout: 20_000 },
      );
    } catch {
      console.log("[1096-C] No booking cards rendered within timeout — DB may be empty");
    }

    // ── 4. Page must render without JS crashes ───────────────────────────────
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
    expect(filteredErrors, "No JS errors on /bookings").toHaveLength(0);

    // ── 5. Button count matches eligibility ──────────────────────────────────
    const confirmButtons = page.locator('[data-testid^="button-confirm-completion-"]');
    const uiCount = await confirmButtons.count();

    if (eligibleIds.size === 0) {
      expect(
        uiCount,
        "No confirm-completion buttons should appear when no booking is eligible",
      ).toBe(0);
      console.log("[1096-C] PASS — no eligible bookings; no buttons in UI.");
      return;
    }

    expect(
      uiCount,
      `Expected ≥1 Confirm completion button for ${eligibleIds.size} eligible booking(s); got ${uiCount}`,
    ).toBeGreaterThan(0);

    // ── 6. Every visible button belongs to an eligible booking ───────────────
    for (let i = 0; i < uiCount; i++) {
      const testId = await confirmButtons.nth(i).getAttribute("data-testid");
      const idFromTestId = testId?.replace("button-confirm-completion-", "") ?? "";
      expect(
        eligibleIds.has(idFromTestId),
        `Button "${testId}" rendered for booking "${idFromTestId}" which is not in the eligible set`,
      ).toBe(true);
    }

    console.log(
      `[1096-C] PASS — ${uiCount} button(s) visible; all match ${eligibleIds.size} eligible booking(s).`,
    );
  });
});
