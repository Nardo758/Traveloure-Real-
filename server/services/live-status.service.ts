/**
 * Live status for earners — "Available now" and "Usually replies within …" (Locked Decision 54,
 * ledger `2026-09-24-live-chat-qa-sessions`).
 *
 * ONE loader for every public surface that shows either fact (the expert list, the expert detail,
 * the storefront), so they cannot disagree (§18 rule 1). The rules themselves are the pure
 * `shared/live-availability.ts`; this only reads the rows.
 *
 * The reply time is MEASURED from `user_and_expert_chats`: for each person who opened a
 * conversation with the earner on a given day in the last 90 days, the minutes until the earner's
 * next message to them. An opening never answered within 7 days counts as "never" (Infinity), so a
 * mostly-silent earner has no median worth showing. Openings younger than 7 days that are still
 * unanswered are left out — they may yet be answered. The median is `percentile_disc`, so no
 * interpolation ever manufactures a time nobody replied in.
 */
import { sql } from "drizzle-orm";
import { db } from "../db";
import { logger } from "../infrastructure/logger";
import { isAvailableNow, replyTimeBucket, type ReplyTimeBucket } from "@shared/live-availability";

export interface LiveStatus {
  availableNow: boolean;
  replyTime: ReplyTimeBucket | null;
}

const NONE: LiveStatus = { availableNow: false, replyTime: null };

export async function loadLiveStatus(userIds: readonly string[]): Promise<Map<string, LiveStatus>> {
  const out = new Map<string, LiveStatus>();
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  if (ids.length === 0) return out;
  for (const id of ids) out.set(id, { ...NONE });
  try {
    const idList = sql.join(ids.map((id) => sql`${id}`), sql`, `);
    const avail = await db.execute(sql`
      SELECT id, available_now_until, vacation_until FROM users WHERE id IN (${idList})
    `);
    const now = new Date();
    for (const r of (avail.rows ?? []) as any[]) {
      out.get(r.id)!.availableNow = isAvailableNow(
        { availableNowUntil: r.available_now_until, vacationUntil: r.vacation_until },
        now,
      );
    }
    const replies = await db.execute(sql`
      WITH openings AS (
        SELECT DISTINCT ON (c.receiver_id, c.sender_id, date_trunc('day', c.created_at))
               c.receiver_id AS earner, c.sender_id AS asker, c.created_at AS opened_at
        FROM user_and_expert_chats c
        WHERE c.receiver_id IN (${idList})
          AND c.sender_id <> c.receiver_id
          AND c.created_at > NOW() - INTERVAL '90 days'
        ORDER BY c.receiver_id, c.sender_id, date_trunc('day', c.created_at), c.created_at
      ),
      answered AS (
        SELECT o.earner, o.opened_at,
               (SELECT min(r.created_at) FROM user_and_expert_chats r
                 WHERE r.sender_id = o.earner AND r.receiver_id = o.asker AND r.created_at > o.opened_at) AS replied_at
        FROM openings o
      )
      SELECT earner,
             count(*)::int AS samples,
             percentile_disc(0.5) WITHIN GROUP (ORDER BY
               CASE WHEN replied_at IS NULL OR replied_at > opened_at + INTERVAL '7 days'
                    THEN 'Infinity'::float8
                    ELSE extract(epoch FROM replied_at - opened_at) / 60.0 END) AS median_minutes
      FROM answered
      WHERE replied_at IS NOT NULL OR opened_at < NOW() - INTERVAL '7 days'
      GROUP BY earner
    `);
    for (const r of (replies.rows ?? []) as any[]) {
      const median = r.median_minutes == null ? null : Number(r.median_minutes);
      out.get(r.earner)!.replyTime = replyTimeBucket(median, Number(r.samples));
    }
  } catch (err) {
    logger.warn({ err }, "[live-status] read failed; showing nothing rather than guessing");
  }
  return out;
}
