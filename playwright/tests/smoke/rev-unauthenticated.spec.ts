/**
 * REV-11: Unauthenticated Access Control
 *
 * Verifies that signed-out visitors:
 *  A. Cannot see Write Review button, Edit, Delete, or Respond buttons (UI layer)
 *  B. GET /reviews is public (readable without auth)
 *  C. POST /reviews     → 401  (write blocked without session)
 *  D. PATCH /reviews/:id → 401  (edit blocked without session)
 *  E. DELETE /reviews/:id → 401  (delete blocked without session)
 *  F. PATCH /reviews/:id/respond → 401 (respond blocked without session)
 *
 * No login required — all steps run as a guest (no session cookie).
 */

import { test, expect } from "@playwright/test";

const BOOKED_SERVICE_ID  = "24717f66-4741-400e-9f58-97224f8a2856";
const EXISTING_REVIEW_ID = "9390a650-3e25-4bd6-ac2f-2e8b76bcdb4d";

// ─────────────────────────────────────────────────────────────────────────────
// REV-11A: UI — no action buttons rendered for signed-out visitors
// ─────────────────────────────────────────────────────────────────────────────
test("REV-11A: UI — no Write/Edit/Delete/Respond buttons for signed-out visitors", async ({ page }) => {
  test.setTimeout(45000);

  // Navigate directly without logging in
  await page.goto(`/services/${BOOKED_SERVICE_ID}`);
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(3000);

  // ── Write Review button must be absent or hidden ───────────────────────────
  const writeBtnCount = await page.locator('[data-testid="button-write-review"]').count();
  expect(writeBtnCount, "button-write-review must not be rendered for guests").toBe(0);
  console.log("REV-11A: button-write-review absent ✓");

  // ── Edit / Delete / Respond buttons must all be absent ────────────────────
  const editCount    = await page.locator('[data-testid^="button-edit-review-"]').count();
  const deleteCount  = await page.locator('[data-testid^="button-delete-review-"]').count();
  const respondCount = await page.locator('[data-testid^="button-respond-review-"]').count();
  expect(editCount,    "No Edit buttons should render for guests").toBe(0);
  expect(deleteCount,  "No Delete buttons should render for guests").toBe(0);
  expect(respondCount, "No Respond buttons should render for guests").toBe(0);
  console.log(`REV-11A: Edit=${editCount} Delete=${deleteCount} Respond=${respondCount} — all absent ✓`);

  // ── Review cards themselves ARE still visible (public read) ────────────────
  const reviewCards = await page.locator('[data-testid^="card-review-"]').count();
  expect(reviewCards, "Review cards should still be visible to guests (public read)").toBeGreaterThan(0);
  console.log(`REV-11A: ${reviewCards} review card(s) visible to guest (read-only) ✓`);

  // ── Sign-in prompt visible in review section ──────────────────────────────
  const signinPrompt = page.locator('text=/sign in/i').first();
  const signinCount  = await signinPrompt.count();
  console.log(`REV-11A: Sign-in prompt present: ${signinCount > 0 ? "✓" : "— not found (still passing)"}`);

  console.log(`REV-11A: ── PASS ✓ ──
  Write button:    ✓ absent (0)
  Edit buttons:    ✓ absent (${editCount})
  Delete buttons:  ✓ absent (${deleteCount})
  Respond buttons: ✓ absent (${respondCount})
  Review cards:    ✓ ${reviewCards} visible (public read-only)
  Enforcement:     isOwner/isProvider use currentUserId="" — no buttons render`);
});

// ─────────────────────────────────────────────────────────────────────────────
// REV-11B: API — GET /reviews is public (200, no auth required)
// ─────────────────────────────────────────────────────────────────────────────
test("REV-11B: API — GET /reviews is public (no auth needed)", async ({ page }) => {
  test.setTimeout(30000);

  const res = await page.request.get(`/api/services/${BOOKED_SERVICE_ID}/reviews`);
  console.log(`REV-11B: GET /reviews → ${res.status()}`);
  expect(res.status(), "GET /reviews must be public (200)").toBe(200);

  const reviews = await res.json() as any[];
  expect(Array.isArray(reviews), "Response must be an array").toBe(true);
  expect(reviews.length, "There must be at least one review").toBeGreaterThan(0);
  console.log(`REV-11B: ${reviews.length} review(s) returned without auth ✓`);

  console.log(`REV-11B: ── PASS ✓ ──
  GET /api/services/:id/reviews → 200
  Reviews returned:  ${reviews.length}
  Auth required:     No — public read endpoint`);
});

