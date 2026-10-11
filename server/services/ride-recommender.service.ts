/**
 * TC-3b — THE RIDE RECOMMENDER, server half (ledger `2026-10-11-tc3b-ride-recommender`; rules in
 * shared/ride-recommender.ts). Read behind the plan card's own gate and only for the plan's OWNER (the ride insert
 * and the dismiss are owner-only, LD 61 — a suggestion nobody on screen could act on is not shown).
 *
 *   · A PAID plan (`planGetsRoutedLegs`) gets per-day `rideSuggestions` over its ROUTED legs, and the first time the
 *     plan card serves one, an `offered` event (once per trip × corridor × service — the table's UNIQUE index).
 *   · A FREE plan gets per-day `rideTeaser: { rides }` only — straight-line corridors between consecutive located
 *     stops, the same walking range and window, no Maps call, nothing recorded (ruling 2).
 *   · NOTHING without confirmed dates: a placeholder day has no real calendar, so no departure is "valid that day"
 *     (§13). Nothing on a deciding leg (ruling 1: the stop has a stored `last_admission` fact), on a skipped corridor
 *     (ruling 3), or past day.
 * Any failure returns empty maps and logs — never a failed plan card (§15b).
 */
import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "../db";
import { itineraryItems, serviceTransportFacts, trips } from "@shared/schema";
import { addCalendarDays } from "@shared/plan-timing";
import { planDatesAreConfirmed } from "@shared/plan-dates";
import { departure, wallClockMinutes } from "@shared/leg-reachability";
import { rowCoordinatesTrusted } from "@shared/ai-place-text";
import { parseTripProfileOverlay } from "@shared/trip-profile-overlay";
import { recommendRides, rideTeaserByDay, type RideCorridor, type RideRankContext, type RideSuggestion } from "@shared/ride-recommender";
import { listMarketRides } from "./ride-catalog.service";
import { recordTransportOptionEvents } from "./transport-option-events.service";

export interface TripRideAnswer {
  suggestions: Map<number, RideSuggestion[]>;
  teasers: Map<number, { rides: number }>;
}

const EMPTY = (): TripRideAnswer => ({ suggestions: new Map(), teasers: new Map() });

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** "YYYY-MM-DD" today in the plan's own zone (UTC when the plan has none). */
export function todayInZone(now: Date, timeZone: string | null | undefined): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timeZone || "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

