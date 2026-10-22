/**
 * The free preview's FINDINGS (surface step 4, spec v1.2 §8; rulings R-f, R-l, R-v; ledger
 * `2026-10-03-surface-step4-optimizer-lead`). Reads what the plan already holds and hands it to the
 * pure rules in `shared/optimizer-lead.ts` — no model call, no network.
 *
 *   items    the plan's rows: day, draft time, title. A stop's point is ONLY its open, non-Google
 *            coordinate (FB-1 steps 1–2; LG-1's rule) — for the path findings and the rides alike
 *   hours    the plan's stored opening-hours facts (`factsForTrip`), with their own checkedAt
 *   anchors  the plan's temporal anchors (the ONE overlap rule validate-schedule uses)
 *   energy   the plan's `energy_tracking` rows (its pace verdict per day)
 *   legs     the plan's own transport legs (the rows the traveler sees) — reachability reads their
 *            minutes and nothing else (Slice A2, `shared/leg-reachability.ts`)
 *
 * R-f: only KINDS and COUNTS leave this module — never a re-sequenced order. Read behind the
 * caller's own plan gate (`GET /api/optimization-preview`, `authorizeTripLogistics`).
 */
import { tripLegsShown } from "./routing/plan-routed-legs.service";
import { legIsRouted } from "./routing/plan-legs";
import { and, asc, eq } from "drizzle-orm";
import { db } from "../db";
import { itineraryItems, trips } from "@shared/schema";
import { rowCoordinatesTrusted } from "@shared/ai-place-text";
import {
  findingStopLines,
  parseDayHours,
  planLegCoverage,
  type Finding,
  type LegCoverage,
  type NotChecked,
} from "@shared/optimizer-lead";
import { checkPlan, checkStop, feasibilityView, type PlanCheckInput, type PlanFix } from "@shared/plan-check";
import { planDayIsPast } from "@shared/plan-timing";
import { factPointsForTrip, feasibilityFactsForTrip, placeRefsForTrip } from "./content-facts/place-facts.service";
import { openCoordsForItemIds, openCoordsForPlaceIds } from "./routing/open-place-coords.service";
import { pulledOpenItems } from "./routing/open-coord-review.service";
import { meetingOrStayItem } from "@shared/meeting-point-items";
import { routingPointFor } from "./routing/open-routing-points";
import { osmRideServiceIds } from "./routing/plan-legs-engine.service";
import { isOpenCoordOrigin } from "@shared/open-coords";
import { loadMarketAreaNames } from "./content-facts/market-areas";
import { unnamedPlaceReason } from "@shared/place-name-gate";
import { type DayFeasibility } from "@shared/plan-feasibility";
import { marketHasTransitCoverage } from "@shared/routing-engine";
import { TRANSPORT_PROFILES } from "../data/transport-profiles";
import { storage } from "../storage";

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function isoOf(v: unknown): string | null {
  const s = v instanceof Date ? v.toISOString() : String(v ?? "");
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
}

/**
 * FB-1 step 2 (ledger `2026-10-18-fb1-pure-checker`): the ONE read of a trip's plan-check input. The decision is
 * `checkPlan` (shared/plan-check.ts, pure); the preview's findings, the day line and a stop's hours all read it
 * through here, so they can never disagree (§18 rule 1). A stop's point is its OPEN coordinate only — LG-1's rule
 * (`routingPointFor` + `isOpenCoordOrigin`), never a Google point (FB-1 steps 1 and 2).
 */
