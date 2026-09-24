/**
 * Phone push — the ONE sender (Locked Decision 53, ledger `2026-09-24-web-push`).
 *
 * Every notification row can reach the person's phones, through this module only (§18 rule 1):
 *
 *   CONFIGURED OR SILENT. Web Push needs a VAPID key pair (`VAPID_PUBLIC_KEY`,
 *     `VAPID_PRIVATE_KEY`, optional `VAPID_SUBJECT`). Without them nothing is claimed and nothing
 *     is sent, and the subscribe rail says push is not available — never a "sent" that went nowhere
 *     (§13).
 *   AT MOST ONCE. A notice is CLAIMED for push by an atomic conditional
 *     (`UPDATE notifications SET push_claimed_at = NOW() WHERE … AND push_claimed_at IS NULL`)
 *     BEFORE the external call (§15), so the immediate dispatch after a write and the periodic
 *     sweep can race freely and a phone still buzzes once. Only rows from the last
 *     `PUSH_WINDOW_MINUTES` whose owner has a device are ever claimed: a deploy never sends a
 *     backlog, and people without phones cost nothing.
 *   CONSENT. The notice's type must map to a preference key (`pushPreferenceKeyFor`) and that
 *     key's `push` switch must be on. An unmapped type is never pushed.
 *   HYGIENE. A subscription the push service reports gone (404/410) is deleted; a delivery
 *     records `last_success_at`; other failures count up and are logged.
 *
 * Never throws into a caller: push is an ancillary effect (§15b).
 */
import { sql } from "drizzle-orm";
import webpush from "web-push";
import { db } from "../db";
import { logger } from "../infrastructure/logger";
import { isNotificationChannelEnabled } from "./notification-preferences.service";
import { buildPushPayload, pushPreferenceKeyFor, type PushPayload } from "@shared/push-notifications";

export const PUSH_WINDOW_MINUTES = 15;
const SWEEP_BATCH = 100;

export interface PushSubscriptionTarget {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

type SendFn = (sub: PushSubscriptionTarget, payload: PushPayload) => Promise<{ statusCode?: number }>;

/** Test seam: replace the transport (no network in tests). */
export const _webPushTestHooks: { send?: SendFn; configured?: boolean } = {};

function vapid(): { publicKey: string; privateKey: string; subject: string } | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return null;
  const from = process.env.EMAIL_FROM?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim() || (from ? `mailto:${from.replace(/^.*<|>.*$/g, "")}` : "mailto:support@traveloure.com");
  return { publicKey, privateKey, subject };
}

export function isPushConfigured(): boolean {
  if (_webPushTestHooks.configured !== undefined) return _webPushTestHooks.configured;
  return vapid() !== null;
}

export function pushPublicKey(): string | null {
  return vapid()?.publicKey ?? null;
}

const defaultSend: SendFn = async (sub, payload) => {
  const keys = vapid();
  if (!keys) throw new Error("push not configured");
  webpush.setVapidDetails(keys.subject, keys.publicKey, keys.privateKey);
  return webpush.sendNotification(
    { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
    JSON.stringify(payload),
    { TTL: 60 * 60 * 24 },
  );
};

async function subscriptionsFor(userId: string): Promise<PushSubscriptionTarget[]> {
  const r = await db.execute(sql`
    SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ${userId}
  `);
  return (r.rows ?? []) as unknown as PushSubscriptionTarget[];
}

/** Send one payload to every device of one person. Returns how many devices accepted it. */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<number> {
  const send = _webPushTestHooks.send ?? defaultSend;
  let delivered = 0;
  for (const sub of await subscriptionsFor(userId)) {
    try {
      await send(sub, payload);
      delivered++;
      await db.execute(sql`UPDATE push_subscriptions SET last_success_at = NOW(), failure_count = 0 WHERE id = ${sub.id}`);
    } catch (err: any) {
      const status = Number(err?.statusCode ?? 0);
      if (status === 404 || status === 410) {
        await db.execute(sql`DELETE FROM push_subscriptions WHERE id = ${sub.id}`);
      } else {
        await db.execute(sql`UPDATE push_subscriptions SET failure_count = failure_count + 1 WHERE id = ${sub.id}`);
        logger.warn({ err: err?.message ?? err, status, subscriptionId: sub.id }, "[web-push] delivery failed");
      }
    }
  }
  return delivered;
}

interface ClaimedNotice {
  id: string;
  user_id: string;
  type: string | null;
  title: string | null;
  message: string | null;
  data: Record<string, unknown> | null;
}

async function deliverClaimed(rows: ClaimedNotice[]): Promise<number> {
  let sent = 0;
  for (const n of rows) {
    const key = pushPreferenceKeyFor(n.type);
    if (!key) continue;
    if (!(await isNotificationChannelEnabled(n.user_id, key, "push"))) continue;
    sent += await sendPushToUser(n.user_id, buildPushPayload(n));
  }
  return sent;
}

/** Push ONE notification now (called right after a write). Idempotent via the claim. */
export async function dispatchPushForNotification(notificationId: string): Promise<void> {
  try {
    if (!notificationId || !isPushConfigured()) return;
    const r = await db.execute(sql`
      UPDATE notifications SET push_claimed_at = NOW()
      WHERE id = ${notificationId}
        AND push_claimed_at IS NULL
        AND created_at > NOW() - (${PUSH_WINDOW_MINUTES} * INTERVAL '1 minute')
        AND EXISTS (SELECT 1 FROM push_subscriptions ps WHERE ps.user_id = notifications.user_id)
      RETURNING id, user_id, type, title, message, data
    `);
    await deliverClaimed((r.rows ?? []) as unknown as ClaimedNotice[]);
  } catch (err) {
    logger.warn({ err, notificationId }, "[web-push] dispatch failed (non-fatal)");
  }
}

/** The sweep: every recent, unclaimed notice of a person with a device — covers every writer. */
export async function sweepUnpushedNotifications(): Promise<{ claimed: number; sent: number }> {
  try {
    if (!isPushConfigured()) return { claimed: 0, sent: 0 };
    const r = await db.execute(sql`
      UPDATE notifications SET push_claimed_at = NOW()
      WHERE id IN (
        SELECT n.id FROM notifications n
        WHERE n.push_claimed_at IS NULL
          AND n.created_at > NOW() - (${PUSH_WINDOW_MINUTES} * INTERVAL '1 minute')
          AND EXISTS (SELECT 1 FROM push_subscriptions ps WHERE ps.user_id = n.user_id)
        ORDER BY n.created_at
        LIMIT ${SWEEP_BATCH}
        FOR UPDATE SKIP LOCKED
      )
      AND push_claimed_at IS NULL
      RETURNING id, user_id, type, title, message, data
    `);
    const rows = (r.rows ?? []) as unknown as ClaimedNotice[];
    return { claimed: rows.length, sent: await deliverClaimed(rows) };
  } catch (err) {
    logger.warn({ err }, "[web-push] sweep failed (non-fatal)");
    return { claimed: 0, sent: 0 };
  }
}
