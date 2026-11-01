/**
 * Row 306 (CS-3 brief 10, E): the selection profile, server half.
 *
 *   · `selectionProfileOn()` is the ONE gate: the platform setting `selection_profile`, off unless it is exactly
 *     "true". While off nothing is written (`recordSelection` returns before any read) and nothing is read
 *     (`readSelectionTraits` returns no traits), so the planner and Optimize see no change.
 *   · `recordSelection` writes one `selection_events` row from a plan item: action, stop type (the item's coarse
 *     type), neighbourhood (from the item's point only when that point is NOT Google's — a Google point never
 *     feeds stored data), time of day and price band. It never throws: a failed log never fails the planner
 *     action that caused it (§15b).
 *   · `readSelectionTraits` is plain counts (`buildSelectionTraits`), no machine learning.
 *   · `resetSelectionProfile` deletes the traveler's own rows.
 */
import crypto from "node:crypto";
import { and, desc, eq, ilike } from "drizzle-orm";
import { db } from "../db";
import { cityNeighborhoods, selectionEvents, trips } from "@shared/schema";
import {
  buildSelectionTraits,
  SELECTION_PROFILE_FLAG,
  selectionNeighbourhood,
  selectionPriceBand,
  selectionStopType,
  selectionTimeOfDay,
  type SelectionAction,
  type SelectionRow,
  type SelectionTrait,
  type PriceBandBounds,
} from "@shared/selection-profile";
import { isNonGoogleCoordSource } from "@shared/item-coord-source";
import { placeServiceInNeighborhood, type NeighborhoodRow } from "@shared/neighborhood-placement";
import { getPlatformFlag } from "./platform-flags";
import { selectionPriceBandBounds, selectionProfileReadLimit, selectionTraitMinCount } from "../config/selection-profile.config";

export async function selectionProfileOn(): Promise<boolean> {
  return getPlatformFlag(SELECTION_PROFILE_FLAG, false);
}

/** What the row builder reads from a plan item. Its title, notes and description are never read. */
export interface SelectionItemInput {
  itemType?: string | null;
  startTime?: string | null;
  estimatedCost?: string | number | null;
  currency?: string | null;
  latitude?: string | number | null;
  longitude?: string | number | null;
  coordSource?: string | null;
}

/** One row from one item. A Google point gives no neighbourhood; an unknown value is null, never guessed. */
export function selectionRowFor(
  action: SelectionAction,
  item: SelectionItemInput | null,
  neighbourhoods: readonly NeighborhoodRow[],
  bounds: PriceBandBounds,
): SelectionRow {
  if (!item) return { action, stopType: null, neighbourhood: null, timeOfDay: null, priceBand: null };
  let neighbourhood: string | null = null;
  if (isNonGoogleCoordSource(item.coordSource)) {
    const id = placeServiceInNeighborhood({ neighborhood: null, latitude: item.latitude ?? null, longitude: item.longitude ?? null }, neighbourhoods);
    const row = id ? neighbourhoods.find((n) => n.id === id) : undefined;
    neighbourhood = selectionNeighbourhood(row?.slug);
  }
  return {
    action,
    stopType: selectionStopType(item.itemType),
    neighbourhood,
    timeOfDay: selectionTimeOfDay(item.startTime),
    priceBand: selectionPriceBand(item.estimatedCost, item.currency, bounds),
  };
}

async function neighbourhoodsForTrip(tripId: string | null | undefined): Promise<NeighborhoodRow[]> {
  if (!tripId) return [];
  const [trip] = await db.select({ destination: trips.destination }).from(trips).where(eq(trips.id, tripId)).limit(1);
  const city = (trip?.destination ?? "").split(",")[0].trim();
  if (!city) return [];
  return db
    .select({
      id: cityNeighborhoods.id,
      city: cityNeighborhoods.city,
      name: cityNeighborhoods.name,
      slug: cityNeighborhoods.slug,
      centroidLat: cityNeighborhoods.centroidLat,
      centroidLng: cityNeighborhoods.centroidLng,
      radiusKm: cityNeighborhoods.radiusKm,
    })
    .from(cityNeighborhoods)
    .where(ilike(cityNeighborhoods.city, city));
}

/**
 * Log one action. Off ⇒ returns false before reading anything. Never throws.
 * `item` is the plan item the action was about (absent for a move, a kept version or a search).
 */
export async function recordSelection(input: {
  userId: string | null | undefined;
  action: SelectionAction;
  tripId?: string | null;
  item?: SelectionItemInput | null;
}): Promise<boolean> {
  try {
    if (!input.userId) return false;
    if (!(await selectionProfileOn())) return false;
    const neighbourhoods = input.item ? await neighbourhoodsForTrip(input.tripId) : [];
    const row = selectionRowFor(input.action, input.item ?? null, neighbourhoods, selectionPriceBandBounds());
    await db.insert(selectionEvents).values({ id: crypto.randomUUID(), userId: input.userId, ...row });
    return true;
  } catch (err) {
    console.warn(`[selection-profile] log skipped (${(err as any)?.code ?? (err as any)?.name ?? "error"})`);
    return false;
  }
}

/** The traveler's traits. Off ⇒ none, without reading the table. */
export async function readSelectionTraits(userId: string | null | undefined): Promise<SelectionTrait[]> {
  if (!userId) return [];
  if (!(await selectionProfileOn())) return [];
  const rows = await db
    .select({
      action: selectionEvents.action,
      stopType: selectionEvents.stopType,
      neighbourhood: selectionEvents.neighbourhood,
      timeOfDay: selectionEvents.timeOfDay,
      priceBand: selectionEvents.priceBand,
    })
    .from(selectionEvents)
    .where(eq(selectionEvents.userId, userId))
    .orderBy(desc(selectionEvents.createdAt))
    .limit(selectionProfileReadLimit());
  return buildSelectionTraits(rows as SelectionRow[], selectionTraitMinCount());
}

/** Reset: delete the traveler's own rows. Returns how many were removed. */
export async function resetSelectionProfile(userId: string): Promise<number> {
  const removed = await db.delete(selectionEvents).where(and(eq(selectionEvents.userId, userId))).returning({ id: selectionEvents.id });
  return removed.length;
}
