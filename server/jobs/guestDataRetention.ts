/**
 * Row 210 — erase guest RSVP details.
 *
 * The daily job deletes invite rows whose event ended at least N days ago. N is
 * `platform_settings.guest_data_retention_days` and has no code default. Absent, blank, or
 * unreadable N logs and erases nothing.
 *
 * Sooner than N: the host deleting the event, or the guest asking, erases that guest data in the
 * same transaction as its audit row. Those two do not wait for N and do not read it.
 *
 * An erasure with no audit row is not made. `access_audit_logs.actor_id` must name a real account,
 * so the job's actor is the admin who saved N (`updated_by`). When that account is missing and
 * rows are due, the job deletes nothing and reports an error. The audit row stores the count, never
 * an email, a name, or a token.
 *
 * `experienceIds` limits a pass to those events. The daily route does not set it. A proof on a
 * shared database passes it so the pass cannot erase anyone else's invites.
 */
import { sql } from "drizzle-orm";
import { db } from "../db";
import { logger } from "../infrastructure/logger";
import { accessAuditLogs } from "@shared/schema";
import {
  GUEST_DATA_RETENTION_DAYS_SETTING,
  parseGuestDataRetentionDays,
} from "@shared/guest-data-retention";

export const GUEST_RETENTION_MAX = 5000;
export const GUEST_DATA_ERASED_ACTION = "guest_data_erased";
export const GUEST_RETENTION_UNSET_LOG = "guest data retention N is unset; erased nothing";
export const GUEST_RETENTION_UNREADABLE_LOG =
  "guest data retention N is not a whole number of days; erased nothing";
export const GUEST_ERASE_AUDIT_MISSING = "guest data was not erased because the audit actor is missing";

const JOB = "guest-data-retention";

export type GuestRetentionJobResult =
  | { status: "unset"; erased: 0; reason: "absent" | "unreadable"; log: string }
  | { status: "idle"; erased: 0; retentionDays: number }
  | { status: "erased"; erased: number; retentionDays: number; more: boolean }
  | { status: "error"; erased: 0; error: string };

