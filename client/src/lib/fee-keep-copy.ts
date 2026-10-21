/**
 * The "keep N%" copy on /earn (CP-2, ledger `2026-10-16-cp2-public-copy`) and the
 * /become-provider review line (S-21, ledger `2026-10-21-supply-registration-fixes`).
 *
 * The numbers are the platform rates the fee resolver applies today, served by
 * `GET /api/fee-policies/keep-rates` (`server/services/earn-keep-rates.service.ts`); the earner
 * keeps the rest. A rate that is absent, not a number, or outside 0–1 gives NO sentence for its
 * half (§13), never a typed fallback (§8).
 *
 * Part F3's beta-cohort clause ("beta cohort rate, locked when you join, 30 days' written notice
 * before any change") rides the expert half only when the server says the expert rate IS a
 * cohort's (`expertCohort`, FE-2 ruling 6). The notice days are the server's
 * `expert_rate_change_notice_days`; when that is unset the notice clause is left out, never a
 * typed "30" (§8/§13).
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

/** The F3 clause for a cohort rate, or null when the rate is not a cohort's. */
export function expertCohortClause(rates: PublicKeepRates | null | undefined): string | null {
  const label = rates?.expertCohort?.label?.trim();
  if (!label) return null;
  const days = rates?.expertCohort?.noticeDays;
  const notice = typeof days === "number" && Number.isInteger(days) && days > 0
    ? `, ${days} days' written notice before any change`
    : "";
  return `${label} cohort rate, locked when you join${notice}`;
}

/**
 * "Experts and planners keep 85% of your planning fee: beta cohort rate, locked when you join,
 * 30 days' written notice before any change." — the clause only for a cohort rate — or null.
 */
export function expertKeepLine(rates: PublicKeepRates | null | undefined): string | null {
  const take = platformTakePercent(rates?.expertPlatformRate);
  if (take === null) return null;
  const clause = expertCohortClause(rates);
  return clause === null
    ? `Experts and planners keep ${100 - take}% of your planning fee.`
    : `Experts and planners keep ${100 - take}% of your planning fee: ${clause}.`;
}

/** The /earn revenue-share line; each half is left out when its rate gave no answer. */
export function earnKeepSentence(rates: PublicKeepRates | null | undefined): string | null {
  const parts = [expertKeepLine(rates), providerKeepLine(rates)].filter((p): p is string => p !== null);
  return parts.length === 0 ? null : parts.join(" ");
}
