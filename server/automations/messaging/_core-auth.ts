import crypto from "node:crypto";
import type { Request } from "express";
import { sql } from "drizzle-orm";
import { db } from "../../db";
import { lockJourney, queueWelcome, scheduleMessage, scheduleSignupInTransaction, type JourneyTx } from "./_core-store";
import { LOCKOUT_FAILURES, LOCKOUT_MINUTES, DELETION_GRACE_DAYS } from "./_core-policy";

export async function recordPasswordAttempt(userId: string, valid: boolean) {
  return db.transaction(async (tx) => {
    const { user, state } = await lockJourney(tx, userId);
    if (user.is_deleted || user.is_suspended) return { allowed: false, locked: false };
    const now = new Date();
    if (state.locked_until && new Date(state.locked_until) > now) return { allowed: false, locked: true };
    const failures = valid ? 0 : (state.locked_until ? 0 : state.failed_attempts) + 1;
    const until = failures >= LOCKOUT_FAILURES
      ? new Date(now.getTime() + LOCKOUT_MINUTES * 60000) : null;
    await tx.execute(sql`UPDATE signup_journey_state SET failed_attempts=${failures},
      locked_until=${until} WHERE user_id=${userId}`);
    if (until) await scheduleMessage(tx, userId, "account_locked", until.toISOString(), now);
    return { allowed: valid && !until, locked: !!until };
  });
}

export async function acceptSocialEmailAssertion(userId: string, emailVerified: unknown) {
  await db.transaction(async (tx) => {
    const { user } = await lockJourney(tx, userId);
    if (user.is_deleted || user.is_suspended) throw new Error("ACCOUNT_UNAVAILABLE");
    // Only an actual signed issuer assertion qualifies. Email presence or an
    // OAuth provider name alone is NOT proof of email verification.
    if (emailVerified === true) {
      await tx.execute(sql`UPDATE users SET email_verified=COALESCE(email_verified,NOW()) WHERE id=${userId}`);
      await queueWelcome(tx, userId);
    } else if (user.email_verified) await queueWelcome(tx, userId);
    else await scheduleSignupInTransaction(tx, userId);
  });
}

export async function recordSuccessfulLogin(userId: string, req: Pick<Request, "ip" | "headers">) {
  await db.transaction(async (tx) => {
    const { user, state } = await lockJourney(tx, userId);
    if (user.is_deleted || user.is_suspended) throw new Error("Account unavailable");
    if (state.account_state === "pending_deletion") {
      // Successful reauthentication alone cancels deletion. Browsing with an
      // existing session does not silently cancel a deliberate deletion request.
      await tx.execute(sql`UPDATE signup_journey_state SET account_state='active',
        deletion_due_at=NULL,deletion_requested_at=NULL WHERE user_id=${userId}`);
      await tx.execute(sql`UPDATE signup_journey_jobs SET status='cancelled',
        skip_reason='deletion_cancelled_by_login',updated_at=NOW(),lease_until=NULL
        WHERE user_id=${userId} AND message_type IN ('deletion_complete','deletion_confirm')
          AND status IN ('pending','processing','failed')`);
    }
    const agent = String(req.headers["user-agent"] ?? "Unknown device").slice(0, 160);
    const ip = req.ip || "Unknown IP";
    const secret = process.env.SESSION_SECRET;
    if (!secret) throw new Error("SESSION_SECRET required for private device fingerprints");
    const fingerprint = crypto.createHmac("sha256", secret).update(`${agent}\n${ip}`).digest("hex");
    const inserted = await tx.execute(sql`INSERT INTO signup_journey_devices(user_id,fingerprint,first_seen_at)
      VALUES(${userId},${fingerprint},NOW()) ON CONFLICT DO NOTHING RETURNING fingerprint`);
    if (inserted.rows.length) {
      await scheduleMessage(tx, userId, "new_device_login", fingerprint, new Date(), {
        device: agent, place: `IP address ${ip}`, time: new Date().toISOString(),
      });
    }
  });
}

