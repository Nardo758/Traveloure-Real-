/**
 * The "keep N%" copy on /earn (CP-2, ledger `2026-10-16-cp2-public-copy`) and the
 * /become-provider review line (S-21, ledger `2026-10-21-supply-registration-fixes`).
 *
 * The numbers are the platform rates the fee resolver applies today, served by
 * `GET /api/fee-policies/keep-rates` (`server/services/earn-keep-rates.service.ts`); the earner
 * keeps the rest. A rate that is absent, not a number, or outside 0–1 gives NO sentence for its
 * half (§13), never a typed fallback (§8).
 *
 * The cohort clause ("Beta cohort rate. Rates are set per band and shown before you accept any job." — A-30, which
 * replaced Part F3's "locked when you join" claim) rides the expert half only when the server says the expert rate IS a
 * cohort's (`expertCohort`, FE-2 ruling 6).
 */
export const KEEP_RATES_ENDPOINT = "/api/fee-policies/keep-rates";

export interface PublicKeepRates {
  expertPlatformRate?: number | null;
  providerPlatformRate?: number | null;
  expertCohort?: { label?: string | null; noticeDays?: number | null } | null;
  /** LW-1g: the platform take on a Ready-Made Trip sale (the `ready_made_trip` band, as charged). */
  readyMadePlatformRate?: number | null;
  readyMadeExampleEnabled?: boolean;
}

/** The platform take as a whole percent, or null when there is no usable rate. */
export function platformTakePercent(rate: number | string | null | undefined): number | null {
  if (rate === null || rate === undefined || rate === "") return null;
  const value = Number(rate);
  if (!Number.isFinite(value) || value < 0 || value >= 1) return null;
  return Math.round(value * 100);
}

/** "Providers keep 90% (10%)." — the /earn half, or null. */
export function providerKeepLine(rates: PublicKeepRates | null | undefined): string | null {
  const take = platformTakePercent(rates?.providerPlatformRate);
  return take === null ? null : `Providers keep ${100 - take}% (${take}%).`;
}

/**
 * The /become-provider review step (S-21). X is the share the earner keeps, from the
 * same provider rate. A rate that cannot be read returns null so the line is omitted
 * rather than filled with a typed number.
 */
export function providerReviewKeepLine(rates: PublicKeepRates | null | undefined): string | null {
  const take = platformTakePercent(rates?.providerPlatformRate);
  if (take === null) return null;
  return `You keep ${100 - take}% of each booking`;
}

/**
 * The cohort clause for a cohort rate, or null when the rate is not a cohort's. A-30 (ledger `2026-11-05-lane5-copy`;
 * "Wording approved — Leon", Nov 5, 2026): no lock is claimed — nothing locks a rate — so the clause says how rates
 * are set: "Beta cohort rate. Rates are set per band and shown before you accept any job."
 */
export function expertCohortClause(rates: PublicKeepRates | null | undefined): string | null {
  const label = rates?.expertCohort?.label?.trim();
  if (!label) return null;
  return `${label.charAt(0).toUpperCase()}${label.slice(1)} cohort rate. Rates are set per band and shown before you accept any job`;
}

/**
 * "Experts and planners keep 85% of your planning fee. Beta cohort rate. Rates are set per band and shown before you
 * accept any job." — the clause only for a cohort rate — or null.
 */
export function expertKeepLine(rates: PublicKeepRates | null | undefined): string | null {
  const take = platformTakePercent(rates?.expertPlatformRate);
  if (take === null) return null;
  const clause = expertCohortClause(rates);
  return clause === null
    ? `Experts and planners keep ${100 - take}% of your planning fee.`
    : `Experts and planners keep ${100 - take}% of your planning fee. ${clause}.`;
}

/** The /earn revenue-share line; each half is left out when its rate gave no answer. */
export function earnKeepSentence(rates: PublicKeepRates | null | undefined): string | null {
  const parts = [expertKeepLine(rates), providerKeepLine(rates)].filter((p): p is string => p !== null);
  return parts.length === 0 ? null : parts.join(" ");
}
