/**
 * `waitlist-retention` — LW-1h (ledger `2026-10-16-lw1h-waitlist-retention`; Leon, Oct 16, 2026: "retention = 12
 * months from the day traveler_signup_mode flips to open … never-converted rows only").
 *
 *   - No `traveler_signup_opened_at` row ⇒ sign-up has never opened ⇒ `not_open`, nothing deleted.
 *   - An unreadable value ⇒ an error (the run is marked failed on /internal/jobs/health), nothing deleted.
 *   - Until the opening instant + WAITLIST_RETENTION_MONTHS has passed ⇒ `not_due`, nothing deleted.
 *   - From then on, a launch_waitlist row is deleted only when it NEVER CONVERTED and its OWN 12 months have passed
 *     too (LW-1f-b per-row floor, issue #1486, architect's follow-up to reading 2): now > max(opening, created_at) +
 *     12 months. A row has converted when an account exists with the same address (users.email, trimmed and
 *     lower-cased on both sides); a row with no address never converted; a row with no created_at is never deleted
 *     (its age is unknown, §13).
 *
 * Each deletion is one transaction with its audit row (`waitlist_row_retention_delete`): the row id and the sha256
 * of the email, never the address (the LW-1e shape). The audit actor is the admin whose flip started the clock (the
 * `updated_by` stamped on the opened-at row) — access_audit_logs.actor_id must name a real account, and that flip is
 * the act this deletion carries out; actor_role is "system" and the metadata says it was the retention job. If that
 * account is gone or unrecorded the job deletes NOTHING and reports it as an error: a deletion with no audit row is
 * never made. Batches of WAITLIST_RETENTION_BATCH rows, at most WAITLIST_RETENTION_MAX_PER_RUN per run; a second run
 * on the same data deletes nothing.
 */
import { sql } from "drizzle-orm";
import { db } from "../db";
import { logger } from "../infrastructure/logger";
import { accessAuditLogs } from "@shared/schema";
import { TRAVELER_SIGNUP_OPENED_AT_SETTING, parseSignupOpenedAt } from "@shared/launch-signup";
import { WAITLIST_RETENTION_MONTHS, waitlistRetentionDueAt } from "@shared/launch-waitlist";
import { waitlistEmailSha256 } from "../services/launch-waitlist.service";

export const WAITLIST_RETENTION_BATCH = 200;
export const WAITLIST_RETENTION_MAX_PER_RUN = 5000;

export type WaitlistRetentionResult =
  | { status: "not_open"; deleted: 0 }
  | { status: "not_due"; openedAt: string; dueAt: string; deleted: 0 }
  | { status: "deleted"; openedAt: string; dueAt: string; deleted: number; more: boolean }
  | { status: "error"; error: string; deleted: number };

export async function runWaitlistRetention(now: Date = new Date()): Promise<WaitlistRetentionResult> {
  const settingRows = await db.execute(sql`
    SELECT s.setting_value, s.updated_by, (u.id IS NOT NULL) AS actor_exists
    FROM platform_settings s
    LEFT JOIN users u ON u.id = s.updated_by
    WHERE s.setting_key = ${TRAVELER_SIGNUP_OPENED_AT_SETTING}
    LIMIT 1
  `);
  const setting = settingRows.rows[0] as { setting_value: string | null; updated_by: string | null; actor_exists: boolean } | undefined;
  if (!setting) return { status: "not_open", deleted: 0 };

  const openedAt = parseSignupOpenedAt(setting.setting_value);
  if (!openedAt) {
    return { status: "error", error: `${TRAVELER_SIGNUP_OPENED_AT_SETTING} is not an ISO-8601 instant`, deleted: 0 };
  }
  const dueAt = waitlistRetentionDueAt(openedAt);
  if (now.getTime() <= dueAt.getTime()) {
    return { status: "not_due", openedAt: openedAt.toISOString(), dueAt: dueAt.toISOString(), deleted: 0 };
  }
  if (!setting.updated_by || !setting.actor_exists) {
    return { status: "error", error: "no recorded account opened sign-up, so no deletion can be audited; nothing deleted", deleted: 0 };
  }
  const actorId = setting.updated_by;

  let deleted = 0;
  while (deleted < WAITLIST_RETENTION_MAX_PER_RUN) {
    const batch = await db.transaction(async (tx) => {
      const r = await tx.execute(sql`
        DELETE FROM launch_waitlist
        WHERE id IN (
          SELECT w.id FROM launch_waitlist w
          WHERE NOT EXISTS (
            SELECT 1 FROM users u
            WHERE w.email IS NOT NULL AND lower(btrim(u.email)) = lower(btrim(w.email))
          )
          -- the per-row floor: this row's own 12 months have passed too (created_at is a zone-less timestamp written
          -- by NOW() in the connection's zone, so it is read in that zone before the comparison).
          AND w.created_at IS NOT NULL
          AND (w.created_at AT TIME ZONE current_setting('TimeZone')) + make_interval(months => ${WAITLIST_RETENTION_MONTHS}) < ${now.toISOString()}::timestamptz
          ORDER BY w.id
          LIMIT ${WAITLIST_RETENTION_BATCH}
          FOR UPDATE SKIP LOCKED
        )
        RETURNING id, email, market_slug, COALESCE(role, 'traveler') AS role
      `);
      const rows = r.rows as { id: string; email: string | null; market_slug: string | null; role: string }[];
      if (rows.length) {
        await tx.insert(accessAuditLogs).values(
          rows.map((row) => ({
            actorId,
            actorRole: "system",
            action: "waitlist_row_retention_delete",
            resourceType: "launch_waitlist",
            resourceId: row.id,
            metadata: {
              job: "waitlist-retention",
              emailSha256: row.email ? waitlistEmailSha256(row.email) : null,
              marketSlug: row.market_slug,
              role: row.role,
              signupOpenedAt: openedAt.toISOString(),
              retentionMonths: WAITLIST_RETENTION_MONTHS,
            },
          })),
        );
      }
      return rows.length;
    });
    deleted += batch;
    if (batch < WAITLIST_RETENTION_BATCH) {
      const out = { status: "deleted" as const, openedAt: openedAt.toISOString(), dueAt: dueAt.toISOString(), deleted, more: false };
      logger.info({ job: "waitlist-retention", ...out }, "[waitlist-retention] done");
      return out;
    }
  }
  const out = { status: "deleted" as const, openedAt: openedAt.toISOString(), dueAt: dueAt.toISOString(), deleted, more: true };
  logger.info({ job: "waitlist-retention", ...out }, "[waitlist-retention] run cap reached; the next run continues");
  return out;
}
