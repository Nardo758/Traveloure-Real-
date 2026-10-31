/**
 * Missed-run cron alerts (ledger `2026-10-30-row100-missed-run-cron-alerts`).
 *
 * `computeJobHealth` already marks a roster job `stale` or `never_succeeded`. This module tells
 * staff: one ops alert per job per UTC day, the same digest-plus-per-admin path as the geocode
 * cap alert. The admin digest is the only mail path. This module does not send mail.
 *
 * NEVER THROWS. It runs at the end of a scheduled pass; an alert that could throw would fail that
 * pass. Dedupe is a read-then-write of today's digest row for that job, not a unique index: two
 * concurrent passes can both insert. That is the same non-atomic posture as the geocode alert.
 *
 * DOES NOT STAMP HEARTBEATS. A success stamp on a job this module is reporting would hide the miss.
 */

import type { JobCadence, JobHealthRow } from "./job-heartbeats.service";

export const JOB_STALE_DIGEST_TYPE = "scheduled_job_missed_run";
export const JOB_STALE_STAFF_TYPE = "job_missed_run";

export interface JobStaleDigestRow {
  type: string;
  message: string;
  reason: string;
  metadata: Record<string, unknown>;
}

export interface JobStaleStaffRow {
  userId: string;
  type: string;
  title: string;
  message: string;
  dedupeKey: string;
  data: Record<string, unknown>;
}

export interface JobStaleAlertDeps {
  health: (roster: readonly JobCadence[], now: Date) => Promise<JobHealthRow[]>;
  alreadyRecordedToday: (job: string, day: string, since: Date) => Promise<boolean>;
  writeDigest: (row: JobStaleDigestRow) => Promise<void>;
  adminUserIds: () => Promise<string[]>;
  writeStaff: (row: JobStaleStaffRow) => Promise<void>;
}

export interface JobStaleAlertInput {
  now?: Date;
  /** Production passes `JOB_CADENCE`. Ignored when `rows` is set. */
  roster?: readonly JobCadence[];
  /** Precomputed health rows. Tests pass these; production leaves them unset. */
  rows?: readonly JobHealthRow[];
}

function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** Expected cadence as staff read it. The seconds stay in the digest metadata. */
export function formatExpectedCadence(expectedIntervalSec: number): string {
  if (expectedIntervalSec > 0 && expectedIntervalSec % 3600 === 0) {
    const hours = expectedIntervalSec / 3600;
    return `every ${hours} ${hours === 1 ? "hour" : "hours"}`;
  }
  if (expectedIntervalSec > 0 && expectedIntervalSec % 60 === 0) {
    const minutes = expectedIntervalSec / 60;
    return `every ${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  }
  return `every ${expectedIntervalSec} seconds`;
}

export function jobStaleAlertTitle(row: { job: string; status: string }): string {
  return `Scheduled job ${row.job} is ${row.status}`;
}

export function jobStaleAlertMessage(row: {
  job: string;
  status: string;
  lastSuccessAt: string | null;
  expectedIntervalSec: number;
  bucket: string;
}): string {
  const last = row.lastSuccessAt ?? "none recorded";
  return (
    `Scheduled job ${row.job} is ${row.status}. ` +
    `Last cron-driven success: ${last}. ` +
    `Expected cadence: ${formatExpectedCadence(row.expectedIntervalSec)} (${row.bucket}).`
  );
}

export function jobStaleStaffDedupeKey(day: string, job: string, userId: string): string {
  return `job-missed-run:${day}:${job}:${userId}`;
}

function defaultDeps(): JobStaleAlertDeps {
  return {
    async health(roster, now) {
      const { computeJobHealth } = await import("./job-heartbeats.service");
      return computeJobHealth(roster, now);
    },
    async alreadyRecordedToday(job, _day, since) {
      const { db } = await import("../db");
      const { adminNotifications } = await import("@shared/schema");
      const { and, eq, gte, sql } = await import("drizzle-orm");
      const found = await db
        .select({ id: adminNotifications.id })
        .from(adminNotifications)
        .where(and(
          eq(adminNotifications.type, JOB_STALE_DIGEST_TYPE),
          gte(adminNotifications.createdAt, since),
          sql`${adminNotifications.metadata}->>'job' = ${job}`,
        ))
        .limit(1);
      return found.length > 0;
    },
    async writeDigest(row) {
      const { raiseOpsAlert } = await import("./ops-alert.service");
      await raiseOpsAlert({
        type: row.type,
        message: row.message,
        reason: row.reason,
        metadata: row.metadata,
      });
    },
    async adminUserIds() {
      const { getAdminUserIds } = await import("./content-query.service");
      return getAdminUserIds();
    },
    async writeStaff(row) {
      const { db } = await import("../db");
      const { notifications } = await import("@shared/schema");
      await db.insert(notifications).values({
        userId: row.userId,
        type: row.type,
        title: row.title,
        message: row.message,
        dedupeKey: row.dedupeKey,
        data: row.data,
      });
    },
  };
}

/**
 * Raise one staff alert for each roster job that is not `ok`. One digest row and one staff
 * notification per admin, once per job per UTC day. Never stamps a heartbeat. Never throws.
 */
export async function recordStaleJobAlerts(
  input: JobStaleAlertInput = {},
  deps: JobStaleAlertDeps = defaultDeps(),
): Promise<void> {
  try {
    const now = input.now ?? new Date();
    const rows = input.rows ?? (input.roster ? await deps.health(input.roster, now) : []);
    const day = utcDay(now);
    const since = startOfUtcDay(now);
    for (const row of rows) {
      if (row.status === "ok") continue;
      try {
        if (await deps.alreadyRecordedToday(row.job, day, since)) continue;
        const message = jobStaleAlertMessage(row);
        const metadata = {
          job: row.job,
          status: row.status,
          lastSuccessAt: row.lastSuccessAt,
          expectedIntervalSec: row.expectedIntervalSec,
          bucket: row.bucket,
          day,
        };
        await deps.writeDigest({
          type: JOB_STALE_DIGEST_TYPE,
          message,
          reason: row.status,
          metadata,
        });
        const title = jobStaleAlertTitle(row);
        const adminIds = await deps.adminUserIds();
        for (const userId of adminIds) {
          await deps.writeStaff({
            userId,
            type: JOB_STALE_STAFF_TYPE,
            title,
            message,
            dedupeKey: jobStaleStaffDedupeKey(day, row.job, userId),
            data: { ...metadata, reason: row.status },
          });
        }
      } catch {
        // one job's failure must not stop the others
      }
    }
  } catch {
    // never throws
  }
}
