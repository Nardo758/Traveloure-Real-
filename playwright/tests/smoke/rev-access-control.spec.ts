/**
 * REV-10: Review Access Control — non-owner cannot edit/delete; API enforces 403
 *
 * Verifies that:
 *  1. Edit/Delete buttons are ONLY shown on a user's OWN review (UI layer)
 *  2. Direct PATCH (edit) on another user's review → 403 (API layer)
 *  3. Direct DELETE on another user's review → 403 (API layer)
 *  4. Direct PATCH /respond when the caller is NOT the service provider → 403 (API layer)
 *  5. Logged in as reviewer2: can see buttons on own review but NOT on testuser123's
 *
 * Test accounts:
 *   testuser123@mailinator.com / Test@1234
 *     — owns review 9390a650-3e25-4bd6-ac2f-2e8b76bcdb4d (travelerId: 3700ebe2-…)
 *   reviewer2@mailinator.com / Review@1234
 *     — has no review after reset (reviewer2 review is cleaned up by REV-08)
 *
 * Seed reviews NOT owned by testuser123 (safe targets for 403 checks):
 *   a1b2c3d4-e5f6-7890-ab12-seed00000001 (travelerId: 49f1942a-…)
 *   a1b2c3d4-e5f6-7890-ab12-seed00000005 (travelerId: test-user-123)
 */

import { test, expect } from "@playwright/test";

const TESTUSER_EMAIL    = "testuser123@mailinator.com";
const TESTUSER_PASSWORD = "Test@1234";
const REVIEWER2_EMAIL   = "reviewer2@mailinator.com";
const REVIEWER2_PASSWORD = "Review@1234";

const BOOKED_SERVICE_ID = "24717f66-4741-400e-9f58-97224f8a2856";
const TESTUSER_REVIEW_ID = "9390a650-3e25-4bd6-ac2f-2e8b76bcdb4d";

// A seed review that belongs to a completely different user — safe for 403 tests
const OTHER_REVIEW_ID   = "a1b2c3d4-e5f6-7890-ab12-seed00000001";

