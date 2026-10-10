/**
 * The free preview's FINDINGS (surface step 4, spec v1.2 §8; rulings R-f, R-l, R-v; ledger
 * `2026-10-03-surface-step4-optimizer-lead`). Reads what the plan already holds and hands it to the
 * pure rules in `shared/optimizer-lead.ts` — no model call, no network.
 *
 *   items    the plan's rows: day, draft time, title; a stop's point is its trusted row coordinate,
 *            else Google's live location fact (LD 57 — read, never copied)
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
import { asc, eq } from "drizzle-orm";
import { db } from "../db";
import { itineraryItems, trips } from "@shared/schema";
import { rowCoordinatesTrusted } from "@shared/ai-place-text";
import {
  afterLastAdmission,
  cityCrossings,
  closedOnArrival,
  closesBeforeVisitEnd,
  lastServiceMissed,
  visitEndMinutes,
  type RideCheck,
  leadFindings,
  paceOver,
  timedEntryConflicts,
  walkingSavedKm,
  type DayPath,
  type Finding,
  type HoursFact,
} from "@shared/optimizer-lead";
import { factPointsForTrip, feasibilityFactsForTrip } from "./content-facts/place-facts.service";
import { lastAdmissionMinutes, lastServiceMinutes, parseLastAdmission, parseLastService, SERVICE_DAY_START_MIN } from "@shared/feasibility-facts";
import { isRideMode, type DayFeasibility } from "@shared/plan-feasibility";
import { parseDayHours } from "@shared/optimizer-lead";
import { haversineMeters } from "@shared/geo";
import { ROUTED_WALK_MAX_METERS, defaultRoutedMode, marketHasTransitCoverage } from "@shared/routing-engine";
import { TRANSPORT_PROFILES } from "../data/transport-profiles";
import { storage } from "../storage";
import { legUnreachableFinding, unreachableStops } from "@shared/leg-reachability";

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function isoOf(v: unknown): string | null {
  const s = v instanceof Date ? v.toISOString() : String(v ?? "");
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
}

export async function loadOptimizerFindings(tripId: string): Promise<{ findings: Finding[]; hasPricedItems: boolean }> {
  const [trip] = await db.select({ startDate: trips.startDate, marketSlug: trips.marketSlug }).from(trips).where(eq(trips.id, tripId)).limit(1);
  const start = isoOf(trip?.startDate);
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
    })
    .from(itineraryItems)
    .where(eq(itineraryItems.tripId, tripId))
    .orderBy(asc(itineraryItems.dayNumber), asc(itineraryItems.startTime), asc(itineraryItems.sortOrder));
  const items = rows.filter((r) => r.dayNumber != null && r.itemType !== "accommodation");

  // a. stored hours, each with its own checkedAt. A hard closure counts only from an OFFICIAL source
  // (R-p): a non-Places fact the registry may publish. FD-3 (ledger `2026-10-10-fd3-feasibility`): read
  // through the ONE feasibility reader, so an official crawled row carrying structured hours is read too,
  // ahead of Places for a hard fact, and an untagged row never is.
  const ctx = await feasibilityContext(tripId, items, start, trip?.marketSlug ?? null);
  const { hours, timed } = ctx;

  // b. the plan's anchors against its timed items — the validate-schedule rule.
  const anchors = await storage.getTemporalAnchors(tripId);
  const scheduled = items.map((r) => ({
    title: r.title,
    dayNumber: r.dayNumber,
    date: start ? addDays(start, r.dayNumber! - 1) : null,
    startTime: r.startTime ?? null,
    endTime: r.endTime ?? null,
  }));

  // c / d. each day's LOCATED stops in the draft's own order (trusted row point, else the live fact).
  const points = await factPointsForTrip(tripId);
  const byDay = new Map<number, DayPath["points"][number][]>();
  for (const r of items) {
    const own = rowCoordinatesTrusted(r as any) && r.lat != null && r.lng != null ? { lat: Number(r.lat), lng: Number(r.lng) } : null;
    const p = own && Number.isFinite(own.lat) && Number.isFinite(own.lng) ? own : points.get(r.id) ?? null;
    if (!p) continue;
    const list = byDay.get(r.dayNumber!) ?? [];
    list.push(p);
    byDay.set(r.dayNumber!, list);
  }
  const days: DayPath[] = Array.from(byDay.entries()).map(([dayNumber, pts]) => ({ dayNumber, points: pts }));

  // e. the plan's own energy verdicts.
  const energy = await storage.getEnergyTracking(tripId);

  // f. reachability: the plan's OWN legs (the rows the traveler sees) against its own times. Step 9a
  // (ledger `2026-10-07-step9a-routing-engine`): the same read rule as the plan — on a routed plan its
  // engine legs count, so the paid lead says how many legs don't fit.
  const legs = await tripLegsShown(tripId);
  const reach = unreachableStops(
    items.map((r) => ({ id: r.id, title: r.title, dayNumber: r.dayNumber, startTime: r.startTime, endTime: r.endTime, durationMinutes: r.durationMinutes ?? null })),
    // Step 9b (L9 as amended, D4 — ledger `2026-10-07-step9b-optimizer-and-rechecks`): each leg says
    // whether its minutes are routed, through the ONE `legIsRouted`; the finding drops "est." only
    // when every leg it counts is.
    legs.map((l: any) => ({ id: l.id, dayNumber: l.dayNumber, fromActivityId: l.fromActivityId, toActivityId: l.toActivityId, estimatedDurationMinutes: l.estimatedDurationMinutes, routed: legIsRouted(l) })),
  );

  const findings = leadFindings([
    legUnreachableFinding(reach.unreachable),
    closedOnArrival(timed, hours, start),
    afterLastAdmission(timed, ctx.lastEntry),
    closesBeforeVisitEnd(timed, hours, start),
    lastServiceMissed(ctx.rides.filter((r) => r.lastDepartures.length > 0)),
    timedEntryConflicts(anchors as any, scheduled),
    cityCrossings(days),
    walkingSavedKm(days),
    paceOver(energy.map((e) => ({ dayNumber: e.dayNumber, recoveryNeeded: e.recoveryNeeded ?? null }))),
  ]);
  // A PRICED item is one carrying a real price: a catalog listing or a booking — never an AI draft's
  // estimated cost, which is a guess, not a price (§13).
  const hasPricedItems = items.some((r) => !!r.providerServiceId || !!r.bookingId);
  return { findings, hasPricedItems };
}


// ── FD-3: the feasibility context, shared by the findings and the day line (ledger `2026-10-10-fd3-feasibility`) ──

/** A plan row as the feasibility checks read it — in plan order (day, start, sort order). */
type FeasibilityItem = {
  id: string;
  title: string;
  dayNumber: number | null;
  startTime: string | null;
  endTime: string | null;
  durationMinutes: number | null;
  lat: unknown;
  lng: unknown;
  origin?: string | null;
  locationName?: string | null;
  locationAddress?: string | null;
};