export async function loadPlanCheckInput(tripId: string): Promise<{ input: PlanCheckInput; hasPricedItems: boolean; found: boolean }> {
  const [trip] = await db.select({ startDate: trips.startDate, marketSlug: trips.marketSlug }).from(trips).where(eq(trips.id, tripId)).limit(1);
  const start = isoOf(trip?.startDate);
  const market = trip?.marketSlug ?? null;
  const rows = await db
    .select({
      id: itineraryItems.id,
      title: itineraryItems.title,
      dayNumber: itineraryItems.dayNumber,
      startTime: itineraryItems.startTime,
      endTime: itineraryItems.endTime,
      sortOrder: itineraryItems.sortOrder,
      lat: itineraryItems.latitude,
      lng: itineraryItems.longitude,
      origin: itineraryItems.origin,
      locationName: itineraryItems.locationName,
      locationAddress: itineraryItems.locationAddress,
      itemType: itineraryItems.itemType,
      durationMinutes: itineraryItems.durationMinutes,
      providerServiceId: itineraryItems.providerServiceId,
      bookingId: itineraryItems.bookingId,
      googlePlaceId: itineraryItems.googlePlaceId,
    })
    .from(itineraryItems)
    .where(eq(itineraryItems.tripId, tripId))
    .orderBy(asc(itineraryItems.dayNumber), asc(itineraryItems.startTime), asc(itineraryItems.sortOrder));
  const items = rows.filter((r) => r.dayNumber != null && r.itemType !== "accommodation");

  // Each stop's OPEN point (LG-1): an admin row, else the open row linked to the item (390), else an OSM match for its
  // Google place id, else a ride's OSM node.
  // A Google point (the row's own, or a Places fact) comes back tagged `google` and is dropped.
  const [placeRefs, factPoints, facts, anchors, energy, legs] = await Promise.all([
    placeRefsForTrip(tripId, items.map((r) => r.id)),
    factPointsForTrip(tripId),
    feasibilityFactsForTrip(tripId, market),
    storage.getTemporalAnchors(tripId),
    storage.getEnergyTracking(tripId),
    tripLegsShown(tripId),
  ]);
  const placeIdOf = (r: any): string | null => (r.googlePlaceId as string | null) || placeRefs.get(r.id)?.placeId || null;
  const [openCoords, itemOpen, pulled, osmRides] = await Promise.all([
    openCoordsForPlaceIds(items.map(placeIdOf).filter((p): p is string => !!p)),
    openCoordsForItemIds(items.map((r) => r.id)),
    pulledOpenItems(items.map((r) => r.id)),
    osmRideServiceIds(items.map((r) => r.providerServiceId).filter((x): x is string => !!x)),
  ]);
  const openPoint = (r: (typeof items)[number]): { lat: number; lng: number } | null => {
    const own = rowCoordinatesTrusted(r as any) && r.lat != null && r.lng != null ? { lat: Number(r.lat), lng: Number(r.lng) } : null;
    const p = routingPointFor({
      placeId: placeRefs.get(r.id)?.placeId ?? null,
      lookupPlaceId: placeIdOf(r),
      open: openCoords,
      itemOpen: itemOpen.get(r.id) ?? null,
      itemPulled: pulled.has(r.id),
      ownPoint: own && Number.isFinite(own.lat) && Number.isFinite(own.lng) ? own : null,
      factPoint: factPoints.get(r.id) ?? null,
      osmRide: !!r.providerServiceId && osmRides.has(r.providerServiceId),
      // LG-2 Ask 5: a check-in, arrival or private tour has a point only when a person chose one.
      meetingOrStay: meetingOrStayItem(r.title),
    });
    return p && isOpenCoordOrigin(p.coordOrigin) ? { lat: p.lat, lng: p.lng } : null;
  };

  const profile = (TRANSPORT_PROFILES as Record<string, { availableModes: Array<{ mode: string; available?: boolean }> }>)[(market ?? "").toLowerCase()];
  const input: PlanCheckInput = {
    tripStartIso: start,
    transitCoverage: marketHasTransitCoverage(profile?.availableModes),
    stops: items.map((r) => ({
      id: r.id,
      title: r.title,
      dayNumber: r.dayNumber!,
      startTime: r.startTime ?? null,
      endTime: r.endTime ?? null,
      durationMinutes: r.durationMinutes ?? null,
      point: openPoint(r),
    })),
    hours: facts.hours,
    lastAdmission: facts.lastAdmissionFacts,
    closedDates: facts.closedDates,
    timedEntry: facts.timedEntry,
    lastServices: facts.lastServices,
    anchors: anchors as any,
    // Step 9b (L9 as amended, D4): each leg says whether its minutes are routed, through the ONE `legIsRouted`.
    legs: (legs as any[]).map((l) => ({
      id: l.id,
      dayNumber: l.dayNumber,
      fromActivityId: l.fromActivityId ?? null,
      toActivityId: l.toActivityId ?? null,
      estimatedDurationMinutes: l.estimatedDurationMinutes ?? null,
      mode: l.userSelectedMode ?? l.selectedMode ?? l.recommendedMode ?? null,
      routed: legIsRouted(l),
      checkedAt: l.legCheckedAt ? new Date(l.legCheckedAt).toISOString() : null,
    })),
    energy: energy.map((e: any) => ({ dayNumber: e.dayNumber, recoveryNeeded: e.recoveryNeeded ?? null })),
  };
  // A PRICED item is one carrying a real price: a catalog listing or a booking — never an AI draft's
  // estimated cost, which is a guess, not a price (§13).
  const hasPricedItems = items.some((r) => !!r.providerServiceId || !!r.bookingId);
  return { input, hasPricedItems, found: !!trip };
}

