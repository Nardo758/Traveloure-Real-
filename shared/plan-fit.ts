/**
 * PLAN-FIT — how well one place fits the plan's days (Track A step A3b; ledger
 * `2026-09-29-a3b-option-sets-slip`; product map §M3, §M9 threshold R213 PROVISIONAL).
 *
 * Pure: the caller injects the ONE travel-time reader (`loadMatrixReader`, A2) and the market's
 * centroids, so this is proven without a database. The server is the only caller; the slip renders
 * what the server derived and computes nothing (§E4).
 *
 *   · BURDEN. For each day, for each LOCATED item that day, the travel time from the option to the
 *     item — walk when the straight line is within the walk threshold, transit above it. A day's
 *     burden is the sum; the plan's is the DAY-WEIGHTED mean (each day weighted by its located-item
 *     count), in whole minutes per day.
 *   · BASIS. "matrix" only when every leg came from the matrix; any straight-line leg makes the
 *     figure "est." — nothing unlabelled is ever a straight-line number.
 *   · COVERAGE. The share of the plan's distinct neighbourhoods whose centroid lies within the walk
 *     threshold of the option.
 *   · HONESTY (§13). Unlocated items are excluded and COUNTED ("3 of 4 located"). An unlocated option,
 *     or fewer located items than `minLocated`, yields no figure and says which.
 */
import { haversineMeters } from "./geo";
import { snapToCentroid, type Centroid, type LatLng, type TravelMode, type TravelTime } from "./travel-time";

/** §M2: plan-fit is shown only with at least this many located items (the Celebrations threshold, reused). */
export const PLAN_FIT_MIN_LOCATED = 3;

export interface FitItem {
  dayNumber: number | null;
  lat: number | null;
  lng: number | null;
}

export type PlanFit =
  | {
      scored: true;
      minutesPerDay: number;
      basis: "matrix" | "est";
      coverage: number | null; // 0..1; null when the plan's located items sit in no known neighbourhood
      /** The two counts `coverage` is the share of (A4 renders "2 of 3 areas"); 0/0 when coverage is null. */
      areasNear: number;
      areasTotal: number;
      located: number;
      total: number;
    }
  | { scored: false; reason: "option_unlocated" | "too_few_located"; located: number; total: number };

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Normalizes a row's stored coordinates (strings or numbers) into a point, or null — never half. */
export function toPoint(lat: unknown, lng: unknown): LatLng | null {
  const a = num(lat);
  const b = num(lng);
  return a === null || b === null ? null : { lat: a, lng: b };
}

export function planFitFor(input: {
  option: LatLng | null;
  items: readonly FitItem[];
  travel: (from: LatLng, to: LatLng, mode: TravelMode) => TravelTime;
  centroids: readonly Centroid[];
  walkThresholdMeters: number;
  minLocated?: number;
}): PlanFit {
  const { option, items, travel, centroids, walkThresholdMeters } = input;
  const minLocated = input.minLocated ?? PLAN_FIT_MIN_LOCATED;
  const located = items.filter((i) => i.lat !== null && i.lng !== null);
  const total = items.length;
  if (!option) return { scored: false, reason: "option_unlocated", located: located.length, total };
  if (located.length < minLocated) return { scored: false, reason: "too_few_located", located: located.length, total };

  const byDay = new Map<number, number>(); // day → summed minutes
  const countByDay = new Map<number, number>();
  let allMatrix = true;
  for (const it of located) {
    const to = { lat: it.lat as number, lng: it.lng as number };
    const meters = haversineMeters(option.lat, option.lng, to.lat, to.lng);
    const t = travel(option, to, meters <= walkThresholdMeters ? "walk" : "transit");
    if (t.basis !== "matrix") allMatrix = false;
    const day = it.dayNumber ?? 0;
    byDay.set(day, (byDay.get(day) ?? 0) + t.minutes);
    countByDay.set(day, (countByDay.get(day) ?? 0) + 1);
  }
  let weighted = 0;
  let weights = 0;
  byDay.forEach((minutes, day) => {
    const w = countByDay.get(day) ?? 0;
    weighted += minutes * w;
    weights += w;
  });

  const hoods = new Map<string, Centroid>();
  for (const it of located) {
    const c = snapToCentroid({ lat: it.lat as number, lng: it.lng as number }, centroids);
    if (c) hoods.set(c.slug, c);
  }
  const reachable = Array.from(hoods.values()).filter((c) => haversineMeters(option.lat, option.lng, c.lat, c.lng) <= walkThresholdMeters).length;

  return {
    scored: true,
    minutesPerDay: Math.round(weighted / weights),
    basis: allMatrix ? "matrix" : "est",
    coverage: hoods.size ? reachable / hoods.size : null,
    areasNear: reachable,
    areasTotal: hoods.size,
    located: located.length,
    total,
  };
}

