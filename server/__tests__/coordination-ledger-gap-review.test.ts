/**
 * #877 — admins can mark a coordination "revenue_reversal_missing" ledger gap reviewed.
 *
 * Run with:
 *   DATABASE_URL=postgresql://claude:claude@localhost:5432/traveloure_test \
 *   npx tsx --test server/__tests__/coordination-ledger-gap-review.test.ts
 *
 * Background: coordination_states.revenue_reversal_missing (migration 128) is set true when a
 * coordination-fee refund finds no platform_revenue row to reverse. The admin concierge panel
 * (client/src/pages/admin/concierge-requests.tsx) renders it as a permanent "Ledger gap:" warning
 * with no way to acknowledge it. Migration 169 adds revenue_reversal_reviewed_at/_by; the new
 * POST /api/admin/coordination-states/:id/review-ledger-gap endpoint (admin.routes.ts) stamps
 * them. This test drives the same UPDATE the endpoint runs, proving:
 *   1. A row starts with revenue_reversal_missing=true and reviewed_at=NULL (the open state).
 *   2. Marking it reviewed stamps reviewed_at/reviewed_by WITHOUT clearing revenue_reversal_missing
 *      or any other ledger data — the underlying gap flag is never deleted, only annotated.
 *   3. The operation is idempotent — a second "mark reviewed" call just re-stamps, no error.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://claude:claude@localhost:5432/traveloure_test";

const { db, pool } = await import("../db");
const { coordinationStates, users } = await import("../../shared/schema");
const { eq } = await import("drizzle-orm");

after(async () => {
  await pool.end().catch(() => {});
});

async function createUser(role = "traveler"): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(users).values({ id, email: `${id}@t.test`, role } as any);
  return id;
}

// The exact UPDATE the new admin.routes.ts endpoint runs.
async function reviewLedgerGap(coordinationId: string, adminId: string) {
  return db
    .update(coordinationStates)
    .set({ revenueReversalReviewedAt: new Date(), revenueReversalReviewedBy: adminId })
    .where(eq(coordinationStates.id, coordinationId))
    .returning({
      id: coordinationStates.id,
      revenueReversalMissing: coordinationStates.revenueReversalMissing,
      revenueReversalReviewedAt: coordinationStates.revenueReversalReviewedAt,
      revenueReversalReviewedBy: coordinationStates.revenueReversalReviewedBy,
    });
}

test("#877 — marking a ledger gap reviewed stamps reviewed_at/_by without clearing the flag", async () => {
  const travelerId = await createUser("traveler");
  const adminId = await createUser("admin");
  const stateId = crypto.randomUUID();
  await db.insert(coordinationStates).values({
    id: stateId,
    userId: travelerId,
    experienceType: "wedding",
    feePaymentStatus: "refunded",
    revenueReversalMissing: true,
  } as any);

  try {
    // Precondition: open ledger gap.
    const [before] = await db.select().from(coordinationStates).where(eq(coordinationStates.id, stateId));
    assert.equal(before.revenueReversalMissing, true);
    assert.equal(before.revenueReversalReviewedAt, null);
    assert.equal(before.revenueReversalReviewedBy, null);

    // Mark reviewed.
    const [reviewed] = await reviewLedgerGap(stateId, adminId);
    assert.equal(reviewed.revenueReversalMissing, true, "the underlying gap flag must never be cleared — only annotated");
    assert.ok(reviewed.revenueReversalReviewedAt, "reviewed_at must be stamped");
    assert.equal(reviewed.revenueReversalReviewedBy, adminId);

    const [afterReview] = await db.select().from(coordinationStates).where(eq(coordinationStates.id, stateId));
    assert.equal(afterReview.revenueReversalMissing, true);
    assert.ok(afterReview.revenueReversalReviewedAt);
    assert.equal(afterReview.revenueReversalReviewedBy, adminId);

    // Idempotent: a second call just re-stamps, no error, still flagged + reviewed.
    const secondAdminId = await createUser("admin");
    try {
      const [reReviewed] = await reviewLedgerGap(stateId, secondAdminId);
      assert.equal(reReviewed.revenueReversalMissing, true);
      assert.equal(reReviewed.revenueReversalReviewedBy, secondAdminId, "re-marking updates the reviewer to the latest admin");
    } finally {
      await db.delete(users).where(eq(users.id, secondAdminId)).catch(() => {});
    }
  } finally {
    await db.delete(coordinationStates).where(eq(coordinationStates.id, stateId)).catch(() => {});
    await db.delete(users).where(eq(users.id, travelerId)).catch(() => {});
    await db.delete(users).where(eq(users.id, adminId)).catch(() => {});
  }
});