/** The free preview's findings: `checkPlan` over the trip's input — the card's three, plus what was not checked. */
export async function loadOptimizerFindings(tripId: string): Promise<{ findings: Finding[]; hasPricedItems: boolean; notChecked: NotChecked[] }> {
  const { input, hasPricedItems } = await loadPlanCheckInput(tripId);
  const { findings, notChecked } = checkPlan(input);
  return { findings, hasPricedItems, notChecked };
}

/**
 * P0-d item 1 (ledger `2026-10-12-p0d-coverage-bridges`): does every consecutive pair of stops on every
 * day not yet past have a routed leg? The stops are the ENGINE's own (`loadPlanLegContext` — its order,
 * its points, the stay excluded) and the legs are the ones the traveler sees (`tripLegsShown`), each
 * routed by the ONE `legIsRouted`. `routedPlan` is the plan's own `planGetsRoutedLegs` answer — a free
 * plan never earns the all-clear. Read only; no routing call is made here.
 */
export async function loadLegCoverage(tripId: string, now: Date = new Date()): Promise<{ coverage: LegCoverage; routedPlan: boolean }> {
  const trip = await storage.getTrip(tripId);
  if (!trip) return { coverage: { complete: false, unlocated: [] }, routedPlan: false };
  const { loadPlanLegContext } = await import("./routing/plan-legs-engine.service");
  const { tripGetsRoutedLegs } = await import("./routing/plan-routed-legs.service");
  const city = (trip.destination ?? "").split(",")[0].trim() || null;
  const [ctx, legs, routedPlan, items, areaNames] = await Promise.all([
    loadPlanLegContext(tripId, trip),
    tripLegsShown(tripId),
    tripGetsRoutedLegs(tripId),
    storage.getItineraryItems(tripId),
    loadMarketAreaNames((trip as any).marketSlug ?? null, city),
  ]);
  const start = trip.startDate ? String(trip.startDate).slice(0, 10) : null;
  const stopList = ctx.stops.filter((s) => !(ctx.stay && s.id === ctx.stay.id));
  // P0-e item 4: an off-map stop is a PLACEHOLDER when it names no place — the ONE decision the Places
  // lookup gate reads (`unnamedPlaceReason`), so the card and the lookup never disagree about a stop.
  const byId = new Map(items.map((it: any) => [it.id, it]));
  const placeholder = (id: string, title: string) => {
    const it: any = byId.get(id);
    return unnamedPlaceReason({ title: it?.title ?? title, locationName: it?.locationName ?? null }, city, areaNames) !== null;
  };
  const coverage = planLegCoverage(
    stopList.map((s) => ({ id: s.id, title: s.name, dayNumber: s.dayNumber, located: !!s.point, ...(s.point ? {} : { placeholder: placeholder(s.id, s.name) }) })),
    legs.map((l: any) => ({ dayNumber: l.dayNumber, fromId: l.fromActivityId ?? null, toId: l.toActivityId ?? null, routed: legIsRouted(l) })),
    (day) => planDayIsPast(start, day, trip.timezone ?? null, now),
  );
  return { coverage, routedPlan };
}

/**
 * FD-3 §3d: each plan day's honest counts — what was checked, of what. Read behind the caller's own plan
 * gate (the plancard). Only counts leave it. Reads the SAME feasibility view the findings do (FB-1 step 2).
 */
