/**
 * Smoke 10 S10-5 (ledger `2026-10-04-smoke10-fixes`): after an item's start time is edited, its day is
 * re-sorted by time through the ONE ordering rule (`orderDayByTime`, shared). Only `sort_order` is
 * written, and only on rows whose position changed; untimed stops keep their place. Never throws — a
 * failed re-sort leaves the edit standing (§15b: the ordering is ancillary to the edit).
 */
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { itineraryItems } from "@shared/schema";
import { orderDayByTime } from "@shared/day-order";

export async function resortDayByTime(tripId: string, dayNumber: number | null | undefined): Promise<number> {
  if (dayNumber == null) return 0;
  try {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM trips WHERE id = ${tripId} FOR UPDATE`);
      const rows = await tx
        .select({ id: itineraryItems.id, startTime: itineraryItems.startTime, sortOrder: itineraryItems.sortOrder })
        .from(itineraryItems)
        .where(and(eq(itineraryItems.tripId, tripId), eq(itineraryItems.dayNumber, dayNumber)))
        .orderBy(asc(itineraryItems.sortOrder), asc(itineraryItems.createdAt));
      const order = orderDayByTime(rows);
      let moved = 0;
      for (let i = 0; i < order.length; i++) {
        const row = rows.find((r) => r.id === order[i])!;
        if (row.sortOrder === i) continue;
        await tx.update(itineraryItems).set({ sortOrder: i }).where(and(eq(itineraryItems.id, row.id), eq(itineraryItems.tripId, tripId)));
        moved++;
      }
      return moved;
    });
  } catch (err) {
    console.error(`[day-order] resort failed plan_id=${tripId} day=${dayNumber}:`, (err as Error)?.message ?? err);
    return 0;
  }
}
