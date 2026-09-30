/**
 * TravelPulse PR 1 (ledger `2026-09-29-travelpulse-hygiene`): how old a market's newest
 * `trend_scores` row may be before no Trend number is shown for it. Config, never a literal at a
 * call site; env-overridable. Default 48 hours — two missed daily refreshes.
 */
export function trendScoreMaxAgeHours(): number {
  const raw = Number(process.env.TREND_SCORE_MAX_AGE_HOURS);
  return Number.isFinite(raw) && raw > 0 ? raw : 48;
}

/**
 * TravelPulse PR 2 (ledger `2026-09-30-travelpulse-crowd-band`): how old a crowd signal's newest
 * observation may be and still set a band. Crowds change daily, so a week-old forecast is the
 * default ceiling. Env-overridable.
 */
export function crowdSignalMaxAgeDays(): number {
  const raw = Number(process.env.CROWD_SIGNAL_MAX_AGE_DAYS);
  return Number.isFinite(raw) && raw > 0 ? raw : 7;
}

/** How many observations a crowd metric needs in the 90-day window before it has a usual to compare against. */
export function crowdMinBaselinePoints(): number {
  const raw = Number(process.env.CROWD_MIN_BASELINE_POINTS);
  return Number.isFinite(raw) && raw >= 2 ? Math.floor(raw) : 7;
}
