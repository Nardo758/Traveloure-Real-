/**
 * Task 1577 — cart-booking platform_revenue dedup test
 *
 * The raw INSERT INTO platform_revenue inside the booking.service.ts
 * confirmCartBooking transaction now carries:
 *
 *   ON CONFLICT (source_id)
 *   WHERE source_type = 'booking_commission' AND gross_amount >= 0
 *   DO NOTHING
 *
 * This targets the partial unique index platform_revenue_booking_mint_uniq
 * created by migration 203.  The tests below verify that:
 *
 *  1. The index itself exists (so the ON CONFLICT clause has a valid target).
 *  2. A second raw INSERT with the same bookingId as source_id is silently
 *     ignored — exactly one revenue row survives.
 *  3. Negative reversal rows (gross_amount < 0) are NOT blocked by the index
 *     and continue to insert freely alongside the original positive row.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "../../db";
import { platformRevenue } from "../../../shared/schema";
import { sql } from "drizzle-orm";

// ── helpers ──────────────────────────────────────────────────────────────────

const RUN_ID = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
// Fake bookingId that acts as source_id for these isolated tests.
const TEST_BOOKING_ID = `test-booking-1577-${RUN_ID}`;

async function countRevenueRows(bookingId: string): Promise<number> {
  const rows = await db
    .select({ id: platformRevenue.id })
    .from(platformRevenue)
    .where(
      sql`${platformRevenue.sourceId} = ${bookingId}
          AND ${platformRevenue.sourceType} = 'booking_commission'`,
    );
  return rows.length;
}

async function cleanup(bookingId: string) {
  await db
    .delete(platformRevenue)
    .where(
      sql`${platformRevenue.sourceId} = ${bookingId}
          AND ${platformRevenue.sourceType} = 'booking_commission'`,
    );
}

/**
 * Execute the same raw INSERT that booking.service.ts uses inside its
 * confirmCartBooking transaction, now including ON CONFLICT DO NOTHING.
 */
async function rawRevenueInsert(bookingId: string, grossAmount = "50.00") {
  return db.execute(sql`
    INSERT INTO platform_revenue (
      id, source_type, source_id, gross_amount, platform_fee,
      net_amount, processing_fees, provider_id, provider_earnings,
      description, status, transaction_date, created_at
    ) VALUES (
      gen_random_uuid()::text, 'booking_commission', ${bookingId},
      ${grossAmount}, ${"10.00"},
      ${"9.71"}, ${"0.29"},
      NULL, ${"40.00"},
      ${"Booking commission from booking " + bookingId},
      'recorded', NOW(), NOW()
    )
    ON CONFLICT (source_id) WHERE source_type = 'booking_commission' AND gross_amount >= 0
    DO NOTHING
  `);
}

// ── index presence ────────────────────────────────────────────────────────────

describe("migration 203 — index presence", () => {
  it("platform_revenue_booking_mint_uniq index exists in the database", async () => {
    const rows = await db.execute(sql`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'platform_revenue'
        AND indexname = 'platform_revenue_booking_mint_uniq'
    `);
    expect(rows.rows.length).toBe(1);
  });
});

// ── dedup behaviour ───────────────────────────────────────────────────────────

describe("cart-booking platform_revenue dedup — task 1577", () => {
  beforeEach(() => cleanup(TEST_BOOKING_ID));
  afterEach(() => cleanup(TEST_BOOKING_ID));

  it("first insert succeeds and produces exactly one revenue row", async () => {
    await rawRevenueInsert(TEST_BOOKING_ID);
    expect(await countRevenueRows(TEST_BOOKING_ID)).toBe(1);
  });

  it("retried insert (same bookingId) produces exactly one revenue row — no duplicate", async () => {
    // First insert — simulates the original transaction commit.
    await rawRevenueInsert(TEST_BOOKING_ID);
    expect(await countRevenueRows(TEST_BOOKING_ID)).toBe(1);

    // Second insert — simulates a retried transaction (webhook re-delivery or
    // transient retry).  ON CONFLICT DO NOTHING must swallow it silently.
    await rawRevenueInsert(TEST_BOOKING_ID);
    expect(await countRevenueRows(TEST_BOOKING_ID)).toBe(1);
  });

  it("concurrent retried inserts (Promise.all): exactly one revenue row survives", async () => {
    // Both fire before either can commit — the DB-level unique index is the
    // only guard (application-level status checks happen before the tx opens).
    await Promise.all([
      rawRevenueInsert(TEST_BOOKING_ID),
      rawRevenueInsert(TEST_BOOKING_ID),
    ]);
    expect(await countRevenueRows(TEST_BOOKING_ID)).toBe(1);
  });

  it("triple concurrent inserts: no error thrown, exactly one row", async () => {
    await expect(
      Promise.all([
        rawRevenueInsert(TEST_BOOKING_ID),
        rawRevenueInsert(TEST_BOOKING_ID),
        rawRevenueInsert(TEST_BOOKING_ID),
      ]),
    ).resolves.toHaveLength(3);

    expect(await countRevenueRows(TEST_BOOKING_ID)).toBe(1);
  });

  it("negative reversal row (gross_amount < 0) is NOT blocked by the index", async () => {
    // Insert the original positive row.
    await rawRevenueInsert(TEST_BOOKING_ID, "50.00");
    expect(await countRevenueRows(TEST_BOOKING_ID)).toBe(1);

    // Insert a negative reversal — partial index only covers gross_amount >= 0,
    // so this must insert freely and not conflict.
    await db.execute(sql`
      INSERT INTO platform_revenue (
        id, source_type, source_id, gross_amount, platform_fee,
        net_amount, processing_fees, provider_id, provider_earnings,
        description, status, transaction_date, created_at
      ) VALUES (
        gen_random_uuid()::text, 'booking_commission', ${TEST_BOOKING_ID},
        ${"-50.00"}, ${"-10.00"},
        ${"-9.71"}, ${"-0.29"},
        NULL, ${"-40.00"},
        ${"Reversal for booking " + TEST_BOOKING_ID},
        'reversed', NOW(), NOW()
      )
    `);

    // Both rows should now exist (positive + negative).
    const all = await db
      .select({ id: platformRevenue.id })
      .from(platformRevenue)
      .where(
        sql`${platformRevenue.sourceId} = ${TEST_BOOKING_ID}
            AND ${platformRevenue.sourceType} = 'booking_commission'`,
      );
    expect(all.length).toBe(2);

    // Clean up the reversal row as well (cleanup() only deletes booking_commission rows,
    // which includes both, so it's fine — but be explicit).
    await cleanup(TEST_BOOKING_ID);
  });
});
