/**
 * REV-12: Ratings Aggregate Consistency
 *
 * Verifies that service.averageRating and service.reviewCount
 * stay mathematically in sync with the actual review records.
 *
 *  REV-12A: Baseline — computed average from reviews matches service metadata
 *  REV-12B: Star rating edit — averageRating recalculates after PATCH (testuser123)
 *  REV-12C: Review create/delete — reviewCount and averageRating recalculate
 *             after POST then DELETE (reviewer2)
 *
 * Accounts:
 *   testuser123@mailinator.com / Test@1234
 *     review: 9390a650-… (current rating varies after REV-07 PATCH)
 *   reviewer2@mailinator.com / Review@1234
 *     booking: rev2-booking-completed-0000-0002
 */

import { test, expect } from "@playwright/test";

const SERVICE_ID         = "24717f66-4741-400e-9f58-97224f8a2856";
const TESTUSER_EMAIL     = "testuser123@mailinator.com";
const TESTUSER_PASSWORD  = "Test@1234";
const TESTUSER_REVIEW_ID = "9390a650-3e25-4bd6-ac2f-2e8b76bcdb4d";
const REVIEWER2_EMAIL    = "reviewer2@mailinator.com";
const REVIEWER2_PASSWORD = "Review@1234";
const REVIEWER2_BOOKING  = "rev2-booking-completed-0000-0002";

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
  await page.waitForURL(/\/dashboard|\/provider\/dashboard/, { timeout: 20000 });
}

// ─────────────────────────────────────────────────────────────────────────────
// REV-12A: Baseline consistency — no auth required
// ─────────────────────────────────────────────────────────────────────────────
test("REV-12A: Baseline — reviewCount and averageRating match actual review data", async ({ page }) => {
  test.setTimeout(30000);

  const [reviewsRes, serviceRes] = await Promise.all([
    page.request.get(`/api/services/${SERVICE_ID}/reviews`),
    page.request.get(`/api/services/${SERVICE_ID}`),
  ]);

  expect(reviewsRes.status(), "GET /reviews must return 200").toBe(200);
  expect(serviceRes.status(), "GET /service must return 200").toBe(200);

  const reviews      = await reviewsRes.json() as any[];
  const service      = await serviceRes.json() as any;

  const computedCount = reviews.length;
  const computedAvg   = avg(reviews.map((r: any) => r.rating));
  const metaCount     = service.reviewCount as number;
  const metaAvg       = parseFloat(service.averageRating as string) || 0;

  console.log(`REV-12A: Reviews in DB:  ${computedCount} (service.reviewCount: ${metaCount})`);
  console.log(`REV-12A: Computed avg:   ${computedAvg.toFixed(2)} (service.averageRating: ${metaAvg.toFixed(2)})`);
  console.log(`REV-12A: Review ratings: [${reviews.map((r: any) => r.rating).join(", ")}]`);

  expect(metaCount, "service.reviewCount must equal number of review records").toBe(computedCount);
  expect(Math.abs(metaAvg - computedAvg), "averageRating must match computed average within 0.01").toBeLessThan(0.01);

  console.log(`REV-12A: ── PASS ✓ ──
  reviewCount:   ${metaCount} == ${computedCount} reviews in DB ✓
  averageRating: ${metaAvg.toFixed(2)} ≈ ${computedAvg.toFixed(2)} (computed) ✓`);
});

