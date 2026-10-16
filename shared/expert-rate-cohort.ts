/**
 * FE-2 — the expert rate cohort (decision-maker rulings, Oct 16, 2026; ledger
 * `2026-10-16-fe2-beta-cohort`).
 *
 * A cohort is a named group of experts who pay one fee band on their planning fees. An expert
 * joins a cohort once, when approved (or by the held backfill), and `users.rate_cohort` records
 * which. This module is the ONE place a cohort is mapped to its band, its end-date setting and its
 * label (§18 rule 1); the resolver, the approval stamp, the admin lock, the backfill and the
 * display all read it.
 *
 * Pure: no db, no I/O.
 */

export interface ExpertRateCohort {
  /** The `fee_bands.band_key` this cohort's experts pay. */
  bandKey: string;
  /** The word shown to the expert: "Your rate: 15%, <label> cohort, locked …". */
  label: string;
  /** `platform_settings` key holding the cohort's end date (YYYY-MM-DD). Absent or blank = no end. */
  endDateSettingKey: string;
}

export const EXPERT_RATE_COHORTS: Readonly<Record<string, ExpertRateCohort>> = {
  beta_2026: { bandKey: "expert_beta_2026", label: "beta", endDateSettingKey: "expert_beta_end_date" },
};

/** `platform_settings` key naming the cohort a newly approved expert joins. Blank = none. */
export const EXPERT_APPROVAL_COHORT_SETTING = "expert_approval_rate_cohort";

/** `platform_settings` key: days of written notice before a cohort rate changes. */
export const EXPERT_RATE_CHANGE_NOTICE_DAYS_SETTING = "expert_rate_change_notice_days";

/** The roles a cohort applies to (ruling 3). The approval stamp skips every other role. */
export const EXPERT_COHORT_ROLES = ["travel_expert", "local_expert", "event_planner"] as const;

export function isExpertCohortRole(role: string | null | undefined): boolean {
  return !!role && (EXPERT_COHORT_ROLES as readonly string[]).includes(role);
}

/** The cohort's definition, or null for a NULL, blank or unknown cohort. */
export function cohortDefinition(cohort: string | null | undefined): ExpertRateCohort | null {
  if (!cohort) return null;
  const key = cohort.trim();
  return Object.prototype.hasOwnProperty.call(EXPERT_RATE_COHORTS, key) ? EXPERT_RATE_COHORTS[key] : null;
}

/** Every cohort whose band is `bandKey` (the admin lock asks this). */
export function cohortsForBand(bandKey: string): string[] {
  return Object.entries(EXPERT_RATE_COHORTS)
    .filter(([, def]) => def.bandKey === bandKey)
    .map(([cohort]) => cohort);
}

/**
 * True when the cohort has ended: the end date is set and today (UTC) is after it. The end date
 * is inclusive. An end date that is set but not a YYYY-MM-DD date counts as ended, so a typo
 * never extends the discount silently; the resolver then falls back to the ordinary expert band.
 */
export function cohortEnded(endDate: string | null | undefined, now: Date): boolean {
  if (endDate === null || endDate === undefined) return false;
  const value = endDate.trim();
  if (value === "") return false;
  const endUtc = parseCohortEndDate(value);
  if (endUtc === null) return true;
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return todayUtc > endUtc;
}

/** A YYYY-MM-DD calendar date as a UTC midnight timestamp, or null when it is not a real date. */
export function parseCohortEndDate(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const utc = Date.UTC(y, m - 1, d);
  const check = new Date(utc);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return null;
  return utc;
}

/**
 * The admin settings rail's checks for the three FE-2 settings: a cohort end date is blank (no
 * end) or a real YYYY-MM-DD date; the approval cohort is blank (none) or a known cohort; the
 * notice is a whole number of days from 1 to 365. Returns null when the value is acceptable, else
 * the sentence to refuse it with. A key this module does not own returns null.
 */
export function expertCohortSettingRefusal(settingKey: string, value: string): string | null {
  const v = value.trim();
  if (Object.values(EXPERT_RATE_COHORTS).some((c) => c.endDateSettingKey === settingKey)) {
    return v === "" || parseCohortEndDate(v) !== null ? null : `${settingKey} must be blank or a date as YYYY-MM-DD`;
  }
  if (settingKey === EXPERT_APPROVAL_COHORT_SETTING) {
    return v === "" || cohortDefinition(v) !== null
      ? null
      : `${settingKey} must be blank or one of: ${Object.keys(EXPERT_RATE_COHORTS).join(", ")}`;
  }
  if (settingKey === EXPERT_RATE_CHANGE_NOTICE_DAYS_SETTING) {
    return /^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 365 ? null : `${settingKey} must be a whole number of days from 1 to 365`;
  }
  return null;
}

/** A platform-take fraction a cohort band may be read as: a number strictly between 0 and 1. */
export function usableCohortRate(rate: number | string | null | undefined): number | null {
  if (rate === null || rate === undefined || rate === "") return null;
  const value = Number(rate);
  return Number.isFinite(value) && value > 0 && value < 1 ? value : null;
}

/** "Oct 16, 2026" (UTC), or null for a missing or invalid date. */
export function formatLockDate(value: string | Date | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export interface ExpertRateView {
  /** The platform take on the expert's planning fees, as a fraction. */
  platformRate: number | null;
  /** The cohort label when the cohort's band is what applies; null otherwise. */
  cohortLabel?: string | null;
  /** When the cohort was stamped (ISO string); only meaningful with a cohort label. */
  lockedAt?: string | null;
}

/**
 * "Your rate: 15%, beta cohort, locked Oct 16, 2026" when the cohort applies, "Your rate: 25%"
 * otherwise, or null when there is no usable rate (§13: no number is invented).
 */
export function expertRateLine(view: ExpertRateView | null | undefined): string | null {
  if (!view) return null;
  const rate = view.platformRate;
  if (rate === null || rate === undefined || !Number.isFinite(rate) || rate < 0 || rate >= 1) return null;
  const percent = Math.round(rate * 100);
  const lockDate = formatLockDate(view.lockedAt ?? null);
  if (view.cohortLabel && lockDate) return `Your rate: ${percent}%, ${view.cohortLabel} cohort, locked ${lockDate}`;
  return `Your rate: ${percent}%`;
}