export async function verifyJourneyToken(tokenHash: string) {
  return db.transaction(async (tx) => {
    // Resolve identity without claiming first; then consistently lock user before token.
    const candidate = (await tx.execute(sql`SELECT user_id FROM email_verification_tokens
      WHERE token_hash=${tokenHash}`)).rows[0] as any;
    if (!candidate) return false;
    const { user } = await lockJourney(tx, candidate.user_id);
    if (user.is_deleted || user.is_suspended) return false;
    const claimed = await tx.execute(sql`UPDATE email_verification_tokens SET used_at=NOW()
      WHERE token_hash=${tokenHash} AND used_at IS NULL AND expires_at>NOW() RETURNING user_id`);
    if (!claimed.rows.length) return false;
    await tx.execute(sql`UPDATE users SET email_verified=COALESCE(email_verified,NOW())
      WHERE id=${candidate.user_id}`);
    await queueWelcome(tx, candidate.user_id);
    return candidate.user_id as string;
  });
}

export async function afterPasswordReset(tx: JourneyTx, userId: string, tokenHash: string) {
  await lockJourney(tx, userId);
  await tx.execute(sql`UPDATE signup_journey_state SET failed_attempts=0,locked_until=NULL
    WHERE user_id=${userId}`);
  await scheduleMessage(tx, userId, "password_changed", tokenHash, new Date());
}

export async function requestAccountDeletion(userId: string) {
  return db.transaction(async (tx) => {
    const { user, state } = await lockJourney(tx, userId);
    if (user.is_deleted) return { alreadyDeleted: true, status: "deleted" };
    if (state.account_state === "pending_deletion") {
      return { status: "pending_deletion", deletionDueAt: state.deletion_due_at };
    }
    const now = new Date();
    const due = new Date(now.getTime() + DELETION_GRACE_DAYS * 86400000);
    await tx.execute(sql`UPDATE signup_journey_state SET account_state='pending_deletion',
      deletion_requested_at=${now},deletion_due_at=${due} WHERE user_id=${userId}`);
    await scheduleMessage(tx, userId, "deletion_confirm", now.toISOString(), now);
    await scheduleMessage(tx, userId, "deletion_complete", now.toISOString(), due);
    return { status: "pending_deletion", deletionDueAt: due };
  });
}

export async function finalizeAccountDeletion(tx: JourneyTx, userId: string) {
  // Called only after the original-address completion email is durably queued,
  // inside the SAME transaction. Financial/booking/message/review rows are retained.
  await tx.execute(sql`UPDATE users SET is_deleted=true,deleted_at=NOW(),
    email=${`deleted_${userId}@deleted.traveloure.com`},password=NULL,instagram_access_token=NULL,
    first_name=NULL,last_name=NULL,bio=NULL,profile_image_url=NULL,notification_email=NULL,
    preferences='{}'::jsonb WHERE id=${userId}`);
  await tx.execute(sql`UPDATE expert_requests SET status='cancelled' WHERE user_id=${userId}`);
  await tx.execute(sql`UPDATE local_expert_forms SET status='deactivated' WHERE user_id=${userId}`);
  await tx.execute(sql`UPDATE service_provider_forms SET status='deactivated' WHERE user_id=${userId}`);
  await tx.execute(sql`DELETE FROM sessions WHERE
    sess->'passport'->'user'->'claims'->>'sub'=${userId} OR sess->'passport'->'user'->>'id'=${userId}`);
  await tx.execute(sql`UPDATE signup_journey_state SET account_state='deleted' WHERE user_id=${userId}`);
  await tx.execute(sql`DELETE FROM signup_journey_devices WHERE user_id=${userId}`);
  await tx.execute(sql`UPDATE signup_journey_jobs SET status='cancelled',skip_reason='account_deleted',
    payload='{}'::jsonb,updated_at=NOW(),lease_until=NULL WHERE user_id=${userId}
    AND message_type<>'deletion_complete' AND status IN ('pending','processing','failed')`);
}