// ─────────────────────────────────────────────────────────────────────────────
// REV-12B: Star rating edit recalculates averageRating
// ─────────────────────────────────────────────────────────────────────────────
test("REV-12B: Rating edit — averageRating recalculates after PATCH", async ({ page }) => {
  test.setTimeout(60000);
  await loginAs(page, TESTUSER_EMAIL, TESTUSER_PASSWORD);
  console.log("REV-12B: Logged in as testuser123 ✓");

  // ── Read pre-edit state ───────────────────────────────────────────────────
  const [reviewsBefore, serviceBefore] = await Promise.all([
    page.request.get(`/api/services/${SERVICE_ID}/reviews`),
    page.request.get(`/api/services/${SERVICE_ID}`),
  ]);
  const reviewListBefore = await reviewsBefore.json() as any[];
  const serviceBefore_   = await serviceBefore.json() as any;
  const ownReviewBefore  = reviewListBefore.find((r: any) => r.id === TESTUSER_REVIEW_ID);
  const ratingBefore     = ownReviewBefore?.rating as number;
  const avgBefore        = parseFloat(serviceBefore_.averageRating) || 0;
  const countBefore      = serviceBefore_.reviewCount as number;
  console.log(`REV-12B: Before edit — rating: ${ratingBefore}, service avg: ${avgBefore.toFixed(2)}, count: ${countBefore}`);

  // ── PATCH to a clearly different rating (1 star) ──────────────────────────
  const newRating = 1;
  const patchRes  = await page.request.patch(
    `/api/services/${SERVICE_ID}/reviews/${TESTUSER_REVIEW_ID}`,
    { data: { rating: newRating, reviewText: "REV-12B rating edit test" } }
  );
  expect(patchRes.status(), "PATCH should return 200").toBe(200);
  console.log(`REV-12B: PATCH rating ${ratingBefore} → ${newRating} ✓`);

  // ── Read post-edit state ──────────────────────────────────────────────────
  const [reviewsAfter, serviceAfter] = await Promise.all([
    page.request.get(`/api/services/${SERVICE_ID}/reviews`),
    page.request.get(`/api/services/${SERVICE_ID}`),
  ]);
  const reviewListAfter = await reviewsAfter.json() as any[];
  const serviceAfter_   = await serviceAfter.json() as any;
  const avgAfter        = parseFloat(serviceAfter_.averageRating) || 0;
  const countAfter      = serviceAfter_.reviewCount as number;

  // Compute expected average with the new rating
  const expectedAvg = avg(reviewListAfter.map((r: any) => r.rating));
  console.log(`REV-12B: After edit — service avg: ${avgAfter.toFixed(2)}, expected: ${expectedAvg.toFixed(2)}, count: ${countAfter}`);

  expect(countAfter, "reviewCount must not change after an edit").toBe(countBefore);
  expect(Math.abs(avgAfter - expectedAvg), "averageRating must match recalculated value within 0.01").toBeLessThan(0.01);
  expect(avgAfter, "averageRating must differ from pre-edit value (rating changed significantly)").not.toBeCloseTo(avgBefore, 1);

  console.log(`REV-12B: ── PASS ✓ ──
  Rating changed: ${ratingBefore} → ${newRating}
  reviewCount:    ${countBefore} → ${countAfter} (unchanged) ✓
  averageRating:  ${avgBefore.toFixed(2)} → ${avgAfter.toFixed(2)} (recalculated) ✓`);

  // ── Restore original rating so other tests aren't affected ────────────────
  const restoreRating = 3; // what REV-07 set it to
  await page.request.patch(
    `/api/services/${SERVICE_ID}/reviews/${TESTUSER_REVIEW_ID}`,
    { data: { rating: restoreRating, reviewText: "Updated review — great service and value!" } }
  );
  console.log(`REV-12B: Restored rating to ${restoreRating} ✓`);
});

