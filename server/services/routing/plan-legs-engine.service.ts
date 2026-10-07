/**
 * THE PLAN'S ROUTED LEGS — the one writer (step 9a, ledger `2026-10-07-step9a-routing-engine`; spec
 * §14.1; brief L3; rulings 2, 3, 5, 10). On a plan that passes `planGetsRoutedLegs`, every leg between
 * consecutive stops (and the stay ↔ the day's first and last stop) is routed through the ONE adapter,
 * cache-first, changed legs only. Engine legs are trip-scoped rows born `proposed` with `source` set to
 * the routing source; an expert's CONFIRMED leg for the same pair is never recomputed and wins on read.
 *
 * Never runs on a free plan (R-e) and never on page load: its callers are Optimize/apply, Finalize,
 * activate-transport and the debounced edit trigger (`plan-legs-queue.ts`). A paused caller (the daily
 * cap) leaves the existing legs exactly as last computed and blocks nothing (L5). A failed call leaves
 * the pair as a thin connector — its stale leg is removed, never shown as current.
 */
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../../db";
import { transportLegs } from "@shared/schema";
import { rowCoordinatesTrusted } from "@shared/ai-place-text";
import { marketHasTransitCoverage, type RoutePoint, type RoutingAdapter } from "@shared/routing-engine";
import { LEG_MODE_STORED } from "@shared/travel-speeds";
import { zonedWallClockToInstant, addCalendarDays } from "@shared/plan-timing";
import { storage } from "../../storage";
import { TRANSPORT_PROFILES } from "../../data/transport-profiles";
import { formatDistance } from "../transport-leg-calculator";
import { factPointsForTrip, factsForTrip, placeRefsForTrip } from "../content-facts/place-facts.service";
import { stayPointForPlan } from "../stay-reroute.service";
import { routingAdapter } from "./index";
import { routeLegCached, type RouteCacheStore } from "./route-cache.service";
import { tripGetsRoutedLegs } from "./plan-routed-legs.service";
import { desiredPlanLegs, diffPlanLegs, legPairKey, selectedModeOf, type DesiredLeg, type ExistingEngineLeg, type PlanStop } from "./plan-legs";

export type PlanLegsResult =
  | { skipped: "engine_off" | "free_plan" | "no_trip" }
  | {
      skipped?: undefined;
      /** Calls the adapter actually made. */
      calls: number;
      cacheHits: number;
      written: number;
      kept: number;
      removed: number;
      noRoute: number;
      /** True when a caller's daily cap stopped the run; existing legs were left as last computed. */
      paused: boolean;
      skippedPairs: number;
    };

function realPoint(lat: unknown, lng: unknown): { lat: number; lng: number } | null {
  if (lat == null || lng == null) return null;
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln) || Math.abs(la) > 90 || Math.abs(ln) > 180 || (la === 0 && ln === 0)) return null;
  return { lat: la, lng: ln };
}

/** `coord_source`/`coord_fetched_at` for a leg: Google when either end is, with the OLDER fetch time. */
export function googleCoordStamp(from: Date | undefined, to: Date | undefined): { coordSource: "google"; coordFetchedAt: Date } | Record<string, never> {
  const times = [from, to].filter((d): d is Date => !!d);
  if (!times.length) return {};
  return { coordSource: "google", coordFetchedAt: new Date(Math.min(...times.map((d) => d.getTime()))) };
}

/** The cache key a stored engine leg was computed under, from its one alternative entry. */
export function engineLegCacheKey(alternativeModes: unknown): string | null {
  const first = Array.isArray(alternativeModes) ? (alternativeModes[0] as any) : null;
  return typeof first?.cacheKey === "string" ? first.cacheKey : null;
}

