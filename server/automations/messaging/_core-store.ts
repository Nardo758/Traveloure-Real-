import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../../db";
import type { CoreKind } from "./_core-definition";

export type JourneyTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export interface JourneyJob {
  id: string; user_id: string; message_type: CoreKind; related_id: string;
  status: string; send_at: Date; payload: Record<string, any>; attempt_count: number;
}
export async function lockJourney(tx: JourneyTx, userId: string) {
  // All journey mutations use user -> state -> job ordering.
  const user = (await tx.execute(sql`SELECT * FROM users WHERE id=${userId} FOR UPDATE`)).rows[0] as any;
  if (!user) throw new Error("Journey account missing");
  await tx.execute(sql`INSERT INTO signup_journey_state(user_id,account_state,failed_attempts)
    VALUES(${userId},'active',0) ON CONFLICT(user_id) DO NOTHING`);
  const state = (await tx.execute(sql`SELECT * FROM signup_journey_state WHERE user_id=${userId} FOR UPDATE`)).rows[0] as any;
  return { user, state };
}
export async function scheduleMessage(tx: JourneyTx, userId: string, kind: CoreKind,
  relatedId: string, sendAt: Date, payload: Record<string, unknown> = {}) {
  const result = await tx.execute(sql`INSERT INTO signup_journey_jobs
    (id,user_id,message_type,related_id,idempotency_key,send_at,status,payload,attempt_count,created_at,updated_at)
    VALUES(${crypto.randomUUID()},${userId},${kind},${relatedId},
      ${`signup-journey:${kind}:${userId}:${relatedId}`},${sendAt},'pending',${JSON.stringify(payload)}::jsonb,0,NOW(),NOW())
    ON CONFLICT(idempotency_key) DO NOTHING RETURNING id`);
  return result.rows[0]?.id as string | undefined;
}
export async function cancelVerificationReminders(tx: JourneyTx, userId: string) {
  await tx.execute(sql`UPDATE signup_journey_jobs SET status='cancelled',
    skip_reason='email_verified',updated_at=NOW(),lease_until=NULL
    WHERE user_id=${userId} AND message_type IN ('verify_reminder_1h','verify_reminder_1d','verify_reminder_3d')
      AND status IN ('pending','processing','failed')`);
}
export async function queueWelcome(tx: JourneyTx, userId: string, now = new Date()) {
  const { user } = await lockJourney(tx, userId);
  if (!user.email_verified || user.is_deleted || user.is_suspended) return;
  await cancelVerificationReminders(tx, userId);
  await scheduleMessage(tx, userId, "welcome", "account", now);
}
export async function scheduleSignup(userId: string) {
  await db.transaction(async (tx) => {
    await scheduleSignupInTransaction(tx, userId);
  });
}
export async function scheduleSignupInTransaction(tx: JourneyTx, userId: string) {
  const { user } = await lockJourney(tx, userId);
  if (user.is_deleted || user.is_suspended || user.email_verified) return;
  const now = new Date();
  await scheduleMessage(tx, userId, "verify_email", "signup", now);
  for (const [kind, hours] of [
    ["verify_reminder_1h", 1], ["verify_reminder_1d", 24], ["verify_reminder_3d", 72],
  ] as const) await scheduleMessage(tx, userId, kind, "signup", new Date(now.getTime() + hours * 3600000));
}
export async function requestVerification(userId: string, requestId: string) {
  return db.transaction(async (tx) => {
    const { user } = await lockJourney(tx, userId);
    if (user.email_verified) return "verified";
    if (user.is_deleted || user.is_suspended) throw new Error("Account unavailable");
    const count = (await tx.execute(sql`SELECT
      (SELECT COUNT(*) FROM email_verification_tokens
        WHERE user_id=${userId} AND created_at > NOW()-INTERVAL '1 hour') +
      (SELECT COUNT(*) FROM signup_journey_jobs WHERE user_id=${userId} AND message_type='verify_email'
        AND status IN ('pending','processing','failed') AND created_at>NOW()-INTERVAL '1 hour')
      AS count`)).rows[0] as any;
    if (Number(count.count) >= 3) return "limited";
    // The worker rechecks the same limit before minting, under the same lock.
    await scheduleMessage(tx, userId, "verify_email", `resend:${requestId}`, new Date());
    return "queued";
  });
}
export async function requestReset(userId: string, requestId: string) {
  await db.transaction(async (tx) => {
    await lockJourney(tx, userId);
    await scheduleMessage(tx, userId, "reset_request", requestId, new Date());
  });
}
export async function duplicateSignup(userId: string) {
  await db.transaction(async (tx) => {
    const { user } = await lockJourney(tx, userId);
    if (user.is_deleted || !user.email) return;
    await scheduleMessage(tx, userId, "already_have_account",
      `hour:${Math.floor(Date.now() / 3600000)}`, new Date());
  });
}