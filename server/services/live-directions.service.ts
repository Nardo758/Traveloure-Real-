/**
 * TC-4 — the Trip Card's live tier, per leg (LD 69; ledger `2026-10-11-tc4-live-directions`).
 *
 * Read behind the plan card's own gate (the caller); writes nothing and calls no API. For every leg with BOTH
 * ends located it builds the live-directions deep link through the ONE server URL builder (`buildGoogleNavUrl`),
 * asking for transit only where the routing API has none (`marketTransitRouting`, ruling 2), and — on a day with
 * a confirmed date — the earliest last departure near the stop the leg leaves (`leavingLastService`, ruling 1).
 * Every viewer the gate admits gets it, routed plan or not (ruling 3): on an unrouted plan the link plus the
 * "est." minutes are honest.
 */
import { eq } from "drizzle-orm";
import { db } from "../db";
import { trips } from "@shared/schema";
import { marketTransitRouting } from "@shared/routing-engine";
import { planDatesAreConfirmed } from "@shared/plan-dates";
import { leavingLastService, type LegLastService, type LegLiveDirections } from "@shared/live-directions";
import { TRANSPORT_PROFILES } from "../data/transport-profiles";
import { liveDirectionsProviderFor } from "../config/live-directions.config";
import { buildGoogleNavUrl } from "./maps-url-builder";
import { lastServicesForMarket } from "./content-facts/place-facts.service";

export interface LegLiveFacts {
  liveDirections?: LegLiveDirections;
  lastService?: LegLastService;
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

type DayIn = { dayNumber: number; dateIso?: string | null; transports?: any[] };

export async function liveLegFactsForTrip(tripId: string, days: readonly DayIn[], now: Date = new Date()): Promise<Map<string, LegLiveFacts>> {
  const out = new Map<string, LegLiveFacts>();
  const [trip] = await db
    .select({ marketSlug: trips.marketSlug, datesConfirmedAt: trips.datesConfirmedAt })
    .from(trips)
    .where(eq(trips.id, tripId))
    .limit(1);
  if (!trip) return out;
  const market = trip.marketSlug ? trip.marketSlug.toLowerCase() : null;
  const profile = market ? (TRANSPORT_PROFILES as Record<string, { availableModes: Array<{ mode: string; available?: boolean }>; apiTransitCoverage?: boolean }>)[market] : undefined;
  const transit = marketTransitRouting(profile).transitApiUncovered;
  const provider = liveDirectionsProviderFor(market);
  const dated = planDatesAreConfirmed(trip.datesConfirmedAt as any);
  const services = dated && market ? await lastServicesForMarket(market, now) : [];

  for (const d of days) {
    for (const t of d.transports ?? []) {
      if (!t?.id) continue;
      const fromLat = num(t.fromLat);
      const fromLng = num(t.fromLng);
      const toLat = num(t.toLat);
      const toLng = num(t.toLng);
      if (fromLat === null || fromLng === null || toLat === null || toLng === null) continue;
      const facts: LegLiveFacts = {
        liveDirections: {
          provider,
          url: buildGoogleNavUrl(fromLat, fromLng, toLat, toLng, "", transit ? { travelmode: "transit" } : {}),
          transit,
        },
      };
      if (services.length && d.dateIso) {
        const ls = leavingLastService(services, { lat: fromLat, lng: fromLng }, d.dateIso);
        if (ls) facts.lastService = ls;
      }
      out.set(t.id, facts);
    }
  }
  return out;
}
