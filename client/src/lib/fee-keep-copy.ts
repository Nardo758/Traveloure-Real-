/**
 * The "keep N%" copy on /earn and /become-provider (CP-2, ledger `2026-10-16-cp2-public-copy`).
 *
 * The numbers are the platform rates the fee resolver applies today, served by
 * `GET /api/fee-policies/keep-rates` (`server/services/earn-keep-rates.service.ts`); the earner
 * keeps the rest. A rate that is absent, not a number, or outside 0–1 gives NO sentence for its
 * half (§13), never a typed fallback (§8).
 *
 * Part F3's beta-cohort clause ("locked when you join, 30 days' written notice before any change")
 * is left out on purpose until FE-2 makes it true (decision-maker, Oct 16, 2026).
 */
export const KEEP_RATES_ENDPOINT = "/api/fee-policies/keep-rates";

export interface PublicKeepRates {
  expertPlatformRate?: number | null;
  providerPlatformRate?: number | null;
}

/** The platform take as a whole percent, or null when there is no usable rate. */
export function platformTakePercent(rate: number | string | null | undefined): number | null {
  if (rate === null || rate === undefined || rate === "") return null;
  const value = Number(rate);
  if (!Number.isFinite(value) || value < 0 || value >= 1) return null;
  return Math.round(value * 100);
}

/** "Providers keep 90% (10%)." — or null. */
export function providerKeepLine(rates: PublicKeepRates | null | undefined): string | null {
  const take = platformTakePercent(rates?.providerPlatformRate);
  return take === null ? null : `Providers keep ${100 - take}% (${take}%).`;
}

/** "Experts and planners keep 75% of your planning fee." — or null. */
export function expertKeepLine(rates: PublicKeepRates | null | undefined): string | null {
  const take = platformTakePercent(rates?.expertPlatformRate);
  return take === null ? null : `Experts and planners keep ${100 - take}% of your planning fee.`;
}

/** The /earn revenue-share line; each half is left out when its rate gave no answer. */
export function earnKeepSentence(rates: PublicKeepRates | null | undefined): string | null {
  const parts = [expertKeepLine(rates), providerKeepLine(rates)].filter((p): p is string => p !== null);
  return parts.length === 0 ? null : parts.join(" ");
}
