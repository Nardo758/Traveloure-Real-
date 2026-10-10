/**
 * THE PLAN'S ROUTED LEGS — the pure half (step 9a, ledger `2026-10-07-step9a-routing-engine`; brief L3,
 * rulings 3 and 10). Which legs a plan should have, and — against the legs it has — which to keep,
 * which to (re)compute and which to remove. The diff is by PAIR, so a lost debounce timer heals on the
 * next edit: whatever is missing or changed is simply computed then.
 *
 *   · legs connect consecutive same-day stops, in plan order (the A8 pairing rule), plus the stay ↔ the
 *     day's first and last stop when the plan has a located stay (spec §14.1 "anchor ↔ first/last stop")
 *   · a stop with no point is never bridged over (§13): the pair is reported and skipped
 *   · a pair an expert has CONFIRMED is never computed — the confirmed leg wins (ruling 3)
 *   · a leg is unchanged when its pair, mode and leg key (both points and the departure hour) are the
 *     same; a leg whose only change is its position is re-ordered, never re-asked
 * No I/O.
 */
import {
  DEFAULT_LEG_DEPARTURE_WALL_CLOCK,
  TRANSIT_UNAVAILABLE_REASON,
  defaultRoutedMode,
  routeLegKey,
  routeHourBucket,
  type RoutePoint,
  type RoutingMode,
} from "@shared/routing-engine";
import { normalizeLegMode } from "@shared/travel-speeds";
import { addCalendarDays, calendarDayOf } from "@shared/plan-timing";

/**
 * P0 legs ruling 3 (ledger `2026-10-10-p0-legs-baseline`): the wall clock a routing call departs at —
 * the leg's own, else a fixed local 10:00 on its trip day (never server-now). The hour bucket is read
 * from the leg's OWN wall clock elsewhere, so a leg with no time keeps its own bucket.
 */
export function legDepartureWallClock(wallClock: string | null | undefined): string {
  return wallClock || DEFAULT_LEG_DEPARTURE_WALL_CLOCK;
}

/**
 * P0 legs ruling 3: is this trip day already over in the plan's zone (UTC when it has none)? A past day
 * is never routed: its legs are frozen — nothing asked, nothing recomputed, nothing deleted. No start
 * date ⇒ not past (the caller's own dates gate decides).
 */
export function planDayIsPast(tripStart: string | null | undefined, dayNumber: number, timezone: string | null | undefined, now: Date): boolean {
  const day = addCalendarDays(tripStart ? String(tripStart).slice(0, 10) : null, dayNumber - 1);
  if (!day) return false;
  return day < calendarDayOf(now, timezone);
}

export interface PlanStop {
  id: string;
  name: string;
  dayNumber: number;
  point: RoutePoint | null;
  startTime: string | null;
  endTime: string | null;
  durationMinutes: number | null;
}

export interface DesiredLeg {
  pairKey: string;
  dayNumber: number;
  legOrder: number;
  from: PlanStop & { point: RoutePoint };
  to: PlanStop & { point: RoutePoint };
  mode: RoutingMode;
  /** The departure's local wall clock, or null when the plan does not say. */
  wallClock: string | null;
  hourBucket: number | null;
  legKey: string;
}

export interface ExistingEngineLeg {
  id: string;
  dayNumber: number;
  legOrder: number;
  fromActivityId: string | null;
  toActivityId: string | null;
  /** The leg key it was computed under (stored on its alternative entry), or null for an older row. */
  legKey: string | null;
  userSelectedMode: string | null;
}

export function legPairKey(dayNumber: number, fromId: string | null, toId: string | null): string {
  return `${dayNumber}|${fromId ?? ""}|${toId ?? ""}`;
}

function hhmm(t: string | null | undefined): string | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

