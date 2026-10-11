/**
 * TC-3a — THE RIDE AS A PLAN ITEM (ledger `2026-10-11-tc3a-ride-item`; brief docs/planning/briefs/tc-3a-ride-item.md;
 * migration 368). A ride is an ordinary `itinerary_items` row: `item_type='transport'`, `provider_service_id`
 * set to a transport CATALOG row (a `provider_services` row that has a `service_transport_facts` row,
 * approved and active), boarding pin = the item's own `latitude`/`longitude`, exit pin = `exit_latitude`/
 * `exit_longitude`, both read from the service's `service_route_points` (first = boarding, last = exit).
 *
 *   · SCHEDULE comes from the catalog: the chosen departure must be one of that date's
 *     `vendor_availability_slots`, or — for a service with no slots that day — its `earliest_start_time`.
 *     The end is the departure plus the service's `duration_minutes`; no duration ⇒ no end time (never guessed).
 *   · BORN LOCKED (R-ah / LD 61): the traveler chose it, so Optimize keeps it as a fixed commitment and no
 *     rebuild deletes it; unlocking (the existing lock rail) makes it flexible.
 *   · THE SWAP: inserted between A and C, the ride supersedes any CONFIRMED A→C leg — `proposal_status`
 *     NULL (hidden from every trip reader), `superseded_at`, `superseded_by_item_id` = the ride — never
 *     deleted. Removing the ride restores exactly those legs (`storage.deleteItineraryItem`). The engine's
 *     own A→C leg is the pair diff's to drop; the 2 s debounce recomputes [A→ride, ride→C].
 *   · OWNER ONLY (the lock is the owner's, LD 61). One 404 for a plan, item or service that is not there
 *     or not the caller's (LD 40).
 */
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { itineraryItems, providerServices, serviceRoutePoints, serviceTransportFacts, transportLegs, trips, vendorAvailabilitySlots } from "@shared/schema";
import { addCalendarDays } from "@shared/plan-timing";
import { stampItemSourceClass } from "@shared/content-tiers";
import { enqueuePlanLegRecompute } from "./routing/plan-legs-queue";

export type InsertRideResult =
  | { ok: true; itemId: string; supersededLegIds: string[] }
  | { ok: false; code: "not_found" | "not_a_ride" | "no_pins" | "no_departure" | "bad_position"; message: string };

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

function pin(lat: unknown, lng: unknown): { lat: string; lng: string } | null {
  if (lat == null || lng == null) return null;
  const a = Number(lat);
  const b = Number(lng);
  if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a) > 90 || Math.abs(b) > 180) return null;
  return { lat: String(lat), lng: String(lng) };
}

