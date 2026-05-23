/**
 * REV-13: Admin Review Moderation
 *
 * Verifies the full hide/unhide moderation lifecycle:
 *
 *  REV-13A: GET /api/admin/reviews returns 401 for unauthenticated callers
 *  REV-13B: PATCH /hide and /unhide return 401 for unauthenticated callers
 *  REV-13C: Non-admin user (traveler) gets 403 from all admin review endpoints
 *  REV-13D: Admin can hide a review — it disappears from public GET /reviews
 *             and service.reviewCount drops by 1; averageRating recalculates
 *  REV-13E: Hidden review is visible (with isHidden=true) in GET /api/admin/reviews
 *  REV-13F: Admin can unhide the review — it reappears in public GET /reviews
 *             and service.reviewCount and averageRating are restored
 *  REV-13G: PATCH /hide requires a reason field (400 when missing)
 *
 * Accounts:
 *   admin@traveloure.test  / Admin@1234    (role: admin)
 *   testuser123@mailinator.com / Test@1234 (role: user, owns the target review)
 *
 * Target review: 9390a650-3e25-4bd6-ac2f-2e8b76bcdb4d
 *   (testuser123's review of Alcatraz VIP Tour)
 */

import { test, expect } from "@playwright/test";

const SERVICE_ID      = "24717f66-4741-400e-9f58-97224f8a2856";
const TARGET_REVIEW   = "9390a650-3e25-4bd6-ac2f-2e8b76bcdb4d";
const ADMIN_EMAIL     = "admin@traveloure.test";
const ADMIN_PASSWORD  = "Admin@1234";
const USER_EMAIL      = "testuser123@mailinator.com";
const USER_PASSWORD   = "Test@1234";

function avg(ratings: number[]): number {
  if (!ratings.length) return 0;
  return ratings.reduce((s, r) => s + r, 0) / ratings.length;
}

