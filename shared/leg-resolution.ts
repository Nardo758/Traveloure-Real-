/**
 * THE ONE TRAVEL-TIME RULE — the pure half (Track A step A8; ledger
 * `2026-09-30-a8-travel-time-service`, R228; rollout "A8 — the travel-time service").
 *
 * Three tiers and one label:
 *   1. MATRIX — a neighbourhood-centroid pair the A2 matrix holds (walk | transit only).
 *   2. GOOGLE ROUTES — an EXACT item-to-item leg in the traveler's chosen mode, computed only when
 *      the caller asks for an exact leg (at Finalize) and a Routes source is wired.
 *   3. STRAIGHT LINE — when neither answers: the distance at the ONE configured speed for the mode
 *      (shared/travel-speeds.ts), ALWAYS labelled "est." (§13).
 *
 * An exact leg prefers Routes (the item-to-item answer) and falls back to the matrix, then the
 * estimate; a plan-level answer (plan-fit) never calls Routes. No I/O here: the server injects the
 * matrix reader and the Routes call, so every rule is proven without a database or a network.
 */
import { haversineMeters } from "./geo";
import type { LatLng, TravelMode, TravelTime } from "./travel-time";
import { straightLineMinutes, type LegMode } from "./travel-speeds";

export type LegBasis = "matrix" | "routes" | "est";

export interface ResolvedLeg {
  mode: LegMode;
  minutes: number;
  distanceMeters: number;
  basis: LegBasis;
  /** "est." exactly when the answer is a straight line; null for a matrix or Routes answer. */
  label: "est." | null;
}

export interface LegSources {
  /** The Routes call for an exact leg; null result = Routes had no answer (fall through, never invent). */
  routes?: ((from: LatLng, to: LatLng, mode: LegMode) => Promise<{ minutes: number; distanceMeters: number } | null>) | null;
  /** The A2 matrix reader (`loadMatrixReader`). Only a `basis: "matrix"` answer is taken from it. */
  matrix?: ((from: LatLng, to: LatLng, mode: TravelMode) => TravelTime) | null;
}

const isMatrixMode = (m: LegMode): m is TravelMode => m === "walk" || m === "transit";

function estimate(from: LatLng, to: LatLng, mode: LegMode): ResolvedLeg {
  const meters = haversineMeters(from.lat, from.lng, to.lat, to.lng);
  return { mode, minutes: straightLineMinutes(meters, mode), distanceMeters: Math.round(meters), basis: "est", label: "est." };
}

/** The matrix tier alone (sync) — the answer when the matrix holds the pair, else null. */
function fromMatrix(from: LatLng, to: LatLng, mode: LegMode, matrix: LegSources["matrix"]): ResolvedLeg | null {
  if (!matrix || !isMatrixMode(mode)) return null;
  const t = matrix(from, to, mode);
  if (t.basis !== "matrix") return null;
  const meters = haversineMeters(from.lat, from.lng, to.lat, to.lng);
  return { mode, minutes: t.minutes, distanceMeters: Math.round(meters), basis: "matrix", label: null };
}

/** THE ONE leg resolver. `exact` = an item-to-item leg at Finalize (Routes allowed). */
export async function resolveLeg(
  input: { from: LatLng; to: LatLng; mode: LegMode; exact: boolean },
  sources: LegSources,
): Promise<ResolvedLeg> {
  const { from, to, mode, exact } = input;
  if (exact && sources.routes) {
    const r = await sources.routes(from, to, mode);
    if (r && Number.isFinite(r.minutes) && r.minutes > 0) {
      return { mode, minutes: Math.max(1, Math.round(r.minutes)), distanceMeters: Math.round(r.distanceMeters), basis: "routes", label: null };
    }
  }
  return fromMatrix(from, to, mode, sources.matrix) ?? estimate(from, to, mode);
}

/**
 * The same rule as a plan-fit `travel` function (sync, never Routes): the matrix where it answers,
 * otherwise the straight line at the MODE's configured speed — so plan-fit and the Finalize legs
 * read one table. The `TravelTime` shape is kept so plan-fit is unchanged.
 */
export function unifiedPlanTravel(matrix: LegSources["matrix"]): (from: LatLng, to: LatLng, mode: TravelMode) => TravelTime {
  return (from, to, mode) => {
    const t = matrix ? matrix(from, to, mode) : null;
    if (t && t.basis === "matrix") return t;
    const e = estimate(from, to, mode);
    return {
      basis: "est",
      minutes: e.minutes,
      mode,
      reason: t && t.basis === "est" ? t.reason : "pair_not_in_matrix",
      straightLineMeters: e.distanceMeters,
    };
  };
}

export interface DayAgreement {
  day: number;
  legMinutes: number;
  fitMinutes: number;
  /** |legs − fit| / max(legs, fit); 0 when both are 0. */
  gap: number;
  agrees: boolean;
}

/**
 * The §7 agreement check (R228): a finalized plan's per-day LEG total and plan-fit's per-day number
 * for the chosen stay agree within `tolerance` (0.25). The two measure differently — stop → next stop
 * vs lodging → each stop, one day's sum each — and the tolerance is ruled to absorb that. Only days
 * present on BOTH sides are compared; a day missing from either is listed in `unmatched`, never
 * counted as agreement.
 */
export function perDayAgreement(
  legMinutesByDay: Readonly<Record<number, number>>,
  fitMinutesByDay: Readonly<Record<number, number>>,
  tolerance = 0.25,
): { agrees: boolean; days: DayAgreement[]; disagreeing: number[]; unmatched: number[] } {
  const legDays = Object.keys(legMinutesByDay).map(Number);
  const fitDays = Object.keys(fitMinutesByDay).map(Number);
  const both = legDays.filter((d) => fitDays.includes(d)).sort((a, b) => a - b);
  const unmatched = Array.from(new Set([...legDays, ...fitDays])).filter((d) => !both.includes(d)).sort((a, b) => a - b);
  const days = both.map((day) => {
    const legMinutes = legMinutesByDay[day];
    const fitMinutes = fitMinutesByDay[day];
    const top = Math.max(legMinutes, fitMinutes);
    const gap = top === 0 ? 0 : Math.abs(legMinutes - fitMinutes) / top;
    return { day, legMinutes, fitMinutes, gap, agrees: gap <= tolerance };
  });
  const disagreeing = days.filter((d) => !d.agrees).map((d) => d.day);
  return { agrees: both.length > 0 && disagreeing.length === 0, days, disagreeing, unmatched };
}
