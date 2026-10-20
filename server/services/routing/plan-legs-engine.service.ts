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
import { itineraryVariants, serviceRoutePoints, temporalAnchors, transportLegs } from "@shared/schema";
import { rowCoordinatesTrusted } from "@shared/ai-place-text";
import { CACHEABLE_ROUTE_SOURCES, STRAIGHT_LINE_EST_SOURCE, marketTransitRouting, routedLegReason, routeLegKey, type RoutePoint, type RoutingAdapter } from "@shared/routing-engine";
import { LEG_MODE_STORED, normalizeLegMode, straightLineMinutes } from "@shared/travel-speeds";
import { haversineMeters } from "@shared/geo";
import type { StoredLegOption } from "@shared/leg-options";
import { zonedWallClockToInstant, addCalendarDays } from "@shared/plan-timing";
import { storage } from "../../storage";
import { TRANSPORT_PROFILES } from "../../data/transport-profiles";
import { formatDistance } from "../transport-leg-calculator";
import { factPointsForTrip, factsForTrip, placeRefsForTrip } from "../content-facts/place-facts.service";
import { stayPointForPlan } from "../stay-reroute.service";
import { openCoordsForItemIds, openCoordsForPlaceIds, type OpenPlaceCoord } from "./open-place-coords.service";
import { pulledOpenItems } from "./open-coord-review.service";
import { acceptedPoint, openPlaceForItem, routingPointFor } from "./open-routing-points";
import { meetingOrStayItem } from "@shared/meeting-point-items";
import { isOpenCoordOrigin } from "@shared/open-coords";
import { routingAdapter } from "./index";
import { RouteRunMemo, routeWithTransitFallback } from "./route-memo";
import { flightAnchorClock, legDepartureWallClock, planDayIsPast, routedFactsOf } from "./plan-legs";
import { tripGetsRoutedLegs, tripLegsShown } from "./plan-routed-legs.service";
import { desiredPlanLegs, diffPlanLegs, legPairKey, planLegsSkipReason, selectedModeOf, type AirportStop, type PlanLegsSkipReason, type DesiredLeg, type ExistingEngineLeg, type PlanStop } from "./plan-legs";

export type PlanLegsResult =
  | { skipped: PlanLegsSkipReason }
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
      /**
       * 9b-d: pairs whose call went unanswered (a failed call, or a mode the router does not serve) — the
       * pair keeps its last leg. Present only when > 0.
       */
      unanswered?: number;
      /** True when a caller's daily cap stopped the run; existing legs were left as last computed. */
      paused: boolean;
      skippedPairs: number;
      /** P0 ruling 7: confirmed legacy legs re-routed this run (present only when > 0). */
      superseded?: number;
      /** P0 ruling 7 as amended: confirmed legacy legs retired (unlocated stop, no replacement); present only when > 0. */
      retiredLegacy?: number;
    };

function realPoint(lat: unknown, lng: unknown): { lat: number; lng: number } | null {
  if (lat == null || lng == null) return null;
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln) || Math.abs(la) > 90 || Math.abs(ln) > 180 || (la === 0 && ln === 0)) return null;
  return { lat: la, lng: ln };
}

/**
 * 9b-b (ledger `2026-10-16-9b-b-legs-off-google`; 9b spec T1/T3, Phase 0 rulings 1–2 and 5): a leg whose
 * `source` is a router whose answers may not be stored (Google Routes — anything outside
 * `CACHEABLE_ROUTE_SOURCES`). The engine never keeps one as its answer: a proposed one is recomputed by the
 * diff, a confirmed one is re-routed and superseded exactly as a legacy `source IS NULL` leg is (P0 ruling 7),
 * so a run on a plan holding Google legs rebuilds them through the current adapter (OSRM or the stub).
 */
