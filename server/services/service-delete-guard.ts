/**
 * Financial-history guard for provider_services deletes.
 *
 * service_bookings.service_id → provider_services.id is ON DELETE CASCADE, so a hard delete
 * silently destroys historical booking rows AND the platform_fee revenue snapshots the
 * revenue dashboard sums. Property (product_shape='property'), room ('property_room') and
 * bundle ('bundle') rows live in the SAME provider_services table, so every delete surface —
 * not just the main service delete — must run through this guard.
 *
 * Behavior (mirrors the admin DELETE /api/admin/services/:id and provider
 * DELETE /api/provider/services/:id fixes): if any service_bookings reference the row,
 * soft-delete instead — set status='suspended' so the listing drops off public surfaces while
 * every historical record keeps its FK reference. Otherwise hard-delete.
 *
 * Runs in a single transaction with the row locked FOR UPDATE: a concurrent checkout's
 * booking INSERT takes a FK KEY SHARE lock on this row, which conflicts with FOR UPDATE, so
 * it blocks until we commit — a booking can never slip in between the count and the delete
 * (post-delete it fails the FK honestly).
 */
import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { providerServices, serviceBookings } from "@shared/schema";

export interface GuardedDeleteOutcome {
  /** true ⇒ row had bookings and was suspended instead of deleted. */
  softDeleted: boolean;
  bookingCount: number;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Delete a provider_services row, soft-deleting (suspend) when bookings reference it.
 * `extraInTx`, when provided, runs inside the same transaction after the delete/suspend —
 * use it for sibling writes that must be atomic with the delete (e.g. re-entering a parent
 * property's review when a room is removed).
 */
export async function guardedDeleteProviderService(
  serviceId: string,
  extraInTx?: (tx: Tx, outcome: GuardedDeleteOutcome) => Promise<void>,
): Promise<GuardedDeleteOutcome> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM provider_services WHERE id = ${serviceId} FOR UPDATE`);
    const [{ bookingCount }] = await tx
      .select({ bookingCount: sql<number>`count(*)::int` })
      .from(serviceBookings)
      .where(eq(serviceBookings.serviceId, serviceId));
    let outcome: GuardedDeleteOutcome;
    if (bookingCount > 0) {
      await tx
        .update(providerServices)
        .set({ status: "suspended", updatedAt: new Date() })
        .where(eq(providerServices.id, serviceId));
      outcome = { softDeleted: true, bookingCount };
    } else {
      await tx.delete(providerServices).where(eq(providerServices.id, serviceId));
      outcome = { softDeleted: false, bookingCount: 0 };
    }
    if (extraInTx) await extraInTx(tx, outcome);
    return outcome;
  });
}

/** Standard user-facing message when a delete was converted to an archive. */
export function softDeleteMessage(kind: string, bookingCount: number): string {
  return `${kind} has ${bookingCount} booking(s) — it was archived (suspended) instead of deleted so booking history stays intact.`;
}
