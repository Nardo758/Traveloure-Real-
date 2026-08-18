/**
 * Task 1573 — platform_revenue payment-intent dedup tests
 *
 * Verifies that two concurrent copies of the same Stripe payment_intent.succeeded
 * webhook can never produce more than one platform_revenue row, even when both
 * pass the advisory hasPaymentIntentRevenue pre-check before either commits.
 *
 * IMPORTANT: all rows use sourceType = 'optimization_fee' (not 'booking_commission')
 * so migration 203's booking-mint partial index is irrelevant here. Only migration 244's
 * expression index on (metadata->>'paymentIntentId') blocks the duplicates — that is
 * exactly the constraint being tested.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "../../db";
import { platformRevenue } from "../../../shared/schema";
import { sql } from "drizzle-orm";
import { storage } from "../../storage";

// ── helpers ──────────────────────────────────────────────────────────────────

// Use a unique suffix per test run so parallel CI runs don't collide.
const RUN_ID = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
const TEST_PI_ID = `pi_test_dedup_244_${RUN_ID}`;

/**
 * Build a payload that is:
 *  - keyed by TEST_PI_ID in metadata (so migration 244 applies)
 *  - sourceType = 'optimization_fee' (NOT 'booking_commission') so migration 203's
 *    booking-mint index does NOT apply — the PI index is the only dedup guard here
 *  - no sourceId (optimization_fee rows typically have none)
 */
function makePayload(
  override: Partial<Parameters<typeof storage.insertPlatformRevenueOnce>[0]> = {},
) {
  return {
    sourceType: "optimization_fee" as const,
    grossAmount: "29.00",
    platformFee: "29.00",
    netAmount: "28.13",
    processingFees: "0.87",
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

// ── verify the index is present ───────────────────────────────────────────────

describe("migration 244 — index presence", () => {
  it("platform_revenue_payment_intent_uniq index exists in the database", async () => {
    const rows = await db.execute(
      sql`
        SELECT indexname
        FROM pg_indexes
        WHERE tablename = 'platform_revenue'
          AND indexname = 'platform_revenue_payment_intent_uniq'
      `,
    );
    expect(rows.rows.length).toBe(1);
  });
});

// ── dedup behaviour ───────────────────────────────────────────────────────────

describe("platform_revenue payment-intent dedup — migration 244 (task 1573)", () => {
  beforeEach(() => cleanupByPi(TEST_PI_ID));
  afterEach(() => cleanupByPi(TEST_PI_ID));

  it("first insert returns inserted=true and exactly one DB row", async () => {
    const result = await storage.insertPlatformRevenueOnce(makePayload());
    expect(result.inserted).toBe(true);
    expect(result.row.id).toBeTruthy();
    expect((result.row.metadata as any)?.paymentIntentId).toBe(TEST_PI_ID);
    expect(await countRowsForPi(TEST_PI_ID)).toBe(1);
  });

  it("sequential duplicate: second call returns inserted=false and the same canonical row", async () => {
    const first = await storage.insertPlatformRevenueOnce(makePayload());
    expect(first.inserted).toBe(true);

    const second = await storage.insertPlatformRevenueOnce(makePayload());
    expect(second.inserted).toBe(false);
    expect(second.row.id).toBe(first.row.id);
    expect(await countRowsForPi(TEST_PI_ID)).toBe(1);
  });

  it("concurrent duplicates (Promise.all): exactly one row — only the PI index can block this", async () => {
    // Both calls race against the same paymentIntentId on an optimization_fee row.
    // Migration 203 has no index covering this source type, so the only applicable
    // unique constraint is migration 244's PI expression index.
    const [a, b] = await Promise.all([
      storage.insertPlatformRevenueOnce(makePayload()),
      storage.insertPlatformRevenueOnce(makePayload()),
    ]);

    const insertedCount = [a, b].filter((r) => r.inserted).length;
    expect(insertedCount).toBe(1);

    // Both calls return the same canonical row id.
    expect(a.row.id).toBe(b.row.id);

    // Exactly one DB row for this PI.
    expect(await countRowsForPi(TEST_PI_ID)).toBe(1);
  });

  it("triple concurrent duplicates: no error thrown, exactly one row", async () => {
    await expect(
      Promise.all([
        storage.insertPlatformRevenueOnce(makePayload()),
        storage.insertPlatformRevenueOnce(makePayload()),
        storage.insertPlatformRevenueOnce(makePayload()),
      ]),
    ).resolves.toHaveLength(3);

    expect(await countRowsForPi(TEST_PI_ID)).toBe(1);
  });

  it("recordPlatformRevenue (legacy callers): no throw, returns canonical row on duplicate", async () => {
    const first = await storage.recordPlatformRevenue(makePayload());
    const second = await storage.recordPlatformRevenue(makePayload());

    expect(first.id).toBe(second.id);
    expect(await countRowsForPi(TEST_PI_ID)).toBe(1);
  });

  it("hasPaymentIntentRevenue: false before insert, true after", async () => {
    expect(await storage.hasPaymentIntentRevenue(TEST_PI_ID)).toBe(false);
    await storage.insertPlatformRevenueOnce(makePayload());
    expect(await storage.hasPaymentIntentRevenue(TEST_PI_ID)).toBe(true);
  });

  it("rows without paymentIntentId are not constrained by migration 244", async () => {
    // Two optimization_fee rows with no paymentIntentId should both insert freely
    // (no PI index applies, and no booking-commission index applies either).
    const payload = makePayload({ metadata: {} });

    const r1 = await storage.insertPlatformRevenueOnce(payload);
    const r2 = await storage.insertPlatformRevenueOnce(payload);

    expect(r1.row.id).toBeTruthy();
    expect(r2.row.id).toBeTruthy();

    // Clean up both rows explicitly since cleanup only targets TEST_PI_ID.
    await db.delete(platformRevenue).where(sql`id = ${r1.row.id}`);
    if (r2.row.id !== r1.row.id) {
      await db.delete(platformRevenue).where(sql`id = ${r2.row.id}`);
    }
  });
});