export interface GuestRetentionRunOptions {
  now?: Date;
  experienceIds?: readonly string[];
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function eraseInviteIds(tx: Tx, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const list = sql.join(ids.map((id) => sql`${id}`), sql`, `);
  await tx.execute(sql`
    DELETE FROM email_outbox
    WHERE email_type = 'guest_invite'
      AND metadata->>'inviteId' IN (${list})
  `);
  const deleted = await tx.execute(sql`
    DELETE FROM event_invites
    WHERE id IN (${list})
    RETURNING id
  `);
  return deleted.rows.length;
}

async function writeEraseAudit(
  tx: Tx,
  row: {
    actorId: string;
    actorRole: string;
    resourceType: string;
    resourceId: string;
    count: number;
    cause: "retention" | "host_delete" | "guest_request";
    retentionDays?: number;
  },
): Promise<void> {
  await tx.insert(accessAuditLogs).values({
    actorId: row.actorId,
    actorRole: row.actorRole.slice(0, 30),
    action: GUEST_DATA_ERASED_ACTION,
    resourceType: row.resourceType,
    resourceId: row.resourceId,
    metadata: {
      count: row.count,
      cause: row.cause,
      ...(row.retentionDays != null ? { retentionDays: row.retentionDays } : {}),
    },
  });
}

async function actorFor(tx: Tx, userId: string): Promise<{ id: string; role: string } | null> {
  const found = await tx.execute(sql`
    SELECT id, role FROM users WHERE id = ${userId} LIMIT 1
  `);
  const row = found.rows[0] as { id: string; role: string | null } | undefined;
  if (!row) return null;
  const role = (row.role ?? "").trim();
  return { id: row.id, role: role || "user" };
}

export async function readGuestDataRetentionDays(): Promise<number | null> {
  const rows = await db.execute(sql`
    SELECT setting_value
    FROM platform_settings
    WHERE setting_key = ${GUEST_DATA_RETENTION_DAYS_SETTING}
    LIMIT 1
  `);
  const raw = (rows.rows[0] as { setting_value: string } | undefined)?.setting_value;
  if (raw == null || raw.trim() === "") return null;
  return parseGuestDataRetentionDays(raw);
}

export async function runGuestDataRetention(
  options: GuestRetentionRunOptions = {},
): Promise<GuestRetentionJobResult> {
  const now = options.now ?? new Date();
  const scope = options.experienceIds;

  const settingRows = await db.execute(sql`
    SELECT setting_value, updated_by
    FROM platform_settings
    WHERE setting_key = ${GUEST_DATA_RETENTION_DAYS_SETTING}
    LIMIT 1
  `);
  const setting = settingRows.rows[0] as { setting_value: string | null; updated_by: string | null } | undefined;
  const raw = setting?.setting_value ?? null;
  if (raw == null || raw.trim() === "") {
    logger.info({ job: JOB, reason: "absent" }, GUEST_RETENTION_UNSET_LOG);
    return { status: "unset", erased: 0, reason: "absent", log: GUEST_RETENTION_UNSET_LOG };
  }
  const days = parseGuestDataRetentionDays(raw);
  if (days == null) {
    logger.info({ job: JOB, reason: "unreadable" }, GUEST_RETENTION_UNREADABLE_LOG);
    return { status: "unset", erased: 0, reason: "unreadable", log: GUEST_RETENTION_UNREADABLE_LOG };
  }
  if (scope && scope.length === 0) return { status: "idle", erased: 0, retentionDays: days };

  try {
    return await db.transaction(async (tx) => {
      const scopeSql = scope
        ? sql`AND e.id IN (${sql.join(scope.map((id) => sql`${id}`), sql`, `)})`
        : sql``;
      const picked = await tx.execute(sql`
        SELECT i.id
        FROM event_invites i
        INNER JOIN user_experiences e ON e.id = i.experience_id
        LEFT JOIN trips t ON t.id = e.trip_id
        WHERE e.event_date IS NOT NULL
          AND (e.event_date + ${days}::int) <= (
            (${now.toISOString()}::timestamptz) AT TIME ZONE COALESCE(NULLIF(btrim(t.timezone), ''), 'UTC')
          )::date
          ${scopeSql}
        ORDER BY i.id
        LIMIT ${GUEST_RETENTION_MAX}
        FOR UPDATE OF i SKIP LOCKED
      `);
      const ids = (picked.rows as { id: string }[]).map((row) => row.id);
      if (ids.length === 0) return { status: "idle" as const, erased: 0 as const, retentionDays: days };

      const actor = setting?.updated_by ? await actorFor(tx, setting.updated_by) : null;
      if (!actor) {
        logger.error({ job: JOB }, GUEST_ERASE_AUDIT_MISSING);
        return { status: "error" as const, erased: 0 as const, error: GUEST_ERASE_AUDIT_MISSING };
      }

      const erased = await eraseInviteIds(tx, ids);
      if (erased > 0) {
        await writeEraseAudit(tx, {
          actorId: actor.id,
          actorRole: "system",
          resourceType: "guest_data_retention",
          resourceId: GUEST_DATA_RETENTION_DAYS_SETTING,
          count: erased,
          cause: "retention",
          retentionDays: days,
        });
      }
      const out = {
        status: "erased" as const,
        erased,
        retentionDays: days,
        more: ids.length === GUEST_RETENTION_MAX,
      };
      logger.info({ job: JOB, erased, retentionDays: days, more: out.more }, "[guest-data-retention] done");
      return out;
    });
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : "retention pass failed";
    logger.error({ job: JOB, error }, "[guest-data-retention] failed");
    return { status: "error", erased: 0, error };
  }
}

/**
 * Host delete of the event. Erases that event's guest rows (and the outbox copies) and writes the
 * count, then deletes the event. Does not read N. Refuses the whole delete when guest rows exist
 * and the host account cannot be the audit actor.
 */
export async function eraseGuestDataOnHostDelete(input: {
  experienceId: string;
  actorId: string;
}): Promise<{ erased: number }> {
  return db.transaction(async (tx) => {
    const picked = await tx.execute(sql`
      SELECT id FROM event_invites
      WHERE experience_id = ${input.experienceId}
      FOR UPDATE
    `);
    const ids = (picked.rows as { id: string }[]).map((row) => row.id);
    const actor = ids.length > 0 ? await actorFor(tx, input.actorId) : null;
    if (ids.length > 0 && !actor) throw new Error(GUEST_ERASE_AUDIT_MISSING);
    const erased = await eraseInviteIds(tx, ids);
    if (erased > 0 && actor) {
      await writeEraseAudit(tx, {
        actorId: actor.id,
        actorRole: actor.role,
        resourceType: "user_experience",
        resourceId: input.experienceId,
        count: erased,
        cause: "host_delete",
      });
    }
    await tx.execute(sql`DELETE FROM user_experiences WHERE id = ${input.experienceId}`);
    return { erased };
  });
}

/**
 * The guest asked, by the invite token. Erases that one invite. The audit actor is the event's
 * organizer, because a guest has no account; `cause` says the guest asked. Does not read N.
 */
export async function eraseGuestInviteOnRequest(token: string): Promise<{ erased: boolean }> {
  return db.transaction(async (tx) => {
    const picked = await tx.execute(sql`
      SELECT id, organizer_id
      FROM event_invites
      WHERE unique_token = ${token}
      FOR UPDATE
    `);
    const row = picked.rows[0] as { id: string; organizer_id: string } | undefined;
    if (!row) return { erased: false };
    const actor = await actorFor(tx, row.organizer_id);
    if (!actor) throw new Error(GUEST_ERASE_AUDIT_MISSING);
    const erased = await eraseInviteIds(tx, [row.id]);
    if (erased > 0) {
      await writeEraseAudit(tx, {
        actorId: actor.id,
        actorRole: "system",
        resourceType: "event_invite",
        resourceId: row.id,
        count: erased,
        cause: "guest_request",
      });
    }
    return { erased: erased > 0 };
  });
}
