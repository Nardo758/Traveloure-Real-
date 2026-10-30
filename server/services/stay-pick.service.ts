/**
 * S1 — THE STAY PICK'S ONE WRITER (ledger `2026-10-09-s1-one-stay`; brief docs/planning/briefs/s1-one-stay.md).
 * The rules are pure in `@shared/stay-pick`; this file loads rows, makes the Route Matrix calls and
 * writes `trips.stay_pick` (migration 359). Nothing else writes that column (§19), and nothing computes it
 * on read: the where-to-stay read only reads what this stored.
 *
 *   · WHO: a plan that passes `planGetsRoutedLegs` (ruling 4 — the step-9a predicate, through
 *     `tripGetsRoutedLegs`). A free plan is skipped here; its short list is straight-line at read time.
 *   · WHEN: Optimize finish, Trip Pass purchase, handoff accept, and the post-debounce stops recompute
 *     (`plan-legs-queue.ts`) — all through `scheduleStayPick`, never on read. A plan whose stops have
 *     not changed since its last pick (`stopsHash`) is not re-scored, so a repeated trigger costs nothing.
 *   · HOW (rulings 1–2, as amended by ledger `2026-10-18-google-writers-open-coords`): the plan's located stops
 *     on its dates; candidates are our own located hotels in the plan's neighbourhoods (each stop's nearest
 *     centroid), in straight-line order; ONE row of drive minutes per hotel (hotel → every stop) from the routing
 *     engine's own adapter (self-hosted OSRM), scored until `STAY_PICK_ELEMENT_BUDGET` elements are spent. A row the
 *     router could not answer stops the scoring there. The pick comes ONLY from scored hotels.
 *   · OPEN COORDINATES ONLY (decision-maker, Oct 18, 2026 — the Google-derived writers): the pick was ranked by
 *     Google Route Matrix; it is now OSRM between OPEN coordinates (`shared/open-coords.ts`) or nothing. Every
 *     located stop on the plan's dates must have an open point (`openPointsForItems`, the engine's one resolver),
 *     and a hotel is scored only from an open coordinate of its own — which no hotel source carries today (LiteAPI
 *     static content, a listing's pin and an affiliate point are none of the four origins), so no new pick is
 *     written until one does. An earlier pick stays as it was (FB-1's stay scoring replaces it).
 *   · NEVER PRICE OR COMMISSION (ruling 5): candidates leave the loader through `toStayPickCandidate`.
 *   · FU-S1-3: the pick also records its per-day closeness (`stayDayCloseness` against
 *     `stayCloseRoutedMinutes()`), read from the SAME matrix row the ranking used — no extra request.
 *   · A re-score REPLACES the pick; `changed` is set when the hotel differs, and the card clears it once
 *     through `markStayPickSeen`. Nothing scored ⇒ the earlier pick stays as it was (§13 — a cap-paused
 *     day never erases an answer).
 *
 * TEMPORARY, BY RULING: the straight-line prune and the element budget are removed when 9a-ii (self-hosted
 * OSRM as a RoutingAdapter provider for walk/drive) is live.
 */
import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "../db";
import { itineraryItems, trips } from "@shared/schema";
import {
  STAY_PICK_ELEMENT_BUDGET,
  nextStayPick,
  planStayScoring,
  rankStays,
  readStayPick,
  stayDayCloseness,
  stayDayClosenessList,
  stayPickIsShown,
  stayStopsHash,
  straightLineOrder,
  toStayPickCandidate,
  type StayPick,
  type StayPickCandidate,
  type StayPickStop,
} from "@shared/stay-pick";
import { fitItems } from "./plan-option-sets.service";
import { cityHotels, cityNeighborhoodRows, dayCount, nearestNeighborhoodSlug } from "./where-to-stay.service";
import type { RoutePoint } from "@shared/routing-engine";
import { stayCloseRoutedMinutes } from "../config/stay-closeness.config";