export async function loadDayFeasibility(
  tripId: string,
  opts: { legsNotChecked?: Map<number, ReadonlyArray<unknown>> } = {},
): Promise<Map<number, DayFeasibility>> {
  const { input, found } = await loadPlanCheckInput(tripId);
  if (!found) return new Map();
  const ctx = feasibilityView(input);
  const out = new Map<number, DayFeasibility>();
  const day = (n: number) => {
    let d = out.get(n);
    if (!d) { d = { stops: 0, hoursChecked: 0, lastEntryChecked: 0, rides: 0, ridesChecked: 0 }; out.set(n, d); }
    return d;
  };
  for (const it of ctx.timed) {
    const d = day(it.dayNumber);
    d.stops += 1;
    const h = ctx.hours.get(it.id);
    if (h && it.startTime && it.dateIso && parseDayHours(h.weekdayDescriptions, new Date(`${it.dateIso}T00:00:00Z`).getUTCDay())) d.hoursChecked += 1;
    if (it.startTime && ctx.lastEntry.has(it.id)) d.lastEntryChecked += 1;
  }
  for (const r of ctx.rides) {
    if (!Number.isFinite(r.dayNumber)) continue;
    const d = day(r.dayNumber);
    d.rides += 1;
    if (r.lastDepartures.length) d.ridesChecked += 1;
  }
  // P0 ruling 2: the "no route found" marker — the ONE gap count the re-check also reads (§18 rule 1).
  const gaps = await import("./routing/plan-legs-engine.service")
    .then(({ planLegGapsByDay }) => planLegGapsByDay(tripId))
    .catch(() => new Map<number, number>());
  gaps.forEach((n, dayNumber) => {
    const d = out.get(dayNumber);
    if (d && n > 0) d.noRoute = n;
  });
  // LG-2 Ask 6: legs with no travel time (an adjacent stop with no open point) — the ONE skip list, so the day line
  // never reads as a pass while one is on the day. The caller may pass the map it already loaded.
  const notChecked = opts.legsNotChecked
    ?? (await import("./routing/plan-legs-engine.service")
      .then(({ planLegsNotCheckedByDay }) => planLegsNotCheckedByDay(tripId))
      .catch(() => new Map<number, ReadonlyArray<unknown>>()));
  notChecked.forEach((pairs, dayNumber) => {
    const d = out.get(dayNumber);
    if (d && pairs.length > 0) d.legsNotChecked = pairs.length;
  });
  return out;
}

/**
 * AP-1 (ledger `2026-10-13-ap1-save-then-warn`): ONE stop's hours, read from the SAME feasibility view the
 * findings and the day line read (§18 rule 1). `lines` are the findings' own stop lines for this item; a stop
 * the hours or last entry cover with no conflict has none. Read behind the caller's own plan gate.
 *
 * Row 124 (ledger `2026-10-22-add-check-closed-dates`): the lines and `fixes` come from `checkStop` — the plan check
 * narrowed to this stop — so a stored `closed_dates` fact naming the stop's date gives the same "closed on that date"
 * line and `move_day` fix the plan check gives, with or without a start time (FB-1 step 5b).
 */
export async function loadStopHoursChecked(
  tripId: string,
  itemId: string,
): Promise<{ found: boolean; hasTime: boolean; checked: boolean; lines: string[]; caveat?: string; fixes: PlanFix[] }> {
  const [row] = await db
    .select({ id: itineraryItems.id })
    .from(itineraryItems)
    .where(and(eq(itineraryItems.id, itemId), eq(itineraryItems.tripId, tripId)))
    .limit(1);
  const { input, found } = await loadPlanCheckInput(tripId);
  if (!found) return { found: false, hasTime: false, checked: false, lines: [], fixes: [] };
  const own = input.stops.find((r) => r.id === itemId);
  if (!own) return { found: !!row, hasTime: false, checked: false, lines: [], fixes: [] };
  const ctx = feasibilityView(input);
  const it = ctx.timed.find((t) => t.id === itemId);
  const closed = ctx.closedOn.has(itemId);
  const hasTime = !!it?.startTime;
  if (!it || (!hasTime && !closed)) return { found: true, hasTime: false, checked: false, lines: [], fixes: [] };
  const h = ctx.hours.get(itemId);
  const hoursChecked = !!(hasTime && h && it.dateIso && parseDayHours(h.weekdayDescriptions, new Date(`${it.dateIso}T00:00:00Z`).getUTCDay()));
  const checked = hoursChecked || (hasTime && ctx.lastEntry.has(itemId)) || closed;
  const { findings, issues } = checkStop(input, itemId);
  const lines = findings.flatMap((f) => findingStopLines(f));
  const caveat = findings.find((f) => f.caveat)?.caveat;
  return { found: true, hasTime, checked, lines, ...(caveat ? { caveat } : {}), fixes: issues.map((i) => i.fix) };
}

/** The same read without the fixes (the FB-1 parity golden pins this shape). */
export async function loadStopHours(
  tripId: string,
  itemId: string,
): Promise<{ found: boolean; hasTime: boolean; checked: boolean; lines: string[]; caveat?: string }> {
  const { fixes: _fixes, ...rest } = await loadStopHoursChecked(tripId, itemId);
  return rest;
}