// ─────────────────────────────────────────────────────────────────────────────
// Helper
// ─────────────────────────────────────────────────────────────────────────────
async function loginAs(page: any, email: string, password: string, urlPattern = /\/dashboard/) {
  await page.goto("/login");
  await page.waitForLoadState("domcontentloaded");
  await expect(page.locator('input[type="email"]').first()).toBeVisible({ timeout: 10000 });
  await page.locator('input[type="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL(urlPattern, { timeout: 20000 });
}

// ─────────────────────────────────────────────────────────────────────────────
// REV-10A: UI — Edit/Delete buttons visible only on own review
// ─────────────────────────────────────────────────────────────────────────────
test("REV-10A: UI — Edit/Delete buttons only on own review (testuser123)", async ({ page }) => {
  test.setTimeout(60000);
  await loginAs(page, TESTUSER_EMAIL, TESTUSER_PASSWORD);
  console.log("REV-10A: Logged in as testuser123 ✓");

  await page.goto(`/services/${BOOKED_SERVICE_ID}`);
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(3000);

  // ── Collect all Edit buttons in review cards ───────────────────────────────
  const editBtns = await page.locator('[data-testid^="button-edit-review-"]').all();
  const editIds  = await Promise.all(editBtns.map((b: any) => b.getAttribute("data-testid")));
  console.log(`REV-10A: Edit buttons found: [${editIds.join(", ")}]`);
  expect(editBtns.length, "Exactly one Edit button should be visible (own review only)").toBe(1);
  expect(editIds[0], "Edit button must belong to testuser123's review").toBe(`button-edit-review-${TESTUSER_REVIEW_ID}`);

  // ── Collect all Delete buttons in review cards ─────────────────────────────
  const deleteBtns = await page.locator('[data-testid^="button-delete-review-"]').all();
  const deleteIds  = await Promise.all(deleteBtns.map((b: any) => b.getAttribute("data-testid")));
  console.log(`REV-10A: Delete buttons found: [${deleteIds.join(", ")}]`);
  expect(deleteBtns.length, "Exactly one Delete button should be visible (own review only)").toBe(1);
  expect(deleteIds[0], "Delete button must belong to testuser123's review").toBe(`button-delete-review-${TESTUSER_REVIEW_ID}`);

  // ── Verify no Edit/Delete on specific seed reviews ─────────────────────────
  const otherEdit   = await page.locator(`[data-testid="button-edit-review-${OTHER_REVIEW_ID}"]`).count();
  const otherDelete = await page.locator(`[data-testid="button-delete-review-${OTHER_REVIEW_ID}"]`).count();
  expect(otherEdit,   "Edit button must NOT appear on another user's review").toBe(0);
  expect(otherDelete, "Delete button must NOT appear on another user's review").toBe(0);
  console.log("REV-10A: No Edit/Delete on other users' reviews ✓");

  console.log(`REV-10A: ── PASS ✓ ──
  Edit buttons:   1 (own review ${TESTUSER_REVIEW_ID.slice(0,8)}… only)
  Delete buttons: 1 (own review ${TESTUSER_REVIEW_ID.slice(0,8)}… only)
  Other reviews:  ✓ no Edit/Delete buttons rendered
  Enforcement:    UI-gated — isOwner check: review.travelerId === currentUserId`);
});

// ─────────────────────────────────────────────────────────────────────────────
// REV-10B: API — PATCH another user's review returns 403
// ─────────────────────────────────────────────────────────────────────────────
test("REV-10B: API — PATCH another user's review returns 403", async ({ page }) => {
  test.setTimeout(45000);
  await loginAs(page, TESTUSER_EMAIL, TESTUSER_PASSWORD);
  console.log("REV-10B: Logged in as testuser123 ✓");

  const res = await page.request.patch(
    `/api/services/${BOOKED_SERVICE_ID}/reviews/${OTHER_REVIEW_ID}`,
    { data: { rating: 1, reviewText: "should be blocked" } }
  );
  console.log(`REV-10B: PATCH other user's review → ${res.status()}`);
  expect(res.status(), "PATCH on another user's review must return 403").toBe(403);

  const body = await res.json() as any;
  console.log(`REV-10B: Error message: "${body?.message}"`);
  expect(body?.message ?? "").toMatch(/only.*edit|not.*authorized|forbidden|own/i);

  console.log(`REV-10B: ── PASS ✓ ──
  Attempted:  PATCH /reviews/${OTHER_REVIEW_ID.slice(0,8)}… (owned by different user)
  Caller:     testuser123 (${TESTUSER_EMAIL})
  Result:     ✓ 403 Forbidden — "${body?.message}"`);
});

// ─────────────────────────────────────────────────────────────────────────────
// REV-10C: API — DELETE another user's review returns 403
// ─────────────────────────────────────────────────────────────────────────────
test("REV-10C: API — DELETE another user's review returns 403", async ({ page }) => {
  test.setTimeout(45000);
  await loginAs(page, TESTUSER_EMAIL, TESTUSER_PASSWORD);
  console.log("REV-10C: Logged in as testuser123 ✓");

  const res = await page.request.delete(
    `/api/services/${BOOKED_SERVICE_ID}/reviews/${OTHER_REVIEW_ID}`
  );
  console.log(`REV-10C: DELETE other user's review → ${res.status()}`);
  expect(res.status(), "DELETE on another user's review must return 403").toBe(403);

  const body = await res.json() as any;
  console.log(`REV-10C: Error message: "${body?.message}"`);
  expect(body?.message ?? "").toMatch(/only.*delete|not.*authorized|forbidden|own/i);

  // Verify the review still exists after failed deletion
  const reviewsRes = await page.request.get(`/api/services/${BOOKED_SERVICE_ID}/reviews`);
  const reviews    = await reviewsRes.json() as any[];
  const stillThere = reviews.some((r: any) => r.id === OTHER_REVIEW_ID);
  expect(stillThere, "Target review must still exist after 403 rejection").toBe(true);
  console.log("REV-10C: Target review still present after failed DELETE ✓");

  console.log(`REV-10C: ── PASS ✓ ──
  Attempted:    DELETE /reviews/${OTHER_REVIEW_ID.slice(0,8)}… (owned by different user)
  Caller:       testuser123 (${TESTUSER_EMAIL})
  Result:       ✓ 403 Forbidden — "${body?.message}"
  Data intact:  ✓ review still in DB`);
});

// ─────────────────────────────────────────────────────────────────────────────
// REV-10D: API — PATCH /respond when caller is NOT the provider returns 403
// ─────────────────────────────────────────────────────────────────────────────
test("REV-10D: API — PATCH /respond returns 403 for non-provider", async ({ page }) => {
  test.setTimeout(45000);
  await loginAs(page, TESTUSER_EMAIL, TESTUSER_PASSWORD);
  console.log("REV-10D: Logged in as testuser123 (traveler, not the service provider) ✓");

  const res = await page.request.patch(
    `/api/services/${BOOKED_SERVICE_ID}/reviews/${TESTUSER_REVIEW_ID}/respond`,
    { data: { responseText: "should be blocked — caller is not the provider" } }
  );
  console.log(`REV-10D: PATCH /respond as non-provider → ${res.status()}`);
  expect(res.status(), "PATCH /respond must return 403 when caller is not the service provider").toBe(403);

  const body = await res.json() as any;
  console.log(`REV-10D: Error message: "${body?.message}"`);
  expect(body?.message ?? "").toMatch(/provider|authorized|forbidden|only/i);

  console.log(`REV-10D: ── PASS ✓ ──
  Attempted:  PATCH /reviews/${TESTUSER_REVIEW_ID.slice(0,8)}…/respond
  Caller:     testuser123 (traveler — travelerId matches review but not providerId)
  Result:     ✓ 403 Forbidden — "${body?.message}"`);
});

// ─────────────────────────────────────────────────────────────────────────────
// REV-10E: UI — reviewer2 sees buttons only on own review, not on testuser123's
// ─────────────────────────────────────────────────────────────────────────────
test("REV-10E: UI — reviewer2 sees buttons only on own review, not others'", async ({ page }) => {
  test.setTimeout(90000);

  // Reset reviewer2's review so we can create a fresh one
  await page.request.delete("/api/dev/reset-test-review");

  // Login as reviewer2 and submit a fresh review (needed for there to be a review to delete)
  await loginAs(page, REVIEWER2_EMAIL, REVIEWER2_PASSWORD);
  console.log("REV-10E: Logged in as reviewer2 ✓");

  // Submit a review via UI so reviewer2 has their own review card
  await page.goto(`/services/${BOOKED_SERVICE_ID}`);
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(3000);

  const writeBtn = page.locator('[data-testid="button-write-review"]');
  const writeBtnVisible = await writeBtn.count() > 0 && await writeBtn.isVisible();
  if (writeBtnVisible) {
    await writeBtn.click();
    await page.waitForTimeout(300);
    const star4 = page.locator('[data-testid="star-input-4"]').first();
    if (await star4.isVisible()) {
      await star4.click();
      const submitBtn = page.locator('[data-testid="button-submit-review"]');
      await submitBtn.click();
      await page.waitForTimeout(2000);
      console.log("REV-10E: Reviewer2 submitted a 4-star review ✓");
    }
  } else {
    console.log("REV-10E: Reviewer2 already has a review (write button hidden) — proceeding");
  }

  // Reload to see the review list with both reviews
  await page.reload();
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(2500);

  // ── Collect all Edit/Delete buttons ─────────────────────────────────────────
  const editBtns  = await page.locator('[data-testid^="button-edit-review-"]').all();
  const deleteBtns = await page.locator('[data-testid^="button-delete-review-"]').all();
  const editIds   = await Promise.all(editBtns.map((b: any) => b.getAttribute("data-testid")));
  const deleteIds = await Promise.all(deleteBtns.map((b: any) => b.getAttribute("data-testid")));
  console.log(`REV-10E: Edit buttons:   [${editIds.join(", ")}]`);
  console.log(`REV-10E: Delete buttons: [${deleteIds.join(", ")}]`);

  // reviewer2 must see exactly 1 Edit and 1 Delete (their own review)
  expect(editBtns.length, "Reviewer2 should see exactly 1 Edit button (own review)").toBe(1);
  expect(deleteBtns.length, "Reviewer2 should see exactly 1 Delete button (own review)").toBe(1);

  // That button must NOT be on testuser123's review
  const hasEditOnTestuser  = editIds.some((id: any) => id?.includes(TESTUSER_REVIEW_ID));
  const hasDeleteOnTestuser = deleteIds.some((id: any) => id?.includes(TESTUSER_REVIEW_ID));
  expect(hasEditOnTestuser,   "Reviewer2 must NOT see Edit on testuser123's review").toBe(false);
  expect(hasDeleteOnTestuser, "Reviewer2 must NOT see Delete on testuser123's review").toBe(false);
  console.log("REV-10E: No Edit/Delete on testuser123's review ✓");

  // And testuser123's review card must be present (visible) without control buttons
  const testuser123Card = page.locator(`[data-testid="card-review-${TESTUSER_REVIEW_ID}"]`);
  await expect(testuser123Card, "testuser123's review card must be visible to reviewer2").toBeVisible();
  console.log("REV-10E: testuser123's review card visible (read-only) ✓");

  console.log(`REV-10E: ── PASS ✓ ──
  Reviewer2 Edit buttons:   ${editBtns.length} (own review only — not on ${TESTUSER_REVIEW_ID.slice(0,8)}…)
  Reviewer2 Delete buttons: ${deleteBtns.length} (own review only — not on ${TESTUSER_REVIEW_ID.slice(0,8)}…)
  testuser123 card visible: ✓ readable but no control buttons
  Cross-review protection:  ✓ isOwner check prevents button rendering`);
});
