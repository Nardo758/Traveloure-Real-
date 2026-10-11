/**
 * THE PLAN'S ROUTED LEGS — the one writer (step 9a, ledger `2026-10-07-step9a-routing-engine`; spec
 * §14.1; brief L3; rulings 2, 3, 5, 10). On a plan that passes `planGetsRoutedLegs`, every leg between
 * consecutive stops (and the stay ↔ the day's first and last stop) is routed through the ONE adapter,
 * changed legs only, de-duplicated in memory for the run (never a persistent cache — Google terms).
 * Engine legs are trip-scoped rows born `proposed` with `source` set to the routing source; an expert's CONFIRMED leg for the same pair is never recomputed and wins on read.
 *
 * Never runs on a free plan (R-e) and never on page load: its callers are Optimize/apply, Finalize,
 * activate-transport and the debounced edit trigger (`plan-legs-queue.ts`). A paused caller (the daily
 * cap) leaves the existing legs exactly as last computed and blocks nothing (L5). A failed call leaves
 * the pair as a thin connector — its stale leg is removed, never shown as current.
 */
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../../db";
import { itineraryVariants, temporalAnchors, transportLegs } from "@shared/schema";
import { rowCoordinatesTrusted } from "@shared/ai-place-text";
import { TRANSIT_UNAVAILABLE_REASON, marketHasTransitCoverage, routeLegKey, type RoutePoint, type RoutingAdapter } from "@shared/routing-engine";
import { LEG_MODE_STORED, normalizeLegMode } from "@shared/travel-speeds";
import type { StoredLegOption } from "@shared/leg-options";
import { zonedWallClockToInstant, addCalendarDays } from "@shared/plan-timing";
import { storage } from "../../storage";
import { TRANSPORT_PROFILES } from "../../data/transport-profiles";
import { formatDistance } from "../transport-leg-calculator";
import { factPointsForTrip, factsForTrip, placeRefsForTrip } from "../content-facts/place-facts.service";
import { stayPointForPlan } from "../stay-reroute.service";
import { routingAdapter } from "./index";
import { RouteRunMemo, routeWithTransitFallback } from "./route-memo";
import { legDepartureWallClock, planDayIsPast, routedFactsOf } from "./plan-legs";
import { tripGetsRoutedLegs, tripLegsShown } from "./plan-routed-legs.service";
import { desiredPlanLegs, diffPlanLegs, legPairKey, selectedModeOf, type AirportStop, type DesiredLeg, type ExistingEngineLeg, type PlanStop } from "./plan-legs";

export type PlanLegsResult =
  | { skipped: "engine_off" | "free_plan" | "no_trip" | "dates_not_confirmed" }
  | {
      skipped?: undefined;
      /** Calls the adapter actually made. */
      calls: number;
      /** Legs answered from this run or the plan's own stored legs — no call made. */
      reused: number;
      written: number;
      kept: number;
      removed: number;
      noRoute: number;
      /** True when a caller's daily cap stopped the run; existing legs were left as last computed. */
      paused: boolean;
      skippedPairs: number;
      /** P0 ruling 7: confirmed legacy legs re-routed this run (present only when > 0). */
      superseded?: number;
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

/** The leg key a stored routed leg was computed under, from its one alternative entry. */
export function engineLegKey(alternativeModes: unknown): string | null {
  const first = Array.isArray(alternativeModes) ? (alternativeModes[0] as any) : null;
  return typeof first?.legKey === "string" ? first.legKey : null;
}

/** The routed legs of the plan's latest Optimize run (its own version legs), for seeding the memo. */
async function latestRunLegs(tripId: string): Promise<Array<typeof transportLegs.$inferSelect>> {
  try {
    const comparison = await storage.getItineraryComparisonByTripId(tripId);
    if (!comparison) return [];
    const rows = await db
      .select({ leg: transportLegs })
      .from(transportLegs)
      .innerJoin(itineraryVariants, eq(itineraryVariants.id, transportLegs.variantId))
      .where(and(eq(itineraryVariants.comparisonId, comparison.id), sql`${transportLegs.source} IS NOT NULL`));
    return rows.map((r) => r.leg);
  } catch (err: any) {
    console.warn("[routing] run legs unreadable (no reuse):", err?.message ?? err);
    return [];
  }
}

/**
 * Step 9b FU-9A-2 (ledger `2026-10-07-step9b-optimizer-and-rechecks`): the plan's flight anchors that
 * carry an airport point — stamped ONLY from an IATA code (`server/services/airport-coords.ts`); a
 * typed airport name has none and stays the fixed-buffer, minutes-free airport leg. The anchor's
 * datetime is the plan's wall clock (R316), so its date and time are read as written.
 */
async function airportStopsForPlan(tripId: string, tripStart: string | null): Promise<AirportStop[]> {
  if (!tripStart) return [];
  const rows = await db
    .select()
    .from(temporalAnchors)
    .where(and(eq(temporalAnchors.tripId, tripId), inArray(temporalAnchors.anchorType, ["flight_arrival", "flight_departure"])));
  const out: AirportStop[] = [];
  for (const a of rows) {
    const p = realPoint(a.latitude, a.longitude);
    if (!p || !a.anchorDatetime) continue;
    const iso = new Date(a.anchorDatetime).toISOString();
    const dayNumber = Math.round((Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) - Date.parse(`${tripStart}T00:00:00Z`)) / 86_400_000) + 1;
    if (dayNumber < 1) continue;
    const arrival = a.anchorType === "flight_arrival";
    const at = Number(iso.slice(11, 13)) * 60 + Number(iso.slice(14, 16));
    const t = arrival ? at + Number(a.bufferAfter ?? 0) : at - Number(a.bufferBefore ?? 0);
    const wallClock = t >= 0 && t < 24 * 60 ? `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}` : null;
    out.push({ id: `anchor:${a.id}`, name: a.location ?? "Airport", dayNumber, direction: arrival ? "arrival" : "departure", point: p, wallClock });
  }
  return out;
}

