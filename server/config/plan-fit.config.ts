/**
 * The "N places would make your days easier" threshold (§M9; R213 `2026-09-29-m7-m9-ratified` —
 * RATIFIED, PROVISIONAL until the Part 6 sessions run; ledger `2026-09-29-a3b-option-sets-slip`).
 * Config, never a literal at a call site: a candidate counts only when its burden per day is lower
 * by at least max(minMinutesPerDay, minFraction × the chosen option's burden), on the same basis,
 * with coverage not lower. Env-overridable so the sessions can move it without a code change.
 */
function envNumber(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw >= 0 ? raw : fallback;
}

export function planFitEasierThreshold(): { minMinutesPerDay: number; minFraction: number } {
  return {
    minMinutesPerDay: envNumber("PLAN_FIT_EASIER_MIN_MINUTES_PER_DAY", 15),
    minFraction: envNumber("PLAN_FIT_EASIER_MIN_FRACTION", 0.2),
  };
}
