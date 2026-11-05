/**
 * R3-12 (ledger `2026-11-05-r3-entry-city`): how far back a plan counts as "recent" for the landing rail. Config, not a
 * literal in the reader; `LANDING_RECENT_PLANS_WINDOW_DAYS` overrides it. A bad value falls back to the default.
 */
const DEFAULT_WINDOW_DAYS = 90;

export function recentPlansWindowDays(): number {
  const n = Number(process.env.LANDING_RECENT_PLANS_WINDOW_DAYS);
  return Number.isInteger(n) && n > 0 && n <= 3650 ? n : DEFAULT_WINDOW_DAYS;
}
