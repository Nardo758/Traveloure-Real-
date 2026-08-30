/**
 * Task 1578 — ready-made purchase revenue dedup
 *
 * Confirms that passing metadata.paymentIntentId when recording platform revenue
 * for a ready-made purchase means the migration-244 DB unique index (not just the
 * old advisory read-then-write check) prevents double-recording on a Stripe retry
 * or concurrent duplicate submission.
 *
 * We test the storage layer directly (insertPlatformRevenueOnce with
 * sourceType='ready_made_commission') — the same call the updated service makes —
 * so the test is deterministic and does not require seeding a full purchase fixture.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "../../db";
import { platformRevenue } from "../../../shared/schema";
import { sql } from "drizzle-orm";
import { storage } from "../../storage";

// ── helpers ───────────────────────────────────────────────────────────────────

const RUN_ID = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
const TEST_PI_ID = `pi_rmp_dedup_1578_${RUN_ID}`;
const TEST_SOURCE_ID = `rmp_test_purchase_${RUN_ID}`;

/**
 * Build a platform-revenue payload that mirrors what fulfillReadyMadePurchase
 * now emits: sourceType='ready_made_commission', sourceId=purchase.id, and
 * metadata.paymentIntentId=stripePaymentIntentId.
 */
function makePayload(
  override: Partial<Parameters<typeof storage.insertPlatformRevenueOnce>[0]> = {},
) {
  return {
    sourceType: "ready_made_commission" as const,
    sourceId: TEST_SOURCE_ID,
    grossAmount: "100.00",
    platformFee: "25.00",
    netAmount: "23.50",
    processingFees: "1.50",
    currency: "USD",
    expertEarnings: "75.00",
    description: `Ready-made trip sale commission: Test Kyoto Trip`,
    metadata: { paymentIntentId: TEST_PI_ID },
    status: "recorded" as const,
    transactionDate: new Date(),
    ...override,
  };
}

async function countRowsForPi(piId: string): Promise<number> {
  const rows = await db
    .select({ id: platformRevenue.id })
    .from(platformRevenue)
    .where(sql`${platformRevenue.metadata}->>'paymentIntentId' = ${piId}`);
  return rows.length;
}

async function cleanupByPi(piId: string) {
  await db
    .delete(platformRevenue)
    .where(sql`${platformRevenue.metadata}->>'paymentIntentId' = ${piId}`);
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe("ready-made purchase revenue dedup — task 1578", () => {
  beforeEach(() => cleanupByPi(TEST_PI_ID));
  afterEach(() => cleanupByPi(TEST_PI_ID));

  it("first fulfillment: inserts exactly one platform_revenue row", async () => {
    const result = await storage.insertPlatformRevenueOnce(makePayload());

    expect(result.inserted).toBe(true);
    expect(result.row.id).toBeTruthy();
    expect(result.row.sourceType).toBe("ready_made_commission");
    expect((result.row.metadata as any)?.paymentIntentId).toBe(TEST_PI_ID);
    expect(await countRowsForPi(TEST_PI_ID)).toBe(1);
  });

  it("sequential retry (Stripe webhook resend): second call returns inserted=false, still only one DB row", async () => {
    const first = await storage.insertPlatformRevenueOnce(makePayload());
    expect(first.inserted).toBe(true);

    // Simulate the webhook being re-delivered and fulfillReadyMadePurchase
    // calling insertPlatformRevenueOnce a second time for the same PI.
    const retry = await storage.insertPlatformRevenueOnce(makePayload());
    expect(retry.inserted).toBe(false);
    expect(retry.row.id).toBe(first.row.id);
    expect(await countRowsForPi(TEST_PI_ID)).toBe(1);
  });

  it("concurrent retry (two simultaneous webhook deliveries): exactly one DB row, no error thrown", async () => {
    // Both calls race with the same paymentIntentId. Only one INSERT can win;
    // the other is blocked by the migration-244 expression index and returns
    // the canonical row via the conflict-recovery SELECT.
    const [a, b] = await Promise.all([
      storage.insertPlatformRevenueOnce(makePayload()),
      storage.insertPlatformRevenueOnce(makePayload()),
    ]);

    const insertedCount = [a, b].filter((r) => r.inserted).length;
    expect(insertedCount).toBe(1);
    expect(a.row.id).toBe(b.row.id);
    expect(await countRowsForPi(TEST_PI_ID)).toBe(1);
  });

  it("paymentIntentId is stored in metadata so migration-244 index can enforce uniqueness", async () => {
    const result = await storage.insertPlatformRevenueOnce(makePayload());
    const meta = result.row.metadata as Record<string, string> | null;
    expect(meta?.paymentIntentId).toBe(TEST_PI_ID);
  });

  it("hasPaymentIntentRevenue returns true after the first fulfillment", async () => {
    expect(await storage.hasPaymentIntentRevenue(TEST_PI_ID)).toBe(false);
    await storage.insertPlatformRevenueOnce(makePayload());
    expect(await storage.hasPaymentIntentRevenue(TEST_PI_ID)).toBe(true);
  });
});
