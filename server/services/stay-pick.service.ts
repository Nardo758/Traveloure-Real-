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
 *   · HOW (rulings 1–2): the plan's located stops on its dates; candidates are our own located hotels in
 *     the plan's neighbourhoods (each stop's nearest centroid), in straight-line order; ONE Route Matrix
 *     request per hotel (hotel → every stop, DRIVE) through the Maps billing gate's `route_matrix` caller,
 *     so its ELEMENTS count against `MAPS_ROUTE_MATRIX_DAILY_CAP` like any other call; scored until
 *     `STAY_PICK_ELEMENT_BUDGET` elements are spent. A refused or failed request stops the scoring there
 *     (a paused cap is not retried). The pick comes ONLY from scored hotels.
 *   · NEVER PRICE OR COMMISSION (ruling 5): candidates leave the loader through `toStayPickCandidate`.
 *   · A re-score REPLACES the pick; `changed` is set when the hotel differs, and the card clears it once
 *     through `markStayPickSeen`. Nothing scored ⇒ the earlier pick stays as it was (§13 — a cap-paused
 *     day never erases an answer).
 *
 * TEMPORARY, BY RULING: the straight-line prune and the element budget are removed when 9a-ii (self-hosted
 * OSRM as a RoutingAdapter provider for walk/drive) is live.
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { trips } from "@shared/schema";
import {
  STAY_PICK_ELEMENT_BUDGET,
  nextStayPick,
  planStayScoring,
  rankStays,
  readStayPick,
  stayStopsHash,
  straightLineOrder,
  toStayPickCandidate,
  type StayPick,
  type StayPickCandidate,
  type StayPickStop,
} from "@shared/stay-pick";
import { fitItems } from "./plan-option-sets.service";
import { cityHotels, cityNeighborhoodRows, dayCount, nearestNeighborhoodSlug } from "./where-to-stay.service";
import { gatedRouteMatrixFetch, type RouteMatrixFetch } from "./travel-time-matrix.service";

export type StayPickOutcome =
  | { skipped: "no_trip" | "free_plan" | "single_day" | "no_located_stops" | "no_candidates" | "unchanged" | "nothing_scored" }
  | { written: StayPick; elementsSpent: number };

export interface StayPickDeps {
  routed?: (tripId: string) => Promise<boolean>;
  fetchMatrix?: RouteMatrixFetch;
  now?: () => Date;
  budget?: number;
}

/** The plan's located stops on its dates, and its city. */
export async function loadStayStops(tripId: string): Promise<{ city: string | null; days: number | null; stops: StayPickStop[] } | null> {
  const [trip] = await db
    .select({ destination: trips.destination, startDate: trips.startDate, endDate: trips.endDate })
    .from(trips)
    .where(eq(trips.id, tripId))
    .limit(1);
  if (!trip) return null;
  const city = (trip.destination ?? "").split(",")[0].trim() || null;
  const days = dayCount(trip.startDate, trip.endDate);
  const items = await fitItems(tripId);
  const stops: StayPickStop[] = [];
  for (const it of items) {
    if (it.lat === null || it.lng === null) continue;
    const day = it.dayNumber ?? 1;
    if (days !== null && (day < 1 || day > days)) continue; // on the plan's dates only (ruling 1)
    stops.push({ dayNumber: day, lat: it.lat, lng: it.lng });
  }
  return { city, days, stops };
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

const parseSeconds = (d?: string) => (d && /^\d+(\.\d+)?s$/.test(d) ? Math.round(Number(d.slice(0, -1))) : null);
const waypoint = (p: { lat: number; lng: number }) => ({ waypoint: { location: { latLng: { latitude: p.lat, longitude: p.lng } } } });

/** Score, rank and write one plan's pick. Never throws (§15b): every failure is an outcome. */
export async function computeStayPick(tripId: string, deps: StayPickDeps = {}): Promise<StayPickOutcome> {
  const routed = deps.routed ?? (async (id: string) => (await import("./routing/plan-routed-legs.service")).tripGetsRoutedLegs(id));
  if (!(await routed(tripId))) return { skipped: "free_plan" };
  const loaded = await loadStayStops(tripId);
  if (!loaded) return { skipped: "no_trip" };
  if (loaded.days === null || loaded.days < 2) return { skipped: "single_day" };
  if (!loaded.stops.length || !loaded.city) return { skipped: "no_located_stops" };

  const [row] = await db.select({ stayPick: trips.stayPick }).from(trips).where(eq(trips.id, tripId)).limit(1);
  const prev = readStayPick(row?.stayPick);
  const hash = stayStopsHash(loaded.stops);
  if (prev && prev.stopsHash === hash) return { skipped: "unchanged" };

  const candidates = await loadPaidCandidates(loaded.city, loaded.stops);
  if (!candidates.length) return { skipped: "no_candidates" };
  const ordered = straightLineOrder(candidates, loaded.stops);
  const plan = planStayScoring(ordered, loaded.stops.length, deps.budget ?? STAY_PICK_ELEMENT_BUDGET);
  // FU-S1-1 (ledger `2026-10-09-fu-s1-1-stay-pick-cost`): the stay pick has no refresh row, so each
  // request records its dollars on its own `api_usage_logs` gate row (purpose `stay_pick`, ref = the plan);
  // its elements still count against `MAPS_ROUTE_MATRIX_DAILY_CAP` through the same `route_matrix` caller.
  const fetchMatrix = deps.fetchMatrix ?? gatedRouteMatrixFetch({ costHere: { purpose: "stay_pick", ref: tripId } });

  // The stops in the SAME canonical order the ranking reads, so a returned destinationIndex is its stop.
  const stops = [...loaded.stops].sort((a, b) => a.dayNumber - b.dayNumber || a.lat - b.lat || a.lng - b.lng);
  const minutes = new Map<string, Array<number | null>>();
  let elementsSpent = 0;
  for (const hotel of plan.toScore) {
    let elements;
    try {
      elements = await fetchMatrix({
        origins: [waypoint(hotel)],
        destinations: stops.map(waypoint),
        travelMode: "DRIVE",
      });
    } catch (err: any) {
      // A refused call (cap reached, caller off, no key) or an API error: stop here — what is scored stands.
      console.warn(`[stay-pick] ${tripId} scoring stopped after ${minutes.size} hotel(s): ${String(err?.message ?? err).slice(0, 200)}`);
      break;
    }
    elementsSpent += stops.length;
    const row: Array<number | null> = stops.map(() => null);
    for (const el of elements) {
      if (el.originIndex !== 0 || el.destinationIndex == null || el.destinationIndex < 0 || el.destinationIndex >= stops.length) continue;
      if (el.condition === "ROUTE_NOT_FOUND") continue;
      const s = parseSeconds(el.duration);
      if (s !== null) row[el.destinationIndex] = s / 60;
    }
    minutes.set(`${hotel.kind}:${hotel.id}`, row);
  }
  const scored = plan.toScore.filter((h) => minutes.has(`${h.kind}:${h.id}`));
  if (!scored.length) return { skipped: "nothing_scored" };

  const ranked = rankStays(scored, stops, (c, i) => minutes.get(`${c.kind}:${c.id}`)?.[i] ?? null);
  const top = ranked[0].candidate;
  const next = nextStayPick(prev, {
    hotelId: top.id,
    hotelKind: top.kind,
    scoredCount: scored.length,
    candidateCount: plan.candidateCount,
    stopsHash: hash,
    computedAt: (deps.now?.() ?? new Date()).toISOString(),
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