export async function computePlanLegs(
  tripId: string,
  deps: { adapter?: RoutingAdapter | null; store?: RouteCacheStore; qualifies?: boolean } = {},
): Promise<PlanLegsResult> {
  const adapter = deps.adapter !== undefined ? deps.adapter : routingAdapter();
  if (!adapter) return { skipped: "engine_off" };
  const qualifies = deps.qualifies ?? (await tripGetsRoutedLegs(tripId));
  if (!qualifies) return { skipped: "free_plan" };
  const trip = await storage.getTrip(tripId);
  if (!trip) return { skipped: "no_trip" };

  const items = await storage.getItineraryItems(tripId);
  const [factPoints, factViews, placeRefs, stayPoint, existingRows] = await Promise.all([
    factPointsForTrip(tripId),
    factsForTrip(tripId),
    placeRefsForTrip(tripId, items.map((i) => i.id)),
    stayPointForPlan(tripId),
    db.select().from(transportLegs).where(and(eq(transportLegs.tripId, tripId), isNull(transportLegs.variantId))),
  ]);
  // LD 57 as extended to legs (R311, migration 350): a point taken from a Google Places fact is a CACHE
  // on the leg — recorded as `coord_source='google'` with the fact's fetch time, so the daily leg job
  // refreshes or clears it. The trusted row point needs no record.
  const googleFetchedAt = new Map<string, Date>();
  const pointFor = (it: any): RoutePoint | null => {
    const own = rowCoordinatesTrusted(it) ? realPoint(it.latitude, it.longitude) : null;
    const fact = own ? null : factPoints.get(it.id) ?? null;
    if (fact) {
      const g = (factViews[it.id] ?? []).find(
        (f: any) => !f.stale && f.factType === "location" && f.origin === "places_api" && Number((f.value as any)?.lat) === fact.lat && Number((f.value as any)?.lng) === fact.lng,
      ) as any;
      if (g?.checkedAt) googleFetchedAt.set(it.id, new Date(g.checkedAt));
    }
    const p = own ?? fact;
    return p ? { ...p, placeId: placeRefs.get(it.id)?.placeId ?? null } : null;
  };
  const stops: PlanStop[] = items.map((it: any) => ({
    id: it.id,
    name: it.title || "Stop",
    dayNumber: it.dayNumber,
    point: pointFor(it),
    startTime: it.startTime || null,
    endTime: it.endTime || null,
    durationMinutes: it.durationMinutes ?? null,
  }));
  if (stayPoint?.source === "google" && stayPoint.fetchedAt) googleFetchedAt.set(stayPoint.itemId, stayPoint.fetchedAt);
  const stay =
    stayPoint
      ? {
          id: stayPoint.itemId,
          name: stayPoint.name,
          dayNumber: 0,
          point: { lat: stayPoint.lat, lng: stayPoint.lng, placeId: placeRefs.get(stayPoint.itemId)?.placeId ?? null },
          startTime: null,
          endTime: null,
          durationMinutes: null,
        }
      : null;

  const engineRows = existingRows.filter((l) => l.source != null);
  const confirmedPairs = new Set(
    existingRows.filter((l) => l.proposalStatus === "confirmed").map((l) => legPairKey(l.dayNumber, l.fromActivityId, l.toActivityId)),
  );
  const existing: ExistingEngineLeg[] = engineRows.map((l) => ({
    id: l.id,
    dayNumber: l.dayNumber,
    legOrder: l.legOrder,
    fromActivityId: l.fromActivityId,
    toActivityId: l.toActivityId,
    cacheKey: engineLegCacheKey(l.alternativeModes),
    userSelectedMode: l.userSelectedMode,
  }));
  const picked = new Map(existing.map((e) => [legPairKey(e.dayNumber, e.fromActivityId, e.toActivityId), selectedModeOf(e)]));
  const marketSlug = (trip.marketSlug ?? "").toLowerCase();
  const profile = (TRANSPORT_PROFILES as Record<string, { availableModes: Array<{ mode: string; available?: boolean }> }>)[marketSlug];
  const { legs: desired, skipped } = desiredPlanLegs(stops, {
    stay,
    hasTransitCoverage: marketHasTransitCoverage(profile?.availableModes),
    selectedMode: (k) => picked.get(k) ?? null,
  });
  const diff = diffPlanLegs(desired, existing, confirmedPairs);

  const tripStart = trip.startDate ? String(trip.startDate).slice(0, 10) : null;
  const departAt = (leg: DesiredLeg): Date | null => {
    if (!tripStart || !leg.wallClock) return null;
    return zonedWallClockToInstant(addCalendarDays(tripStart, leg.dayNumber - 1), leg.wallClock, trip.timezone);
  };

  let calls = 0;
  let cacheHits = 0;
  let noRoute = 0;
  let paused = false;
  const rows: Array<typeof transportLegs.$inferInsert> = [];
  const replacedIds: string[] = [];
  for (const leg of diff.compute) {
    if (paused) break;
    const r = await routeLegCached(
      { origin: leg.from.point, destination: leg.to.point, mode: leg.mode, departAt: departAt(leg), hourBucket: leg.hourBucket },
      adapter,
      deps.store,
    );
    if (r.outcome.kind === "paused") {
      paused = true;
      break;
    }
    if (r.cached) cacheHits++;
    else calls++;
    replacedIds.push(...(diff.replaces.get(leg.pairKey) ?? []));
    if (r.outcome.kind === "no_route") {
      noRoute++;
      continue;
    }
    const route = r.outcome.route;
    rows.push({
      tripId,
      dayNumber: leg.dayNumber,
      legOrder: leg.legOrder,
      fromActivityId: leg.from.id,
      fromName: leg.from.name,
      fromLat: leg.from.point.lat,
      fromLng: leg.from.point.lng,
      toActivityId: leg.to.id,
      toName: leg.to.name,
      toLat: leg.to.point.lat,
      toLng: leg.to.point.lng,
      distanceMeters: route.distanceM,
      distanceDisplay: formatDistance(route.distanceM),
      recommendedMode: LEG_MODE_STORED[leg.mode],
      userSelectedMode: picked.get(leg.pairKey) ? LEG_MODE_STORED[picked.get(leg.pairKey)!] : null,
      estimatedDurationMinutes: route.durationMin,
      estimatedCostUsd: null,
      // The ONE alternative entry carries the facts the row has no column for: line, fare (source
      // currency, never converted — L6) and the cache key the pair diff compares (ruling 10).
      alternativeModes: [
        {
          mode: LEG_MODE_STORED[leg.mode],
          durationMinutes: route.durationMin,
          costUsd: null,
          energyCost: 0,
          reason: route.provenance.source,
          line: route.line,
          fare: route.fare,
          cacheKey: r.cacheKey,
          hourBucket: leg.hourBucket,
        },
      ] as any,
      energyCost: 0,
      destinationProfile: trip.destination || null,
      proposalStatus: "proposed",
      source: route.provenance.source,
      calculatedAt: new Date(route.provenance.checkedAt),
      ...googleCoordStamp(googleFetchedAt.get(leg.from.id), googleFetchedAt.get(leg.to.id)),
    });
  }

  const removeIds = Array.from(new Set([...diff.remove, ...replacedIds]));
  const reorders = diff.keep.filter((k) => k.legOrder != null) as Array<{ id: string; legOrder: number }>;
  if (rows.length || removeIds.length || reorders.length) {
    await db.transaction(async (tx) => {
      // Serialise writers for this plan across instances (the debounce is process-local).
      await tx.execute(sql`SELECT id FROM trips WHERE id = ${tripId} FOR UPDATE`);
      if (removeIds.length) {
        await tx.delete(transportLegs).where(and(eq(transportLegs.tripId, tripId), inArray(transportLegs.id, removeIds), sql`${transportLegs.source} IS NOT NULL`));
      }
      for (const r of reorders) {
        await tx.update(transportLegs).set({ legOrder: r.legOrder, updatedAt: new Date() }).where(and(eq(transportLegs.id, r.id), eq(transportLegs.tripId, tripId)));
      }
      if (rows.length) {
        // A concurrent writer may have inserted the same pair since our read: drop engine rows for
        // these pairs first, so the plan holds one engine leg per pair.
        for (const row of rows) {
          await tx
            .delete(transportLegs)
            .where(
              and(
                eq(transportLegs.tripId, tripId),
                isNull(transportLegs.variantId),
                sql`${transportLegs.source} IS NOT NULL`,
                eq(transportLegs.dayNumber, row.dayNumber),
                eq(transportLegs.fromActivityId, row.fromActivityId!),
                eq(transportLegs.toActivityId, row.toActivityId!),
              ),
            );
        }
        await tx.insert(transportLegs).values(rows);
      }
    });
  }
  return {
    calls,
    cacheHits,
    written: rows.length,
    kept: diff.keep.length,
    removed: removeIds.length,
    noRoute,
    paused,
    skippedPairs: skipped.length,
  };
}