// ─────────────────────────────────────────────────────────────────────────────
// REV-12C: Review create then delete — reviewCount and averageRating update twice
// ─────────────────────────────────────────────────────────────────────────────
test("REV-12C: Create then delete — reviewCount and averageRating recalculate both ways", async ({ page }) => {
  test.setTimeout(60000);

  // Ensure reviewer2 has no existing review
  await page.request.delete("/api/dev/reset-test-review");
  console.log("REV-12C: Reviewer2 review reset ✓");

  await loginAs(page, REVIEWER2_EMAIL, REVIEWER2_PASSWORD);
  console.log("REV-12C: Logged in as reviewer2 ✓");

  // ── Read baseline ─────────────────────────────────────────────────────────
  const [reviewsBase, serviceBase] = await Promise.all([
    page.request.get(`/api/services/${SERVICE_ID}/reviews`),
    page.request.get(`/api/services/${SERVICE_ID}`),
  ]);
  const baseReviews = await reviewsBase.json() as any[];
  const base_       = await serviceBase.json() as any;
  // Use actual review record count as the source of truth (service metadata may lag behind dev resets)
  const baseCount   = baseReviews.length;
  const baseAvg     = avg(baseReviews.map((r: any) => r.rating));
  console.log(`REV-12C: Baseline — DB records: ${baseCount}, computed avg: ${baseAvg.toFixed(2)}, service.reviewCount: ${base_.reviewCount}`);

  // ── POST a 2-star review as reviewer2 ────────────────────────────────────
  const postRes = await page.request.post(
    `/api/services/${SERVICE_ID}/reviews`,
    { data: { bookingId: REVIEWER2_BOOKING, rating: 2, reviewText: "REV-12C create/delete test" } }
  );
  console.log(`REV-12C: POST 2-star review → ${postRes.status()}`);
  expect(postRes.status(), "POST /reviews should return 201").toBe(201);
  const newReview = await postRes.json() as any;
  const newReviewId = newReview.id as string;
  console.log(`REV-12C: Created review ID: ${newReviewId.slice(0, 8)}… ✓`);

  // ── Verify count +1, avg recalculated ────────────────────────────────────
  const [reviewsAfterCreate, serviceAfterCreate] = await Promise.all([
    page.request.get(`/api/services/${SERVICE_ID}/reviews`),
    page.request.get(`/api/services/${SERVICE_ID}`),
  ]);
  const afterCreateReviews = await reviewsAfterCreate.json() as any[];
  const afterCreate_       = await serviceAfterCreate.json() as any;
  const countAfterCreate   = afterCreate_.reviewCount as number;
  const avgAfterCreate     = parseFloat(afterCreate_.averageRating) || 0;
  const expectedAvgCreate  = avg(afterCreateReviews.map((r: any) => r.rating));
  console.log(`REV-12C: After create — count: ${countAfterCreate} (expected ${baseCount + 1}), avg: ${avgAfterCreate.toFixed(2)} (expected ${expectedAvgCreate.toFixed(2)})`);

  expect(countAfterCreate, "reviewCount must increase by 1 after create").toBe(baseCount + 1);
  expect(Math.abs(avgAfterCreate - expectedAvgCreate), "averageRating must match computed value after create").toBeLessThan(0.01);

  // ── DELETE the new review ─────────────────────────────────────────────────
  const deleteRes = await page.request.delete(
    `/api/services/${SERVICE_ID}/reviews/${newReviewId}`
  );
  console.log(`REV-12C: DELETE review → ${deleteRes.status()}`);
  expect(deleteRes.status(), "DELETE should be successful (2xx)").toBeGreaterThanOrEqual(200);
  expect(deleteRes.status()).toBeLessThan(300);

  // ── Verify count and avg restored to baseline ─────────────────────────────
  const [reviewsAfterDelete, serviceAfterDelete] = await Promise.all([
    page.request.get(`/api/services/${SERVICE_ID}/reviews`),
    page.request.get(`/api/services/${SERVICE_ID}`),
  ]);
  const afterDeleteReviews = await reviewsAfterDelete.json() as any[];
  const afterDelete_       = await serviceAfterDelete.json() as any;
  const countAfterDelete   = afterDelete_.reviewCount as number;
  const avgAfterDelete     = parseFloat(afterDelete_.averageRating) || 0;
  const expectedAvgDelete  = avg(afterDeleteReviews.map((r: any) => r.rating));
  console.log(`REV-12C: After delete — count: ${countAfterDelete} (expected ${baseCount}), avg: ${avgAfterDelete.toFixed(2)} (expected ${expectedAvgDelete.toFixed(2)})`);

  expect(countAfterDelete, "reviewCount must return to baseline after delete").toBe(baseCount);
  expect(Math.abs(avgAfterDelete - expectedAvgDelete), "averageRating must match computed value after delete").toBeLessThan(0.01);
  expect(Math.abs(avgAfterDelete - baseAvg), "averageRating must return to near-baseline after delete").toBeLessThan(0.01);

  // Confirm the new review is gone from the list
  const stillPresent = afterDeleteReviews.some((r: any) => r.id === newReviewId);
  expect(stillPresent, "Deleted review must not appear in GET /reviews").toBe(false);

  console.log(`REV-12C: ── PASS ✓ ──
  Baseline:      count=${baseCount}, avg=${baseAvg.toFixed(2)}
  After create:  count=${countAfterCreate} (+1 ✓), avg=${avgAfterCreate.toFixed(2)} (recalculated ✓)
  After delete:  count=${countAfterDelete} (restored ✓), avg=${avgAfterDelete.toFixed(2)} (restored ✓)`);
});
