/**
 * Item locks — ruling R-ah (ledger `2026-10-03-item-locks`, migration 342). The ONE writer of
 * `itinerary_items.locked_at` besides the Moment default (`stampMomentLock`, below).
 *
 *   setItemLock     the owner's "Keep this" / "Unlock". ONE atomic UPDATE keyed on item + trip, so
 *                   an item on another plan is not found (one 404 — LD 40's sentence). Locking an
 *                   already-locked row keeps its first instant (`COALESCE`); unlocking clears it.
 *   stampMomentLock the Moment default: the item a Moment plan is built around is locked when it
 *                   becomes that anchor. Never overwrites an existing lock and never re-locks
 *                   something an owner unlocked unless it is made the anchor again.
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { itineraryItems } from "@shared/schema";
import { experienceGroupFor } from "@shared/experience-group";
import { storage } from "../storage";
import { readPlanPenOccasionSlug } from "./plan-pen-occasion.service";
import { trips } from "@shared/schema";

export async function setItemLock(input: { tripId: string; itemId: string; locked: boolean }): Promise<{ locked: boolean } | null> {
  const [row] = await db
    .update(itineraryItems)
    .set({
      lockedAt: input.locked ? sql`COALESCE(${itineraryItems.lockedAt}, NOW())` : null,
      updatedAt: new Date(),
    } as any)
    .where(and(eq(itineraryItems.id, input.itemId), eq(itineraryItems.tripId, input.tripId)))
    .returning({ lockedAt: itineraryItems.lockedAt });
  if (!row) return null;
  return { locked: row.lockedAt != null };
}

/** Is this plan a Moment? The same occasion resolution `lodgingAnchorRole` reads (no new rule). */
export async function planIsMoment(tripId: string): Promise<boolean> {
  const [trip] = await db.select({ userId: trips.userId }).from(trips).where(eq(trips.id, tripId)).limit(1);
  const slug = await readPlanPenOccasionSlug(trip?.userId, tripId);
  const row = slug ? await storage.getExperienceTypeBySlug(slug) : null;
  return experienceGroupFor(row as any) === "moments";
}

/** Lock the item a Moment plan is built around, inside the caller's transaction. */
export async function stampMomentLock(tx: any, itemId: string): Promise<void> {
  await tx
    .update(itineraryItems)
    .set({ lockedAt: sql`COALESCE(${itineraryItems.lockedAt}, NOW())` } as any)
    .where(eq(itineraryItems.id, itemId));
}
