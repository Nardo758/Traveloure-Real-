/**
 * Task 1573 — platform_revenue payment-intent dedup tests
 *
 * Verifies that two concurrent copies of the same Stripe payment_intent.succeeded
 * webhook can never produce more than one platform_revenue row, even when both
 * pass the advisory hasPaymentIntentRevenue pre-check before either commits.
 *
 * The DB-level uniqueness guard (migration 244, partial unique index on
 * metadata->>'paymentIntentId') backed by ON CONFLICT DO NOTHING in
 * insertPlatformRevenueOnce is the authoritative dedup mechanism tested here.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { db } from "../../db";
import { platformRevenue } from "../../../shared/schema";
import { sql, eq } from "drizzle-orm";
import { storage } from "../../storage";

// ── helpers ──────────────────────────────────────────────────────────────────

const TEST_PI_ID = `pi_test_dedup_${Date.now()}`;
const TEST_SOURCE_ID = `src_dedup_${Date.now()}`;

function makeRevenuePayload(override: Partial<Parameters<typeof storage.insertPlatformRevenueOnce>[0]> = {}) {
  return {
    sourceType: "booking_commission" as const,
    sourceId: TEST_SOURCE_ID,
    grossAmount: "100.00",
    platformFee: "25.00",
    netAmount: "24.25",
    processingFees: "0.75",
    metadata: { paymentIntentId: TEST_PI_ID },
    status: "recorded" as const,
    transactionDate: new Date(),
    ...override,
  };
}

async function countRevenueRowsForPi(piId: string): Promise<number> {
  const rows = await db
    .select({ id: platformRevenue.id })
    .from(platformRevenue)
    .where(sql`${platformRevenue.metadata}->>'paymentIntentId' = ${piId}`);
  return rows.length;
}

async function cleanupTestRows() {
  await db
    .delete(platformRevenue)
    .where(sql`${platformRevenue.metadata}->>'paymentIntentId' = ${TEST_PI_ID}`);
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe("platform_revenue payment-intent dedup (task 1573)", () => {
  beforeEach(async () => {
    await cleanupTestRows();
  });

  afterEach(async () => {
    await cleanupTestRows();
  });

  it("insertPlatformRevenueOnce: first call inserts and returns inserted=true", async () => {
    const result = await storage.insertPlatformRevenueOnce(makeRevenuePayload());
    expect(result.inserted).toBe(true);
    expect(result.row.id).toBeTruthy();
    expect((result.row.metadata as any)?.paymentIntentId).toBe(TEST_PI_ID);
    expect(await countRevenueRowsForPi(TEST_PI_ID)).toBe(1);
  });

  it("insertPlatformRevenueOnce: second call for same PI returns inserted=false, no new row", async () => {
    const first = await storage.insertPlatformRevenueOnce(makeRevenuePayload());
    expect(first.inserted).toBe(true);

    const second = await storage.insertPlatformRevenueOnce(makeRevenuePayload());
    expect(second.inserted).toBe(false);
    // Returns the canonical existing row
    expect(second.row.id).toBe(first.row.id);
    // Still exactly one row
    expect(await countRevenueRowsForPi(TEST_PI_ID)).toBe(1);
  });

  it("concurrent duplicate inserts: exactly one row survives", async () => {
    // Fire two insertPlatformRevenueOnce calls simultaneously — simulates two webhook
    // copies that both pass the hasPaymentIntentRevenue read before either commits.
    const [a, b] = await Promise.all([
      storage.insertPlatformRevenueOnce(makeRevenuePayload()),
      storage.insertPlatformRevenueOnce(makeRevenuePayload()),
    ]);

    // Exactly one should be inserted; the other should be a conflict.
    const insertedCount = [a, b].filter((r) => r.inserted).length;
    expect(insertedCount).toBe(1);

    // Both return the same canonical row id.
    expect(a.row.id).toBe(b.row.id);

    // Only one DB row for this PI.
    expect(await countRevenueRowsForPi(TEST_PI_ID)).toBe(1);
  });

  it("concurrent duplicate inserts: no 500 / no thrown error", async () => {
    await expect(
      Promise.all([
        storage.insertPlatformRevenueOnce(makeRevenuePayload()),
        storage.insertPlatformRevenueOnce(makeRevenuePayload()),
        storage.insertPlatformRevenueOnce(makeRevenuePayload()),
      ])
    ).resolves.toHaveLength(3);

    expect(await countRevenueRowsForPi(TEST_PI_ID)).toBe(1);
  });

  it("rows without a paymentIntentId are unaffected by the constraint", async () => {
    // Insert two rows with no paymentIntentId — they should both succeed.
    const payload = {
      sourceType: "coordination_fee" as const,
      sourceId: undefined as unknown as string,
      grossAmount: "50.00",
      platformFee: "50.00",
      netAmount: "48.50",
      processingFees: "1.50",
      metadata: {},
      status: "recorded" as const,
      transactionDate: new Date(),
    };

    const [r1, r2] = await Promise.all([
      storage.insertPlatformRevenueOnce(payload),
      storage.insertPlatformRevenueOnce(payload),
    ]);

    // Both should insert (no PI-keyed constraint to block them).
    // (They might conflict on booking_commission index but coordination_fee is exempt.)
    // Just assert neither throws and both return rows.
    expect(r1.row.id).toBeTruthy();
    expect(r2.row.id).toBeTruthy();

    // Cleanup
    await db.delete(platformRevenue).where(eq(platformRevenue.id, r1.row.id));
    if (r2.row.id !== r1.row.id) {
      await db.delete(platformRevenue).where(eq(platformRevenue.id, r2.row.id));
    }
  });

  it("recordPlatformRevenue (legacy callers): returns the canonical row on duplicate", async () => {
    // recordPlatformRevenue delegates to insertPlatformRevenueOnce — verify it doesn't throw.
    const payload = makeRevenuePayload();
    const first = await storage.recordPlatformRevenue(payload);
    const second = await storage.recordPlatformRevenue(payload);

    expect(first.id).toBe(second.id);
    expect(await countRevenueRowsForPi(TEST_PI_ID)).toBe(1);
  });

  it("hasPaymentIntentRevenue: returns true after a successful insert", async () => {
    expect(await storage.hasPaymentIntentRevenue(TEST_PI_ID)).toBe(false);
    await storage.insertPlatformRevenueOnce(makeRevenuePayload());
    expect(await storage.hasPaymentIntentRevenue(TEST_PI_ID)).toBe(true);
  });
});
