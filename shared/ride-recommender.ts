/**
 * TC-3b — THE RIDE RECOMMENDER, pure core (ledger `2026-10-11-tc3b-ride-recommender`; TC-3 brief rev 1;
 * decision-maker rulings 1–4, Oct 11, 2026). No DB, no network, no clock: every input arrives as data, so the
 * plan card's suggestions and the free plan's teaser are the SAME rule over different corridors (§18 rule 1).
 *
 * A CORRIDOR is one pair of consecutive stops on a plan day: where the traveler leaves, where they must arrive,
 * and the window between (the stop left ends at its own end time or start + duration — `departure` in
 * shared/leg-reachability.ts, the reachability check's own rule; the next stop's start). A paid plan's
 * corridors are its ROUTED legs (with the leg's minutes); a free plan's are straight-line pairs of located
 * stops (no minutes, no Maps call — ruling 2).
 *
 * A ride FITS a corridor when its boarding point is within walking range of where the traveler leaves, its exit
 * within walking range of where they arrive, and one of THAT DAY's departures (the catalog's slots for the date)
 * lets them walk to the boarding point after leaving, ride, and walk on in time for the next stop. A ride with
 * no departures that day, or no stated duration, never fits — nothing is guessed (§13).
 *
 * HARD FILTERS hide (ruling 4 — these three now; passes, payment and luggage wait for migration 372's
 * `notes.filters`): mobility (limited ⇒ 400 m walking range; wheelchair ⇒ only a ride the catalog states is
 * wheelchair-accessible, and none does yet), a child shorter than the ride's stated minimum height, and a
 * booking lead time the day can no longer meet. SOFT RANKING only reorders: extra minutes weighted by pace,
 * budget (the adult fare), the scenic preference and the return-pair bonus. NEVER commission or price paid to us
 * (rule 8 — the fare is the operator's, read only for a budget-minded traveler).
 *
 * NEVER: on a leg arriving at a stop with a stored `last_admission` fact (ruling 1 — flagged or not), on a
 * corridor the traveler skipped this trip (ruling 3), on a leg whose end is already a ride, or on a past day.
 * One suggestion per corridor, at most three per day.
 */
import { haversineMeters, WALK_METERS_PER_MIN } from "./geo";
import { ROUTED_WALK_MAX_METERS } from "./routing-engine";
import { wallClockMinutes } from "./leg-reachability";

/** Walking range to a boarding point and from an exit (1,200 m — the routing engine's walk threshold). */
export const RIDE_WALK_MAX_METERS = ROUTED_WALK_MAX_METERS;
/** Limited mobility: five minutes' walk, the same 5 min `effectiveProfileToTransportPrefs` sets (400 m). */
export const RIDE_WALK_MAX_METERS_LIMITED = 5 * WALK_METERS_PER_MIN;
/** At most this many suggestions on one plan day (rule 1: two or three per day). */
export const RIDE_SUGGESTIONS_PER_DAY = 3;
/** Out one way, back another (rule 3): a ranking bonus, never a constraint. */
export const RIDE_RETURN_PAIR_BONUS = 20;
/** A traveler who says they prefer scenic routes. */
export const RIDE_SCENIC_BONUS = 10;

export type RideMobility = "standard" | "limited" | "wheelchair";
export type RidePace = "relaxed" | "moderate" | "packed";
export type RideBudgetBand = "budget" | "moderate" | "luxury";

export interface RidePoint {
  name: string | null;
  lat: number;
  lng: number;
}

export interface RideFare {
  currency: string;
  adult: number | null;
  child: number | null;
}

export interface RideCatalogEntry {
  serviceId: string;
  title: string;
  boarding: RidePoint;
  exit: RidePoint;
  /** The catalog's running time; null ⇒ the ride never fits (no end is guessed). */
  durationMinutes: number | null;
  /** That date's departures, "HH:MM", from the catalog. A date absent ⇒ no departures that day. */
  departuresByDate: Record<string, string[]>;
  /** `notes.childMinHeightCm` (e.g. Hozugawa's 80 cm). Null ⇒ no stated minimum. */
  childMinHeightCm: number | null;
  /** `service_transport_facts.booking_window_days`, read as the minimum days ahead a booking must be made. */
  bookingWindowDays: number | null;
  /** True only where the catalog states it; null ⇒ unknown, which a wheelchair user is never offered. */
  wheelchairAccessible: boolean | null;
  fare: RideFare | null;
  /** Services the operator itself pairs with this one (`notes.pairing.withServiceIds`), read both ways. */
  pairServiceIds: string[];
}

export interface RideCorridor {
  dayNumber: number;
  /** The plan day's date; null ⇒ no departures can be read, so nothing fits. */
  dateIso: string | null;
  /** The routed leg this corridor is (paid plans); null for a free plan's straight-line pair. */
  legId: string | null;
  fromItemId: string;
  toItemId: string;
  from: { lat: number; lng: number };
  to: { lat: number; lng: number };
  /** Minutes after midnight the traveler leaves the first stop; null ⇒ not known (never guessed). */
  leaveAt: number | null;
  /** The next stop's start, minutes after midnight; null ⇒ not known. */
  arriveAt: number | null;
  /** The routed leg's own minutes (paid plans); null for a free plan. */
  legMinutes: number | null;
}

