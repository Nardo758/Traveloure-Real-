/**
 * R-ba / R-bg (work plan L1-3): what a buyer's copy of a Ready Made Trip carries besides its items —
 * the author's CONFIRMED trip-scoped legs and the build's temporal anchors. Pure builders; the clone
 * (`fulfillReadyMadePurchase`) inserts their output inside its pre-claim build step, so a lost claim's
 * orphan delete cascades them away with the trip (both tables' `trip_id` FKs are ON DELETE CASCADE).
 *
 * Item ids change in a clone, so every reference to an item goes through `itemIdMap` (source id →
 * clone id). A reference the map cannot resolve is DROPPED, never pointed at a guessed item (§13): a
 * leg whose either end is unresolvable is not copied at all.
 *
 * Shared on purpose: clone-and-adapt (L1-12) duplicates a build through the same two builders
 * (§18 rule 1).
 */
import type { temporalAnchors, transportLegs } from "@shared/schema";

type LegRow = typeof transportLegs.$inferSelect;
type AnchorRow = typeof temporalAnchors.$inferSelect;

/** R-ba: the leg `origin` a copy's carried leg is stamped with. */
export const AUTHOR_PICK_ORIGIN = "author_pick";

/** A leg the copy carries: trip-scoped and confirmed. Proposals are machine output, never sold. */
export function isCarriedLeg(leg: Pick<LegRow, "tripId" | "variantId" | "proposalStatus">): boolean {
  return !!leg.tripId && !leg.variantId && leg.proposalStatus === "confirmed";
}

/**
 * One cloned leg, or null when either end does not resolve. Carries the geometry, the author's pick
 * (mode, tip, host pickup reference, their stated pickup point/time) and the checked stamp
 * (R-bf: "legs checked by {author}" stays true of the copy). Drops booking linkage
 * (`linkedProductId`/`Url`) and the re-check state, which belongs to the copy's own life (L1-5).
 */
export function buildClonedLeg(
  leg: LegRow,
  cloneTripId: string,
  itemIdMap: ReadonlyMap<string, string>,
): typeof transportLegs.$inferInsert | null {
  const from = leg.fromActivityId ? itemIdMap.get(leg.fromActivityId) : undefined;
  const to = leg.toActivityId ? itemIdMap.get(leg.toActivityId) : undefined;
  if (!from || !to) return null;
  return {
    tripId: cloneTripId,
    variantId: null,
    dayNumber: leg.dayNumber,
    legOrder: leg.legOrder,
    fromActivityId: from,
    fromName: leg.fromName,
    fromLat: leg.fromLat,
    fromLng: leg.fromLng,
    toActivityId: to,
    toName: leg.toName,
    toLat: leg.toLat,
    toLng: leg.toLng,
    distanceMeters: leg.distanceMeters,
    distanceDisplay: leg.distanceDisplay,
    recommendedMode: leg.recommendedMode,
    userSelectedMode: leg.userSelectedMode,
    estimatedDurationMinutes: leg.estimatedDurationMinutes,
    estimatedCostUsd: leg.estimatedCostUsd,
    alternativeModes: leg.alternativeModes,
    energyCost: leg.energyCost,
    destinationProfile: leg.destinationProfile,
    pickupPoint: leg.pickupPoint,
    pickupTime: leg.pickupTime,
    proposalStatus: "confirmed",
    authorTip: leg.authorTip,
    pickupProviderServiceId: leg.pickupProviderServiceId,
    checkedBy: leg.checkedBy,
    checkedAt: leg.checkedAt,
    origin: AUTHOR_PICK_ORIGIN,
  };
}

/** Midnight UTC of a `YYYY-MM-DD` plan date. */
function dayStartUtc(date: string): number {
  return Date.parse(`${date.slice(0, 10)}T00:00:00Z`);
}

/**
 * R-bg: an anchor's DAY is its offset from the build's synthetic `start_date`; the copy re-materialises
 * it against the copy's own start date, keeping the wall-clock time of day. The copy's dates are a
 * placeholder until the buyer confirms them (`dates_confirmed_at` NULL), and so are its anchors.
 *
 * Not carried: `userExperienceId` (events are not part of a clone). `dependsOnItemIds` is remapped and
 * an id that does not resolve is dropped.
 */
export function buildClonedAnchor(
  anchor: AnchorRow,
  cloneTripId: string,
  sourceStartDate: string,
  cloneStartDate: string,
  itemIdMap: ReadonlyMap<string, string>,
  /**
   * The copy trip's own `created_at`. A cloned anchor is stamped with EXACTLY this instant, so a later
   * reader can tell the template's anchors (created_at = the copy's) from anchors the buyer added
   * (always later) without a new column — the first re-date moves only the former (L1-4).
   */
  cloneCreatedAt?: Date | null,
): typeof temporalAnchors.$inferInsert {
  const offsetMs = new Date(anchor.anchorDatetime as any).getTime() - dayStartUtc(sourceStartDate);
  const deps = Array.isArray(anchor.dependsOnItemIds) ? (anchor.dependsOnItemIds as unknown[]) : [];
  return {
    tripId: cloneTripId,
    userExperienceId: null,
    anchorType: anchor.anchorType,
    anchorDatetime: new Date(dayStartUtc(cloneStartDate) + offsetMs),
    bufferBefore: anchor.bufferBefore,
    bufferAfter: anchor.bufferAfter,
    location: anchor.location,
    latitude: anchor.latitude,
    longitude: anchor.longitude,
    radiusKm: anchor.radiusKm,
    mustReturnToHotel: anchor.mustReturnToHotel,
    isImmovable: anchor.isImmovable,
    dependsOnItemIds: deps
      .map((id) => (typeof id === "string" ? itemIdMap.get(id) : undefined))
      .filter((id): id is string => !!id),
    description: anchor.description,
    ...(cloneCreatedAt ? { createdAt: cloneCreatedAt } : {}),
  };
}