export async function rideRecommendationsForTrip(tripId: string, viewerUserId: string | null, now: Date = new Date()): Promise<TripRideAnswer> {
  try {
    const [trip] = await db
      .select({
        userId: trips.userId,
        startDate: trips.startDate,
        marketSlug: trips.marketSlug,
        timezone: trips.timezone,
        datesConfirmedAt: trips.datesConfirmedAt,
        preferences: trips.preferences,
        momentKey: trips.momentKey,
        experienceType: trips.experienceType,
      })
      .from(trips)
      .where(eq(trips.id, tripId))
      .limit(1);
    if (!trip || !viewerUserId || trip.userId !== viewerUserId) return EMPTY();
    if (!planDatesAreConfirmed(trip.datesConfirmedAt as any) || !trip.startDate || !trip.marketSlug) return EMPTY();
    const start = String(trip.startDate).slice(0, 10);

    const { tripGetsRoutedLegs, tripLegsShown } = await import("./routing/plan-routed-legs.service");
    const { legIsRouted } = await import("./routing/plan-legs");
    const paid = await tripGetsRoutedLegs(tripId);

    const items = await db
      .select({
        id: itineraryItems.id,
        title: itineraryItems.title,
        dayNumber: itineraryItems.dayNumber,
        startTime: itineraryItems.startTime,
        endTime: itineraryItems.endTime,
        durationMinutes: itineraryItems.durationMinutes,
        lat: itineraryItems.latitude,
        lng: itineraryItems.longitude,
        origin: itineraryItems.origin,
        locationName: itineraryItems.locationName,
        locationAddress: itineraryItems.locationAddress,
        providerServiceId: itineraryItems.providerServiceId,
      })
      .from(itineraryItems)
      .where(eq(itineraryItems.tripId, tripId))
      .orderBy(asc(itineraryItems.dayNumber), asc(itineraryItems.sortOrder), asc(itineraryItems.startTime), asc(itineraryItems.createdAt), asc(itineraryItems.id));
    if (items.length < 2) return EMPTY();

    const serviceIds = Array.from(new Set(items.map((i) => i.providerServiceId).filter((x): x is string => !!x)));
    const rideServiceIds = serviceIds.length
      ? new Set((await db.select({ id: serviceTransportFacts.serviceId }).from(serviceTransportFacts).where(and(inArray(serviceTransportFacts.serviceId, serviceIds), isNotNull(serviceTransportFacts.serviceId)))).map((r) => r.id))
      : new Set<string>();
    const rideItemIds = new Set(items.filter((i) => i.providerServiceId && rideServiceIds.has(i.providerServiceId)).map((i) => i.id));

    const { feasibilityFactsForTrip, factPointsForTrip } = await import("./content-facts/place-facts.service");
    const facts = await feasibilityFactsForTrip(tripId, trip.marketSlug).catch(() => null);
    if (!facts) return EMPTY(); // ruling 1 cannot be honoured without the stored facts — offer nothing
    const decidingItemIds = new Set(Array.from(facts.lastAdmission.keys()));

    const overlay = parseTripProfileOverlay(trip.preferences);
    const ctx: RideRankContext = {
      todayIso: todayInZone(now, trip.timezone),
      mobility: overlay.mobility ?? null,
      childHeightsCm: overlay.childHeightsCm ?? null,
      pace: overlay.pace ?? null,
      budgetBand: overlay.budgetBand ?? null,
      scenic: overlay.scenic ?? null,
      skippedCorridors: new Set(overlay.skippedCorridors ?? []),
      decidingItemIds,
      rideItemIds,
    };

    const byId = new Map(items.map((i) => [i.id, i] as const));
    const dateOf = (day: number | null) => (day == null ? null : addCalendarDays(start, day - 1));
    const windowOf = (fromId: string, toId: string) => {
      const from = byId.get(fromId);
      const to = byId.get(toId);
      if (!from || !to) return null;
      const leave = departure({ ...from, dayNumber: from.dayNumber ?? null } as any);
      // A stop known only by its start says nothing about when the traveler can leave it (§13).
      if (!leave || leave.basis === "start_only") return { leaveAt: null, arriveAt: wallClockMinutes(to.startTime) };
      return { leaveAt: leave.at, arriveAt: wallClockMinutes(to.startTime) };
    };

    const corridors: RideCorridor[] = [];
    if (paid) {
      const legs = (await tripLegsShown(tripId)) as any[];
      for (const l of legs) {
        if (!legIsRouted(l) || !l.fromActivityId || !l.toActivityId) continue;
        const from = { lat: num(l.fromLat), lng: num(l.fromLng) };
        const to = { lat: num(l.toLat), lng: num(l.toLng) };
        if (from.lat === null || from.lng === null || to.lat === null || to.lng === null) continue;
        const w = windowOf(l.fromActivityId, l.toActivityId);
        if (!w) continue;
        corridors.push({
          dayNumber: Number(l.dayNumber),
          dateIso: dateOf(Number(l.dayNumber)),
          legId: String(l.id),
          fromItemId: l.fromActivityId,
          toItemId: l.toActivityId,
          from: { lat: from.lat, lng: from.lng },
          to: { lat: to.lat, lng: to.lng },
          leaveAt: w.leaveAt,
          arriveAt: w.arriveAt,
          legMinutes: num(l.estimatedDurationMinutes),
        });
      }
    } else {
      const points = await factPointsForTrip(tripId);
      const pointOf = (i: (typeof items)[number]) => {
        const own = rowCoordinatesTrusted(i as any) ? { lat: num(i.lat), lng: num(i.lng) } : { lat: null, lng: null };
        return own.lat !== null && own.lng !== null ? { lat: own.lat, lng: own.lng } : points.get(i.id) ?? null;
      };
      const byDay = new Map<number, typeof items>();
      for (const i of items) if (i.dayNumber != null) byDay.set(i.dayNumber, [...(byDay.get(i.dayNumber) ?? []), i]);
      byDay.forEach((list, day) => {
        const located = list.map((i) => ({ i, p: pointOf(i) })).filter((x): x is { i: (typeof items)[number]; p: { lat: number; lng: number } } => x.p !== null);
        for (let k = 0; k + 1 < located.length; k++) {
          const a = located[k];
          const b = located[k + 1];
          const w = windowOf(a.i.id, b.i.id);
          if (!w) continue;
          corridors.push({ dayNumber: day, dateIso: dateOf(day), legId: null, fromItemId: a.i.id, toItemId: b.i.id, from: a.p, to: b.p, leaveAt: w.leaveAt, arriveAt: w.arriveAt, legMinutes: null });
        }
      });
    }
    if (!corridors.length) return EMPTY();

    const dates = Array.from(new Set(corridors.map((c) => c.dateIso).filter((d): d is string => !!d)));
    const rides = await listMarketRides(trip.marketSlug, dates);
    if (!rides.length) return EMPTY();

    if (!paid) return { suggestions: new Map(), teasers: rideTeaserByDay(corridors, rides, ctx) };

    const list = recommendRides(corridors, rides, ctx);
    const suggestions = new Map<number, RideSuggestion[]>();
    for (const s of list) suggestions.set(s.dayNumber, [...(suggestions.get(s.dayNumber) ?? []), s]);
    const occasion = trip.momentKey ?? trip.experienceType ?? null;
    void recordTransportOptionEvents(
      list.map((s) => ({ tripId, corridorKey: s.corridorKey, serviceId: s.serviceId, event: "offered" as const, dayNumber: s.dayNumber, legId: s.legId, occasion })),
    );
    return { suggestions, teasers: new Map() };
  } catch (err: any) {
    console.warn(`[ride-recommender] ${tripId}: not computed: ${String(err?.message ?? err).slice(0, 200)}`);
    return EMPTY();
  }
}

/** The occasion an event row records: the trip's fine Moment key, else its coarse occasion key; null ⇒ not stated. */
export async function tripOccasion(tripId: string): Promise<string | null> {
  try {
    const [t] = await db.select({ momentKey: trips.momentKey, experienceType: trips.experienceType }).from(trips).where(eq(trips.id, tripId)).limit(1);
    return t?.momentKey ?? t?.experienceType ?? null;
  } catch {
    return null;
  }
}