export type StayPickOutcome =
  | {
      skipped:
        | "no_trip"
        | "free_plan"
        | "single_day"
        | "no_located_stops"
        | "stops_not_open"
        | "no_candidates"
        | "no_open_candidates"
        | "unchanged"
        | "nothing_scored";
    }
  | { written: StayPick; elementsSpent: number };

/**
 * One hotel's drive minutes to each stop, in order (null = the router's own "no route"). Throws when the router
 * learned nothing (no router, an outage, a refused point) — the scoring stops there, as a refused request did.
 */
export type StayRouteRow = (origin: RoutePoint, destinations: readonly RoutePoint[]) => Promise<Array<number | null>>;

export interface StayPickDeps {
  routed?: (tripId: string) => Promise<boolean>;
  /** Default: the routing engine's adapter (self-hosted OSRM), never Google. */
  routeRow?: StayRouteRow;
  /** A candidate's OPEN coordinate. Default: none — no hotel source carries one today. */
  openPointOf?: (c: StayPickCandidate) => RoutePoint | null;
  now?: () => Date;
  budget?: number;
}

/** The engine's adapter as a row of drive minutes. A refused point or an unanswered call throws. */
async function adapterRouteRow(origin: RoutePoint, destinations: readonly RoutePoint[]): Promise<Array<number | null>> {
  const { routingAdapter } = await import("./routing/index");
  const adapter = routingAdapter();
  if (!adapter) throw new Error("no routing adapter");
  const row: Array<number | null> = [];
  for (const d of destinations) {
    if (adapter.acceptsPoint && (!adapter.acceptsPoint(origin) || !adapter.acceptsPoint(d))) throw new Error("coordinates not open");
    const r = await adapter.route(origin, d, "drive", null);
    if (r.kind === "ok") row.push(r.route.durationMin);
    else if (r.kind === "no_route" && !r.unanswered) row.push(null);
    else throw new Error(r.kind === "paused" ? "routing paused" : `router did not answer (${r.unanswered})`);
  }
  return row;
}

/** A stop at its open routing point (the point keeps its origin for the adapter). */
export type OpenStayStop = StayPickStop & { point: RoutePoint };

/**
 * The plan's located stops on its dates, at their OPEN points, and its city. `notOpen` counts the located stops on
 * the plan's dates that have no open point — any one of them means no pick (ledger
 * `2026-10-18-google-writers-open-coords`): ranking over a subset would pick for a plan the traveler did not make.
 */
export async function loadStayStops(tripId: string): Promise<{ city: string | null; days: number | null; stops: OpenStayStop[]; notOpen: number } | null> {
  const [trip] = await db
    .select({ destination: trips.destination, startDate: trips.startDate, endDate: trips.endDate })
    .from(trips)
    .where(eq(trips.id, tripId))
    .limit(1);
  if (!trip) return null;
  const city = (trip.destination ?? "").split(",")[0].trim() || null;
  const days = dayCount(trip.startDate, trip.endDate);
  const inDates = (day: number) => days === null || (day >= 1 && day <= days); // on the plan's dates only (ruling 1)
  const located = (await fitItems(tripId)).filter((it) => it.lat !== null && it.lng !== null && inDates(it.dayNumber ?? 1)).length;
  const rows = await db
    .select({
      id: itineraryItems.id,
      dayNumber: itineraryItems.dayNumber,
      latitude: itineraryItems.latitude,
      longitude: itineraryItems.longitude,
      googlePlaceId: itineraryItems.googlePlaceId,
      providerServiceId: itineraryItems.providerServiceId,
      origin: itineraryItems.origin,
      locationName: itineraryItems.locationName,
      locationAddress: itineraryItems.locationAddress,
    })
    .from(itineraryItems)
    .where(and(eq(itineraryItems.tripId, tripId), ne(itineraryItems.itemType, "accommodation")));
  const { openPointsForItems } = await import("./routing/plan-legs-engine.service");
  const open = await openPointsForItems(tripId, rows);
  const stops: OpenStayStop[] = [];
  for (const it of rows) {
    const p = open.get(it.id);
    const day = it.dayNumber ?? 1;
    if (!p || !inDates(day)) continue;
    stops.push({ dayNumber: day, lat: p.lat, lng: p.lng, point: p });
  }
  return { city, days, stops, notOpen: Math.max(0, located - stops.length) };
}

