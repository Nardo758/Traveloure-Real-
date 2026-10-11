/**
 * FD-5 — COVERAGE TARGETS (decision-maker rulings, Oct 10, 2026; numbers Leon's, Oct 10, 2026; ledger
 * `2026-10-10-fd5-coverage-targets`; brief docs/planning/briefs/fd-5-coverage-targets.md).
 *
 * Per market, per PRODUCTION neighbourhood slug (`city_neighborhoods.slug`), per day type, the counts of
 * local content a neighbourhood must hold before the free plan's count-only teaser may speak for it.
 * Counts, never rates (§8). The rule that reads these is `shared/coverage-targets.ts`.
 *
 *   · A slug with NO entry has NO gate (FD-1's behaviour) — never an invented target (§13).
 *   · `localPicks` / `localNotes` GATE the teaser (ruling 4).
 *   · The official-fact fields are CENSUS-REPORTED ONLY and stay unset (ruling 4): FD-3's day line already
 *     says "not checked" where nothing official is stored.
 *   · Migration 042's `fushimi_inari` / `downtown_kawaramachi` never reached production and are not keys here.
 */
import type { CoverageTargets } from "@shared/coverage-targets";

const KYOTO_SLUG_TARGET = {
  peak: { localPicks: 5, localNotes: 3 },
  normal_weekday: { localPicks: 3, localNotes: 2 },
} as const;

export const COVERAGE_TARGETS: CoverageTargets = {
  kyoto: {
    higashiyama: KYOTO_SLUG_TARGET,
    arashiyama: KYOTO_SLUG_TARGET,
    fushimi: KYOTO_SLUG_TARGET,
    gion: KYOTO_SLUG_TARGET,
    pontocho: KYOTO_SLUG_TARGET,
    "kawaramachi-sanjo": KYOTO_SLUG_TARGET,
    "kyoto-station": KYOTO_SLUG_TARGET,
    nishijin: KYOTO_SLUG_TARGET,
  },
};

/** The market's targets by slug, or an empty map (no gate anywhere in it). */
export function coverageTargetsForMarket(market: string | null | undefined): CoverageTargets[string] {
  if (!market) return {};
  return COVERAGE_TARGETS[market.trim().toLowerCase()] ?? {};
}

/**
 * Ruling 1: a date in a season whose `market_season_calendars.expected_demand_multiplier` is at or above
 * this is a PEAK day (Kyoto: sakura 1.90, momiji 1.80). Env-overridable; unset, non-numeric or
 * non-positive reads the ruled 1.5.
 */
export function coveragePeakMultiplier(): number {
  const raw = process.env.COVERAGE_PEAK_MULTIPLIER;
  if (raw == null || raw.trim() === "") return 1.5;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 1.5;
}