/**
 * §M9 — does `candidate` make the days EASIER than `chosen`? All four conditions (R213, provisional):
 * lower by at least `minMinutesPerDay`, AND by at least `minFraction` of the chosen burden, on the
 * SAME basis, with coverage not lower. An unscored figure on either side never counts.
 */
export function beatsChosen(
  candidate: PlanFit,
  chosen: PlanFit,
  threshold: { minMinutesPerDay: number; minFraction: number },
): boolean {
  if (!candidate.scored || !chosen.scored) return false;
  if (candidate.basis !== chosen.basis) return false;
  const gap = chosen.minutesPerDay - candidate.minutesPerDay;
  if (gap < Math.max(threshold.minMinutesPerDay, threshold.minFraction * chosen.minutesPerDay)) return false;
  if (candidate.coverage !== null && chosen.coverage !== null && candidate.coverage < chosen.coverage) return false;
  if (candidate.coverage === null && chosen.coverage !== null) return false;
  return true;
}

/** The one line an option's fit renders as (§13 wording; the slip prints it verbatim). */
export function planFitLine(fit: PlanFit): string {
  if (!fit.scored) {
    return fit.reason === "option_unlocated"
      ? "No pin for this place yet, so we can't say how it fits your days"
      : "Add a few things to your days to see how each place fits";
  }
  const basis = fit.basis === "est" ? "est. " : "";
  return `${basis}${fit.minutesPerDay} min/day getting around · based on ${fit.located} of ${fit.total} located stops`;
}

// ── A4: the compare view (ledger `2026-09-29-a4-plan-fit-compare`; §E4, §M3) ─────────────────

/** The M module's version string, recorded on every `slip_plan_fit_shown` row (slip-funnel-events §3.4). */
export const PLAN_FIT_VERSION = "m3-v1";

/** The funnel event's basis vocabulary (§3.4): `est` is recorded as what it is, a straight-line estimate. */
export function fitBasisKey(fit: PlanFit): "matrix" | "est_straight_line" | null {
  if (!fit.scored) return null;
  return fit.basis === "matrix" ? "matrix" : "est_straight_line";
}

/**
 * Rank each fit among its set, 1 = easiest days: lower minutes per day first, then higher coverage.
 * Unscored fits are never ranked (null) — an unscorable place is not "last", it is unknown (§13).
 * Exact ties share a rank.
 */
export function fitRanks(fits: readonly PlanFit[]): Array<number | null> {
  const key = (f: PlanFit) => (f.scored ? [f.minutesPerDay, -(f.coverage ?? -1)] : null);
  return fits.map((f) => {
    const k = key(f);
    if (!k) return null;
    let better = 0;
    for (const g of fits) {
      const kg = key(g);
      if (kg && (kg[0] < k[0] || (kg[0] === k[0] && kg[1] < k[1]))) better++;
    }
    return better + 1;
  });
}

/**
 * The "Easiest days" badge: only on a place that ranks 1 ALONE among at least two scored places, all
 * on the SAME basis — a matrix figure is never compared against a straight-line one to crown a winner.
 */
export function easiestIndex(fits: readonly PlanFit[]): number | null {
  const scored = fits.filter((f) => f.scored) as Array<Extract<PlanFit, { scored: true }>>;
  if (scored.length < 2) return null;
  if (new Set(scored.map((f) => f.basis)).size > 1) return null;
  const ranks = fitRanks(fits);
  const firsts = ranks.map((r, i) => (r === 1 ? i : -1)).filter((i) => i >= 0);
  return firsts.length === 1 ? firsts[0] : null;
}

/** The compare view's lead sentence; states the located count, never a figure it does not have. */
export function compareIntroLine(located: number, total: number): string {
  const base = "Plan-fit = how much travelling your days would take from each place. Lower is easier.";
  if (total === 0) return `${base} Add a few things to your days to see how each place fits.`;
  return `${base} Based on ${located} of ${total} ${total === 1 ? "stop" : "stops"} that ${total === 1 ? "has" : "have"} a location.`;
}
