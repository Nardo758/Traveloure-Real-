/**
 * R-ba (work plan L1-4): on a buyer's copy of a Ready Made Trip, the first leg of day 1 and the last
 * leg of the last day are re-routed to the buyer's own stay; every other leg stays the author's pick.
 *
 * WHAT A "COPY" IS: a plan carrying a leg whose `origin` is `author_pick` or `rerouted_for_stay` (the
 * plan's own words: "on a copy (origin present on any leg)"). Anything else is never touched.
 *
 * WHAT "THE STAY" IS: a `hotel_checkin` / `hotel_checkout` temporal anchor with a real coordinate —
 * the plan's "lodging anchor". Check-in is where day 1 starts; check-out (else check-in) is where the
 * last day ends. An anchor with no coordinate is no stay point (§13 — never a city centre).
 *   STATED LIMIT: the where-to-stay chooser sets a stay as a lodging ITEM through an option set and
 *   writes no such anchor, and a Places coordinate is never written onto an item row (LD 57). So a
 *   stay chosen there does not re-route yet; that needs its own ruling.
 *
 * WHAT IS REPLACED: the day's end leg is removed only when it touches a LODGING item at that end
 * (`isLodgingItem`) — the author's own placeholder stay — so an author's pick between two real stops
 * is never deleted. On a later change of stay, the earlier `rerouted_for_stay` leg at each end is the
 * one replaced (its mode kept), so legs never stack. The new legs go from the stay to the first located non-lodging stop
 * of day 1, and from the last located non-lodging stop of the last day back to the stay, in the
 * removed leg's mode through the travel-time service when it is on and the mode is selectable, else
 * the engine's recommendation; an end leg whose replacement cannot be computed is KEPT. They are
 * `confirmed` and `origin='rerouted_for_stay'` ("re-routed for your stay"), with no item on the stay
 * end (`from/to_activity_id` NULL).
 *
 * Never throws into its caller's write (§15b): the anchor route calls it best-effort.
 */
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../db";
import { temporalAnchors, transportLegs, trips } from "@shared/schema";
import { isLodgingItem } from "@shared/where-to-stay";
import { storage } from "../storage";
import { computeTransportLeg } from "./transport-leg-calculator";
import { SELECTABLE_TRANSPORT_MODES, recomputeLegForMode } from "./trip-transport-legs.service";
import { AUTHOR_PICK_ORIGIN } from "./ready-made-clone-legs";

export const REROUTED_FOR_STAY_ORIGIN = "rerouted_for_stay";
export const STAY_ANCHOR_TYPES = ["hotel_checkin", "hotel_checkout"] as const;

export type StayPoint = { name: string; lat: number; lng: number };

function point(lat: unknown, lng: unknown): { lat: number; lng: number } | null {
  const la = Number(lat);
  const ln = Number(lng);
  if (lat == null || lng == null || !Number.isFinite(la) || !Number.isFinite(ln)) return null;
  if (Math.abs(la) > 90 || Math.abs(ln) > 180 || (la === 0 && ln === 0)) return null;
  return { lat: la, lng: ln };
}

/** The stay's start and end points from the plan's hotel anchors (latest of each type wins). */
export function stayPointsFromAnchors(
  anchors: ReadonlyArray<{ anchorType: string; latitude: unknown; longitude: unknown; location: string | null; updatedAt?: Date | null }>,
): { start: StayPoint | null; end: StayPoint | null } {
  const latest = (type: string): StayPoint | null => {
    const rows = anchors
      .filter((a) => a.anchorType === type && point(a.latitude, a.longitude))
      .sort((a, b) => new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime());
    const a = rows[0];
    if (!a) return null;
    const p = point(a.latitude, a.longitude)!;
    return { name: a.location?.trim() || "Your stay", ...p };
  };
  const start = latest("hotel_checkin");
  return { start, end: latest("hotel_checkout") ?? start };
}

export type RerouteResult =
  | { rerouted: number; removed: number }
  | { skipped: "not_a_copy" | "no_located_stay" | "no_located_stops" };