export function legNeedsRebuild(source: string | null | undefined): boolean {
  return source != null && !CACHEABLE_ROUTE_SOURCES.has(source);
}
/** The same predicate as SQL, for the conditional supersede: a legacy leg, or one `legNeedsRebuild` names. */
const legacyOrRebuildSql = sql`(${transportLegs.source} IS NULL OR ${transportLegs.source} NOT IN (${sql.join(Array.from(CACHEABLE_ROUTE_SOURCES).map((s) => sql`${s}`), sql`, `)}))`;

/**
 * Migration 386 (9b spec ED2): the plan-timezone "HH:MM" this leg was routed for — the same wall clock
 * `departAt` turns into the instant it asks with (P0 ruling 3's 10:00 when the stop has no time). NULL when
 * the leg was asked with no departure (no trip start), so nothing is claimed that was not asked.
 */
export function routedDepartureLocalFor(leg: Pick<DesiredLeg, "wallClock">, departAt: (leg: any) => Date | null): string | null {
  return departAt(leg) ? legDepartureWallClock(leg.wallClock) : null;
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

/** The plan's ride services whose every route point is a seeded OSM node (TC-3) — their item pins are OSM. */
export async function osmRideServiceIds(serviceIds: readonly string[]): Promise<Set<string>> {
  const ids = Array.from(new Set(serviceIds.filter(Boolean)));
  if (ids.length === 0) return new Set();
  const rows = await db
    .select({ serviceId: serviceRoutePoints.serviceId, nodes: sql<number>`count(${serviceRoutePoints.osmNodeId})::int`, total: sql<number>`count(*)::int` })
    .from(serviceRoutePoints)
    .where(inArray(serviceRoutePoints.serviceId, ids))
    .groupBy(serviceRoutePoints.serviceId);
  return new Set(rows.filter((r) => Number(r.total) > 0 && Number(r.nodes) === Number(r.total)).map((r) => r.serviceId));
}

/**
 * LG-1 follow-up (ledger `2026-10-18-google-writers-open-coords`): each item's OPEN routing point — the SAME
 * `routingPointFor` the engine routes a stop from (§18 rule 1), kept only when its origin is open (an admin or OSM
 * row linked to the item or keyed by its place id, or a ride's seeded OSM node). An item with none is absent from the map. Read by the writers
 * that may not use a Google-derived point or minute: the stay pick, Ready-Made clone legs and the intelligence
 * travel total.
 */
export async function openPointsForItems(
  tripId: string,
  items: ReadonlyArray<{ id: string; title?: string | null; googlePlaceId?: string | null; providerServiceId?: string | null; latitude?: unknown; longitude?: unknown; origin?: string | null; locationName?: string | null; locationAddress?: string | null }>,
): Promise<Map<string, RoutePoint>> {
  const out = new Map<string, RoutePoint>();
  if (!items.length) return out;
  const placeRefs = await placeRefsForTrip(tripId, items.map((i) => i.id));
  const placeIdOf = (it: (typeof items)[number]): string | null => it.googlePlaceId || placeRefs.get(it.id)?.placeId || null;
  const [openCoords, itemOpen, pulled, osmRides] = await Promise.all([
    openCoordsForPlaceIds(items.map(placeIdOf).filter((p): p is string => !!p)),
    openCoordsForItemIds(items.map((it) => it.id)),
    pulledOpenItems(items.map((it) => it.id)),
    osmRideServiceIds(items.map((it) => it.providerServiceId ?? "").filter(Boolean)),
  ]);
  for (const it of items) {
    const p = routingPointFor({
      placeId: placeRefs.get(it.id)?.placeId ?? null,
      lookupPlaceId: placeIdOf(it),
      open: openCoords,
      itemOpen: itemOpen.get(it.id) ?? null,
      itemPulled: pulled.has(it.id),
      ownPoint: rowCoordinatesTrusted(it as any) ? realPoint(it.latitude, it.longitude) : null,
      factPoint: null,
      osmRide: !!it.providerServiceId && osmRides.has(it.providerServiceId),
      // LG-2 Ask 5: no stay is known here, so a check-in, arrival or private tour has a point only when a person chose one.
      meetingOrStay: meetingOrStayItem(it.title),
    });
    if (p && isOpenCoordOrigin(p.coordOrigin)) out.set(it.id, p);
  }
  return out;
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
    // LB8 (ledger `2026-10-18-lb8-lb9-card-wiring`): the ONE flight-anchor clock the Trip Card's leave-by reads too.
    const { dayNumber, direction, wallClock } = flightAnchorClock(a, tripStart);
    if (dayNumber < 1) continue;
    // LG-1: an airport point is stamped only from an IATA code (never Google), so it is an open coordinate.
    out.push({ id: `anchor:${a.id}`, name: a.location ?? "Airport", dayNumber, direction, point: { ...p, coordOrigin: "iata" }, wallClock });
  }
  return out;
}

