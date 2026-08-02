/**
 * #875 — coordination refund must fully release consumed credits for reuse.
 *
 * Run with:
 *   DATABASE_URL=postgresql://claude:claude@localhost:5432/traveloure_test \
 *   npx tsx --test server/__tests__/coordination-refund-credit-release.test.ts
 *
 * Verifies, against the REAL functions the live endpoints call:
 *   1. `claimCoordinationCredit` (the /pay claim, optimization-fee.service.ts) consumes an
 *      available paid-optimize credit — stamping consumed_by_coordination_id + consumed_at.
 *   2. The refund endpoint's credit-release step (routes.ts ~7261-7265: an UPDATE nulling
 *      consumed_by_coordination_id/consumed_at WHERE consumed_by_coordination_id = coordinationId
 *      — reproduced verbatim here since it's inline in the routes.ts monolith, not an importable
 *      function) fully un-consumes the credit row.
 *   3. A subsequent `claimCoordinationCredit` call (a second coordination "paying" again) can
 *      claim the now-released credit — proving it's genuinely reusable, not just DB-visible.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://claude:claude@localhost:5432/traveloure_test";

const { db, pool } = await import("../db");
const { coordinationStates, coordinationFeeCredits, users } = await import("../../shared/schema");
const { eq } = await import("drizzle-orm");
const { claimCoordinationCredit } = await import("../services/optimization-fee.service");

after(async () => {
  await pool.end().catch(() => {});
});

async function createUser(): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(users).values({ id, email: `${id}@t.test`, role: "traveler" } as any);
  return id;
}

async function createCoordinationState(userId: string): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(coordinationStates).values({
    id,
    userId,
    experienceType: "wedding",
    feePaymentStatus: "unpaid",
  } as any);
  return id;
}

async function createCredit(userId: string, amountCents: number): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(coordinationFeeCredits).values({
    id,
    userId,
    sourcePaymentIntentId: `pi_opt_${crypto.randomUUID().slice(0, 8)}`,
    amountCents,
    eventType: "wedding",
  } as any);
  return id;
}

// The refund endpoint's credit-release step (routes.ts ~7261-7265), reproduced verbatim —
// it's inline in the routes.ts monolith transaction, not an importable function.
async function refundReleaseCredits(coordinationId: string) {
  return db
    .update(coordinationFeeCredits)
    .set({ consumedByCoordinationId: null, consumedAt: null })
    .where(eq(coordinationFeeCredits.consumedByCoordinationId, coordinationId));
}

async function cleanup(userId: string, stateIds: string[], creditIds: string[]) {
  for (const id of creditIds) {
    await db.delete(coordinationFeeCredits).where(eq(coordinationFeeCredits.id, id)).catch(() => {});
  }
  for (const id of stateIds) {
    await db.delete(coordinationStates).where(eq(coordinationStates.id, id)).catch(() => {});
  }
  await db.delete(users).where(eq(users.id, userId)).catch(() => {});
}

test("#875 — refund fully releases a consumed credit, and it is claimable again", async () => {
  const userId = await createUser();
  const stateId1 = await createCoordinationState(userId);
  const creditId = await createCredit(userId, 1999); // wedding optimize credit, $19.99

  try {
    // Step 1: consume the credit via the real /pay claim path.
    const claimed = await claimCoordinationCredit(userId, stateId1, "wedding", 49900);
    assert.equal(claimed, 1999, "the pay-time claim should consume the full credit (under the fee ceiling)");

    const [afterClaim] = await db
      .select()
      .from(coordinationFeeCredits)
      .where(eq(coordinationFeeCredits.id, creditId));
    assert.equal(afterClaim.consumedByCoordinationId, stateId1, "credit must be stamped consumed by this coordination");
    assert.ok(afterClaim.consumedAt, "consumedAt must be set");

    // A second, unrelated coordination should NOT be able to claim it while consumed.
    const stateId2 = await createCoordinationState(userId);
    try {
      const secondClaimWhileConsumed = await claimCoordinationCredit(userId, stateId2, "wedding", 49900);
      assert.equal(secondClaimWhileConsumed, 0, "a consumed credit must not be claimable by another coordination");

      // Step 2: refund coordination #1 — release the credit exactly as the refund endpoint does.
      await refundReleaseCredits(stateId1);

      const [afterRelease] = await db
        .select()
        .from(coordinationFeeCredits)
        .where(eq(coordinationFeeCredits.id, creditId));
      assert.equal(afterRelease.consumedByCoordinationId, null, "refund must null out consumed_by_coordination_id");
      assert.equal(afterRelease.consumedAt, null, "refund must null out consumed_at");

      // Step 3: the now-released credit must be genuinely claimable again by a fresh coordination.
      const stateId3 = await createCoordinationState(userId);
      try {
        const reclaimed = await claimCoordinationCredit(userId, stateId3, "wedding", 49900);
        assert.equal(reclaimed, 1999, "the released credit must be claimable by a new coordination after refund");

        const [afterReclaim] = await db
          .select()
          .from(coordinationFeeCredits)
          .where(eq(coordinationFeeCredits.id, creditId));
        assert.equal(afterReclaim.consumedByCoordinationId, stateId3);
      } finally {
        await db.delete(coordinationStates).where(eq(coordinationStates.id, stateId3)).catch(() => {});
      }
    } finally {
      await db.delete(coordinationStates).where(eq(coordinationStates.id, stateId2)).catch(() => {});
    }
  } finally {
    await cleanup(userId, [stateId1], [creditId]);
  }
});