function plusMinutes(hhmm: string, minutes: number | null | undefined): string | null {
  if (minutes == null || !Number.isFinite(Number(minutes)) || Number(minutes) <= 0) return null;
  const [h, m] = hhmm.split(":").map(Number);
  const t = h * 60 + m + Math.round(Number(minutes));
  if (t >= 24 * 60) return null;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

/** The departures a catalog ride offers on a date: that day's slots, else its earliest start time. */
export async function rideDepartures(serviceId: string, dateIso: string | null): Promise<string[]> {
  if (dateIso) {
    const slots = await db
      .select({ startTime: vendorAvailabilitySlots.startTime, status: vendorAvailabilitySlots.status })
      .from(vendorAvailabilitySlots)
      .where(and(eq(vendorAvailabilitySlots.serviceId, serviceId), eq(vendorAvailabilitySlots.date, dateIso)));
    const open = slots.filter((s) => (s.status ?? "available") === "available" && s.startTime && HHMM.test(String(s.startTime).slice(0, 5)));
    if (slots.length) return open.map((s) => String(s.startTime).slice(0, 5));
  }
  const [svc] = await db.select({ earliest: providerServices.earliestStartTime }).from(providerServices).where(eq(providerServices.id, serviceId)).limit(1);
  const e = svc?.earliest ? String(svc.earliest).slice(0, 5) : null;
  return e && HHMM.test(e) ? [e] : [];
}

export async function insertRide(input: {
  tripId: string;
  userId: string;
  serviceId: string;
  dayNumber: number;
  afterItemId: string | null;
  departureTime: string;
}): Promise<InsertRideResult> {
  const notFound = { ok: false as const, code: "not_found" as const, message: "No such plan or ride" };
  const [trip] = await db.select({ userId: trips.userId, startDate: trips.startDate }).from(trips).where(eq(trips.id, input.tripId)).limit(1);
  if (!trip || trip.userId !== input.userId) return notFound;

  const [svc] = await db
    .select({ id: providerServices.id, title: providerServices.serviceName, duration: providerServices.durationMinutes, status: providerServices.status, approval: providerServices.approvalStatus })
    .from(providerServices)
    .innerJoin(serviceTransportFacts, eq(serviceTransportFacts.serviceId, providerServices.id))
    .where(eq(providerServices.id, input.serviceId))
    .limit(1);
  if (!svc) return notFound;
  if (svc.approval !== "approved" || svc.status !== "active") return { ok: false, code: "not_a_ride", message: "That ride isn't bookable yet" };

  const points = await db
    .select({ name: serviceRoutePoints.name, lat: serviceRoutePoints.latitude, lng: serviceRoutePoints.longitude })
    .from(serviceRoutePoints)
    .where(eq(serviceRoutePoints.serviceId, input.serviceId))
    .orderBy(asc(serviceRoutePoints.position));
  const located = points.map((p) => ({ name: p.name, at: pin(p.lat, p.lng) })).filter((p) => p.at);
  if (!located.length) return { ok: false, code: "no_pins", message: "This ride has no located boarding point" };
  const board = located[0];
  const exit = located.length > 1 ? located[located.length - 1] : null;

  if (!HHMM.test(input.departureTime)) return { ok: false, code: "no_departure", message: "Choose one of the ride's departures" };
  const dateIso = addCalendarDays(trip.startDate ? String(trip.startDate).slice(0, 10) : null, input.dayNumber - 1);
  const departures = await rideDepartures(input.serviceId, dateIso);
  if (!departures.includes(input.departureTime)) return { ok: false, code: "no_departure", message: "Choose one of the ride's departures" };

  const out = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM trips WHERE id = ${input.tripId} FOR UPDATE`);
    const day = await tx
      .select({ id: itineraryItems.id })
      .from(itineraryItems)
      .where(and(eq(itineraryItems.tripId, input.tripId), eq(itineraryItems.dayNumber, input.dayNumber)))
      .orderBy(asc(itineraryItems.sortOrder), asc(itineraryItems.startTime), asc(itineraryItems.createdAt), asc(itineraryItems.id));
    const at = input.afterItemId == null ? -1 : day.findIndex((d) => d.id === input.afterItemId);
    if (input.afterItemId != null && at < 0) return { bad: true as const };
    const prevId = at >= 0 ? day[at].id : null;
    const nextId = day[at + 1]?.id ?? null;

    const [ride] = await tx
      .insert(itineraryItems)
      .values(stampItemSourceClass({
        tripId: input.tripId,
        title: svc.title ?? "Ride",
        itemType: "transport",
        providerServiceId: svc.id,
        dayNumber: input.dayNumber,
        sortOrder: 0,
        startTime: input.departureTime,
        endTime: plusMinutes(input.departureTime, svc.duration),
        durationMinutes: svc.duration ?? null,
        locationName: board.name,
        latitude: board.at!.lat,
        longitude: board.at!.lng,
        exitLatitude: exit?.at?.lat ?? null,
        exitLongitude: exit?.at?.lng ?? null,
        dropOffPoint: exit?.name ?? null,
        origin: "traveler",
        lockedAt: new Date(),
      }) as any)
      .returning({ id: itineraryItems.id });

    // The day's order with the ride spliced in after A (renumbered, so sort order alone places it).
    const order = day.map((d) => d.id);
    order.splice(at + 1, 0, ride.id);
    for (let i = 0; i < order.length; i++) {
      await tx.update(itineraryItems).set({ sortOrder: i } as any).where(eq(itineraryItems.id, order[i]));
    }

    let supersededLegIds: string[] = [];
    if (prevId && nextId) {
      const rows = await tx
        .update(transportLegs)
        .set({ proposalStatus: null, supersededAt: new Date(), supersededByItemId: ride.id, updatedAt: new Date() })
        .where(
          and(
            eq(transportLegs.tripId, input.tripId),
            isNull(transportLegs.variantId),
            eq(transportLegs.dayNumber, input.dayNumber),
            eq(transportLegs.fromActivityId, prevId),
            eq(transportLegs.toActivityId, nextId),
            eq(transportLegs.proposalStatus, "confirmed"),
            isNull(transportLegs.supersededAt),
          ),
        )
        .returning({ id: transportLegs.id });
      supersededLegIds = rows.map((r) => r.id);
    }
    return { bad: false as const, itemId: ride.id, supersededLegIds };
  });
  if (out.bad) return { ok: false, code: "bad_position", message: "That item isn't on this day of the plan" };
  enqueuePlanLegRecompute(input.tripId);
  return { ok: true, itemId: out.itemId, supersededLegIds: out.supersededLegIds };
}