/** When the traveler leaves a stop: its end, else start + duration, else null (never a guessed hour). */
export function departureWallClock(stop: Pick<PlanStop, "startTime" | "endTime" | "durationMinutes">): string | null {
  const end = hhmm(stop.endTime);
  if (end) return end;
  const start = hhmm(stop.startTime);
  if (!start || stop.durationMinutes == null || !Number.isFinite(stop.durationMinutes)) return null;
  const [h, m] = start.split(":").map(Number);
  const t = h * 60 + m + Math.round(stop.durationMinutes);
  if (t >= 24 * 60) return null;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

export interface DesiredLegsResult {
  legs: DesiredLeg[];
  /** Adjacent pairs with a stop that has no point (§13) — reported; the located stops either side are still connected. */
  skipped: Array<{ dayNumber: number; fromItemId: string; toItemId: string; reason: "missing_coordinates" }>;
}

/**
 * The legs the plan should have. `stops` in plan order (storage order). `stay` = the plan's located
 * stay, which is taken out of the day lists and connected to each day's first and last stop.
 * `selectedMode(pairKey)` = a mode the traveler picked for that pair (9c), kept over the default.
 */
/**
 * A flight anchor with an airport point (step 9b FU-9A-2): an arrival is connected to the day's stay
 * (else its first located stop), a departure from the day's stay (else its last located stop). `id` is
 * the leg-end id the row stores — `anchor:<anchorId>` — so the pair diff and the read rule treat it like
 * any stop. `wallClock` = when the traveler leaves (arrival + buffer; departure − buffer).
 */
export interface AirportStop {
  id: string;
  name: string;
  dayNumber: number;
  direction: "arrival" | "departure";
  point: RoutePoint;
  wallClock: string | null;
}

export function desiredPlanLegs(
  stops: readonly PlanStop[],
  opts: {
    stay: (PlanStop & { point: RoutePoint }) | null;
    hasTransitCoverage: boolean;
    selectedMode?: (pairKey: string) => RoutingMode | null;
    airports?: readonly AirportStop[];
  },
): DesiredLegsResult {
  const byDay = new Map<number, PlanStop[]>();
  for (const s of stops) {
    if (opts.stay && s.id === opts.stay.id) continue;
    byDay.set(s.dayNumber, [...(byDay.get(s.dayNumber) ?? []), s]);
  }
  const legs: DesiredLeg[] = [];
  const skipped: DesiredLegsResult["skipped"] = [];
  const add = (dayNumber: number, legOrder: number, from: PlanStop, to: PlanStop, wallClock: string | null) => {
    if (!from.point || !to.point) {
      skipped.push({ dayNumber, fromItemId: from.id, toItemId: to.id, reason: "missing_coordinates" });
      return;
    }
    const pairKey = legPairKey(dayNumber, from.id, to.id);
    const mode = opts.selectedMode?.(pairKey) ?? defaultRoutedMode(from.point, to.point, opts.hasTransitCoverage);
    const hourBucket = routeHourBucket(wallClock);
    legs.push({
      pairKey,
      dayNumber,
      legOrder,
      from: from as PlanStop & { point: RoutePoint },
      to: to as PlanStop & { point: RoutePoint },
      mode,
      wallClock,
      hourBucket,
      legKey: routeLegKey(from.point, to.point, mode, hourBucket),
    });
  };
  for (const dayNumber of Array.from(byDay.keys()).sort((a, b) => a - b)) {
    const day = byDay.get(dayNumber)!;
    const located = day.filter((s) => s.point);
    if (opts.stay && located.length) {
      // Out of the stay to the day's first located stop; the hour is when that stop starts.
      add(dayNumber, 0, { ...opts.stay, dayNumber }, located[0], hhmm(located[0].startTime));
    }
    // P0 legs ruling 1 (ledger `2026-10-10-p0-legs-baseline`): a stop with no point is REPORTED for
    // each adjacent pair it breaks, and the located stops either side of it are still connected — an
    // unlocated stop never leaves a gap with no leg. The bridge's order is the from-stop's position.
    for (let i = 0; i < day.length - 1; i++) {
      if (!day[i].point || !day[i + 1].point) {
        skipped.push({ dayNumber, fromItemId: day[i].id, toItemId: day[i + 1].id, reason: "missing_coordinates" });
      }
    }
    for (let j = 0; j < located.length - 1; j++) {
      add(dayNumber, day.indexOf(located[j]) + 1, located[j], located[j + 1], departureWallClock(located[j]));
    }
    if (opts.stay && located.length) {
      const last = located[located.length - 1];
      add(dayNumber, day.length, last, { ...opts.stay, dayNumber }, departureWallClock(last));
    }
  }
  // FU-9A-2: airport legs — only for a flight anchor that HAS a point (an IATA code the table holds).
  for (const a of opts.airports ?? []) {
    const located = (byDay.get(a.dayNumber) ?? []).filter((s) => s.point);
    const airport: PlanStop = { id: a.id, name: a.name, dayNumber: a.dayNumber, point: a.point, startTime: null, endTime: null, durationMinutes: null };
    if (a.direction === "arrival") {
      const to = opts.stay ? { ...opts.stay, dayNumber: a.dayNumber } : located[0];
      if (to) add(a.dayNumber, -1, airport, to, a.wallClock);
    } else {
      const from = opts.stay ? { ...opts.stay, dayNumber: a.dayNumber } : located[located.length - 1];
      if (from) add(a.dayNumber, (byDay.get(a.dayNumber) ?? []).length + 1, from, airport, a.wallClock);
    }
  }
  return { legs, skipped };
}

export interface PlanLegsDiff {
  /** Unchanged legs; `legOrder` set only when the position moved (a re-order, no call). */
  keep: Array<{ id: string; legOrder: number | null }>;
  /** Legs to (re)compute (through the run memo). */
  compute: DesiredLeg[];
  /** Engine legs to remove: their pair is gone, or an expert confirmed it, or they are duplicates. */
  remove: string[];
  /** Engine legs being replaced by a recompute, keyed by pair — removed only once the answer is in. */
  replaces: Map<string, string[]>;
}

export function diffPlanLegs(desired: readonly DesiredLeg[], existing: readonly ExistingEngineLeg[], confirmedPairs: ReadonlySet<string>): PlanLegsDiff {
  const byPair = new Map<string, ExistingEngineLeg[]>();
  for (const e of existing) {
    const k = legPairKey(e.dayNumber, e.fromActivityId, e.toActivityId);
    byPair.set(k, [...(byPair.get(k) ?? []), e]);
  }
  const keep: PlanLegsDiff["keep"] = [];
  const compute: DesiredLeg[] = [];
  const remove: string[] = [];
  const replaces = new Map<string, string[]>();
  const wanted = new Set<string>();
  for (const d of desired) {
    if (confirmedPairs.has(d.pairKey)) continue;
    wanted.add(d.pairKey);
    const have = byPair.get(d.pairKey) ?? [];
    const same = have.find((e) => e.legKey === d.legKey);
    if (same) {
      keep.push({ id: same.id, legOrder: same.legOrder === d.legOrder ? null : d.legOrder });
      remove.push(...have.filter((e) => e.id !== same.id).map((e) => e.id));
    } else {
      compute.push(d);
      if (have.length) replaces.set(d.pairKey, have.map((e) => e.id));
    }
  }
  for (const [k, list] of Array.from(byPair.entries())) if (!wanted.has(k)) remove.push(...list.map((e) => e.id));
  return { keep, compute, remove, replaces };
}

/** A traveler-picked mode on an existing engine leg (9c), else null. */
export function selectedModeOf(leg: Pick<ExistingEngineLeg, "userSelectedMode">): RoutingMode | null {
  return leg.userSelectedMode ? normalizeLegMode(leg.userSelectedMode) : null;
}

/**
 * The routed facts an ENGINE leg carries (`source` set): line and fare from its one alternative entry,
 * provenance from `source` + `calculated_at` (stamped with the source's own answer time). Null for any
 * other leg — an expert's, the variant optimizer's, a legacy row.
 */
export function routedFactsOf(leg: {
  source?: string | null;
  calculatedAt?: Date | string | null;
  alternativeModes?: unknown;
}): { line: string | null; fare: { amount: number; currency: string } | null; provenance: { source: string; checkedAt: string }; transitUnavailable?: true } | null {
  if (!leg.source || !leg.calculatedAt) return null;
  const at = new Date(leg.calculatedAt as any);
  if (Number.isNaN(at.getTime())) return null;
  const alt = Array.isArray(leg.alternativeModes) ? (leg.alternativeModes[0] as any) : null;
  const fare = alt?.fare && Number.isFinite(Number(alt.fare.amount)) && typeof alt.fare.currency === "string" ? { amount: Number(alt.fare.amount), currency: alt.fare.currency } : null;
  return {
    line: typeof alt?.line === "string" && alt.line ? alt.line : null,
    fare,
    provenance: { source: leg.source, checkedAt: at.toISOString() },
    // P0 ruling 2: present only on a drive the engine fell back to because transit had no route.
    ...(alt?.reason === TRANSIT_UNAVAILABLE_REASON ? { transitUnavailable: true as const } : {}),
  };
}

/**
 * WHICH LEGS A PLAN SHOWS (step 9a rulings 3 and 5, ledger `2026-10-07-step9a-routing-engine`) — the one
 * read rule, given the plan's `planGetsRoutedLegs` answer.
 *   · an expert's CONFIRMED trip leg always shows, and wins over an engine leg for the same pair
 *   · an ENGINE leg (`source` set) shows only on a qualifying plan
 *   · other `proposed` trip legs (the Workstation's machine proposals) never reach a traveler (§18 L4)
 *   · the selected variant's legs show only on a qualifying plan that has no engine legs yet — on a
 *     free plan they are HIDDEN, not deleted (ruling 5)
 */
export function selectPlanLegs<L extends { dayNumber: number; fromActivityId: string | null; toActivityId: string | null; proposalStatus?: string | null; source?: string | null }>(input: {
  qualifies: boolean;
  tripLegs: readonly L[];
  variantLegs: readonly L[];
}): { tripLegs: L[]; variantLegs: L[] } {
  const confirmed = input.tripLegs.filter((l) => l.proposalStatus === "confirmed");
  const confirmedPairs = new Set(confirmed.map((l) => legPairKey(l.dayNumber, l.fromActivityId, l.toActivityId)));
  const engine = input.qualifies
    ? input.tripLegs.filter((l) => l.source != null && l.proposalStatus !== "confirmed" && !confirmedPairs.has(legPairKey(l.dayNumber, l.fromActivityId, l.toActivityId)))
    : [];
  const hasEngine = input.tripLegs.some((l) => l.source != null && l.proposalStatus !== "confirmed");
  const tripLegs = [...confirmed, ...engine].sort((a: any, b: any) => a.dayNumber - b.dayNumber || (a.legOrder ?? 0) - (b.legOrder ?? 0));
  return { tripLegs, variantLegs: input.qualifies && !hasEngine ? [...input.variantLegs] : [] };
}

/**
 * IS THIS LEG'S DURATION ROUTED? (step 9b, D4 — ledger `2026-10-07-step9b-optimizer-and-rechecks`). The
 * ONE answer the findings read (§18 rule 1). A shown leg with positive minutes counts when it is an
 * ENGINE leg (`source` set — the routing adapter's answer), or a leg an expert CONFIRMED whose own
 * recorded tier is not the straight-line estimate (`alternative_modes[mode].reason !== "est."`, the tier
 * the travel-time service writes): an expert's own minutes are a human answer, not a guess. A leg with
 * no positive minutes is never routed (§13).
 */
export function legIsRouted(leg: {
  source?: string | null;
  proposalStatus?: string | null;
  estimatedDurationMinutes?: number | string | null;
  recommendedMode?: string | null;
  alternativeModes?: Array<{ mode?: string; reason?: string | null }> | null;
}): boolean {
  const minutes = Number(leg.estimatedDurationMinutes);
  if (!Number.isFinite(minutes) || minutes <= 0) return false;
  if (leg.source != null) return true;
  if (leg.proposalStatus !== "confirmed") return false;
  const own = (leg.alternativeModes ?? []).find((a) => a?.mode === leg.recommendedMode);
  return own?.reason !== "est.";
}
