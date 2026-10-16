/**
 * The "keep N%" copy on /earn and /become-provider (CP-2, ledger `2026-10-16-cp2-public-copy`).
 *
 * Every number comes from a live `fee_bands` row (§8): the band stores the PLATFORM TAKE as a
 * fraction, and the earner keeps the rest. A band that did not load, is not a percent band, or
 * holds a rate outside 0–1 gives NO sentence (§13), never a typed fallback number.
 *
 * Bands read: `expert_new` (the beta cohort's expert and planner rate) and `beta_flat` (the
 * provider rate while `active_provider_commission_policy` is `beta_flat`).
 */
export const EXPERT_BETA_BAND = "expert_new";
export const PROVIDER_BETA_BAND = "beta_flat";

export interface PercentBandLike {
  rate_type?: string;
  default_rate?: number | string | null;
}

/** The platform take as a whole percent, or null when the band gives no usable answer. */
export function platformTakePercent(band: PercentBandLike | null | undefined): number | null {
  if (!band || band.rate_type !== "percent") return null;
  const rate = Number(band.default_rate);
  if (!Number.isFinite(rate) || rate < 0 || rate > 1) return null;
  return Math.round(rate * 100);
}

/** "Providers keep 90% (10%)." — or null. */
export function providerKeepLine(providerBand: PercentBandLike | null | undefined): string | null {
  const take = platformTakePercent(providerBand);
  return take === null ? null : `Providers keep ${100 - take}% (${take}%).`;
}

/**
 * The /earn revenue-share line (Part F3 item 3, word for word). Each half needs its own band;
 * a half whose band gave no answer is left out rather than guessed.
 */
export function earnKeepSentence(
  expertBand: PercentBandLike | null | undefined,
  providerBand: PercentBandLike | null | undefined,
): string | null {
  const expertTake = platformTakePercent(expertBand);
  const expertHalf =
    expertTake === null
      ? null
      : `Experts and planners keep ${100 - expertTake}% of your planning fee (${expertTake}% beta cohort rate, locked when you join, 30 days' written notice before any change).`;
  const parts = [expertHalf, providerKeepLine(providerBand)].filter((p): p is string => p !== null);
  return parts.length === 0 ? null : parts.join(" ");
}
