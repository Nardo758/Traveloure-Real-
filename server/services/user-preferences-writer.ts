/**
 * THE ONE WRITER OF `users.preferences` (ledger `2026-09-23-preferences-one-writer`).
 *
 * `users.preferences` is a namespaced jsonb: each surface owns one key (`settings`, `storefront`,
 * `travelPreferences`, `ea`, `travelerProfile`) and merges only that key. Every writer used to do it
 * the same way — SELECT the whole column, merge its key in JS, UPDATE the whole column — so two
 * saves racing on the same account each wrote back the copy they had read, and the later one
 * silently erased the earlier one's change, even when they owned different keys. Nothing errored and
 * nothing logged; the traveler's cover image, notification settings or travel style just reverted.
 *
 * The fix is a row lock, stated once. `updateUserPreferences` reads the column `FOR UPDATE` inside a
 * transaction, hands the locked value to the caller's pure merge, and writes the result in the same
 * transaction. A second writer on the same user waits at the SELECT until the first commits, then
 * merges onto what the first wrote. Each caller keeps its own merge rule verbatim — this changes WHEN
 * the value is read, never HOW a key is merged. §18 rule 1: one implementation, every writer a caller;
 * `scripts/check-preferences-writer.cjs` fails CI when a write to the column appears anywhere else.
 */
import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { users } from "@shared/schema";

export type UserPreferences = Record<string, any>;

export interface PreferencesWrite<T> {
  /** The whole next `users.preferences` value. */
  preferences: UserPreferences;
  /** Other `users` columns written in the SAME statement (e.g. `bio`, `emailBookingAlerts`). */
  columns?: Partial<typeof users.$inferInsert>;
  /** What the caller wants back — usually the merged sub-key it owns. */
  result: T;
}

/**
 * Locks the user's row, passes the current preferences (`{}` when unset) to `merge`, and writes
 * what it returns. Resolves to `merge`'s `result`, or `null` when no such user exists (nothing is
 * written). `merge` must be pure: it may run while other writers for this user are waiting.
 */
export async function updateUserPreferences<T>(
  userId: string,
  merge: (current: UserPreferences) => PreferencesWrite<T>,
): Promise<T | null> {
  return db.transaction(async (tx) => {
    const locked = await tx.execute(sql`SELECT preferences FROM users WHERE id = ${userId} FOR UPDATE`);
    const row = locked.rows[0] as { preferences: unknown } | undefined;
    if (!row) return null;
    const current = (row.preferences as UserPreferences | null) ?? {};
    const next = merge(current);
    await tx
      .update(users)
      .set({ ...(next.columns ?? {}), preferences: next.preferences })
      .where(eq(users.id, userId));
    return next.result;
  });
}