/**
 * The plan's leg context — its stops, stay and airports as the engine sees them, the legs it should have
 * and the engine legs it holds. ONE loader for the recompute and for a leg's options ask (step 9c D1,
 * ledger `2026-10-07-step9c-leg-options`), so an option is keyed exactly as the recompute would key it.
 */
export async function loadPlanLegContext(
  tripId: string,
  trip: NonNullable<Awaited<ReturnType<typeof storage.getTrip>>>,
  opts: { acceptsPoint?: (p: RoutePoint) => boolean } = {},
) {
  // LG-1: which points the routing adapter may be given — the caller's adapter, else the live one. OSRM takes open
  // coordinates only; a refused stop is unlocated for routing (no routed leg in or out — LG-2 Ask 6: never bridged).
  const liveAdapter = opts.acceptsPoint ? null : routingAdapter();
  const acceptsPoint = opts.acceptsPoint ?? (liveAdapter?.acceptsPoint ? (p: RoutePoint) => liveAdapter.acceptsPoint!(p) : undefined);
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
  const placeIdOf = (it: any): string | null => (it.googlePlaceId as string | null) || placeRefs.get(it.id)?.placeId || null;
  const engineItemIds = [...items.map((it: any) => it.id as string), ...(stayPoint ? [stayPoint.itemId] : [])];
  const [openCoords, itemOpen, pulled, osmRides] = await Promise.all([
    openCoordsForPlaceIds([...items.map(placeIdOf), stayPoint ? placeIdOf(items.find((i: any) => i.id === stayPoint.itemId) ?? { id: stayPoint.itemId }) : null].filter((p): p is string => !!p)),
    // LG-1 re-key (migration 390): the open place each item is linked to — reached without a Google place id.
    openCoordsForItemIds(engineItemIds),
    // LG-2 Ask 1 (migration 391): an item whose link is pulled for review does not fall back by place id.
    pulledOpenItems(engineItemIds),
    osmRideServiceIds(items.map((it: any) => it.providerServiceId).filter(Boolean)),
  ]);
  // The stay is resolved first: a check-in, an arrival or a private tour routes from it (LG-2 Ask 5).
  const stayItem: any = stayPoint ? items.find((i: any) => i.id === stayPoint.itemId) ?? { id: stayPoint.itemId } : null;
  const stayRoutePoint = stayPoint
    ? acceptedPoint(
        routingPointFor({
          placeId: placeRefs.get(stayPoint.itemId)?.placeId ?? null,
          lookupPlaceId: placeIdOf(stayItem),
          open: openCoords,
          itemOpen: itemOpen.get(stayPoint.itemId) ?? null,
          itemPulled: pulled.has(stayPoint.itemId),
          ownPoint: { lat: stayPoint.lat, lng: stayPoint.lng },
          factPoint: null,
          osmRide: false,
        }),
        acceptsPoint,
      )
    : null;
  const pointFor = (it: any): RoutePoint | null => {
    const own = rowCoordinatesTrusted(it) ? realPoint(it.latitude, it.longitude) : null;
    const fact = own ? null : factPoints.get(it.id) ?? null;
    const p = acceptedPoint(
      routingPointFor({
        placeId: placeRefs.get(it.id)?.placeId ?? null,
        lookupPlaceId: placeIdOf(it),
        open: openCoords,
        itemOpen: itemOpen.get(it.id) ?? null,
        itemPulled: pulled.has(it.id),
        ownPoint: own,
        factPoint: fact,
        osmRide: !!it.providerServiceId && osmRides.has(it.providerServiceId),
        // LG-2 Ask 5: a check-in, an arrival or a private tour routes from a chosen point or the stay, else nowhere.
        meetingOrStay: stayPoint && it.id === stayPoint.itemId ? null : meetingOrStayItem(it.title),
        stayPoint: stayRoutePoint,
      }),
      acceptsPoint,
    );
    if (p && p.coordOrigin === "google" && fact && p.lat === fact.lat && p.lng === fact.lng) {
      const g = (factViews[it.id] ?? []).find(
        (f: any) => !f.stale && f.factType === "location" && f.origin === "places_api" && Number((f.value as any)?.lat) === fact.lat && Number((f.value as any)?.lng) === fact.lng,
      ) as any;
      if (g?.checkedAt) googleFetchedAt.set(it.id, new Date(g.checkedAt));
    }
    return p;
  };
  const stops: PlanStop[] = items.map((it: any) => ({
    id: it.id,
    name: it.title || "Stop",
    dayNumber: it.dayNumber,
    point: pointFor(it),
    // LG-2 Ask 7b interim: a path entered at its start (a hand-picked point a person attached) — the leg leaving it waits.
    leavingUnchecked: (() => {
      const o = itemOpen.get(it.id);
      return !!o && o.linkSource === "admin" && o.pointBasis === "path_start";
    })(),
    // TC-3a (migration 368): a ride's exit pin — the origin of the leg that follows it.
    // LG-1: the exit pin is the ride's last seeded OSM node — open only when the ride's points are all OSM nodes.
    exitPoint: acceptedPoint(
      (() => {
        const e = realPoint(it.exitLatitude, it.exitLongitude);
        return e ? { ...e, coordOrigin: it.providerServiceId && osmRides.has(it.providerServiceId) ? ("osm_node" as const) : ("google" as const) } : null;
      })(),
      acceptsPoint,
    ),
    startTime: it.startTime || null,
    endTime: it.endTime || null,
    durationMinutes: it.durationMinutes ?? null,
  }));
  if (stayPoint?.source === "google" && stayPoint.fetchedAt && stayRoutePoint?.coordOrigin === "google") googleFetchedAt.set(stayPoint.itemId, stayPoint.fetchedAt);
  const stay =
    stayPoint && stayRoutePoint
      ? {
          id: stayPoint.itemId,
          name: stayPoint.name,
          dayNumber: 0,
          point: stayRoutePoint,
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
    // 9b-b: a Google-sourced leg never matches a desired key, so the diff recomputes (and replaces) it.
    legKey: legNeedsRebuild(l.source) ? `rebuild:${l.id}` : engineLegKey(l.alternativeModes),
    userSelectedMode: l.userSelectedMode,
  }));
  const picked = new Map(existing.map((e) => [legPairKey(e.dayNumber, e.fromActivityId, e.toActivityId), selectedModeOf(e)]));
  const marketSlug = (trip.marketSlug ?? "").toLowerCase();
  const profile = (TRANSPORT_PROFILES as Record<string, { availableModes: Array<{ mode: string; available?: boolean }>; apiTransitCoverage?: boolean }>)[marketSlug];
  const { hasTransitCoverage, transitApiUncovered } = marketTransitRouting(profile);
  const { legs: desired, skipped } = desiredPlanLegs(stops, {
    stay,
    hasTransitCoverage,
    selectedMode: (k) => picked.get(k) ?? null,
    airports: (await airportStopsForPlan(tripId, trip.startDate ? String(trip.startDate).slice(0, 10) : null)).filter((a) => acceptedPoint(a.point, acceptsPoint)),
  });

  const tripStart = trip.startDate ? String(trip.startDate).slice(0, 10) : null;
  // P0 ruling 3: a leg with no time of day departs at a fixed local 10:00 on its trip day, never
  // server-now; its hour bucket (in the leg key) stays its own.
  const departAt = (leg: DesiredLeg): Date | null => {
    if (!tripStart) return null;
    return zonedWallClockToInstant(addCalendarDays(tripStart, leg.dayNumber - 1), legDepartureWallClock(leg.wallClock), trip.timezone);
  };
  // P0-d (ledger `2026-10-12-p0d-coverage-bridges`): `stops` and `stay` are returned so the findings'
  // coverage check pairs the day's stops exactly as the engine does (§18 rule 1).
  return { desired, skipped, engineRows, existingRows, confirmedPairs, existing, picked, googleFetchedAt, departAt, hasTransitCoverage, transitApiUncovered, stops, stay };
}

