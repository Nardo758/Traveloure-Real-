/**
 * FU-S1-3 — WHAT "CLOSE" MEANS FOR A STAY (decision-maker ruling, Oct 9, 2026; Locked Decision 64). A day is
 * close when the stay is within a threshold of EVERY located stop that day: routed minutes on a paid plan
 * (`planGetsRoutedLegs`), straight-line distance on a free plan. Distances and durations, never rates (§8).
 * Each is env-overridable by name; an unset, non-numeric or non-positive value reads the ruled default.
 */
function positiveNumberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Ruled default: 20 routed minutes (paid plan). */
export const STAY_CLOSE_ROUTED_MINUTES_DEFAULT = 20;
/** Ruled default: 1.5 km straight line (free plan). */
export const STAY_CLOSE_STRAIGHT_KM_DEFAULT = 1.5;

/** Paid plan: routed minutes from the stay to every located stop of a day for that day to be close. */
export function stayCloseRoutedMinutes(): number {
  return positiveNumberEnv("STAY_CLOSE_ROUTED_MINUTES", STAY_CLOSE_ROUTED_MINUTES_DEFAULT);
}

/** Free plan: straight-line kilometres from the stay to every located stop of a day for that day to be close. */
export function stayCloseStraightKm(): number {
  return positiveNumberEnv("STAY_CLOSE_STRAIGHT_KM", STAY_CLOSE_STRAIGHT_KM_DEFAULT);
}