export interface RideRankContext {
  todayIso: string;
  mobility?: RideMobility | null;
  childHeightsCm?: readonly number[] | null;
  pace?: RidePace | null;
  budgetBand?: RideBudgetBand | null;
  scenic?: boolean | null;
  /** Corridor keys the traveler skipped this trip (ruling 3). */
  skippedCorridors?: ReadonlySet<string>;
  /** Items with a stored `last_admission` fact — a leg INTO one is a deciding leg (ruling 1). */
  decidingItemIds?: ReadonlySet<string>;
  /** Items that are already rides. */
  rideItemIds?: ReadonlySet<string>;
}

export interface RideSuggestion {
  dayNumber: number;
  legId: string | null;
  fromItemId: string;
  toItemId: string;
  corridorKey: string;
  serviceId: string;
  title: string;
  departure: string;
  arrival: string;
  boardingName: string | null;
  exitName: string | null;
  walkToMinutes: number;
  walkFromMinutes: number;
  rideMinutes: number;
  /** Door-to-door minutes over the routed leg's (walk + ride + walk − leg); null when the leg has no minutes. */
  extraMinutes: number | null;
  fare: RideFare | null;
  returnPair: boolean;
  score: number;
}

export type RideFilterReason = "wheelchair_unknown" | "child_height" | "booking_lead" | "past_day" | "no_date";

/** The one corridor key: a pair of stops, in travel order. Written to the overlay by the dismiss route. */
export function corridorKey(fromItemId: string, toItemId: string): string {
  return `${fromItemId}>${toItemId}`;
}

