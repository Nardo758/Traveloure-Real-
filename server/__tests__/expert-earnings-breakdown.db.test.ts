/**
 * Expert Revenue Share Breakdown — DB-level proof that getExpertRevenueDetails()
 * returns correct gross / platform-fee / expert-share figures from platform_revenue,
 * and that reversal rows cancel the originals (double-entry net semantics).
 *
 * Run solo:
 *   npx tsx --test server/__tests__/expert-earnings-breakdown.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { revenueTrackingService } from "../services/revenue-tracking.service";

const RUN = crypto.randomUUID().slice(0, 8);
const expertId = `test-expert-breakdown-${RUN}`;

// IDs of rows we insert — cleaned up in after().
const insertedPlatformRevenueIds: string[] = [];
let insertedEarningId: string | null = null;

before(async () => {
  // Minimal user fixture — only the id and role columns are needed.
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name, role)
    VALUES (${expertId}, ${`expert-breakdown-${RUN}@t.test`}, 'Test', 'Expert', 'expert')
  `);
});

after(async () => {
  // Clean up in reverse dependency order.
  for (const id of insertedPlatformRevenueIds) {
    await db.execute(sql`DELETE FROM platform_revenue WHERE id = ${id}`).catch(() => {});
  }
  if (insertedEarningId) {
    await db.execute(sql`DELETE FROM expert_earnings WHERE id = ${insertedEarningId}`).catch(() => {});
  }
  await db.execute(sql`DELETE FROM users WHERE id = ${expertId}`).catch(() => {});
});

// ── helpers ────────────────────────────────────────────────────────────────────

async function insertPlatformRevenue(opts: {
  gross: number;
  platformFee: number;
  expertShare: number;
  sourceType?: string;
}): Promise<string> {
  const id = `pr-${RUN}-${crypto.randomUUID().slice(0, 6)}`;
  await db.execute(sql`
    INSERT INTO platform_revenue
      (id, source_type, gross_amount, platform_fee, net_amount, expert_id, expert_earnings, status)
    VALUES
      (${id}, ${opts.sourceType ?? 'booking_commission'},
       ${opts.gross}, ${opts.platformFee}, ${opts.gross - opts.platformFee},
       ${expertId}, ${opts.expertShare}, 'recorded')
  `);
  insertedPlatformRevenueIds.push(id);
  return id;
}

// ── tests ──────────────────────────────────────────────────────────────────────

test("expert breakdown: zero revenue returns all-zero gross/fee/share with null effectiveShareRate", async () => {
  const details = await revenueTrackingService.getExpertRevenueDetails(expertId);
  assert.equal(details.summary.grossBookingValue, 0, "grossBookingValue must be 0 when no revenue rows exist");
  assert.equal(details.summary.platformFeeTotal, 0, "platformFeeTotal must be 0 when no revenue rows exist");
  assert.equal(details.summary.expertShareFromRevenue, 0, "expertShareFromRevenue must be 0 when no revenue rows exist");
  assert.equal(details.summary.effectiveShareRate, null, "effectiveShareRate must be null when gross is zero");
});

test("expert breakdown: single booking row surfaces correct gross, fee, and share", async () => {
  await insertPlatformRevenue({ gross: 100, platformFee: 25, expertShare: 75 });

  const details = await revenueTrackingService.getExpertRevenueDetails(expertId);
  assert.equal(
    Number(details.summary.grossBookingValue).toFixed(2),
    "100.00",
    "grossBookingValue must equal the booking gross",
  );
  assert.equal(
    Number(details.summary.platformFeeTotal).toFixed(2),
    "25.00",
    "platformFeeTotal must equal the platform fee",
  );
  assert.equal(
    Number(details.summary.expertShareFromRevenue).toFixed(2),
    "75.00",
    "expertShareFromRevenue must equal the expert's cut",
  );
  assert.ok(
    details.summary.effectiveShareRate !== null,
    "effectiveShareRate must be non-null when gross > 0",
  );
  assert.equal(
    Number(details.summary.effectiveShareRate!.toFixed(4)),
    0.75,
    "effectiveShareRate must be expertShare / gross = 0.75",
  );
});

test("expert breakdown: reversal row nets the original booking to zero (double-entry semantics)", async () => {
  // Original booking already inserted in the previous test (+100 gross, +25 fee, +75 share).
  // Insert the compensating reversal: negative mirror of the original amounts.
  await insertPlatformRevenue({ gross: -100, platformFee: -25, expertShare: -75 });

  const details = await revenueTrackingService.getExpertRevenueDetails(expertId);
  assert.equal(
    Number(details.summary.grossBookingValue).toFixed(2),
    "0.00",
    "grossBookingValue must net to 0 when original + reversal are both summed",
  );
  assert.equal(
    Number(details.summary.platformFeeTotal).toFixed(2),
    "0.00",
    "platformFeeTotal must net to 0 after full reversal",
  );
  assert.equal(
    Number(details.summary.expertShareFromRevenue).toFixed(2),
    "0.00",
    "expertShareFromRevenue must net to 0 after full reversal",
  );
  assert.equal(
    details.summary.effectiveShareRate,
    null,
    "effectiveShareRate must be null when net gross is zero (no positive base to divide by)",
  );
});

test("expert breakdown: partial refund leaves correct non-zero residual", async () => {
  // At this point: original (+100) + full-reversal (-100) = 0 from prior tests.
  // Add a new booking of 200 with a partial refund of 50.
  await insertPlatformRevenue({ gross: 200, platformFee: 50, expertShare: 150 });
  await insertPlatformRevenue({ gross: -50, platformFee: -12.5, expertShare: -37.5 });

  const details = await revenueTrackingService.getExpertRevenueDetails(expertId);
  // Net: 0 (prior) + 200 - 50 = 150 gross; 0 + 50 - 12.5 = 37.5 fee; 0 + 150 - 37.5 = 112.5 share
  assert.equal(
    Number(details.summary.grossBookingValue).toFixed(2),
    "150.00",
    "grossBookingValue must reflect the partial-refund residual",
  );
  assert.equal(
    Number(details.summary.platformFeeTotal).toFixed(2),
    "37.50",
    "platformFeeTotal must reflect the partial-refund residual",
  );
  assert.equal(
    Number(details.summary.expertShareFromRevenue).toFixed(2),
    "112.50",
    "expertShareFromRevenue must reflect the partial-refund residual",
  );
  // effectiveRate = 112.5 / 150 = 0.75
  assert.ok(details.summary.effectiveShareRate !== null, "effectiveShareRate must be non-null when net gross > 0");
  assert.equal(
    Number(details.summary.effectiveShareRate!.toFixed(4)),
    0.75,
    "effectiveShareRate must remain 75% after partial refund",
  );
});
