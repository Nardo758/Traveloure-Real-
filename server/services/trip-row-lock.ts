/**
 * The plan-row lock item edit, item delete, apply-days, and restore share
 * (Architect, 2026-10-25 22:00 ET, on PR #1704).
 *
 * `SELECT id FROM trips WHERE id = ? FOR NO KEY UPDATE`. Same strength as the
 * `SELECT finalized_at` / `SELECT id` locks in apply-days, retime, and restore, so those
 * writers conflict with each other. `FOR NO KEY UPDATE` does not block a foreign-key
 * check's `FOR KEY SHARE` on this row. Call it as the first lock of the write's
 * transaction, before any item row is locked. Locking the same row again in that
 * transaction does not wait. A `SELECT … FOR NO KEY UPDATE` outside a transaction does
 * not hold, so a writer that is not already inside one must open the transaction itself.
 */
import { sql } from "drizzle-orm";

export type TripLockExecutor = { execute: (query: any) => Promise<any> };

export async function lockTripRow(tx: TripLockExecutor, tripId: string): Promise<void> {
  if (!tripId) return;
  await tx.execute(sql`SELECT id FROM trips WHERE id = ${tripId} FOR NO KEY UPDATE`);
}