function hhmm(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function dayDiff(fromIso: string, toIso: string): number | null {
  const a = Date.parse(`${fromIso}T00:00:00Z`);
  const b = Date.parse(`${toIso}T00:00:00Z`);
  return Number.isFinite(a) && Number.isFinite(b) ? Math.round((b - a) / 86_400_000) : null;
}

/** The walking range the traveler's stated mobility allows. */
export function rideWalkRangeMeters(mobility: RideMobility | null | undefined): number {
  return mobility === "limited" ? RIDE_WALK_MAX_METERS_LIMITED : RIDE_WALK_MAX_METERS;
}

/** HARD FILTERS — what the ride makes impossible for this party on this date. Null = it passes. */
export function rideHardFilter(ride: RideCatalogEntry, dateIso: string | null, ctx: RideRankContext): RideFilterReason | null {
  if (!dateIso) return "no_date";
  const ahead = dayDiff(ctx.todayIso, dateIso);
  if (ahead === null || ahead < 0) return "past_day";
  if (ctx.mobility === "wheelchair" && ride.wheelchairAccessible !== true) return "wheelchair_unknown";
  if (ride.childMinHeightCm != null && (ctx.childHeightsCm ?? []).some((h) => h < ride.childMinHeightCm!)) return "child_height";
  if (ride.bookingWindowDays != null && ahead < ride.bookingWindowDays) return "booking_lead";
  return null;
}

/** Can this ride replace this corridor? The earliest departure that fits, or null. */
export function fitRideToCorridor(
  ride: RideCatalogEntry,
  c: RideCorridor,
  walkMaxMeters: number,
): Omit<RideSuggestion, "returnPair" | "score" | "dayNumber" | "legId" | "fromItemId" | "toItemId" | "corridorKey"> | null {
  if (c.leaveAt == null || c.arriveAt == null || !c.dateIso) return null;
  const ride_ = Number(ride.durationMinutes);
  if (!Number.isFinite(ride_) || ride_ <= 0) return null;
  const toBoard = haversineMeters(c.from.lat, c.from.lng, ride.boarding.lat, ride.boarding.lng);
  const fromExit = haversineMeters(ride.exit.lat, ride.exit.lng, c.to.lat, c.to.lng);
  if (toBoard > walkMaxMeters || fromExit > walkMaxMeters) return null;
  const walkTo = Math.ceil(toBoard / WALK_METERS_PER_MIN);
  const walkFrom = Math.ceil(fromExit / WALK_METERS_PER_MIN);
  const departures = (ride.departuresByDate[c.dateIso] ?? [])
    .map((d) => wallClockMinutes(d))
    .filter((m): m is number => m !== null)
    .sort((a, b) => a - b);
  for (const d of departures) {
    if (d < c.leaveAt + walkTo) continue;
    const end = d + ride_;
    if (end + walkFrom > c.arriveAt || end >= 24 * 60) break;
    const legMinutes = Number(c.legMinutes);
    return {
      serviceId: ride.serviceId,
      title: ride.title,
      departure: hhmm(d),
      arrival: hhmm(end),
      boardingName: ride.boarding.name,
      exitName: ride.exit.name,
      walkToMinutes: walkTo,
      walkFromMinutes: walkFrom,
      rideMinutes: ride_,
      extraMinutes: Number.isFinite(legMinutes) && legMinutes > 0 ? walkTo + ride_ + walkFrom - legMinutes : null,
      fare: ride.fare,
    };
  }
  return null;
}

/** Is the corridor one no ride may be offered on? */
function corridorClosed(c: RideCorridor, ctx: RideRankContext): boolean {
  if (ctx.decidingItemIds?.has(c.toItemId)) return true;
  if (ctx.skippedCorridors?.has(corridorKey(c.fromItemId, c.toItemId))) return true;
  if (ctx.rideItemIds?.has(c.fromItemId) || ctx.rideItemIds?.has(c.toItemId)) return true;
  return false;
}

function paired(a: RideCatalogEntry, b: RideCatalogEntry): boolean {
  if (a.serviceId === b.serviceId) return false;
  if (a.pairServiceIds.includes(b.serviceId) || b.pairServiceIds.includes(a.serviceId)) return true;
  // The same line the other way: this one's exit is that one's boarding and back.
  const near = (p: RidePoint, q: RidePoint) => haversineMeters(p.lat, p.lng, q.lat, q.lng) <= RIDE_WALK_MAX_METERS;
  return near(a.exit, b.boarding) && near(a.boarding, b.exit);
}

function softScore(s: { extraMinutes: number | null; fare: RideFare | null }, ctx: RideRankContext): number {
  const weight = ctx.pace === "relaxed" ? 0.5 : ctx.pace === "packed" ? 2 : 1;
  let score = -Math.max(0, s.extraMinutes ?? 0) * weight;
  if (ctx.scenic) score += RIDE_SCENIC_BONUS;
  if (ctx.budgetBand === "budget" && s.fare?.adult != null && s.fare.currency === "JPY") score -= s.fare.adult / 100;
  return score;
}

/**
 * Every fitting suggestion, one per corridor (its best), at most RIDE_SUGGESTIONS_PER_DAY per day, ranked.
 * Ordered by day, then by score (best first), then by corridor order.
 */
export function recommendRides(corridors: readonly RideCorridor[], rides: readonly RideCatalogEntry[], ctx: RideRankContext): RideSuggestion[] {
  const walkMax = rideWalkRangeMeters(ctx.mobility);
  type Cand = { c: RideCorridor; idx: number; ride: RideCatalogEntry; fit: NonNullable<ReturnType<typeof fitRideToCorridor>> };
  const cands: Cand[] = [];
  corridors.forEach((c, idx) => {
    if (corridorClosed(c, ctx)) return;
    for (const ride of rides) {
      if (rideHardFilter(ride, c.dateIso, ctx)) continue;
      const fit = fitRideToCorridor(ride, c, walkMax);
      if (fit) cands.push({ c, idx, ride, fit });
    }
  });
  const best = new Map<number, RideSuggestion & { idx: number }>();
  for (const k of cands) {
    const returnPair = cands.some((o) => o.c.dayNumber === k.c.dayNumber && o.idx !== k.idx && paired(k.ride, o.ride));
    const score = softScore(k.fit, ctx) + (returnPair ? RIDE_RETURN_PAIR_BONUS : 0);
    const s: RideSuggestion & { idx: number } = {
      ...k.fit,
      dayNumber: k.c.dayNumber,
      legId: k.c.legId,
      fromItemId: k.c.fromItemId,
      toItemId: k.c.toItemId,
      corridorKey: corridorKey(k.c.fromItemId, k.c.toItemId),
      returnPair,
      score,
      idx: k.idx,
    };
    const cur = best.get(k.idx);
    if (!cur || s.score > cur.score) best.set(k.idx, s);
  }
  const byDay = new Map<number, Array<RideSuggestion & { idx: number }>>();
  best.forEach((s) => byDay.set(s.dayNumber, [...(byDay.get(s.dayNumber) ?? []), s]));
  const out: RideSuggestion[] = [];
  Array.from(byDay.keys())
    .sort((a, b) => a - b)
    .forEach((day) => {
      byDay
        .get(day)!
        .sort((a, b) => b.score - a.score || a.idx - b.idx)
        .slice(0, RIDE_SUGGESTIONS_PER_DAY)
        .forEach(({ idx: _idx, ...s }) => out.push(s));
    });
  return out;
}

/** The free plan's teaser: per day, how many corridors a ride could replace — a count only (ruling 2). */
export function rideTeaserByDay(corridors: readonly RideCorridor[], rides: readonly RideCatalogEntry[], ctx: RideRankContext): Map<number, { rides: number }> {
  const out = new Map<number, { rides: number }>();
  for (const s of recommendRides(corridors, rides, ctx)) out.set(s.dayNumber, { rides: (out.get(s.dayNumber)?.rides ?? 0) + 1 });
  return out;
}
