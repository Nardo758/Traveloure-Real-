/**
 * R-ba (work plan L1-4): on a buyer's copy of a Ready Made Trip, the first leg of day 1 and the last
 * leg of the last day are re-routed to the buyer's own stay; every other leg stays the author's pick.
 *
 * WHAT A "COPY" IS: a plan carrying a leg whose `origin` is `author_pick` or `rerouted_for_stay` (the
 * plan's own words: "on a copy (origin present on any leg)"). Anything else is never touched.
 *
 * WHAT "THE STAY" IS (decision-maker, Oct 4, 2026 — ledger `2026-10-04-stay-item-reroute`; no hotel
 * anchor): the plan's STAY ITEM, read by ONE function, `stayPointForPlan` —
 *   · the item a CHOSEN accommodation option set put on the plan (the where-to-stay chooser, a stay
 *     typed by name, or "Set as where you're staying"), primary set first; else
 *   · the latest hand-added accommodation item that is not the author's (`origin` not `expert`, so a
 *     copy's own placeholder ryokan is never mistaken for the buyer's stay);
 * and its point is the item row's OWN coordinate when trusted (`rowCoordinatesTrusted`); only when the
 * item has none does it take its Google `location` fact — exactly the pin the plancard draws
 * (`applyGooglePins`, §18 rule 1). No point ⇒ no re-route (§13 — never a city centre). The stay is
 * where day 1 starts and the last day ends.
 *
 * GOOGLE COORDINATES ON A LEG (decision-maker ruling, Oct 4, 2026 — LD 57 extends to transport_legs;
 * ledger `2026-10-04-leg-google-coords`, migration 350): `from/to_lat/lng` are NOT NULL, so a leg built
 * from a Google pin holds it. That leg says so — `coord_source = 'google'` and `coord_fetched_at` = the
 * fact's fetch time — so the coordinate is a CACHE (max 30 days) that a scheduled job refreshes or
 * clears. A leg built from the item's own coordinate carries NULL in both.
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
import { and, asc, desc, eq, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import { db } from "../db";
import { itineraryItems, planOptionSets, transportLegs, trips } from "@shared/schema";
import { isLodgingItem } from "@shared/where-to-stay";
import { applyGooglePins, rowCoordinatesTrusted } from "@shared/ai-place-text";
import { factsForTrip } from "./content-facts/place-facts.service";
import { storage } from "../storage";
import { computeTransportLeg } from "./transport-leg-calculator";
import { SELECTABLE_TRANSPORT_MODES, recomputeLegForMode } from "./trip-transport-legs.service";
import { AUTHOR_PICK_ORIGIN } from "./ready-made-clone-legs";

export const REROUTED_FOR_STAY_ORIGIN = "rerouted_for_stay";
export type StayPoint = {
  itemId: string;
  name: string;
  lat: number;
  lng: number;
  /** `item` = the stay row's own coordinate; `google` = its Google Places `location` fact. */
  source: "item" | "google";
  /** For `google`: the fact's fetch time (its 30-day cache window starts here). Null otherwise. */
  fetchedAt: Date | null;
};

function point(lat: unknown, lng: unknown): { lat: number; lng: number } | null {
  const la = Number(lat);
  const ln = Number(lng);
  if (lat == null || lng == null || !Number.isFinite(la) || !Number.isFinite(ln)) return null;
  if (Math.abs(la) > 90 || Math.abs(ln) > 180 || (la === 0 && ln === 0)) return null;
  return { lat: la, lng: ln };
}

/** The plan's stay item id, or null — the ONE choice of which item is the stay (see the header). */
export async function stayItemIdForPlan(tripId: string): Promise<string | null> {
  const [chosen] = await db
    .select({ itemId: planOptionSets.itineraryItemId })
    .from(planOptionSets)
    .where(
      and(
        eq(planOptionSets.tripId, tripId),
        eq(planOptionSets.categoryKey, "accommodation"),
        eq(planOptionSets.status, "chosen"),
        isNotNull(planOptionSets.itineraryItemId),
      ),
    )
    .orderBy(sql`CASE WHEN ${planOptionSets.anchorRole} = 'primary' THEN 0 ELSE 1 END`, desc(planOptionSets.createdAt))
    .limit(1);
  let itemId = chosen?.itemId ?? null;
  if (!itemId) {
    const [own] = await db
      .select({ id: itineraryItems.id })
      .from(itineraryItems)
      .where(
        and(
          eq(itineraryItems.tripId, tripId),
          eq(itineraryItems.itemType, "accommodation"),
          or(isNull(itineraryItems.origin), ne(itineraryItems.origin, "expert")),
        ),
      )
      .orderBy(desc(itineraryItems.createdAt), asc(itineraryItems.id))
      .limit(1);
    itemId = own?.id ?? null;
  }
  return itemId;
}

/** The plan's stay item and its point, or null (see the header). */
export async function stayPointForPlan(tripId: string): Promise<StayPoint | null> {
  const itemId = await stayItemIdForPlan(tripId);
  if (!itemId) return null;
  const [item] = await db.select().from(itineraryItems).where(and(eq(itineraryItems.id, itemId), eq(itineraryItems.tripId, tripId))).limit(1);
  if (!item) return null;
  const name = item.title?.trim() || "Your stay";
  // The item's own coordinate first — a Google fact is read only when the row has none it can trust.
  const own = rowCoordinatesTrusted(item as any) ? point(item.latitude, item.longitude) : null;
  if (own) return { itemId: item.id, name, ...own, source: "item", fetchedAt: null };
  // An EXPIRED Places fact is never a pin (R312): `factsForTrip` keeps a stale view (ranked last) for
  // display, so the stay reads only its unexpired facts — past Google's 30 days the point is gone.
  const live = (await factsForTrip(tripId))[item.id]?.filter((f) => !f.stale) ?? [];
  const [day] = applyGooglePins([{ activities: [{ id: item.id, lat: null as number | null, lng: null as number | null }] }], { [item.id]: live } as any);
  const pin = point(day.activities[0].lat, day.activities[0].lng);
  if (!pin) return null;
  const loc = live.find((f) => f.factType === "location" && f.origin === "places_api");
  const fetchedAt = loc?.checkedAt ? new Date(loc.checkedAt) : null;
  return { itemId: item.id, name, ...pin, source: "google", fetchedAt };
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
  const stayPoint = await stayPointForPlan(tripId);
  if (!stayPoint) return { skipped: "no_located_stay" };
  const stay = { start: stayPoint, end: stayPoint };

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
      // Migration 350: the stay end's point, when it is Google's, is recorded as a cache.
      coordSource: stayPoint.source === "google" ? "google" : null,
      coordFetchedAt: stayPoint.source === "google" ? stayPoint.fetchedAt : null,
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

/**
 * The best-effort hook (§15b): the plan's stay may have changed — after the where-to-stay chooser binds
 * a stay and after an accommodation option set is chosen. Never throws; a no-op off a copy.
 */
export async function rerouteAfterStayChange(tripId: string): Promise<void> {
  try {
    await rerouteCopyForStay(tripId);
  } catch (err) {
    console.error(`[stay-reroute] failed plan_id=${tripId}:`, (err as Error)?.message ?? err);
  }
}