/**
 * The plan's leg context — its stops, stay and airports as the engine sees them, the legs it should have
 * and the engine legs it holds. ONE loader for the recompute and for a leg's options ask (step 9c D1,
 * ledger `2026-10-07-step9c-leg-options`), so an option is keyed exactly as the recompute would key it.
 */
export async function loadPlanLegContext(tripId: string, trip: NonNullable<Awaited<ReturnType<typeof storage.getTrip>>>) {
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
    // TC-3a (migration 368): a ride's exit pin — the origin of the leg that follows it.
    exitPoint: realPoint(it.exitLatitude, it.exitLongitude),
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
  // An engine leg an expert CONFIRMED (P0 ruling 7 writes these) is never the diff's to remove: its pair
  // is in `confirmedPairs`, so it would read as "no longer wanted" and be deleted.
  const existing: ExistingEngineLeg[] = engineRows.filter((l) => l.proposalStatus !== "confirmed").map((l) => ({
    id: l.id,
    dayNumber: l.dayNumber,
    legOrder: l.legOrder,
    fromActivityId: l.fromActivityId,
    toActivityId: l.toActivityId,
    legKey: engineLegKey(l.alternativeModes),
    userSelectedMode: l.userSelectedMode,
  }));
  const picked = new Map(existing.map((e) => [legPairKey(e.dayNumber, e.fromActivityId, e.toActivityId), selectedModeOf(e)]));
  const marketSlug = (trip.marketSlug ?? "").toLowerCase();
  const profile = (TRANSPORT_PROFILES as Record<string, { availableModes: Array<{ mode: string; available?: boolean }> }>)[marketSlug];
  const { legs: desired, skipped } = desiredPlanLegs(stops, {
    stay,
    hasTransitCoverage: marketHasTransitCoverage(profile?.availableModes),
    selectedMode: (k) => picked.get(k) ?? null,
    airports: await airportStopsForPlan(tripId, trip.startDate ? String(trip.startDate).slice(0, 10) : null),
  });

  const tripStart = trip.startDate ? String(trip.startDate).slice(0, 10) : null;
  // P0 ruling 3: a leg with no time of day departs at a fixed local 10:00 on its trip day, never
  // server-now; its hour bucket (in the leg key) stays its own.
  const departAt = (leg: DesiredLeg): Date | null => {
    if (!tripStart) return null;
    return zonedWallClockToInstant(addCalendarDays(tripStart, leg.dayNumber - 1), legDepartureWallClock(leg.wallClock), trip.timezone);
  };
  const hasTransitCoverage = marketHasTransitCoverage(profile?.availableModes);
  return { desired, skipped, engineRows, existingRows, confirmedPairs, existing, picked, googleFetchedAt, departAt, hasTransitCoverage };
}