export async function computePlanLegs(
  tripId: string,
  deps: { adapter?: RoutingAdapter | null; qualifies?: boolean; now?: () => Date } = {},
): Promise<PlanLegsResult> {
  const result = await computePlanLegsCore(tripId, deps);
  // P0-c item 3 (ledger `2026-10-12-p0c-hotfix`; LD 69): at the end of every recompute — skipped or not —
  // the Trip Card's frozen snapshot takes the live plan's items for every day not yet past. Runs inside the
  // same debounced call, never on read; a failed refresh never fails the recompute (§15b).
  try {
    const { refreshTripFinalLiveDays } = await import("../trip-finalize.service");
    await refreshTripFinalLiveDays(tripId, deps.now ? deps.now() : new Date());
  } catch (err: any) {
    console.warn(`[routing] trip card refresh failed for ${tripId}: ${String(err?.message ?? err).slice(0, 200)}`);
  }
  return result;
}

async function computePlanLegsCore(
  tripId: string,
  deps: { adapter?: RoutingAdapter | null; qualifies?: boolean; now?: () => Date } = {},
): Promise<PlanLegsResult> {
  const adapter = deps.adapter !== undefined ? deps.adapter : routingAdapter();
  const qualifies = deps.qualifies ?? (await tripGetsRoutedLegs(tripId));
  const trip = adapter && qualifies ? await storage.getTrip(tripId) : undefined;
  // Ledger `2026-10-08-e1-zero-questions` (E1 ruling 7): a plan whose dates nobody chose has no real
  // departure instants, so nothing is routed against its placeholder window — the same skip the
  // day-of re-check takes (`leg-recheck.service.ts`). Setting dates re-runs the compute. The order is
  // the ONE `planLegsSkipReason` (P0-b item 1), which the plan card's `legsSkipped` also reads; its last
  // gate — the dates — is the E1 line itself, kept as written.
  const skipReason = planLegsSkipReason({ engineOn: !!adapter, qualifies, tripExists: !!trip, datesConfirmed: true });
  if (skipReason || !adapter || !trip) return { skipped: skipReason ?? "no_trip" };
  if (!trip.datesConfirmedAt) return { skipped: "dates_not_confirmed" };

  const { desired, skipped, engineRows, existingRows, confirmedPairs, existing, picked, googleFetchedAt, departAt, transitApiUncovered } = await loadPlanLegContext(tripId, trip, {
    acceptsPoint: adapter.acceptsPoint ? (p) => adapter.acceptsPoint!(p) : () => true,
  });
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
  // 9b-b: a confirmed Google-sourced leg is re-routed the same way (`legNeedsRebuild`).
  const legacyConfirmed = existingRows.filter((l) => (l.source == null || legNeedsRebuild(l.source)) && l.proposalStatus === "confirmed" && l.variantId == null);
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
    // 9b-b (9b spec T1): a stored Google answer is never re-stored as a new leg — only an OSRM or stub
    // answer seeds the memo (`CACHEABLE_ROUTE_SOURCES`). An unchanged Google leg is kept by the diff as it is.
    if (facts && key && !facts.transitUnavailable && Number(l.estimatedDurationMinutes) > 0 && CACHEABLE_ROUTE_SOURCES.has(facts.provenance.source)) {
      memo.seed(key, { durationMin: Number(l.estimatedDurationMinutes), distanceM: Number(l.distanceMeters ?? 0), line: facts.line, fare: facts.fare, provenance: facts.provenance });
    }
  }
  // Step 9c D1/D3 (ledger `2026-10-07-step9c-leg-options`): a leg's asked options are the plan's own
  // answers too, so a mode picked from them is never re-asked.
  for (const l of engineRows) {
    for (const o of (Array.isArray(l.alternativeModes) ? (l.alternativeModes as StoredLegOption[]) : []).slice(1)) {
      if (typeof o?.legKey !== "string" || !o.checkedAt || !(Number(o.durationMinutes) > 0)) continue;
      if (!CACHEABLE_ROUTE_SOURCES.has(String(o.reason))) continue;
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
  let unanswered = 0;
  let paused = false;
  let retiredLegacy = 0;
  const unlocatedPairs = new Set(skipped.map((p) => legPairKey(p.dayNumber, p.fromItemId, p.toItemId)));
  for (const old of legacyConfirmed) {
    if (paused) break;
    const pairKey = legPairKey(old.dayNumber, old.fromActivityId, old.toActivityId);
    const want = desiredByPair.get(pairKey);
    // P0 ruling 7 as amended (P0-b item 2, ledger `2026-10-11-p0b-routing-follow-ups`): a legacy leg whose
    // pair has an UNLOCATED stop cannot be re-routed, so it is retired — superseded with no replacement
    // (`superseded_at` set, `superseded_by_item_id` left null), never deleted. The slip then reads the gap
    // as "not worked out yet — <stop> isn't on the map". No unsourced leg shows on a routed plan.
    if (!want) {
      if (unlocatedPairs.has(pairKey) && live(old.dayNumber)) {
        const retired = await db
          .update(transportLegs)
          .set({ proposalStatus: null, supersededAt: new Date(), updatedAt: new Date() })
          .where(and(eq(transportLegs.id, old.id), eq(transportLegs.tripId, tripId), eq(transportLegs.proposalStatus, "confirmed"), legacyOrRebuildSql))
          .returning({ id: transportLegs.id });
        if (retired.length) {
          retiredLegacy += 1;
          console.info(`[routing] legacy leg ${old.id} retired on ${tripId}: missing_coordinates`);
        }
      }
      continue;
    }
    if (!live(want.dayNumber)) continue;
    // P0-b item 9: a mode copied from `recommended_mode` on confirm (no checker, the same value) is not a
    // traveler's or an expert's choice, so it does not pin the re-route; only a real pick does.
    const copied = old.checkedBy == null && old.userSelectedMode != null && old.userSelectedMode === old.recommendedMode;
    const picked = old.userSelectedMode && !copied ? normalizeLegMode(old.userSelectedMode) : null;
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
        .where(and(eq(transportLegs.id, old.id), eq(transportLegs.tripId, tripId), eq(transportLegs.proposalStatus, "confirmed"), legacyOrRebuildSql))
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
            reason: routedLegReason({ transitUnavailable: asked.transitUnavailable, transitApiUncovered, mode: asked.mode, picked: picked != null, source: route.provenance.source }),
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
        routedDepartureLocal: routedDepartureLocalFor(want, departAt),
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
    // 9b-d (Leon's ruling, Oct 17, 2026): a call that went UNANSWERED (failed, or a mode the router does
    // not serve) learned nothing — the pair keeps its last leg and the next run asks again (§13: an outage is
    // never "no route").
    if (asked.outcome.kind === "no_route" && asked.outcome.unanswered) {
      unanswered++;
      continue;
    }
    replacedIds.push(...(diff.replaces.get(leg.pairKey) ?? []));
    if (asked.outcome.kind === "no_route") {
      // The router's OWN answer that no route exists: the pair shows a labelled straight-line estimate (a
      // drive at the ONE configured speed), never a routed leg — `STRAIGHT_LINE_EST_SOURCE` is read as "est."
      // everywhere, and it is outside the cacheable set, so the next run asks the pair again.
      noRoute++;
      const meters = Math.round(haversineMeters(leg.origin.lat, leg.origin.lng, leg.to.point.lat, leg.to.point.lng));
      const minutes = straightLineMinutes(meters, "drive");
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
        distanceMeters: meters,
        distanceDisplay: formatDistance(meters),
        recommendedMode: LEG_MODE_STORED.drive,
        userSelectedMode: null,
        estimatedDurationMinutes: minutes,
        estimatedCostUsd: null,
        alternativeModes: [{ mode: LEG_MODE_STORED.drive, durationMinutes: minutes, costUsd: null, energyCost: 0, reason: STRAIGHT_LINE_EST_SOURCE, line: null, fare: null, legKey: leg.legKey, hourBucket: leg.hourBucket }] as any,
        energyCost: 0,
        destinationProfile: trip.destination || null,
        proposalStatus: "proposed",
        source: STRAIGHT_LINE_EST_SOURCE,
        routedDepartureLocal: null,
        calculatedAt: new Date(),
      });
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
          reason: routedLegReason({ transitUnavailable: asked.transitUnavailable, transitApiUncovered, mode: rowMode, picked: picked.get(leg.pairKey) != null, source: route.provenance.source }),
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
      routedDepartureLocal: routedDepartureLocalFor(leg, departAt),
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
    ...(unanswered ? { unanswered } : {}),
    paused,
    skippedPairs: skipped.length,
    ...(superseded ? { superseded } : {}),
    ...(retiredLegacy ? { retiredLegacy } : {}),
  };
}