/** Our own located hotels in the plan's neighbourhoods, projected to the candidate shape (no money field). */
export async function loadPaidCandidates(city: string, stops: readonly StayPickStop[]): Promise<StayPickCandidate[]> {
  const [hotels, neighborhoods] = await Promise.all([cityHotels(city), cityNeighborhoodRows(city)]);
  const candidates = hotels.map((h) => toStayPickCandidate(h));
  // §13: a city with no neighbourhood rows has no "plan's neighbourhoods" to filter by — every located
  // hotel in the city is a candidate, still in straight-line order and still under the budget.
  if (!neighborhoods.length) return candidates;
  const planSlugs = new Set(stops.map((s) => nearestNeighborhoodSlug(neighborhoods, s)).filter((s): s is string => !!s));
  return candidates.filter((c) => {
    const slug = nearestNeighborhoodSlug(neighborhoods, c);
    return !!slug && planSlugs.has(slug);
  });
}


/** Score, rank and write one plan's pick. Never throws (§15b): every failure is an outcome. */
export async function computeStayPick(tripId: string, deps: StayPickDeps = {}): Promise<StayPickOutcome> {
  const routed = deps.routed ?? (async (id: string) => (await import("./routing/plan-routed-legs.service")).tripGetsRoutedLegs(id));
  if (!(await routed(tripId))) return { skipped: "free_plan" };
  const loaded = await loadStayStops(tripId);
  if (!loaded) return { skipped: "no_trip" };
  if (loaded.days === null || loaded.days < 2) return { skipped: "single_day" };
  if (loaded.notOpen > 0) return { skipped: "stops_not_open" };
  if (!loaded.stops.length || !loaded.city) return { skipped: "no_located_stops" };

  const [row] = await db.select({ stayPick: trips.stayPick }).from(trips).where(eq(trips.id, tripId)).limit(1);
  // A Google-ranked pick (no `router`) is not shown and is no basis for "unchanged" or "changed": the next
  // OSRM score replaces it as a first pick (ledger `2026-10-18-stay-pick-est-fallback`). Its row is not deleted.
  const stored = readStayPick(row?.stayPick);
  const prev = stayPickIsShown(stored) ? stored : null;
  const hash = stayStopsHash(loaded.stops);
  if (prev && prev.stopsHash === hash) return { skipped: "unchanged" };

  const candidates = await loadPaidCandidates(loaded.city, loaded.stops);
  if (!candidates.length) return { skipped: "no_candidates" };
  const openPointOf = deps.openPointOf ?? (() => null);
  const openPoint = new Map<string, RoutePoint>();
  for (const c of candidates) {
    const p = openPointOf(c);
    if (p) openPoint.set(`${c.kind}:${c.id}`, p);
  }
  const scorable = candidates.filter((c) => openPoint.has(`${c.kind}:${c.id}`));
  if (!scorable.length) return { skipped: "no_open_candidates" };
  const ordered = straightLineOrder(scorable, loaded.stops);
  const plan = planStayScoring(ordered, loaded.stops.length, deps.budget ?? STAY_PICK_ELEMENT_BUDGET);
  const routeRow = deps.routeRow ?? adapterRouteRow;

  // The stops in the SAME canonical order the ranking reads, so a row's index is its stop.
  const stops = [...loaded.stops].sort((a, b) => a.dayNumber - b.dayNumber || a.lat - b.lat || a.lng - b.lng);
  const stopPoints: RoutePoint[] = stops.map((s0) => s0.point);
  const minutes = new Map<string, Array<number | null>>();
  let elementsSpent = 0;
  for (const hotel of plan.toScore) {
    let row: Array<number | null>;
    try {
      row = await routeRow(openPoint.get(`${hotel.kind}:${hotel.id}`)!, stopPoints);
    } catch (err: any) {
      // The router learned nothing (no router, an outage, a refused point): stop here — what is scored stands.
      console.warn(`[stay-pick] ${tripId} scoring stopped after ${minutes.size} hotel(s): ${String(err?.message ?? err).slice(0, 200)}`);
      break;
    }
    elementsSpent += stops.length;
    minutes.set(`${hotel.kind}:${hotel.id}`, stops.map((_, i) => (Number.isFinite(row[i] as number) ? (row[i] as number) : null)));
  }
  const scored = plan.toScore.filter((h) => minutes.has(`${h.kind}:${h.id}`));
  if (!scored.length) return { skipped: "nothing_scored" };

  const ranked = rankStays(scored, stops, (c, i) => minutes.get(`${c.kind}:${c.id}`)?.[i] ?? null);
  const top = ranked[0].candidate;
  // FU-S1-3: the pick's per-day closeness, from the matrix row already fetched above — no extra call.
  const topRow = minutes.get(`${top.kind}:${top.id}`);
  const closeness = stayDayCloseness(stops, (i) => topRow?.[i] ?? null, stayCloseRoutedMinutes(), "routed");
  // Row 244: the per-day list from the same row and threshold (no minutes stored).
  const dayCloseness = stayDayClosenessList(stops, (i) => topRow?.[i] ?? null, stayCloseRoutedMinutes(), "routed");
  const next = nextStayPick(prev, {
    hotelId: top.id,
    hotelKind: top.kind,
    scoredCount: scored.length,
    candidateCount: plan.candidateCount,
    stopsHash: hash,
    computedAt: (deps.now?.() ?? new Date()).toISOString(),
    closeness,
    dayCloseness,
    router: "osrm",
  });
  await db.update(trips).set({ stayPick: next }).where(eq(trips.id, tripId));
  return { written: next, elementsSpent };
}