export async function computePlanLegs(
  tripId: string,
  deps: { adapter?: RoutingAdapter | null; qualifies?: boolean; now?: () => Date } = {},
): Promise<PlanLegsResult> {
  const adapter = deps.adapter !== undefined ? deps.adapter : routingAdapter();
  if (!adapter) return { skipped: "engine_off" };
  const qualifies = deps.qualifies ?? (await tripGetsRoutedLegs(tripId));
  if (!qualifies) return { skipped: "free_plan" };
  const trip = await storage.getTrip(tripId);
  if (!trip) return { skipped: "no_trip" };
  // Ledger `2026-10-08-e1-zero-questions` (E1 ruling 7): a plan whose dates nobody chose has no real
  // departure instants, so nothing is routed against its placeholder window — the same skip the
  // day-of re-check takes (`leg-recheck.service.ts`). Setting dates re-runs the compute.
  if (!trip.datesConfirmedAt) return { skipped: "dates_not_confirmed" };

  const { desired, skipped, engineRows, existingRows, confirmedPairs, existing, picked, googleFetchedAt, departAt } = await loadPlanLegContext(tripId, trip);
  // P0 ruling 3: a day that is already over is never routed — its legs are frozen (not asked, not
  // recomputed, not deleted), so neither side of the diff sees that day.
  const now = deps.now ? deps.now() : new Date();
  const live = (dayNumber: number) => !planDayIsPast(trip.startDate ? String(trip.startDate) : null, dayNumber, trip.timezone, now);
  const diff = diffPlanLegs(
    desired.filter((d) => live(d.dayNumber)),
    existing.filter((e) => live(e.dayNumber)),
    confirmedPairs,
  );

  // P0 ruling 7 (ledger `2026-10-10-p0-legs-baseline`): a CONFIRMED legacy leg (`source IS NULL` — the
  // pre-engine writer, every leg "driving") is re-routed on the plan's first engine run. The new row is
  // an engine leg that KEEPS `confirmed` (and the expert's stamp, tip and pickup); the legacy row is
  // superseded — hidden (`proposal_status` NULL, which every trip reader skips) and marked
  // `superseded_at` (migration 368; TC-3a closed the interim `origin` marker), never deleted — and the mode change is logged in the plan's change log. The
  // expert's own pick (`user_selected_mode`) is kept as the mode; else the engine's default. A pair with
  // no route keeps its legacy leg as it was. Only pairs the plan still has, on days not yet over.
  const legacyConfirmed = existingRows.filter((l) => l.source == null && l.proposalStatus === "confirmed" && l.variantId == null);
  const desiredByPair = new Map(desired.map((d) => [d.pairKey, d] as const));
  let superseded = 0;

  // No persistent route cache (Google terms, decision-maker Oct 7, 2026): the memo lives for THIS call,
  // seeded only from the plan's OWN legs — its engine legs and its latest run's version legs, by key —
  // so apply reuses what the run already asked for and an unchanged pair is never re-asked.
  const memo = new RouteRunMemo();
  for (const l of [...engineRows, ...(await latestRunLegs(tripId))]) {
    const facts = routedFactsOf(l);
    const key = engineLegKey(l.alternativeModes);
    // A fallback drive (P0 ruling 2) is stored under the transit key; it is never a transit answer, so
    // it is not seeded (the diff keeps its own row by key without asking).
    if (facts && key && !facts.transitUnavailable && Number(l.estimatedDurationMinutes) > 0) {
      memo.seed(key, { durationMin: Number(l.estimatedDurationMinutes), distanceM: Number(l.distanceMeters ?? 0), line: facts.line, fare: facts.fare, provenance: facts.provenance });
    }
  }
  // Step 9c D1/D3 (ledger `2026-10-07-step9c-leg-options`): a leg's asked options are the plan's own
  // answers too, so a mode picked from them is never re-asked.
  for (const l of engineRows) {
    for (const o of (Array.isArray(l.alternativeModes) ? (l.alternativeModes as StoredLegOption[]) : []).slice(1)) {
      if (typeof o?.legKey !== "string" || !o.checkedAt || !(Number(o.durationMinutes) > 0)) continue;
      memo.seed(o.legKey, {
        durationMin: Number(o.durationMinutes),
        distanceM: Number(o.distanceMeters ?? 0),
        line: o.line ?? null,
        fare: o.fare ?? null,
        provenance: { source: o.reason, checkedAt: o.checkedAt },
      });
    }
  }
  let calls = 0;
  let reused = 0;
  let noRoute = 0;
  let paused = false;
  for (const old of legacyConfirmed) {
    if (paused) break;
    const want = desiredByPair.get(legPairKey(old.dayNumber, old.fromActivityId, old.toActivityId));
    if (!want || !live(want.dayNumber)) continue;
    const picked = old.userSelectedMode ? normalizeLegMode(old.userSelectedMode) : null;
    const mode = picked ?? want.mode;
    const asked = await routeWithTransitFallback(memo, adapter, { origin: want.origin, destination: want.to.point, mode, departAt: departAt(want), hourBucket: want.hourBucket });
    calls += asked.calls;
    reused += asked.reused;
    if (asked.outcome.kind === "paused") {
      paused = true;
      break;
    }
    if (asked.outcome.kind !== "ok") continue;
    const route = asked.outcome.route;
    const previousMode = old.userSelectedMode ?? old.recommendedMode ?? null;
    const newMode = LEG_MODE_STORED[asked.mode];
    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM trips WHERE id = ${tripId} FOR UPDATE`);
      const claimed = await tx
        .update(transportLegs)
        .set({ proposalStatus: null, supersededAt: new Date(), updatedAt: new Date() })
        .where(and(eq(transportLegs.id, old.id), eq(transportLegs.tripId, tripId), eq(transportLegs.proposalStatus, "confirmed"), isNull(transportLegs.source)))
        .returning({ id: transportLegs.id });
      if (!claimed.length) return; // a concurrent run superseded it first (§15)
      await tx.insert(transportLegs).values({
        tripId,
        dayNumber: want.dayNumber,
        legOrder: want.legOrder,
        fromActivityId: want.from.id,
        fromName: want.from.name,
        fromLat: want.origin.lat,
        fromLng: want.origin.lng,
        toActivityId: want.to.id,
        toName: want.to.name,
        toLat: want.to.point.lat,
        toLng: want.to.point.lng,
        distanceMeters: route.distanceM,
        distanceDisplay: formatDistance(route.distanceM),
        recommendedMode: newMode,
        userSelectedMode: !asked.transitUnavailable && picked ? LEG_MODE_STORED[picked] : null,
        estimatedDurationMinutes: route.durationMin,
        estimatedCostUsd: null,
        alternativeModes: [
          {
            mode: newMode,
            durationMinutes: route.durationMin,
            costUsd: null,
            energyCost: 0,
            reason: asked.transitUnavailable ? TRANSIT_UNAVAILABLE_REASON : route.provenance.source,
            line: route.line,
            fare: route.fare,
            legKey: routeLegKey(want.origin, want.to.point, mode, want.hourBucket),
            hourBucket: want.hourBucket,
          },
        ] as any,
        energyCost: 0,
        destinationProfile: trip.destination || null,
        proposalStatus: "confirmed",
        checkedBy: old.checkedBy ?? null,
        checkedAt: old.checkedAt ?? null,
        authorTip: old.authorTip ?? null,
        pickupPoint: old.pickupPoint ?? null,
        pickupTime: old.pickupTime ?? null,
        pickupProviderServiceId: old.pickupProviderServiceId ?? null,
        source: route.provenance.source,
        calculatedAt: new Date(route.provenance.checkedAt),
        ...googleCoordStamp(googleFetchedAt.get(want.from.id), googleFetchedAt.get(want.to.id)),
      });
      superseded += 1;
    });
    if (previousMode !== newMode) {
      await storage
        .createItineraryChange({
          tripId,
          activityId: want.from.id,
          who: "Routing engine",
          action: `Re-routed confirmed leg ${want.from.name} → ${want.to.name}: ${previousMode ?? "no mode"} → ${newMode}`,
          changeType: "transport",
          role: "system",
          metadata: { supersededLegId: old.id, previousMode, newMode, transitUnavailable: asked.transitUnavailable },
        } as any)
        .catch((err: any) => console.error("[plan-legs] change-log write failed (non-fatal):", err?.message ?? err));
    }
  }
  const rows: Array<typeof transportLegs.$inferInsert> = [];
  const replacedIds: string[] = [];
  for (const leg of diff.compute) {
    if (paused) break;
    const asked = await routeWithTransitFallback(memo, adapter, {
      origin: leg.origin,
      destination: leg.to.point,
      mode: leg.mode,
      departAt: departAt(leg),
      hourBucket: leg.hourBucket,
    });
    calls += asked.calls;
    reused += asked.reused;
    if (asked.outcome.kind === "paused") {
      paused = true;
      break;
    }
    replacedIds.push(...(diff.replaces.get(leg.pairKey) ?? []));
    if (asked.outcome.kind === "no_route") {
      noRoute++;
      continue;
    }
    const route = asked.outcome.route;
    const rowMode = asked.mode;
    // The fallback drive keeps the DESIRED leg key (the transit one), so an unchanged pair is kept by
    // the diff and not re-asked every run; the traveler's own pick is not carried onto a drive they
    // did not choose.
    const r = { legKey: leg.legKey };
    rows.push({
      tripId,
      dayNumber: leg.dayNumber,
      legOrder: leg.legOrder,
      fromActivityId: leg.from.id,
      fromName: leg.from.name,
      fromLat: leg.origin.lat,
      fromLng: leg.origin.lng,
      toActivityId: leg.to.id,
      toName: leg.to.name,
      toLat: leg.to.point.lat,
      toLng: leg.to.point.lng,
      distanceMeters: route.distanceM,
      distanceDisplay: formatDistance(route.distanceM),
      recommendedMode: LEG_MODE_STORED[rowMode],
      userSelectedMode: !asked.transitUnavailable && picked.get(leg.pairKey) ? LEG_MODE_STORED[picked.get(leg.pairKey)!] : null,
      estimatedDurationMinutes: route.durationMin,
      estimatedCostUsd: null,
      // The ONE alternative entry carries the facts the row has no column for: line, fare (source
      // currency, never converted — L6) and the leg key the pair diff compares (ruling 10).
      alternativeModes: [
        {
          mode: LEG_MODE_STORED[rowMode],
          durationMinutes: route.durationMin,
          costUsd: null,
          energyCost: 0,
          reason: asked.transitUnavailable ? TRANSIT_UNAVAILABLE_REASON : route.provenance.source,
          line: route.line,
          fare: route.fare,
          legKey: r.legKey,
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
    reused,
    written: rows.length,
    kept: diff.keep.length,
    removed: removeIds.length,
    noRoute,
    paused,
    skippedPairs: skipped.length,
    ...(superseded ? { superseded } : {}),
  };
}

/**
 * P0 legs rulings 2 and 6 (ledger `2026-10-10-p0-legs-baseline`): per plan day, how many legs the plan
 * SHOULD have (the ONE `desiredPlanLegs`, bridges included) and shows none — a "no route found" marker
 * the FD-3 day line counts and the re-check reports. Counted only where the engine could have answered:
 * the engine on, a routed plan, chosen dates, a day not yet over. Empty map otherwise (nothing claimed).
 * Read only — never writes a leg.
 */
export async function planLegGapsByDay(tripId: string, now: Date = new Date()): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  if (!routingAdapter()) return out;
  if (!(await tripGetsRoutedLegs(tripId))) return out;
  const trip = await storage.getTrip(tripId);
  if (!trip || !trip.datesConfirmedAt) return out;
  const { desired } = await loadPlanLegContext(tripId, trip);
  const shown = new Set(((await tripLegsShown(tripId)) as any[]).map((l) => legPairKey(l.dayNumber, l.fromActivityId, l.toActivityId)));
  for (const d of desired) {
    if (planDayIsPast(trip.startDate ? String(trip.startDate) : null, d.dayNumber, trip.timezone, now)) continue;
    if (!shown.has(d.pairKey)) out.set(d.dayNumber, (out.get(d.dayNumber) ?? 0) + 1);
  }
  return out;
}

/**
 * The routing context for an Optimize run's versions (step 9a ruling 6): the adapter, the plan's
 * transit coverage, its first day and zone, ONE in-memory memo for the run, and its stops' place IDs (so a
 * version stop keys a leg exactly as the plan stop it came from — the apply then reuses the run's own
 * version legs, stored on the plan's rows). Null when
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
      memo: new RouteRunMemo(),
      hasTransitCoverage: marketHasTransitCoverage(profile?.availableModes),
      tripStart: trip.startDate ? String(trip.startDate).slice(0, 10) : null,
      timezone: trip.timezone ?? null,
    },
    placeIdFor: (id) => (id ? refs.get(id)?.placeId ?? null : null),
  };
}