interface FeasibilityContext {
  hours: Map<string, HoursFact>;
  timed: Array<{ id: string; dayNumber: number; dateIso: string | null; startTime: string | null; endTime: string | null; durationMinutes: number | null }>;
  /** Item → the last-entry minute that applies on its date (ruling 1). */
  lastEntry: Map<string, number>;
  /** Every ride the plan takes; `lastDepartures` empty ⇒ not checked (ruling 2). */
  rides: RideCheck[];
}

/**
 * ONE assembly of the feasibility inputs (§18 rule 1): the findings above and `loadDayFeasibility` below
 * read the same hours, last entries and rides, so the day line and the findings can never disagree.
 */
async function feasibilityContext(tripId: string, items: FeasibilityItem[], start: string | null, market: string | null): Promise<FeasibilityContext> {
  const facts = await feasibilityFactsForTrip(tripId, market);
  const hours = new Map<string, HoursFact>();
  facts.hours.forEach((h, itemId) => hours.set(itemId, h));
  const timed = items
    .filter((r) => r.dayNumber != null)
    .map((r) => ({
      id: r.id,
      dayNumber: r.dayNumber!,
      dateIso: start ? addDays(start, r.dayNumber! - 1) : null,
      startTime: r.startTime ?? null,
      endTime: r.endTime ?? null,
      durationMinutes: r.durationMinutes ?? null,
    }));
  const lastEntry = new Map<string, number>();
  for (const it of timed) {
    const v = parseLastAdmission(facts.lastAdmission.get(it.id));
    const m = v && it.dateIso ? lastAdmissionMinutes(v, it.dateIso) : null;
    if (m !== null) lastEntry.set(it.id, m);
  }

  // Rides (ruling 3). A free plan stores no estimated legs, so the ride is derived the way the routing
  // engine picks its default mode (`defaultRoutedMode`): between two consecutive LOCATED stops of a day,
  // walk up to 1.2 km straight line, else transit where the market's profile lists it. A leg the plan
  // actually shows for that pair (an expert-confirmed or routed leg) wins with its own mode. The ride
  // departs when the stop it leaves ends (its end time, else start + duration); no end ⇒ unchecked.
  const legs = await tripLegsShown(tripId);
  const shownMode = new Map<string, string | null>();
  for (const l of legs as any[]) shownMode.set(`${l.dayNumber}|${l.fromActivityId}|${l.toActivityId}`, l.userSelectedMode ?? l.selectedMode ?? l.recommendedMode ?? null);
  const points = await factPointsForTrip(tripId);
  const pointOf = (r: FeasibilityItem): { lat: number; lng: number } | null => {
    const own = rowCoordinatesTrusted(r as any) && r.lat != null && r.lng != null ? { lat: Number(r.lat), lng: Number(r.lng) } : null;
    return own && Number.isFinite(own.lat) && Number.isFinite(own.lng) ? own : points.get(r.id) ?? null;
  };
  const profile = (TRANSPORT_PROFILES as Record<string, { availableModes: Array<{ mode: string; available?: boolean }> }>)[(market ?? "").toLowerCase()];
  const transitCoverage = marketHasTransitCoverage(profile?.availableModes);
  const byId = new Map(timed.map((t) => [t.id, t]));
  const services = facts.lastServices
    .map((s) => ({ ...s, v: parseLastService(s.value) }))
    .filter((s): s is typeof s & { v: NonNullable<typeof s.v> } => s.v !== null);
  const rides: RideCheck[] = [];
  const byDay = new Map<number, FeasibilityItem[]>();
  for (const r of items) {
    if (r.dayNumber == null) continue;
    byDay.set(r.dayNumber, [...(byDay.get(r.dayNumber) ?? []), r]);
  }
  byDay.forEach((list, dayNumber) => {
    const located = list.map((r) => ({ r, p: pointOf(r) })).filter((x): x is { r: FeasibilityItem; p: { lat: number; lng: number } } => x.p !== null);
    for (let i = 0; i + 1 < located.length; i++) {
      const a = located[i];
      const b = located[i + 1];
      const key = `${dayNumber}|${a.r.id}|${b.r.id}`;
      const inferred = !shownMode.has(key);
      const mode = inferred ? defaultRoutedMode(a.p, b.p, transitCoverage) : shownMode.get(key) ?? null;
      if (!isRideMode(mode)) continue;
      const from = byId.get(a.r.id);
      let departMin = from ? visitEndMinutes(from) : null;
      if (departMin !== null && departMin < SERVICE_DAY_START_MIN) departMin += 24 * 60;
      const dateIso = from?.dateIso ?? null;
      const lastDepartures =
        departMin === null || !dateIso
          ? []
          : services
              .filter((s) => haversineMeters(a.p.lat, a.p.lng, s.lat, s.lng) <= ROUTED_WALK_MAX_METERS)
              .map((s) => lastServiceMinutes(s.v, dateIso))
              .filter((m): m is number => m !== null);
      rides.push({ dayNumber, departMin: departMin ?? -1, lastDepartures, inferred });
    }
  });
  return { hours, timed, lastEntry, rides };
}

