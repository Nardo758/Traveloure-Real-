/**
 * Bootstrap for booking_fee_configs — Task #1036 (DECISIONS.md ruling 32).
 *
 * SURFACE DECLARATION (ruling 32): booking_fee_configs percent rows back the
 * transport/service booking commission layer (runtime lookups introduced with
 * migration 031). The 'default' category row is that layer's catch-all split.
 *
 * This function is the documented BOOTSTRAP THAT CREATES THE SOURCE OF TRUTH:
 * on a fresh database it inserts the canonical default row (platform 25% /
 * expert 75%, mirroring the fee_bands expert_standard seed of migrations
 * 033/174). It NEVER updates an existing row — ON CONFLICT DO NOTHING — so an
 * admin edit to any value can never be clobbered by a restart. (The historical
 * one-time 70/30 → 75/25 policy backfill moved to migration 175; it used to run
 * here on every boot, which was exactly the clobber hazard.)
 *
 * DB-backed guarantees are asserted in
 * server/__tests__/booking-fee-bootstrap-and-split-fallback.db.test.ts.
 */
import { db } from "../db";
import { sql } from "drizzle-orm";

export async function ensureDefaultBookingFeeConfig(): Promise<void> {
  // fee-literal-ok: bootstrap seed that CREATES the booking_fee_configs source of
  // truth on an empty DB (ruling 32 surface declaration above); never overwrites.
  await db.execute(sql`
    INSERT INTO booking_fee_configs
      (id, category, platform_fee_percent, expert_share_percent, ai_keeps_100, is_active, created_at, updated_at)
    VALUES
      (gen_random_uuid(), 'default', 25, 75, true, true, NOW(), NOW())
    ON CONFLICT (category) DO NOTHING
  `);
}