/**
 * The card read the change: clear `changed` (owner or managing assistant — the same "choose" role the
 * stay chooser takes). One atomic conditional; a pick with nothing to clear is left as it is. Returns
 * false when the caller may not choose for this plan (one 404 at the route, LD 40).
 */
export async function markStayPickSeen(tripId: string, userId: string): Promise<boolean> {
  const { planRole } = await import("./plan-option-sets.service");
  if (!(await planRole(tripId, userId, "choose"))) return false;
  await db
    .update(trips)
    .set({ stayPick: sql`jsonb_set(${trips.stayPick}, '{changed}', 'false'::jsonb)` })
    .where(and(eq(trips.id, tripId), sql`(${trips.stayPick} ->> 'changed') = 'true'`));
  return true;
}

const inFlight = new Map<string, Promise<StayPickOutcome | null>>();

/**
 * Fire-and-forget trigger. Never throws into the caller and never blocks it (§15b). Runs ONE at a time per
 * plan in this process, so two triggers that land together (a Trip Pass grant and its debounced leg
 * recompute) score once: the second sees the stored `stopsHash` and spends nothing. Across instances two
 * runs can still overlap; each is bounded by the budget and the later write wins — recorded, not fixed.
 */
export function scheduleStayPick(tripId: string | null | undefined, deps: StayPickDeps = {}): Promise<StayPickOutcome | null> {
  if (!tripId) return Promise.resolve(null);
  const before = inFlight.get(tripId) ?? Promise.resolve(null);
  const next = before
    .catch(() => null)
    .then(() => computeStayPick(tripId, deps))
    .catch((err: any) => {
      console.error(`[stay-pick] ${tripId} failed:`, err?.message ?? err);
      return null;
    })
    .finally(() => {
      if (inFlight.get(tripId) === next) inFlight.delete(tripId);
    });
  inFlight.set(tripId, next);
  return next;
}