/**
 * The routing context for an Optimize run's versions (step 9a ruling 6): the adapter, the plan's
 * transit coverage, its first day and zone, and its stops' place IDs (so a version stop keys the cache
 * exactly as the plan stop it came from — the apply then reads the run's answers as hits). Null when
 * the engine is off, or the comparison names no plan.
 */
export async function versionRoutingFor(comparisonId: string): Promise<{
  ctx: import("../transport-leg-calculator").VersionRoutingContext;
  placeIdFor: (sourceItemId: string | null | undefined) => string | null;
} | null> {
  const adapter = routingAdapter();
  if (!adapter) return null;
  const comparison = await storage.getItineraryComparison(comparisonId);
  const tripId = (comparison as any)?.tripId as string | null | undefined;
  if (!tripId) return null;
  const trip = await storage.getTrip(tripId);
  if (!trip) return null;
  const items = await storage.getItineraryItems(tripId);
  const refs = await placeRefsForTrip(tripId, items.map((i) => i.id));
  const profile = (TRANSPORT_PROFILES as Record<string, { availableModes: Array<{ mode: string; available?: boolean }> }>)[(trip.marketSlug ?? "").toLowerCase()];
  return {
    ctx: {
      adapter,
      hasTransitCoverage: marketHasTransitCoverage(profile?.availableModes),
      tripStart: trip.startDate ? String(trip.startDate).slice(0, 10) : null,
      timezone: trip.timezone ?? null,
    },
    placeIdFor: (id) => (id ? refs.get(id)?.placeId ?? null : null),
  };
}
