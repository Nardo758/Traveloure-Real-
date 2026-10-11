/**
 * TC-3b — the ride catalog for a market (ledger `2026-10-11-tc3b-ride-recommender`). A catalog ride is a
 * `provider_services` row with a `service_transport_facts` row, approved and active (the same test the ride insert
 * applies, `ride-item.service.ts`). Rides carry no market column: the market is the listing's own `city`, resolved
 * through `resolveMarketSlug` — the resolver every trip's `market_slug` comes from (§18 rule 1).
 *
 * Boarding = the first located route point, exit = the last (TC-3a's rule). Departures per date are the ride's
 * ONE departure rule, `departuresForDate` below, which `rideDepartures` (the insert's check) calls too: that date's
 * available slots; a date with no slots at all falls back to the listing's `earliest_start_time`; nothing else.
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { providerServices, serviceRoutePoints, serviceTransportFacts, vendorAvailabilitySlots } from "@shared/schema";
import type { RideCatalogEntry, RideFare } from "@shared/ride-recommender";
import { resolveMarketSlug } from "./trend-engine/operating-markets";

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** THE departure rule for one ride on one date (pure). */
export function departuresForDate(slotsThatDate: ReadonlyArray<{ startTime: unknown; status: unknown }>, earliestStartTime: unknown): string[] {
  if (slotsThatDate.length) {
    return slotsThatDate
      .filter((s) => (s.status ?? "available") === "available" && s.startTime && HHMM.test(String(s.startTime).slice(0, 5)))
      .map((s) => String(s.startTime).slice(0, 5));
  }
  const e = earliestStartTime ? String(earliestStartTime).slice(0, 5) : null;
  return e && HHMM.test(e) ? [e] : [];
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function fareOf(notes: any): RideFare | null {
  const f = notes?.fare;
  if (!f || typeof f !== "object" || typeof f.currency !== "string") return null;
  return { currency: f.currency, adult: num(f.adult), child: num(f.child) };
}

/** Every live catalog ride in the market, with its departures on each of the given dates. */
export async function listMarketRides(marketSlug: string | null, datesIso: readonly string[]): Promise<RideCatalogEntry[]> {
  if (!marketSlug) return [];
  const rows = await db
    .select({
      id: providerServices.id,
      title: providerServices.serviceName,
      city: providerServices.city,
      duration: providerServices.durationMinutes,
      earliest: providerServices.earliestStartTime,
      bookingWindowDays: serviceTransportFacts.bookingWindowDays,
      notes: serviceTransportFacts.notes,
    })
    .from(providerServices)
    .innerJoin(serviceTransportFacts, eq(serviceTransportFacts.serviceId, providerServices.id))
    .where(and(eq(providerServices.status, "active"), eq(providerServices.approvalStatus, "approved")));
  const inMarket = rows.filter((r) => resolveMarketSlug(r.city) === marketSlug.toLowerCase());
  if (!inMarket.length) return [];
  const ids = inMarket.map((r) => r.id);
  const [points, slots] = await Promise.all([
    db
      .select({ serviceId: serviceRoutePoints.serviceId, name: serviceRoutePoints.name, lat: serviceRoutePoints.latitude, lng: serviceRoutePoints.longitude })
      .from(serviceRoutePoints)
      .where(inArray(serviceRoutePoints.serviceId, ids))
      .orderBy(asc(serviceRoutePoints.serviceId), asc(serviceRoutePoints.position)),
    datesIso.length
      ? db
          .select({ serviceId: vendorAvailabilitySlots.serviceId, date: vendorAvailabilitySlots.date, startTime: vendorAvailabilitySlots.startTime, status: vendorAvailabilitySlots.status })
          .from(vendorAvailabilitySlots)
          .where(and(inArray(vendorAvailabilitySlots.serviceId, ids), inArray(vendorAvailabilitySlots.date, [...datesIso])))
      : Promise.resolve([] as Array<{ serviceId: string; date: string; startTime: string | null; status: string | null }>),
  ]);
  const out: RideCatalogEntry[] = [];
  for (const r of inMarket) {
    const located = points
      .filter((p) => p.serviceId === r.id)
      .flatMap((p) => {
        const lat = num(p.lat);
        const lng = num(p.lng);
        return lat !== null && lng !== null ? [{ name: (p.name as string | null) ?? null, lat, lng }] : [];
      });
    if (located.length < 2) continue; // a ride needs a boarding point AND an exit to replace a leg
    const departuresByDate: Record<string, string[]> = {};
    for (const d of datesIso) {
      const deps = departuresForDate(slots.filter((s) => s.serviceId === r.id && String(s.date).slice(0, 10) === d), r.earliest);
      if (deps.length) departuresByDate[d] = deps;
    }
    const notes = (r.notes ?? {}) as any;
    const pairs = Array.isArray(notes?.pairing?.withServiceIds) ? notes.pairing.withServiceIds.filter((x: unknown) => typeof x === "string") : [];
    out.push({
      serviceId: r.id,
      title: r.title ?? "Ride",
      boarding: located[0],
      exit: located[located.length - 1],
      durationMinutes: num(r.duration),
      departuresByDate,
      childMinHeightCm: num(notes?.childMinHeightCm),
      bookingWindowDays: num(r.bookingWindowDays),
      wheelchairAccessible: typeof notes?.wheelchairAccessible === "boolean" ? notes.wheelchairAccessible : null,
      fare: fareOf(notes),
      pairServiceIds: pairs,
    });
  }
  return out;
}