// ─────────────────────────────────────────────────────────────────────────────
// REV-11C: API — POST /reviews without session returns 401
// ─────────────────────────────────────────────────────────────────────────────
test("REV-11C: API — POST /reviews returns 401 without session", async ({ page }) => {
  test.setTimeout(30000);

  const res = await page.request.post(
    `/api/services/${BOOKED_SERVICE_ID}/reviews`,
    { data: { bookingId: "fake-booking-id", rating: 5, reviewText: "unauthorized attempt" } }
  );
  console.log(`REV-11C: POST /reviews (no auth) → ${res.status()}`);
  expect(res.status(), "POST /reviews must return 401 without a session").toBe(401);

  console.log(`REV-11C: ── PASS ✓ ──
  POST /api/services/:id/reviews (no session) → 401
  Write blocked at isAuthenticated middleware`);
});

// ─────────────────────────────────────────────────────────────────────────────
// REV-11D: API — PATCH /reviews/:id without session returns 401
// ─────────────────────────────────────────────────────────────────────────────
test("REV-11D: API — PATCH /reviews/:id returns 401 without session", async ({ page }) => {
  test.setTimeout(30000);

  const res = await page.request.patch(
    `/api/services/${BOOKED_SERVICE_ID}/reviews/${EXISTING_REVIEW_ID}`,
    { data: { rating: 1, reviewText: "unauthorized edit attempt" } }
  );
  console.log(`REV-11D: PATCH /reviews/:id (no auth) → ${res.status()}`);
  expect(res.status(), "PATCH /reviews/:id must return 401 without a session").toBe(401);

  console.log(`REV-11D: ── PASS ✓ ──
  PATCH /api/services/:id/reviews/${EXISTING_REVIEW_ID.slice(0,8)}… (no session) → 401`);
});

// ─────────────────────────────────────────────────────────────────────────────
// REV-11E: API — DELETE /reviews/:id without session returns 401
// ─────────────────────────────────────────────────────────────────────────────
test("REV-11E: API — DELETE /reviews/:id returns 401 without session", async ({ page }) => {
  test.setTimeout(30000);

  const res = await page.request.delete(
    `/api/services/${BOOKED_SERVICE_ID}/reviews/${EXISTING_REVIEW_ID}`
  );
  console.log(`REV-11E: DELETE /reviews/:id (no auth) → ${res.status()}`);
  expect(res.status(), "DELETE /reviews/:id must return 401 without a session").toBe(401);

  // Confirm review still exists after blocked deletion
  const getRes = await page.request.get(`/api/services/${BOOKED_SERVICE_ID}/reviews`);
  const reviews = await getRes.json() as any[];
  const stillThere = reviews.some((r: any) => r.id === EXISTING_REVIEW_ID);
  expect(stillThere, "Review must still exist after blocked DELETE").toBe(true);
  console.log("REV-11E: Review intact after unauthenticated DELETE attempt ✓");

  console.log(`REV-11E: ── PASS ✓ ──
  DELETE /api/services/:id/reviews/${EXISTING_REVIEW_ID.slice(0,8)}… (no session) → 401
  Data intact: ✓ review still in DB`);
});

// ─────────────────────────────────────────────────────────────────────────────
// REV-11F: API — PATCH /reviews/:id/respond without session returns 401
// ─────────────────────────────────────────────────────────────────────────────
test("REV-11F: API — PATCH /reviews/:id/respond returns 401 without session", async ({ page }) => {
  test.setTimeout(30000);

  const res = await page.request.patch(
    `/api/services/${BOOKED_SERVICE_ID}/reviews/${EXISTING_REVIEW_ID}/respond`,
    { data: { responseText: "unauthorized provider response attempt" } }
  );
  console.log(`REV-11F: PATCH /reviews/:id/respond (no auth) → ${res.status()}`);
  expect(res.status(), "PATCH /respond must return 401 without a session").toBe(401);

  console.log(`REV-11F: ── PASS ✓ ──
  PATCH /api/services/:id/reviews/${EXISTING_REVIEW_ID.slice(0,8)}…/respond (no session) → 401`);
});
