/**
 * daily_revenue_summary — ONE atomic upsert, never a check-then-insert (§15).
 *
 * Ledger `2026-09-16-ci-main-red-repairs` (punchlist V-34). `storage.updateDailyRevenueSummary`
 * used to SELECT the day's row and then either UPDATE it or INSERT it — the check-then-insert §15
 * names as the TOCTOU bug, not a guard. Two writers landing on a date with no row yet both saw
 * "absent", both INSERTed, and the loser died on `daily_revenue_summary_date_unique`. It surfaced
 * in CI, where `suite-server-routes-migrations` runs the three revenue-dedup vitest suites in
 * PARALLEL worker processes and each one's first genuine `insertPlatformRevenueOnce` writes
 * TODAY's summary row; it was never seen in production only because the row for a given day is
 * created once and then updated.
 *
 * The writer is now `INSERT … ON CONFLICT (date) DO UPDATE SET total_* = total_* + excluded.total_*,
 * transaction_count = transaction_count + 1` — the same shape the cart-confirm rollup in
 * `storage.ts` already used, so the two rollups are one shape. The UNIQUE constraint the old code
 * tripped over is the one the upsert now targets; no schema change.
 *
 * THIS PROOF IS DELIBERATELY CONCURRENT AND DELIBERATELY DETERMINISTIC ABOUT ITS DATE: eight
 * writers race a date no other test touches (a per-run day in 1901, cleaned up either side), so
 * the assertion is "one row, eight increments, zero rejections" and not "today's row happened to
 * be there already". Against the pre-fix check-then-insert this fails with the unique violation.
 *
 * Runs in `suite-server-routes-migrations` alongside the three dedup suites — the exact
 * parallel shape that exposed the race.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "../../db";
import { storage } from "../../storage";

// A date no live path writes to, unique per run so parallel CI runs never share a row.
// 1901-01-01 + (0..29999) days stays inside 1901..1983.
const OFFSET_DAYS = Math.floor(Math.random() * 30000);
const RUN_DATE = new Date(Date.UTC(1901, 0, 1) + OFFSET_DAYS * 86_400_000).toISOString().slice(0, 10);

async function readRow(date: string) {
  const r = await db.execute(
    sql`SELECT total_gross, total_platform_fee, total_net, transaction_count
          FROM daily_revenue_summary WHERE date = ${date}`,
  );
  return r.rows as Array<{ total_gross: string; total_platform_fee: string; total_net: string; transaction_count: number }>;
}

async function cleanup(date: string) {
  await db.execute(sql`DELETE FROM daily_revenue_summary WHERE date = ${date}`);
}

describe("daily_revenue_summary upsert — §15 (ledger 2026-09-16-ci-main-red-repairs, V-34)", () => {
  beforeEach(async () => { await cleanup(RUN_DATE); });
  afterEach(async () => { await cleanup(RUN_DATE); });

  it("U1: eight concurrent first-writers on an absent date produce ONE row carrying all eight increments and no rejection", async () => {
    const WRITERS = 8;
    const results = await Promise.allSettled(
      Array.from({ length: WRITERS }, () =>
        storage.updateDailyRevenueSummary(RUN_DATE, {
          totalGross: "10.00",
          totalPlatformFee: "1.00",
          totalNet: "0.90",
        }),
      ),
    );
    const rejected = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    expect(rejected.map((r) => String(r.reason))).toEqual([]);

    const rows = await readRow(RUN_DATE);
    expect(rows).toHaveLength(1);
    expect(rows[0].transaction_count).toBe(WRITERS);
    expect(Number(rows[0].total_gross)).toBeCloseTo(10 * WRITERS, 2);
    expect(Number(rows[0].total_platform_fee)).toBeCloseTo(1 * WRITERS, 2);
    expect(Number(rows[0].total_net)).toBeCloseTo(0.9 * WRITERS, 2);
  });

  it("U2: every writer receives the row it contributed to (the returned row is the date's row)", async () => {
    const [a, b] = await Promise.all([
      storage.updateDailyRevenueSummary(RUN_DATE, { totalGross: "5.00", totalPlatformFee: "0.50", totalNet: "0.45" }),
      storage.updateDailyRevenueSummary(RUN_DATE, { totalGross: "5.00", totalPlatformFee: "0.50", totalNet: "0.45" }),
    ]);
    expect(a.date).toBe(RUN_DATE);
    expect(b.date).toBe(RUN_DATE);
    expect(a.id).toBe(b.id);
    const rows = await readRow(RUN_DATE);
    expect(rows).toHaveLength(1);
    expect(rows[0].transaction_count).toBe(2);
  });

  it("U3: a writer that omits a total adds NOTHING to it — never NULLs the running sum (§13: an unstated increment is zero, not unknown)", async () => {
    await storage.updateDailyRevenueSummary(RUN_DATE, { totalGross: "7.00", totalPlatformFee: "0.70", totalNet: "0.63" });
    await storage.updateDailyRevenueSummary(RUN_DATE, { totalGross: "3.00" });
    const rows = await readRow(RUN_DATE);
    expect(rows).toHaveLength(1);
    expect(rows[0].transaction_count).toBe(2);
    expect(Number(rows[0].total_gross)).toBeCloseTo(10, 2);
    expect(Number(rows[0].total_platform_fee)).toBeCloseTo(0.7, 2);
    expect(Number(rows[0].total_net)).toBeCloseTo(0.63, 2);
  });
});
