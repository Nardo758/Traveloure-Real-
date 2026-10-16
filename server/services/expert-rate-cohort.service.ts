/**
 * FE-2 — the expert rate cohort, server side (decision-maker rulings, Oct 16, 2026; ledger
 * `2026-10-16-fe2-beta-cohort`).
 *
 *   · `resolveCohortBandRate`  — the ONE read of "what does this cohort pay right now": the cohort's
 *     band, active and a usable percent, and the cohort not past its end date. Null means the
 *     cohort does not apply and the caller takes the ordinary expert path (§13: nothing invented).
 *   · `stampApprovalCohort`    — run INSIDE the approval's role-change transaction: stamps
 *     `rate_cohort` + `rate_locked_at` once, and writes its own audit row in the same transaction.
 *   · `resolveExpertRateView`  — what the expert is shown: the resolver's own rate, and the cohort
 *     label and lock date only when the cohort is what priced it.
 *   · `resolveApprovalCohortRate` — what a NEW expert would pay (/earn): the band named by
 *     `expert_approval_rate_cohort`, under the same end-date rule.
 *   · `bandLockedByCohort`     — whether any user's current cohort pays this band (the admin lock).
 *
 * The cohort → band map lives in `@shared/expert-rate-cohort` and is never restated here.
 */
import { sql } from "drizzle-orm";
import { db } from "../db";
import { accessAuditLogs } from "@shared/schema";
import {
  EXPERT_APPROVAL_COHORT_SETTING,
  EXPERT_RATE_CHANGE_NOTICE_DAYS_SETTING,
  cohortDefinition,
  cohortEnded,
  cohortsForBand,
  isExpertCohortRole,
  usableCohortRate,
} from "@shared/expert-rate-cohort";

type Executor = Pick<typeof db, "execute">;

async function readSetting(key: string, executor: Executor = db): Promise<string | null> {
  const result = await executor.execute(sql`
    SELECT setting_value FROM platform_settings WHERE setting_key = ${key} LIMIT 1
  `);
  const row = result.rows?.[0] as { setting_value: string | null } | undefined;
  return row?.setting_value ?? null;
}

async function readActivePercentRate(bandKey: string, executor: Executor = db): Promise<number | null> {
  const result = await executor.execute(sql`
    SELECT CAST(default_rate AS FLOAT) AS rate, rate_type
      FROM fee_bands
     WHERE band_key = ${bandKey} AND is_active = true
     LIMIT 1
  `);
  const row = result.rows?.[0] as { rate: number | null; rate_type: string | null } | undefined;
  if (!row || row.rate_type !== "percent") return null;
  return usableCohortRate(row.rate);
}

export interface CohortBandRate {
  cohort: string;
  bandKey: string;
  label: string;
  /** Platform-take fraction. */
  rate: number;
}

/**
 * The rate a cohort pays now, or null when it does not apply: an unknown cohort, a cohort past its
 * end date, or a band that is missing, inactive, not a percent band, or outside (0, 1).
 */
export async function resolveCohortBandRate(
  cohort: string | null | undefined,
  now: Date = new Date(),
  executor: Executor = db,
): Promise<CohortBandRate | null> {
  const def = cohortDefinition(cohort);
  if (!def || !cohort) return null;
  const endDate = await readSetting(def.endDateSettingKey, executor);
  if (cohortEnded(endDate, now)) return null;
  const rate = await readActivePercentRate(def.bandKey, executor);
  if (rate === null) return null;
  return { cohort: cohort.trim(), bandKey: def.bandKey, label: def.label, rate };
}

export interface ApprovalCohortStamp {
  cohort: string;
  bandKey: string;
  rate: number;
  lockedAt: string;
}

/**
 * Stamp the approval cohort on a newly approved expert. Call it INSIDE the transaction that writes
 * the role change and its audit row, so the stamp, its audit row and the role commit together.
 *
 * Stamps nothing (returns null) when: the role is not a cohort role (ruling 3); the approval setting
 * is blank or names an unknown cohort; the cohort is past its end date or its band is unusable; or
 * the expert already has a cohort — a re-approval never moves `rate_locked_at`.
 */
