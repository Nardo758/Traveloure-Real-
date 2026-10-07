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
 *   · a leg is unchanged when its pair, mode and cache key (both points and the departure hour) are the
 *     same; a leg whose only change is its position is re-ordered, never re-asked
 * No I/O.
 */
import {
  defaultRoutedMode,
  routeCacheKey,
  routeHourBucket,
  type RoutePoint,
  type RoutingMode,
} from "@shared/routing-engine";
import { normalizeLegMode } from "@shared/travel-speeds";

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
  cacheKey: string;
}

export interface ExistingEngineLeg {
  id: string;
  dayNumber: number;
  legOrder: number;
  fromActivityId: string | null;
  toActivityId: string | null;
  /** The cache key it was computed under (stored on its alternative entry), or null for an older row. */
  cacheKey: string | null;
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
  /** Pairs with a stop that has no point (§13) — reported, never bridged. */
  skipped: Array<{ dayNumber: number; fromItemId: string; toItemId: string; reason: "missing_coordinates" }>;
}

/**
 * The legs the plan should have. `stops` in plan order (storage order). `stay` = the plan's located
 * stay, which is taken out of the day lists and connected to each day's first and last stop.
 * `selectedMode(pairKey)` = a mode the traveler picked for that pair (9c), kept over the default.
 */
export function desiredPlanLegs(
  stops: readonly PlanStop[],
  opts: { stay: (PlanStop & { point: RoutePoint }) | null; hasTransitCoverage: boolean; selectedMode?: (pairKey: string) => RoutingMode | null },
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
      cacheKey: routeCacheKey(from.point, to.point, mode, hourBucket),
    });
  };
  for (const dayNumber of Array.from(byDay.keys()).sort((a, b) => a - b)) {
    const day = byDay.get(dayNumber)!;
    const located = day.filter((s) => s.point);
    if (opts.stay && located.length) {
      // Out of the stay to the day's first located stop; the hour is when that stop starts.
      add(dayNumber, 0, { ...opts.stay, dayNumber }, located[0], hhmm(located[0].startTime));
    }
    for (let i = 0; i < day.length - 1; i++) add(dayNumber, i + 1, day[i], day[i + 1], departureWallClock(day[i]));
    if (opts.stay && located.length) {
      const last = located[located.length - 1];
      add(dayNumber, day.length, last, { ...opts.stay, dayNumber }, departureWallClock(last));
    }
  }
  return { legs, skipped };
}

export interface PlanLegsDiff {
  /** Unchanged legs; `legOrder` set only when the position moved (a re-order, no call). */
  keep: Array<{ id: string; legOrder: number | null }>;
  /** Legs to (re)compute through the cache. */
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
    const same = have.find((e) => e.cacheKey === d.cacheKey);
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
}): { line: string | null; fare: { amount: number; currency: string } | null; provenance: { source: string; checkedAt: string } } | null {
  if (!leg.source || !leg.calculatedAt) return null;
  const at = new Date(leg.calculatedAt as any);
  if (Number.isNaN(at.getTime())) return null;
  const alt = Array.isArray(leg.alternativeModes) ? (leg.alternativeModes[0] as any) : null;
  const fare = alt?.fare && Number.isFinite(Number(alt.fare.amount)) && typeof alt.fare.currency === "string" ? { amount: Number(alt.fare.amount), currency: alt.fare.currency } : null;
  return {
    line: typeof alt?.line === "string" && alt.line ? alt.line : null,
    fare,
    provenance: { source: leg.source, checkedAt: at.toISOString() },
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