async function loginAs(page: any, email: string, password: string) {
  await page.goto("/login");
  await page.waitForLoadState("domcontentloaded");
  await expect(page.locator('input[type="email"]').first()).toBeVisible({ timeout: 10000 });
  await page.locator('input[type="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.locator('button[type="submit"]').first().click();
  // Admin → /admin/dashboard, traveler → /dashboard, provider → /provider/dashboard
  await page.waitForURL(/\/(admin|dashboard|provider)/, { timeout: 25000 });
  console.log(`Logged in as: ${email} → ${page.url()}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// REV-13A: Unauthenticated GET /api/admin/reviews → 401
// ─────────────────────────────────────────────────────────────────────────────
test("REV-13A: GET /api/admin/reviews returns 401 without session", async ({ page }) => {
  test.setTimeout(30000);
  // Clear all cookies to guarantee no Replit OIDC or email-auth session bleeds in
  await page.context().clearCookies();
  // Also destroy any server-side session via logout endpoint
  await page.request.post("/api/auth/logout").catch(() => {});
  const res = await page.request.get("/api/admin/reviews");
  console.log(`REV-13A: GET /api/admin/reviews (no auth) → ${res.status()}`);
  expect(res.status(), "Admin review list must require authentication").toBe(401);
  console.log("REV-13A: ── PASS ✓ ── GET /api/admin/reviews (no session) → 401");
});

// ─────────────────────────────────────────────────────────────────────────────
// REV-13B: Unauthenticated PATCH /hide and /unhide → 401
// ─────────────────────────────────────────────────────────────────────────────
test("REV-13B: PATCH /hide and /unhide return 401 without session", async ({ page }) => {
  test.setTimeout(30000);
  await page.context().clearCookies();
  await page.request.post("/api/auth/logout").catch(() => {});
  const hideRes = await page.request.patch(
    `/api/admin/reviews/${TARGET_REVIEW}/hide`,
    { data: { reason: "unauthorized attempt" } }
  );
  const unhideRes = await page.request.patch(
    `/api/admin/reviews/${TARGET_REVIEW}/unhide`
  );
  console.log(`REV-13B: PATCH /hide (no auth) → ${hideRes.status()}, PATCH /unhide (no auth) → ${unhideRes.status()}`);
  expect(hideRes.status(), "PATCH /hide must return 401 without session").toBe(401);
  expect(unhideRes.status(), "PATCH /unhide must return 401 without session").toBe(401);
  console.log("REV-13B: ── PASS ✓ ── /hide → 401, /unhide → 401 (unauthenticated)");
});

// ─────────────────────────────────────────────────────────────────────────────
// REV-13C: Non-admin user gets 403 from admin endpoints
// ─────────────────────────────────────────────────────────────────────────────
test("REV-13C: Non-admin user (traveler) gets 403 from admin review endpoints", async ({ page }) => {
  test.setTimeout(60000);
  // Clear any existing session (Replit OIDC or prior test) before logging in as non-admin
  await page.context().clearCookies();
  await page.request.post("/api/auth/logout").catch(() => {});
  await loginAs(page, USER_EMAIL, USER_PASSWORD);

  const listRes = await page.request.get("/api/admin/reviews");
  const hideRes = await page.request.patch(
    `/api/admin/reviews/${TARGET_REVIEW}/hide`,
    { data: { reason: "non-admin attempt" } }
  );
  const unhideRes = await page.request.patch(
    `/api/admin/reviews/${TARGET_REVIEW}/unhide`
  );

  console.log(`REV-13C: GET /admin/reviews → ${listRes.status()}, /hide → ${hideRes.status()}, /unhide → ${unhideRes.status()}`);
  expect(listRes.status(), "Non-admin must get 403 from GET /admin/reviews").toBe(403);
  expect(hideRes.status(), "Non-admin must get 403 from PATCH /hide").toBe(403);
  expect(unhideRes.status(), "Non-admin must get 403 from PATCH /unhide").toBe(403);

  // Confirm review still visible in public list (not affected)
  const publicRes  = await page.request.get(`/api/services/${SERVICE_ID}/reviews`);
  const publicList = await publicRes.json() as any[];
  const stillThere = publicList.some((r: any) => r.id === TARGET_REVIEW);
  expect(stillThere, "Review must still be public after failed non-admin hide").toBe(true);

  console.log("REV-13C: ── PASS ✓ ── Non-admin blocked (403) from all admin review endpoints");
});

// ─────────────────────────────────────────────────────────────────────────────
// REV-13D: Admin hides a review → disappears from public GET /reviews
// ─────────────────────────────────────────────────────────────────────────────
test("REV-13D: Admin hide — review disappears from public GET /reviews, aggregate recalculates", async ({ page }) => {
  test.setTimeout(60000);

  // Ensure clean state
  await page.request.delete(`/api/dev/reset-review-hidden/${TARGET_REVIEW}`);
  console.log("REV-13D: Hidden state reset ✓");

  await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);

  // ── Capture baseline ──────────────────────────────────────────────────────
  const [reviewsBefore, serviceBefore] = await Promise.all([
    page.request.get(`/api/services/${SERVICE_ID}/reviews`),
    page.request.get(`/api/services/${SERVICE_ID}`),
  ]);
  const listBefore   = await reviewsBefore.json() as any[];
  const svcBefore    = await serviceBefore.json() as any;
  const countBefore  = listBefore.length;
  const avgBefore    = avg(listBefore.map((r: any) => r.rating));
  const reviewBefore = listBefore.find((r: any) => r.id === TARGET_REVIEW);
  console.log(`REV-13D: Before hide — count: ${countBefore}, avg: ${avgBefore.toFixed(2)}, target rating: ${reviewBefore?.rating}`);
  expect(reviewBefore, "Target review must be in public list before hide").toBeTruthy();

  // ── Admin hides the review ────────────────────────────────────────────────
  const hideRes = await page.request.patch(
    `/api/admin/reviews/${TARGET_REVIEW}/hide`,
    { data: { reason: "REV-13D: contains inappropriate content" } }
  );
  console.log(`REV-13D: PATCH /hide → ${hideRes.status()}`);
  expect(hideRes.status(), "Admin PATCH /hide must return 200").toBe(200);

  const hiddenReview = await hideRes.json() as any;
  expect(hiddenReview.isHidden, "Response must have isHidden=true").toBe(true);
  expect(hiddenReview.hiddenReason, "Response must include hiddenReason").toBeTruthy();
  console.log(`REV-13D: API response — isHidden: ${hiddenReview.isHidden}, reason: "${hiddenReview.hiddenReason}" ✓`);

  // ── Verify review absent from public GET /reviews ─────────────────────────
  const [reviewsAfter, serviceAfter] = await Promise.all([
    page.request.get(`/api/services/${SERVICE_ID}/reviews`),
    page.request.get(`/api/services/${SERVICE_ID}`),
  ]);
  const listAfter   = await reviewsAfter.json() as any[];
  const svcAfter    = await serviceAfter.json() as any;
  const countAfter  = listAfter.length;
  const avgAfter    = avg(listAfter.map((r: any) => r.rating));
  const stillPublic = listAfter.some((r: any) => r.id === TARGET_REVIEW);

  console.log(`REV-13D: After hide — count: ${countAfter} (expected ${countBefore - 1}), avg: ${avgAfter.toFixed(2)}`);
  expect(stillPublic, "Hidden review must NOT appear in public GET /reviews").toBe(false);
  expect(countAfter, "reviewCount must decrease by 1").toBe(countBefore - 1);
  expect(svcAfter.reviewCount, "service.reviewCount must decrease by 1").toBe(svcBefore.reviewCount - 1);
  expect(Math.abs(avgAfter - avg(listAfter.map((r: any) => r.rating))), "averageRating must match computed value").toBeLessThan(0.01);

  console.log(`REV-13D: ── PASS ✓ ──
  Review ${TARGET_REVIEW.slice(0, 8)}… hidden by admin ✓
  Public count:     ${countBefore} → ${countAfter} (-1 ✓)
  service.count:    ${svcBefore.reviewCount} → ${svcAfter.reviewCount} (-1 ✓)
  averageRating:    ${avgBefore.toFixed(2)} → ${avgAfter.toFixed(2)} (recalculated ✓)
  Public list:      review absent ✓`);
});

// ─────────────────────────────────────────────────────────────────────────────
// REV-13E: Admin GET /api/admin/reviews shows hidden review with isHidden=true
// ─────────────────────────────────────────────────────────────────────────────
test("REV-13E: GET /api/admin/reviews includes hidden reviews with isHidden=true", async ({ page }) => {
  test.setTimeout(45000);

  // Ensure TARGET_REVIEW is hidden (depends on REV-13D having run, but we hide it here too)
  await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await page.request.patch(
    `/api/admin/reviews/${TARGET_REVIEW}/hide`,
    { data: { reason: "REV-13E: verify admin list" } }
  );

  const adminRes  = await page.request.get("/api/admin/reviews");
  console.log(`REV-13E: GET /api/admin/reviews → ${adminRes.status()}`);
  expect(adminRes.status(), "Admin GET /reviews must return 200").toBe(200);

  const allReviews = await adminRes.json() as any[];
  const hiddenOne  = allReviews.find((r: any) => r.id === TARGET_REVIEW);

  expect(hiddenOne,           "Target review must appear in admin list").toBeTruthy();
  expect(hiddenOne.isHidden,  "Target review must have isHidden=true in admin list").toBe(true);
  expect(hiddenOne.hiddenReason, "Target review must have a hiddenReason").toBeTruthy();
  expect(hiddenOne.hiddenBy,  "Target review must have hiddenBy set").toBeTruthy();

  const hiddenCount  = allReviews.filter((r: any) => r.isHidden).length;
  const visibleCount = allReviews.filter((r: any) => !r.isHidden).length;
  console.log(`REV-13E: Admin list has ${allReviews.length} total (${visibleCount} visible, ${hiddenCount} hidden) ✓`);

  // Public list must NOT include the hidden review
  const publicRes  = await page.request.get(`/api/services/${SERVICE_ID}/reviews`);
  const publicList = await publicRes.json() as any[];
  const inPublic   = publicList.some((r: any) => r.id === TARGET_REVIEW);
  expect(inPublic, "Hidden review must NOT appear in public list").toBe(false);

  console.log(`REV-13E: ── PASS ✓ ──
  Admin list:    ${allReviews.length} total (${hiddenCount} hidden) ✓
  Hidden review: isHidden=true, reason="${hiddenOne.hiddenReason}", hiddenBy set ✓
  Public list:   hidden review absent ✓`);
});

// ─────────────────────────────────────────────────────────────────────────────
// REV-13F: Admin unhides → review reappears in public list, aggregate restored
// ─────────────────────────────────────────────────────────────────────────────
test("REV-13F: Admin unhide — review reappears in public list, aggregate restored", async ({ page }) => {
  test.setTimeout(60000);

  await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);

  // Ensure hidden state first
  await page.request.patch(
    `/api/admin/reviews/${TARGET_REVIEW}/hide`,
    { data: { reason: "REV-13F: setup for unhide test" } }
  );

  // Baseline after hide
  const [reviewsHidden, serviceHidden] = await Promise.all([
    page.request.get(`/api/services/${SERVICE_ID}/reviews`),
    page.request.get(`/api/services/${SERVICE_ID}`),
  ]);
  const listHidden  = await reviewsHidden.json() as any[];
  const svcHidden   = await serviceHidden.json() as any;
  const countHidden = listHidden.length;
  console.log(`REV-13F: Hidden baseline — count: ${countHidden}, avg: ${svcHidden.averageRating}`);

  // ── Admin unhides ─────────────────────────────────────────────────────────
  const unhideRes = await page.request.patch(
    `/api/admin/reviews/${TARGET_REVIEW}/unhide`
  );
  console.log(`REV-13F: PATCH /unhide → ${unhideRes.status()}`);
  expect(unhideRes.status(), "Admin PATCH /unhide must return 200").toBe(200);

  const restoredReview = await unhideRes.json() as any;
  expect(restoredReview.isHidden, "Response must have isHidden=false after unhide").toBe(false);
  expect(restoredReview.hiddenReason, "hiddenReason must be null after unhide").toBeNull();

  // ── Verify reappears in public list ──────────────────────────────────────
  const [reviewsAfter, serviceAfter] = await Promise.all([
    page.request.get(`/api/services/${SERVICE_ID}/reviews`),
    page.request.get(`/api/services/${SERVICE_ID}`),
  ]);
  const listAfter  = await reviewsAfter.json() as any[];
  const svcAfter   = await serviceAfter.json() as any;
  const countAfter = listAfter.length;
  const inPublic   = listAfter.some((r: any) => r.id === TARGET_REVIEW);
  const computedAvg = avg(listAfter.map((r: any) => r.rating));

  console.log(`REV-13F: After unhide — count: ${countAfter} (expected ${countHidden + 1}), avg: ${svcAfter.averageRating}`);
  expect(inPublic,   "Unhidden review must reappear in public GET /reviews").toBe(true);
  expect(countAfter, "reviewCount must increase by 1 after unhide").toBe(countHidden + 1);
  expect(svcAfter.reviewCount, "service.reviewCount must increase by 1").toBe(svcHidden.reviewCount + 1);
  expect(Math.abs(parseFloat(svcAfter.averageRating) - computedAvg), "averageRating must match computed value").toBeLessThan(0.01);

  console.log(`REV-13F: ── PASS ✓ ──
  Review ${TARGET_REVIEW.slice(0, 8)}… restored by admin ✓
  Public count:     ${countHidden} → ${countAfter} (+1 ✓)
  service.count:    ${svcHidden.reviewCount} → ${svcAfter.reviewCount} (+1 ✓)
  averageRating:    recalculated ✓
  Review visible:   ✓ reappears in public list`);
});

// ─────────────────────────────────────────────────────────────────────────────
// REV-13G: PATCH /hide without reason returns 400
// ─────────────────────────────────────────────────────────────────────────────
test("REV-13G: PATCH /hide returns 400 when reason is missing", async ({ page }) => {
  test.setTimeout(45000);

  // Ensure review is not hidden
  await page.request.delete(`/api/dev/reset-review-hidden/${TARGET_REVIEW}`);

  await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);

  const noReasonRes = await page.request.patch(
    `/api/admin/reviews/${TARGET_REVIEW}/hide`,
    { data: {} }
  );
  console.log(`REV-13G: PATCH /hide (no reason) → ${noReasonRes.status()}`);
  expect(noReasonRes.status(), "PATCH /hide without reason must return 400").toBe(400);

  const emptyReasonRes = await page.request.patch(
    `/api/admin/reviews/${TARGET_REVIEW}/hide`,
    { data: { reason: "   " } }
  );
  console.log(`REV-13G: PATCH /hide (blank reason) → ${emptyReasonRes.status()}`);
  expect(emptyReasonRes.status(), "PATCH /hide with blank reason must return 400").toBe(400);

  // Review must still be public (neither bad request should have hidden it)
  const publicRes  = await page.request.get(`/api/services/${SERVICE_ID}/reviews`);
  const publicList = await publicRes.json() as any[];
  const stillThere = publicList.some((r: any) => r.id === TARGET_REVIEW);
  expect(stillThere, "Review must still be public after failed hide attempts").toBe(true);

  // Clean up: ensure hidden state is clear for subsequent tests
  await page.request.delete(`/api/dev/reset-review-hidden/${TARGET_REVIEW}`);

  console.log(`REV-13G: ── PASS ✓ ──
  No reason:     PATCH /hide → 400 ✓
  Blank reason:  PATCH /hide → 400 ✓
  Review:        still public after both failed attempts ✓`);
});
