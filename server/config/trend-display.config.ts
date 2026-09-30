/**
 * TravelPulse PR 1 (ledger `2026-09-29-travelpulse-hygiene`): how old a market's newest
 * `trend_scores` row may be before no Trend number is shown for it. Config, never a literal at a
 * call site; env-overridable. Default 48 hours — two missed daily refreshes.
 */
export function trendScoreMaxAgeHours(): number {
  const raw = Number(process.env.TREND_SCORE_MAX_AGE_HOURS);
  return Number.isFinite(raw) && raw > 0 ? raw : 48;
}
