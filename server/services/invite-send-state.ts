/**
 * Organizer read of invite send state (row 207). One query, then the pure
 * derivation in `shared/invite-send-state.ts`. Nothing here writes a status.
 */
import { sql } from "drizzle-orm";
import { deriveInviteSendState, type InviteSendState } from "@shared/invite-send-state";
import { db } from "../db";

function asStatuses(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((status) => String(status));
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed.map((status) => String(status)) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function asId(value: unknown): number | null {
  if (value == null) return null;
  const id = typeof value === "number" ? value : Number(value);
  return Number.isFinite(id) ? id : null;
}

/**
 * One derived state per invite on the event. An invite with no log row is
 * `not_sent`. The latest log row is the one consulted.
 */
export async function loadInviteSendStates(experienceId: string): Promise<Map<string, InviteSendState>> {
  const result = await db.execute(sql`
    SELECT i.id AS invite_id,
           l.status AS log_status,
           l.outbox_id AS outbox_id,
           o.status AS pointed_status,
           COALESCE((
             SELECT jsonb_agg(e.status ORDER BY e.id)
             FROM email_outbox e
             WHERE e.email_type = 'guest_invite'
               AND e.metadata->>'inviteId' = i.id
           ), '[]'::jsonb) AS unpointed_statuses
    FROM event_invites i
    LEFT JOIN LATERAL (
      SELECT status, outbox_id
      FROM invite_send_log
      WHERE invite_id = i.id
      ORDER BY sent_at DESC NULLS LAST, id DESC
      LIMIT 1
    ) l ON TRUE
    LEFT JOIN email_outbox o ON o.id = l.outbox_id
    WHERE i.experience_id = ${experienceId}
  `);

  const states = new Map<string, InviteSendState>();
  for (const raw of result.rows ?? []) {
    const row = raw as {
      invite_id?: string;
      log_status?: string | null;
      outbox_id?: number | string | null;
      pointed_status?: string | null;
      unpointed_statuses?: unknown;
    };
    if (!row.invite_id) continue;
    const outboxId = asId(row.outbox_id);
    const hasLog = row.log_status != null || outboxId != null;
    states.set(
      row.invite_id,
      deriveInviteSendState({
        hasLog,
        logStatus: row.log_status ?? null,
        outboxId,
        pointedStatus: row.pointed_status ?? null,
        unpointedStatuses: asStatuses(row.unpointed_statuses),
      }),
    );
  }
  return states;
}