export async function rerouteCopyForStay(tripId: string): Promise<RerouteResult> {
  const legs = await db
    .select()
    .from(transportLegs)
    .where(and(eq(transportLegs.tripId, tripId), isNull(transportLegs.variantId)));
  if (!legs.some((l) => l.origin === AUTHOR_PICK_ORIGIN || l.origin === REROUTED_FOR_STAY_ORIGIN)) {
    return { skipped: "not_a_copy" };
  }
  const anchors = await db
    .select()
    .from(temporalAnchors)
    .where(and(eq(temporalAnchors.tripId, tripId), inArray(temporalAnchors.anchorType, [...STAY_ANCHOR_TYPES])));
  const stay = stayPointsFromAnchors(anchors);
  if (!stay.start || !stay.end) return { skipped: "no_located_stay" };

  const items = await storage.getItineraryItems(tripId);
  if (items.length === 0) return { skipped: "no_located_stops" };
  const days = Array.from(new Set(items.map((i) => i.dayNumber))).sort((a, b) => a - b);
  const firstDay = items.filter((i) => i.dayNumber === days[0]);
  const lastDay = items.filter((i) => i.dayNumber === days[days.length - 1]);
  const located = (i: any) => !isLodgingItem({ type: i.itemType, title: i.title }) && point(i.latitude, i.longitude);
  const firstStop = firstDay.find(located) as any;
  const lastStop = [...lastDay].reverse().find(located) as any;
  if (!firstStop || !lastStop) return { skipped: "no_located_stops" };

  // The legs this replaces: earlier re-routes, and an end leg that touches a lodging item.
  const lodgingIds = new Set(items.filter((i) => isLodgingItem({ type: i.itemType, title: i.title })).map((i) => i.id));
  const firstItem = firstDay[0];
  const lastItem = lastDay[lastDay.length - 1];
  // The leg each end replaces: an earlier re-route at that end, else the author's leg from/to a
  // lodging item. Its mode is the one the new leg keeps.
  const prevStart = legs.find((l) => l.origin === REROUTED_FOR_STAY_ORIGIN && l.fromActivityId === null);
  const prevEnd = legs.find((l) => l.origin === REROUTED_FOR_STAY_ORIGIN && l.toActivityId === null);
  const startLeg = prevStart ?? legs.find((l) => l.dayNumber === days[0] && l.fromActivityId === firstItem.id && lodgingIds.has(firstItem.id));
  const endLeg = prevEnd ?? legs.find((l) => l.dayNumber === days[days.length - 1] && l.toActivityId === lastItem.id && lodgingIds.has(lastItem.id));
  const [trip] = await db.select({ destination: trips.destination, marketSlug: trips.marketSlug }).from(trips).where(eq(trips.id, tripId)).limit(1);
  const destination = trip?.destination ?? "";
  const build = async (
    from: { id: string | null; name: string; lat: number; lng: number },
    to: { id: string | null; name: string; lat: number; lng: number },
    dayNumber: number,
    legOrder: number,
    authorMode: string | null | undefined,
  ): Promise<typeof transportLegs.$inferInsert | null> => {
    const ends = {
      tripId,
      variantId: null,
      dayNumber,
      legOrder,
      fromActivityId: from.id,
      fromName: from.name,
      fromLat: from.lat,
      fromLng: from.lng,
      toActivityId: to.id,
      toName: to.name,
      toLat: to.lat,
      toLng: to.lng,
      destinationProfile: destination || null,
      proposalStatus: "confirmed",
      origin: REROUTED_FOR_STAY_ORIGIN,
    } as const;
    // The plan's route: the ONE travel-time service in the author's mode (Routes → matrix → the
    // labelled straight-line estimate). Null when the service is off or the mode is not selectable.
    const mode = authorMode && SELECTABLE_TRANSPORT_MODES.includes(authorMode) ? authorMode : null;
    const timed = mode
      ? await recomputeLegForMode({ fromLat: from.lat, fromLng: from.lng, toLat: to.lat, toLng: to.lng }, mode, trip?.marketSlug ?? null)
      : null;
    if (timed && mode) {
      return { ...ends, ...timed, recommendedMode: mode, userSelectedMode: mode };
    }
    // Else the engine's own recommendation (its driving route). Null without a route — then the
    // caller keeps the leg it would have replaced rather than leave an invented one (§13).
    const loc = (p: typeof from, order: number) => ({ id: p.id ?? "stay", name: p.name, lat: p.lat, lng: p.lng, scheduledTime: "", dayNumber, order });
    const engine = await computeTransportLeg(loc(from, 0), loc(to, 1), dayNumber, legOrder, destination);
    if (!engine) return null;
    return {
      ...ends,
      distanceMeters: engine.distanceMeters,
      distanceDisplay: engine.distanceDisplay,
      recommendedMode: engine.recommendedMode,
      userSelectedMode: mode,
      estimatedDurationMinutes: engine.estimatedDurationMinutes,
      estimatedCostUsd: engine.estimatedCostUsd ?? null,
      alternativeModes: engine.alternativeModes,
      energyCost: engine.energyCost,
    };
  };

  const firstPoint = { id: firstStop.id, name: firstStop.title, ...point(firstStop.latitude, firstStop.longitude)! };
  const lastPoint = { id: lastStop.id, name: lastStop.title, ...point(lastStop.latitude, lastStop.longitude)! };
  const [startRow, endRow] = await Promise.all([
    build({ id: null, ...stay.start }, firstPoint, days[0], -1, startLeg?.userSelectedMode),
    build(lastPoint, { id: null, ...stay.end }, days[days.length - 1], lastDay.length, endLeg?.userSelectedMode),
  ]);
  const rows = [startRow, endRow].filter((r): r is NonNullable<typeof r> => r !== null);
  // A replaced leg (an earlier re-route or the author's lodging end leg) goes only when its
  // replacement was computed, so a stay change never leaves an end with no leg it used to have.
  const removeIds = [
    ...(startLeg && startRow ? [startLeg.id] : []),
    ...(endLeg && endRow ? [endLeg.id] : []),
  ];

  await db.transaction(async (tx) => {
    if (removeIds.length) {
      await tx.delete(transportLegs).where(and(eq(transportLegs.tripId, tripId), inArray(transportLegs.id, removeIds)));
    }
    if (rows.length) await tx.insert(transportLegs).values(rows);
  });
  return { rerouted: rows.length, removed: removeIds.length };
}

/** The anchor route's best-effort hook: a stay anchor changed on a copy. Never throws (§15b). */
export async function rerouteAfterStayAnchor(tripId: string, anchorType: string | null | undefined): Promise<void> {
  if (!anchorType || !(STAY_ANCHOR_TYPES as readonly string[]).includes(anchorType)) return;
  try {
    await rerouteCopyForStay(tripId);
  } catch (err) {
    console.error(`[stay-reroute] failed plan_id=${tripId}:`, (err as Error)?.message ?? err);
  }
}