/**
 * FD-3 §3d: each plan day's honest counts — what was checked, of what. Read behind the caller's own plan
 * gate (the plancard). Only counts leave it.
 */
export async function loadDayFeasibility(tripId: string): Promise<Map<number, DayFeasibility>> {
  const [trip] = await db.select({ startDate: trips.startDate, marketSlug: trips.marketSlug }).from(trips).where(eq(trips.id, tripId)).limit(1);
  if (!trip) return new Map();
  const start = isoOf(trip.startDate);
  const rows = await db
    .select({
      id: itineraryItems.id,
      title: itineraryItems.title,
      dayNumber: itineraryItems.dayNumber,
      startTime: itineraryItems.startTime,
      endTime: itineraryItems.endTime,
      durationMinutes: itineraryItems.durationMinutes,
      itemType: itineraryItems.itemType,
      lat: itineraryItems.latitude,
      lng: itineraryItems.longitude,
      origin: itineraryItems.origin,
      locationName: itineraryItems.locationName,
      locationAddress: itineraryItems.locationAddress,
    })
    .from(itineraryItems)
    .where(eq(itineraryItems.tripId, tripId))
    .orderBy(asc(itineraryItems.dayNumber), asc(itineraryItems.startTime), asc(itineraryItems.sortOrder));
  const items = rows.filter((r) => r.dayNumber != null && r.itemType !== "accommodation");
  const ctx = await feasibilityContext(tripId, items as FeasibilityItem[], start, trip.marketSlug ?? null);
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
  return out;
}
