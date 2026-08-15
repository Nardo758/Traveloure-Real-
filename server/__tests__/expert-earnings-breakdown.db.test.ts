/**
 * Expert Booking Revenue Share Breakdown — DB-level proof that getExpertRevenueDetails()
 * returns correct gross / platform-fee / expert-share figures scoped to booking_commission
 * rows from platform_revenue, that reversal rows cancel the originals (double-entry net
 * semantics), and that tip_commission / affiliate_commission rows are NOT included (they
 * are surfaced separately and must not cause a double-count in the booking breakdown).
 *
 * Run solo:
 *   JOURNEY_DB_WRITES_OK=1 npx tsx --test server/__tests__/expert-earnings-breakdown.db.test.ts
 *
 * DISPOSABLE DB ONLY — same guard posture as payout-parity.db.test.ts.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { revenueTrackingService } from "../services/revenue-tracking.service";

const RUN = crypto.randomUUID().slice(0, 8);
const expertId = `test-expert-breakdown-${RUN}`;

const insertedPlatformRevenueIds: string[] = [];

// ── Disposable-DB guard (mirrors payout-parity.db.test.ts) ────────────────────
const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
async function assertDisposableDb(): Promise<void> {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host: string | null = null;
  try {
    host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
  } catch {
    host = null;
  }
  let serverAddr: string | null = null;
  try {
    const r = await db.execute(sql`SELECT host(inet_server_addr()) AS addr`);
    serverAddr = ((r.rows[0] as any)?.addr as string) ?? null;
  } catch {
    /* local socket ⇒ NULL ⇒ disposable signal */
  }
  const ok =
    (host !== null && DISPOSABLE_HOSTS.has(host)) ||
    (host === null && (serverAddr === null || DISPOSABLE_HOSTS.has(serverAddr)));
  if (!ok) {
    throw new Error(
      `[expert-earnings-breakdown] REFUSING to write fixtures: DATABASE_URL host '${host ?? "<none>"}' is not ` +
        `a recognized disposable dev/CI database. Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1.`,
    );
  }
}

before(async () => {
  await assertDisposableDb();
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name, role)
    VALUES (${expertId}, ${`expert-breakdown-${RUN}@t.test`}, 'Test', 'Expert', 'expert')
  `);
});

after(async () => {
  for (const id of insertedPlatformRevenueIds) {
    await db.execute(sql`DELETE FROM platform_revenue WHERE id = ${id}`).catch(() => {});
  }
  await db.execute(sql`DELETE FROM users WHERE id = ${expertId}`).catch(() => {});
});

// ── helpers ────────────────────────────────────────────────────────────────────

async function insertPlatformRevenue(opts: {
  gross: number;
  platformFee: number;
  expertShare: number;
  sourceType: string;
}): Promise<string> {
  const id = `pr-${RUN}-${crypto.randomUUID().slice(0, 6)}`;
  await db.execute(sql`
    INSERT INTO platform_revenue
      (id, source_type, gross_amount, platform_fee, net_amount, expert_id, expert_earnings, status)
    VALUES
      (${id}, ${opts.sourceType},
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

test("expert breakdown: booking_commission row surfaces correct gross, fee, and share", async () => {
  await insertPlatformRevenue({ gross: 100, platformFee: 25, expertShare: 75, sourceType: "booking_commission" });

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
  assert.ok(details.summary.effectiveShareRate !== null, "effectiveShareRate must be non-null when gross > 0");
  assert.equal(
    Number(details.summary.effectiveShareRate!.toFixed(4)),
    0.75,
    "effectiveShareRate must be expertShare / gross = 0.75",
  );
});

test("expert breakdown: tip_commission row is excluded from booking gross/fee/share", async () => {
  // At this point: one booking_commission row (+100 gross). Adding a tip must NOT inflate
  // the booking breakdown (tips are surfaced separately in totalTips and must not be
  // double-counted in grossBookingValue / expertShareFromRevenue).
  await insertPlatformRevenue({ gross: 10, platformFee: 0, expertShare: 10, sourceType: "tip_commission" });

  const details = await revenueTrackingService.getExpertRevenueDetails(expertId);
  assert.equal(
    Number(details.summary.grossBookingValue).toFixed(2),
    "100.00",
    "grossBookingValue must remain unchanged — tip_commission rows are excluded from the booking breakdown",
  );
  assert.equal(
    Number(details.summary.expertShareFromRevenue).toFixed(2),
    "75.00",
    "expertShareFromRevenue must remain unchanged — tips must not inflate the booking share",
  );
});

test("expert breakdown: reversal row nets the original booking to zero (double-entry semantics)", async () => {
  // Insert the compensating reversal for the booking_commission row: negative mirror.
  await insertPlatformRevenue({ gross: -100, platformFee: -25, expertShare: -75, sourceType: "booking_commission" });

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
    "effectiveShareRate must be null when net gross is zero",
  );
});

test("expert breakdown: partial refund leaves correct non-zero residual", async () => {
  // State so far: booking (+100) + reversal (-100) = 0; tip (excluded).
  // Add a new booking of 200 with a partial refund of 50.
  await insertPlatformRevenue({ gross: 200, platformFee: 50, expertShare: 150, sourceType: "booking_commission" });
  await insertPlatformRevenue({ gross: -50, platformFee: -12.5, expertShare: -37.5, sourceType: "booking_commission" });

  const details = await revenueTrackingService.getExpertRevenueDetails(expertId);
  // Net booking: 0 + 200 - 50 = 150 gross; 0 + 50 - 12.5 = 37.5 fee; 0 + 150 - 37.5 = 112.5 share
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
  assert.ok(details.summary.effectiveShareRate !== null, "effectiveShareRate must be non-null when net gross > 0");
  assert.equal(
    Number(details.summary.effectiveShareRate!.toFixed(4)),
    0.75,
    "effectiveShareRate must remain 75% after partial refund",
  );
});
