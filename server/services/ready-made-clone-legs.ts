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
import { CACHEABLE_ROUTE_SOURCES, STRAIGHT_LINE_EST_SOURCE, type RoutePoint } from "@shared/routing-engine";
import { haversineMeters } from "@shared/geo";
import { normalizeLegMode, straightLineMinutes } from "@shared/travel-speeds";
import { formatDistance } from "./transport-leg-calculator";

type LegRow = typeof transportLegs.$inferSelect;
type AnchorRow = typeof temporalAnchors.$inferSelect;

/** R-ba: the leg `origin` a copy's carried leg is stamped with. */
export const AUTHOR_PICK_ORIGIN = "author_pick";

/** A leg the copy carries: trip-scoped and confirmed. Proposals are machine output, never sold. */
export function isCarriedLeg(leg: Pick<LegRow, "tripId" | "variantId" | "proposalStatus">): boolean {
  return !!leg.tripId && !leg.variantId && leg.proposalStatus === "confirmed";
}

/**
 * Ledger `2026-10-18-google-writers-open-coords` (decision-maker, Oct 18, 2026): may a copy carry this leg's ROUTED
 * numbers? Only when the leg was routed by a non-Google source (`CACHEABLE_ROUTE_SOURCES`) AND both its stored ends
 * are open coordinates — each item end equals that item's open point (`openPointsForItems`, the engine's resolver), an
 * airport end is IATA-stamped by construction. Anything else may hold Google minutes or a Google point. Pure.
 */
export function legFromOpenCoordinates(
  leg: Pick<LegRow, "source" | "fromActivityId" | "toActivityId" | "fromLat" | "fromLng" | "toLat" | "toLng">,
  openPoints: ReadonlyMap<string, RoutePoint>,
): boolean {
  if (!leg.source || !CACHEABLE_ROUTE_SOURCES.has(leg.source)) return false;
  const same = (a: unknown, b: number) => Number.isFinite(Number(a)) && Math.abs(Number(a) - b) < 1e-6;
  const endOpen = (id: string | null, lat: unknown, lng: unknown) => {
    if (!id) return false;
    if (id.startsWith("anchor:")) return Number.isFinite(Number(lat)) && Number.isFinite(Number(lng));
    const p = openPoints.get(id);
    return !!p && same(lat, p.lat) && same(lng, p.lng);
  };
  return endOpen(leg.fromActivityId, leg.fromLat, leg.fromLng) && endOpen(leg.toActivityId, leg.toLat, leg.toLng);
}

/**
 * One cloned leg, or null when either end does not resolve (or, for an estimate, when the leg stored no ends). Carries the geometry, the author's pick
 * (mode, tip, host pickup reference, their stated pickup point/time) and the checked stamp
 * (R-bf: "legs checked by {author}" stays true of the copy) and its routing source. Drops booking linkage
 * (`linkedProductId`/`Url`) and the re-check state, which belongs to the copy's own life (L1-5).
 */
export function buildClonedLeg(
  leg: LegRow,
  cloneTripId: string,
  itemIdMap: ReadonlyMap<string, string>,
  /** `legFromOpenCoordinates` for this leg. False (the default) ⇒ the copy carries the labelled estimate. */
  openCoordinates = false,
): typeof transportLegs.$inferInsert | null {
  const from = leg.fromActivityId ? itemIdMap.get(leg.fromActivityId) : undefined;
  const to = leg.toActivityId ? itemIdMap.get(leg.toActivityId) : undefined;
  if (!from || !to) return null;
  // Ledger `2026-10-18-google-writers-open-coords`: a leg not routed between open coordinates is carried as the
  // labelled straight-line ESTIMATE ("est.") — the author's pick, tip and pickup kept, the minutes, distance and
  // alternatives (which may be Google's) replaced by the one configured speed for its mode. A leg with no stored ends
  // has nothing to estimate from and is not carried (the copy's engine routes or bridges that pair, §13).
  let est: { meters: number; minutes: number } | null = null;
  if (!openCoordinates) {
    if (![leg.fromLat, leg.fromLng, leg.toLat, leg.toLng].every((v) => v != null && Number.isFinite(Number(v)))) return null;
    const meters = Math.round(haversineMeters(Number(leg.fromLat), Number(leg.fromLng), Number(leg.toLat), Number(leg.toLng)));
    est = { meters, minutes: straightLineMinutes(meters, normalizeLegMode(leg.userSelectedMode ?? leg.recommendedMode) ?? "drive") };
  }
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
    distanceMeters: est ? est.meters : leg.distanceMeters,
    distanceDisplay: est ? formatDistance(est.meters) : leg.distanceDisplay,
    recommendedMode: leg.recommendedMode,
    userSelectedMode: leg.userSelectedMode,
    estimatedDurationMinutes: est ? est.minutes : leg.estimatedDurationMinutes,
    estimatedCostUsd: leg.estimatedCostUsd,
    alternativeModes: est ? [] : leg.alternativeModes,
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
    // 9b-b (Phase 0 ruling 5, ledger `2026-10-16-9b-b-legs-off-google`): routed = `source` set, and a copy keeps
    // it — with the departure it was routed for (migration 386) — so a copied routed leg stays routed and the
    // rebuild finds a Google-sourced copy by the same predicate as its original.
    source: est ? STRAIGHT_LINE_EST_SOURCE : leg.source,
    routedDepartureLocal: est ? null : leg.routedDepartureLocal,
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