/**
 * P0 legs rulings 2 and 6 (ledger `2026-10-10-p0-legs-baseline`): per plan day, how many legs the plan
 * SHOULD have (the ONE `desiredPlanLegs`, adjacent pairs only — LG-2 Ask 6) and shows none — a "no route found" marker
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
 * LG-2 Ask 6 (decision-maker, Oct 19, 2026): per plan day, the ADJACENT pairs whose leg has no travel time because a
 * stop has no open coordinate — the ONE `desiredPlanLegs` skip list (§18 rule 1). Each such leg exists with no time
 * and reads "Travel time not checked yet"; the day line counts them, so the day's check never reads as a pass. Only
 * on a plan that earns routed legs (a free plan shows no legs at all). Read only — never writes a leg.
 */
export async function planLegsNotCheckedByDay(tripId: string): Promise<Map<number, Array<{ fromActivityId: string; toActivityId: string }>>> {
  const out = new Map<number, Array<{ fromActivityId: string; toActivityId: string }>>();
  if (!(await tripGetsRoutedLegs(tripId))) return out;
  const trip = await storage.getTrip(tripId);
  if (!trip) return out;
  const { skipped } = await loadPlanLegContext(tripId, trip);
  for (const p of skipped) {
    out.set(p.dayNumber, [...(out.get(p.dayNumber) ?? []), { fromActivityId: p.fromItemId, toActivityId: p.toItemId }]);
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
  /** LG-1: the open coordinate (admin row, else OSM match) for a version stop's plan item, else null. */
  openFor: (sourceItemId: string | null | undefined) => OpenPlaceCoord | null;
  /** LG-2 Ask 5: the version stop's plan item is a check-in, arrival or private tour — no Google point stands in. */
  meetingOrStayFor: (sourceItemId: string | null | undefined) => string | null;
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
  const placeIdOf = new Map(items.map((i: any) => [i.id, ((i.googlePlaceId as string | null) || refs.get(i.id)?.placeId || null) as string | null] as const));
  const meetingOf = new Map(items.map((i: any) => [i.id as string, meetingOrStayItem(i.title)] as const));
  const [open, itemOpen, pulled] = await Promise.all([
    openCoordsForPlaceIds(Array.from(placeIdOf.values()).filter((p): p is string => !!p)),
    openCoordsForItemIds(items.map((i: any) => i.id as string)),
    pulledOpenItems(items.map((i: any) => i.id as string)),
  ]);
  const profile = (TRANSPORT_PROFILES as Record<string, { availableModes: Array<{ mode: string; available?: boolean }>; apiTransitCoverage?: boolean }>)[(trip.marketSlug ?? "").toLowerCase()];
  const transit = marketTransitRouting(profile);
  return {
    ctx: {
      adapter,
      memo: new RouteRunMemo(),
      hasTransitCoverage: transit.hasTransitCoverage,
      transitApiUncovered: transit.transitApiUncovered,
      tripStart: trip.startDate ? String(trip.startDate).slice(0, 10) : null,
      timezone: trip.timezone ?? null,
    },
    placeIdFor: (id) => (id ? refs.get(id)?.placeId ?? null : null),
    // The same order as `routingPointFor`: an admin row for the place id, the item's own open place, a place-id match
    // (none for an item whose link is pulled for review, LG-2 Ask 1).
    openFor: (id) => {
      if (!id) return null;
      const pid = placeIdOf.get(id) ?? null;
      return openPlaceForItem({ byPlace: pid ? open.get(pid) ?? null : null, itemOpen: itemOpen.get(id) ?? null, itemPulled: pulled.has(id), meetingOrStay: meetingOf.get(id) ?? null });
    },
    meetingOrStayFor: (id) => (id ? meetingOf.get(id) ?? null : null),
  };
}

/**
 * ONE recompute of an Optimize version's legs from its own items, through the engine (step 9a ruling 6).
 * Shared by POST /api/itinerary-variants/:variantId/calculate-transport and the 9b-b rebuild (§18 rule 1):
 * refused when the version belongs to no plan, the plan does not earn routed legs, or the engine is off.
 * The caller owns authorization.
 */
export async function recalculateVariantLegs(
  variantId: string,
  userPrefs: Record<string, unknown> = {},
): Promise<{ refused: "not_found" | "routed_legs_not_included" | "routing_engine_off" } | { legs: import("../transport-leg-calculator").TransportLegResult[] }> {
  const variant = await storage.getItineraryVariantById(variantId);
  if (!variant) return { refused: "not_found" };
  const comparison = await storage.getItineraryComparison(variant.comparisonId);
  if (!comparison) return { refused: "not_found" };
  if (!comparison.tripId || !(await tripGetsRoutedLegs(comparison.tripId))) return { refused: "routed_legs_not_included" };
  const items = await storage.getItineraryVariantItemsByVariantId(variantId);
  const version = await versionRoutingFor(comparison.id);
  const routing = version?.ctx ?? null;
  if (!routing) return { refused: "routing_engine_off" };
  // LG-1: a stop whose plan item has an open coordinate routes from it; any other point is Google (OSRM refuses it).
  const activities = items
    .filter((item) =>
      version?.openFor((item as any).sourceItemId)
        ? true
        : !version?.meetingOrStayFor((item as any).sourceItemId) && !!(item.latitude && item.longitude),
    )
    .map((item, idx) => {
      const open = version?.openFor((item as any).sourceItemId) ?? null;
      return {
        id: item.id,
        name: item.name,
        lat: open ? open.lat : parseFloat(item.latitude as any),
        lng: open ? open.lng : parseFloat(item.longitude as any),
        coordOrigin: open ? open.origin : ("google" as const),
        scheduledTime: item.startTime || `09:${String((idx * 30) % 60).padStart(2, "0")}`,
        dayNumber: item.dayNumber,
        order: item.sortOrder || idx,
      };
    });
  const { calculateTransportLegs } = await import("../transport-leg-calculator");
  const legs = await calculateTransportLegs(variantId, activities, comparison.destination || "", userPrefs as any, routing);
  return { legs };
}