export async function stampApprovalCohort(
  tx: Executor & { insert: typeof db.insert },
  input: { userId: string; role: string; actorId: string; actorRole: string },
  now: Date = new Date(),
): Promise<ApprovalCohortStamp | null> {
  if (!isExpertCohortRole(input.role)) return null;
  const cohort = (await readSetting(EXPERT_APPROVAL_COHORT_SETTING, tx))?.trim() ?? "";
  const band = await resolveCohortBandRate(cohort, now, tx);
  if (!band) return null;

  const stamped = await tx.execute(sql`
    UPDATE users
       SET rate_cohort = ${band.cohort}, rate_locked_at = now()
     WHERE id = ${input.userId} AND rate_cohort IS NULL
    RETURNING rate_locked_at
  `);
  const row = stamped.rows?.[0] as { rate_locked_at: Date | string } | undefined;
  if (!row) return null;
  const lockedAt = new Date(row.rate_locked_at).toISOString();

  await tx.insert(accessAuditLogs).values({
    actorId: input.actorId,
    actorRole: input.actorRole,
    action: "rate_cohort_assigned",
    resourceType: "user",
    resourceId: input.userId,
    targetUserId: input.userId,
    metadata: { cohort: band.cohort, bandKey: band.bandKey, platformRate: band.rate, lockedAt },
  } as any);

  return { cohort: band.cohort, bandKey: band.bandKey, rate: band.rate, lockedAt };
}

export interface ExpertRateViewResult {
  platformRate: number | null;
  cohort: string | null;
  cohortLabel: string | null;
  lockedAt: string | null;
  /** What priced the rate: the per-expert override, the cohort's band, or the ordinary expert band. */
  basis: "override" | "cohort" | "standard" | null;
}

/**
 * The rate an expert pays on a default-category planning fee, read through `resolveCommissionRates`
 * itself (§18 rule 1). The cohort label and lock date are returned only when the cohort is what
 * priced it; an override or an ended cohort shows the bare rate.
 */
export async function resolveExpertRateView(userId: string, now: Date = new Date()): Promise<ExpertRateViewResult> {
  const { resolveCommissionRates } = await import("./commission");
  const { resolveCommissionOverride } = await import("./commission-override");
  const userRow = await db.execute(sql`
    SELECT rate_cohort, rate_locked_at,
           commission_override_platform_fee_percent AS platform_fee,
           commission_override_expert_share_percent AS expert_share
      FROM users WHERE id = ${userId} LIMIT 1
  `);
  const row = userRow.rows?.[0] as
    | { rate_cohort: string | null; rate_locked_at: Date | string | null; platform_fee: string | null; expert_share: string | null }
    | undefined;

  let platformRate: number | null = null;
  try {
    platformRate = (await resolveCommissionRates({ category: "default", expertId: userId })).platformFeeRate;
  } catch {
    platformRate = null;
  }

  const override = row
    ? resolveCommissionOverride({ platformFeePercent: row.platform_fee, expertSharePercent: row.expert_share })
    : null;
  if (override) {
    return { platformRate, cohort: row?.rate_cohort ?? null, cohortLabel: null, lockedAt: null, basis: "override" };
  }
  const band = row?.rate_cohort ? await resolveCohortBandRate(row.rate_cohort, now) : null;
  if (band && row?.rate_locked_at && platformRate === band.rate) {
    return {
      platformRate,
      cohort: band.cohort,
      cohortLabel: band.label,
      lockedAt: new Date(row.rate_locked_at).toISOString(),
      basis: "cohort",
    };
  }
  return {
    platformRate,
    cohort: row?.rate_cohort ?? null,
    cohortLabel: null,
    lockedAt: null,
    basis: platformRate === null ? null : "standard",
  };
}

export interface ApprovalCohortRate {
  rate: number;
  label: string;
  noticeDays: number | null;
}

/**
 * The cohort rate a newly approved expert would get today (/earn, ruling 6), or null when the
 * approval setting is blank, names an unknown cohort, or the cohort does not apply.
 */
export async function resolveApprovalCohortRate(now: Date = new Date()): Promise<ApprovalCohortRate | null> {
  const cohort = await readSetting(EXPERT_APPROVAL_COHORT_SETTING);
  const band = await resolveCohortBandRate(cohort, now);
  if (!band) return null;
  const rawDays = await readSetting(EXPERT_RATE_CHANGE_NOTICE_DAYS_SETTING);
  const days = rawDays === null ? NaN : Number(rawDays.trim());
  return { rate: band.rate, label: band.label, noticeDays: Number.isInteger(days) && days > 0 ? days : null };
}

/** Whether some user's current cohort pays `bandKey` (the admin rate lock, ruling 2). */
export async function bandLockedByCohort(bandKey: string, executor: Executor = db): Promise<boolean> {
  const cohorts = cohortsForBand(bandKey);
  if (cohorts.length === 0) return false;
  const result = await executor.execute(sql`
    SELECT 1 FROM users WHERE rate_cohort IN (${sql.join(cohorts.map((c) => sql`${c}`), sql`, `)}) LIMIT 1
  `);
  return (result.rows?.length ?? 0) > 0;
}
