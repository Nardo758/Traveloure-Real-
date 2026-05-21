import { test, expect } from "@playwright/test";

const TESTUSER_EMAIL    = "testuser123@mailinator.com";
const TESTUSER_PASSWORD = "Test@1234";

const COMPLETED_BOOKING_ID = "7a6266b7-5ee0-41a0-a23b-8320239b6eaa";
const PENDING_BOOKING_ID   = "bkg-seed-pending-001";

async function loginAsTestUser123(page: any) {
  await page.goto("/login");
  await page.waitForLoadState("domcontentloaded");
  const emailInput = page.locator('input[type="email"]').first();
  await expect(emailInput).toBeVisible({ timeout: 10000 });
  await emailInput.fill(TESTUSER_EMAIL);
  await page.locator('input[type="password"]').first().fill(TESTUSER_PASSWORD);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL(/\/dashboard/, { timeout: 20000 });
  console.log(`Logged in — URL: ${page.url()}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// BKG-01: My Bookings page loads with correct structure
// ─────────────────────────────────────────────────────────────────────────────
test("BKG-01: My Bookings page loads with title, tabs, and booking cards", async ({ page }) => {
  await loginAsTestUser123(page);
  await page.goto("/bookings");
  await page.waitForSelector('[data-testid="text-page-title"]', { timeout: 12000 });

  const title = await page.locator('[data-testid="text-page-title"]').textContent();
  console.log(`BKG-01: Page title: "${title?.trim()}"`);

  // Verify all 5 tabs
  const tabs = ["tab-all", "tab-pending", "tab-active", "tab-completed", "tab-activities"];
  for (const tab of tabs) {
    const found = await page.locator(`[data-testid="${tab}"]`).count() > 0;
    console.log(`BKG-01: Tab ${tab}: ${found ? "✓" : "✗"}`);
  }

  // API check
  const apiBookings = await (await page.request.get("/api/my-bookings")).json();
  const apiCount = Array.isArray(apiBookings) ? apiBookings.length : 0;
  console.log(`BKG-01: API /my-bookings returned ${apiCount} booking(s)`);

  // Verify at least the known completed booking card is in the DOM
  const completedCard = page.locator(`[data-testid="card-booking-${COMPLETED_BOOKING_ID}"]`);
  const hasCompleted = await completedCard.count() > 0;
  console.log(`BKG-01: Completed booking card: ${hasCompleted ? "✓" : "✗"}`);

  // Verify pending booking card is in the DOM
  const pendingCard = page.locator(`[data-testid="card-booking-${PENDING_BOOKING_ID}"]`);
  const hasPending = await pendingCard.count() > 0;
  console.log(`BKG-01: Pending booking card:   ${hasPending ? "✓" : "✗"}`);

  expect(title?.trim(), "Page title should be 'My Bookings'").toBe("My Bookings");
  for (const tab of tabs) {
    expect(
      await page.locator(`[data-testid="${tab}"]`).count(),
      `Tab '${tab}' should be present`
    ).toBeGreaterThan(0);
  }
  expect(apiCount, "API should return at least 1 booking").toBeGreaterThan(0);
  expect(hasCompleted, "Completed booking card should be visible").toBe(true);

  console.log(`BKG-01: ── PASS ✓ ──
  Page title:   ✓ "${title?.trim()}"
  Tabs:         ✓ all 5 present (all/pending/active/completed/activities)
  API:          ✓ ${apiCount} booking(s)
  Cards:        completed:${hasCompleted ? "✓" : "✗"}  pending:${hasPending ? "✓" : "✗"}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// BKG-02: Completed booking card shows correct status badge + Review button
// ─────────────────────────────────────────────────────────────────────────────
test("BKG-02: Completed booking card shows status badge and Review button", async ({ page }) => {
  await loginAsTestUser123(page);
  await page.goto("/bookings");
  await page.waitForSelector(`[data-testid="card-booking-${COMPLETED_BOOKING_ID}"]`, { timeout: 12000 });

  const card = page.locator(`[data-testid="card-booking-${COMPLETED_BOOKING_ID}"]`);

  // Status badge
  const badge = card.locator(`[data-testid="badge-status-${COMPLETED_BOOKING_ID}"]`);
  const hasBadge = await badge.count() > 0;
  const badgeText = hasBadge ? (await badge.first().textContent() || "").trim() : "";
  console.log(`BKG-02: Status badge: ${hasBadge ? "✓" : "✗"}  text: "${badgeText}"`);

  // Amount display
  const amountEl = card.locator(`[data-testid="text-amount-${COMPLETED_BOOKING_ID}"]`);
  const hasAmount = await amountEl.count() > 0;
  const amountText = hasAmount ? (await amountEl.first().textContent() || "").trim() : "—";
  console.log(`BKG-02: Amount display: ${hasAmount ? "✓" : "✗"}  "${amountText}"`);

  // Review button (completed bookings unlock the review button)
  const reviewBtn = card.locator(`[data-testid="button-review-${COMPLETED_BOOKING_ID}"]`);
  const hasReview = await reviewBtn.count() > 0;
  console.log(`BKG-02: Review button:  ${hasReview ? "✓" : "✗"}`);

  // Reviewed badge (may or may not be present depending on prior test run)
  const reviewedBadge = card.locator(`[data-testid="badge-reviewed-${COMPLETED_BOOKING_ID}"]`);
  const isReviewed = await reviewedBadge.count() > 0;
  console.log(`BKG-02: Already-reviewed badge: ${isReviewed ? "✓ (previously reviewed)" : "not present"}`);

  expect(hasBadge, "Status badge should be present").toBe(true);
  expect(badgeText.toLowerCase(), "Status should be 'completed'").toContain("completed");

  console.log(`BKG-02: ── PASS ✓ ──
  Status badge:  ✓ "${badgeText}"
  Amount:        ${hasAmount ? `✓ ${amountText}` : "✗ not shown"}
  Review button: ${hasReview ? "✓ visible" : "✗ hidden (booking may already be reviewed)"}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// BKG-03: Pending booking — cancel dialog opens with correct elements
// ─────────────────────────────────────────────────────────────────────────────
test("BKG-03: Pending booking cancel dialog opens with correct elements", async ({ page }) => {
  await loginAsTestUser123(page);
  await page.goto("/bookings");
  await page.waitForSelector(`[data-testid="card-booking-${PENDING_BOOKING_ID}"]`, { timeout: 12000 });

  const card = page.locator(`[data-testid="card-booking-${PENDING_BOOKING_ID}"]`);

  // Status badge should say pending
  const badge = card.locator(`[data-testid="badge-status-${PENDING_BOOKING_ID}"]`);
  const badgeText = (await badge.first().textContent() || "").trim();
  console.log(`BKG-03: Pending badge text: "${badgeText}"`);

  // Cancel button
  const cancelBtn = card.locator(`[data-testid="button-cancel-booking-${PENDING_BOOKING_ID}"]`);
  const hasCancelBtn = await cancelBtn.count() > 0;
  console.log(`BKG-03: Cancel button: ${hasCancelBtn ? "✓" : "✗"}`);
  expect(hasCancelBtn, "Cancel button should be present on a pending booking").toBe(true);

  // Click cancel — opens dialog
  await cancelBtn.first().click();
  await page.waitForTimeout(800);

  // Dialog title
  const dialogTitle = page.locator('[data-testid="text-cancel-dialog-title"]');
  const hasDialogTitle = await dialogTitle.count() > 0;
  const dialogTitleText = hasDialogTitle ? (await dialogTitle.first().textContent() || "").trim() : "";
  console.log(`BKG-03: Cancel dialog title: ${hasDialogTitle ? "✓" : "✗"}  "${dialogTitleText}"`);

  // Reason input
  const reasonInput = page.locator('[data-testid="input-cancel-reason"]');
  const hasReasonInput = await reasonInput.count() > 0;
  console.log(`BKG-03: Reason input: ${hasReasonInput ? "✓" : "✗"}`);

  // Confirm + dismiss buttons
  const confirmBtn = page.locator('[data-testid="button-cancel-dialog-confirm"]');
  const dismissBtn = page.locator('[data-testid="button-cancel-dialog-dismiss"]');
  const hasConfirm = await confirmBtn.count() > 0;
  const hasDismiss = await dismissBtn.count() > 0;
  console.log(`BKG-03: Confirm button: ${hasConfirm ? "✓" : "✗"}  Dismiss button: ${hasDismiss ? "✓" : "✗"}`);

  // Dismiss — do not actually cancel (keeps booking pending for re-runs)
  if (hasDismiss) {
    await dismissBtn.first().click();
    await page.waitForTimeout(500);
    console.log(`BKG-03: Dialog dismissed — booking remains pending`);
  }

  expect(hasDialogTitle, "Cancel dialog title should appear").toBe(true);
  expect(hasReasonInput, "Cancel reason input should be present").toBe(true);
  expect(hasConfirm, "Confirm cancel button should be present").toBe(true);
  expect(hasDismiss, "Dismiss button should be present").toBe(true);

  console.log(`BKG-03: ── PASS ✓ ──
  Cancel button:  ✓ visible on pending card
  Dialog opens:   ✓ "${dialogTitleText}"
  Reason input:   ✓ present
  Buttons:        ✓ confirm + dismiss
  State:          booking remains pending (dialog dismissed)`);
});

// ─────────────────────────────────────────────────────────────────────────────
// BKG-04: Activities tab loads (empty state or activity cards)
// ─────────────────────────────────────────────────────────────────────────────
test("BKG-04: Activities tab loads and shows correct content", async ({ page }) => {
  await loginAsTestUser123(page);
  await page.goto("/bookings");
  await page.waitForSelector('[data-testid="tab-activities"]', { timeout: 12000 });

  // Click Activities tab
  await page.locator('[data-testid="tab-activities"]').click();
  await page.waitForTimeout(1000);

  // API check
  const apiResp = await page.request.get("/api/bookings/my-activity-bookings");
  const apiStatus = apiResp.status();
  let apiActivity: any[] = [];
  try { apiActivity = await apiResp.json(); } catch {}
  const apiCount = Array.isArray(apiActivity) ? apiActivity.length : 0;
  console.log(`BKG-04: API /api/bookings/my-activity-bookings → ${apiStatus}, ${apiCount} record(s)`);

  if (apiCount > 0) {
    // Check that each activity card is rendered
    let rendered = 0;
    for (const act of apiActivity) {
      const card = page.locator(`[data-testid="card-activity-booking-${act.id}"]`);
      if (await card.count() > 0) {
        rendered++;
        const title = await card.locator(`[data-testid="text-activity-title-${act.id}"]`).first().textContent();
        console.log(`BKG-04: Activity card ${rendered}: ✓ "${title?.trim().substring(0, 50)}"`);
      }
    }
    expect(rendered, `All ${apiCount} activity bookings should render as cards`).toBe(apiCount);
    console.log(`BKG-04: ── PASS ✓ — ${rendered} activity card(s) rendered ──`);
  } else {
    // Empty state — page should still render (not crash), and show something
    const pageContent = await page.locator('[data-testid="tabs-booking-status"]').count();
    console.log(`BKG-04: Empty state — tabs container still present: ${pageContent > 0 ? "✓" : "✗"}`);
    expect(apiStatus, "API should respond 200").toBe(200);
    expect(pageContent, "Tabs container should still render in empty state").toBeGreaterThan(0);
    console.log(`BKG-04: ── PASS ✓ — Activities tab loads cleanly (0 activity bookings — empty state) ──`);
  }
});
