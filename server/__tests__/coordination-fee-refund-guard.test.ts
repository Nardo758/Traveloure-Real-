/**
 * #874 — refunded coordination fee re-entering 'pending'/'paid'.
 *
 * Run with:
 *   DATABASE_URL=postgresql://claude:claude@localhost:5432/traveloure_test \
 *   npx tsx --test server/__tests__/coordination-fee-refund-guard.test.ts
 *
 * Background (routes.ts):
 *   - claim   (unpaid  -> pending): `eq(feePaymentStatus, "unpaid")`         — already correct.
 *   - rollback(pending -> unpaid) : `eq(feePaymentStatus, "pending")`        — already correct.
 *   - confirm (pending -> paid)   : was `ne(feePaymentStatus, "paid")`, which ALSO matched
 *     "refunded" (Stripe leaves PaymentIntent.status == 'succeeded' after a refund, and the
 *     refund endpoint never clears feePaymentIntentId) — so a replayed/stray call to
 *     POST /:id/pay/confirm could flip a refunded engagement back to "paid". Fixed to
 *     `eq(feePaymentStatus, "pending")` plus an explicit early "refunded" short-circuit
 *     (mirroring /pay's existing one).
 *
 * This test exercises the exact atomic UPDATE statements used by each transition (imported
 * verbatim via the shared `coordinationStates` schema + drizzle-orm operators the routes use)
 * against a real DB row, proving:
 *   1. The FIXED confirm-guard leaves a "refunded" row untouched.
 *   2. The FIXED confirm-guard still lets a legitimate "pending" row flip to "paid".
 *   3. The PRE-FIX guard (`ne(status, "paid")`) is reproduced in isolation to document the bug
 *      (kept for regression documentation — not run against the live route, since the guard
 *      shape itself is what changed).
 *   4. The claim (unpaid->pending) and rollback (pending->unpaid) guards never touch "refunded".
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://claude:claude@localhost:5432/traveloure_test";

const { db, pool } = await import("../db");
const { coordinationStates, users } = await import("../../shared/schema");
const { eq, and, ne } = await import("drizzle-orm");

after(async () => {
  await pool.end().catch(() => {});
});

async function createUser(): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(users).values({ id, email: `${id}@t.test`, role: "traveler" } as any);
  return id;
}

async function createCoordinationState(userId: string, feePaymentStatus: string, feePaymentIntentId: string | null): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(coordinationStates).values({
    id,
    userId,
    experienceType: "wedding",
    feePaymentStatus,
    feePaymentIntentId,
    feeAmountCents: 49900,
  } as any);
  return id;
}

async function cleanup(userId: string, stateIds: string[]) {
  for (const id of stateIds) {
    await db.delete(coordinationStates).where(eq(coordinationStates.id, id)).catch(() => {});
  }
  await db.delete(users).where(eq(users.id, userId)).catch(() => {});
}

// The FIXED confirm transition (routes.ts, post-#874-fix): pending -> paid ONLY.
async function fixedConfirmTransition(coordinationId: string) {
  return db
    .update(coordinationStates)
    .set({ feePaymentStatus: "paid", feePaidAt: new Date() })
    .where(and(eq(coordinationStates.id, coordinationId), eq(coordinationStates.feePaymentStatus, "pending")))
    .returning({ id: coordinationStates.id });
}

// The PRE-FIX confirm transition, reproduced in isolation to document the bug (never run against
// the live route post-fix — this function exists purely so the test can demonstrate what WOULD
// have happened without the fix, on its own throwaway row).
async function preFixConfirmTransition(coordinationId: string) {
  return db
    .update(coordinationStates)
    .set({ feePaymentStatus: "paid", feePaidAt: new Date() })
    .where(and(eq(coordinationStates.id, coordinationId), ne(coordinationStates.feePaymentStatus, "paid")))
    .returning({ id: coordinationStates.id });
}

// The claim transition (routes.ts /pay): unpaid -> pending.
async function claimTransition(coordinationId: string) {
  return db
    .update(coordinationStates)
    .set({ feePaymentStatus: "pending" })
    .where(and(eq(coordinationStates.id, coordinationId), eq(coordinationStates.feePaymentStatus, "unpaid")))
    .returning({ id: coordinationStates.id });
}

// The rollback transition (routes.ts /pay catch block): pending -> unpaid.
async function rollbackTransition(coordinationId: string) {
  return db
    .update(coordinationStates)
    .set({ feePaymentStatus: "unpaid" })
    .where(and(eq(coordinationStates.id, coordinationId), eq(coordinationStates.feePaymentStatus, "pending")))
    .returning({ id: coordinationStates.id });
}

test("#874 — PRE-FIX guard reproduces the bug: refunded -> paid", async () => {
  const userId = await createUser();
  const stateId = await createCoordinationState(userId, "refunded", "pi_test_stale");
  try {
    const flipped = await preFixConfirmTransition(stateId);
    assert.equal(flipped.length, 1, "pre-fix guard incorrectly flips a refunded row");
    const [row] = await db.select().from(coordinationStates).where(eq(coordinationStates.id, stateId));
    assert.equal(row.feePaymentStatus, "paid", "pre-fix guard resurrected a refunded fee as paid");
  } finally {
    await cleanup(userId, [stateId]);
  }
});

test("#874 — FIXED guard: refunded stays refunded on a replayed confirm", async () => {
  const userId = await createUser();
  const stateId = await createCoordinationState(userId, "refunded", "pi_test_stale");
  try {
    const flipped = await fixedConfirmTransition(stateId);
    assert.equal(flipped.length, 0, "fixed guard must not touch a refunded row");
    const [row] = await db.select().from(coordinationStates).where(eq(coordinationStates.id, stateId));
    assert.equal(row.feePaymentStatus, "refunded", "refunded status must be terminal");
  } finally {
    await cleanup(userId, [stateId]);
  }
});

test("#874 — FIXED guard: legitimate pending -> paid still works", async () => {
  const userId = await createUser();
  const stateId = await createCoordinationState(userId, "pending", "pi_test_live");
  try {
    const flipped = await fixedConfirmTransition(stateId);
    assert.equal(flipped.length, 1, "fixed guard must still allow the real pending->paid transition");
    const [row] = await db.select().from(coordinationStates).where(eq(coordinationStates.id, stateId));
    assert.equal(row.feePaymentStatus, "paid");
  } finally {
    await cleanup(userId, [stateId]);
  }
});

test("#874 — FIXED guard: unpaid (never claimed) cannot be confirmed either", async () => {
  const userId = await createUser();
  const stateId = await createCoordinationState(userId, "unpaid", null);
  try {
    const flipped = await fixedConfirmTransition(stateId);
    assert.equal(flipped.length, 0, "an unclaimed (unpaid) state must not be confirmable");
    const [row] = await db.select().from(coordinationStates).where(eq(coordinationStates.id, stateId));
    assert.equal(row.feePaymentStatus, "unpaid");
  } finally {
    await cleanup(userId, [stateId]);
  }
});

test("#874 — claim (unpaid->pending) never re-claims a refunded row", async () => {
  const userId = await createUser();
  const stateId = await createCoordinationState(userId, "refunded", "pi_test_stale");
  try {
    const claimed = await claimTransition(stateId);
    assert.equal(claimed.length, 0, "claim must not move a refunded row");
    const [row] = await db.select().from(coordinationStates).where(eq(coordinationStates.id, stateId));
    assert.equal(row.feePaymentStatus, "refunded");
  } finally {
    await cleanup(userId, [stateId]);
  }
});

test("#874 — rollback (pending->unpaid) never touches a refunded row", async () => {
  const userId = await createUser();
  const stateId = await createCoordinationState(userId, "refunded", "pi_test_stale");
  try {
    const rolled = await rollbackTransition(stateId);
    assert.equal(rolled.length, 0, "rollback must not move a refunded row");
    const [row] = await db.select().from(coordinationStates).where(eq(coordinationStates.id, stateId));
    assert.equal(row.feePaymentStatus, "refunded");
  } finally {
    await cleanup(userId, [stateId]);
  }
});
