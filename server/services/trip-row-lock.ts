/**
 * The one plan-row lock restore, apply-days, and every `itinerary_items` writer share
 * (Architect, 2026-10-25 21:15 ET, on PR #1704).
 *
 * `SELECT id FROM trips WHERE id = ? FOR UPDATE`. Call it as the first statement of the
 * write's transaction, before any item row is locked, so an edit cannot hold an item
 * while restore holds the plan. Locking the same row again in that transaction does not
 * wait (Postgres row locks reenter). A `SELECT … FOR UPDATE` outside a transaction does
 * not hold, so a writer that is not already inside one must open the transaction itself.
 */
import { sql } from "drizzle-orm";

export type TripLockExecutor = { execute: (query: any) => Promise<any> };

export async function lockTripRow(tx: TripLockExecutor, tripId: string): Promise<void> {
  if (!tripId) return;
  await tx.execute(sql`SELECT id FROM trips WHERE id = ${tripId} FOR UPDATE`);
}
