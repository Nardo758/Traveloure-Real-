import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../../db";
import { dispatchAutomationEvent } from "../event-dispatcher";
import { messagingAutomationRegistry } from "./index";
import { coreByKind } from "./_core-index";
import { renderCoreEmail } from "./_core-renderer";
import { MARKETING_KINDS, marketingPreferences, isDaytime, safeName, journeyBaseUrl } from "./_core-policy";
import { lockJourney, scheduleMessage, cancelVerificationReminders, type JourneyJob } from "./_core-store";
import { finalizeAccountDeletion } from "./_core-auth";
import { unsubscribePath } from "./_core-unsubscribe";
import { getAppBaseUrl } from "../../services/email.service";
import { logger } from "../../infrastructure/logger";

async function processJob(id: string, userId: string): Promise<number | undefined> {
  return db.transaction(async (tx) => {
    const { user, state } = await lockJourney(tx, userId);
    const job = (await tx.execute(sql`SELECT * FROM signup_journey_jobs WHERE id=${id} FOR UPDATE`)).rows[0] as unknown as JourneyJob;
    if (!job || job.status !== "processing") return;
    const message = coreByKind.get(job.message_type);
    if (!message) throw new Error("Unknown core message");
    const now = new Date();
    const reminder = job.message_type.startsWith("verify_reminder_");
    const verification = reminder || job.message_type === "verify_email";
    const marketing = MARKETING_KINDS.has(job.message_type);
    const prefs = marketingPreferences(user.preferences);
    let reason: string | undefined;
    if (!message.node.enabled) reason = "google_integration_not_available";
    else if (!user.email || user.is_deleted) reason = "account_deleted";
    else if (user.is_suspended && job.message_type !== "deletion_complete") reason = "account_suspended";
    else if (verification && user.email_verified) reason = "already_verified";
    else if (job.message_type === "welcome" && !user.email_verified) reason = "not_verified";
    else if (job.message_type === "deletion_complete" &&
      (state.account_state !== "pending_deletion" || !state.deletion_due_at)) reason = "deletion_cancelled";
    else if (marketing && (!user.email_verified || !prefs.consent || user.preferences?.journeyMarketingOptOut ||
      state.account_state !== "active")) reason = "marketing_ineligible";
    else if (job.message_type === "profile_nudge" && user.first_name && user.last_name && user.bio && user.profile_image_url) {
      reason = "profile_complete";
    } else if (job.message_type === "planner_nudge") {
      const found = await tx.execute(sql`SELECT 1 FROM trips WHERE user_id=${userId} LIMIT 1`);
      if (found.rows.length) reason = "itinerary_exists";
    }
    if (reason) {
      await tx.execute(sql`UPDATE signup_journey_jobs SET status='skipped',skip_reason=${reason},
        updated_at=NOW(),lease_until=NULL WHERE id=${id}`);
      return;
    }
    if ((marketing && !isDaytime(now, prefs.timezone)) ||
      (job.message_type === "deletion_complete" && new Date(state.deletion_due_at) > now)) {
      await tx.execute(sql`UPDATE signup_journey_jobs SET status='pending',send_at=${marketing ?
        new Date(now.getTime() + 30 * 60000) : new Date(state.deletion_due_at)},lease_until=NULL WHERE id=${id}`);
      return;
    }
    let link = message.copy({ name: safeName(user.first_name) }).path;
    const base = journeyBaseUrl(getAppBaseUrl);
    if (verification || job.message_type === "reset_request") {
      if (verification) {
        const rate = (await tx.execute(sql`SELECT COUNT(*)::int AS count,MIN(created_at) AS oldest
          FROM email_verification_tokens WHERE user_id=${userId} AND created_at>NOW()-INTERVAL '1 hour'`)).rows[0] as any;
        if (rate.count >= 3) {
          await tx.execute(sql`UPDATE signup_journey_jobs SET status='pending',lease_until=NULL,
            send_at=${new Date(new Date(rate.oldest).getTime() + 3601000)} WHERE id=${id}`);
          return;
        }
      }
      const raw = crypto.randomBytes(32).toString("hex");
      const hash = crypto.createHash("sha256").update(raw).digest("hex");
      const expires = new Date(now.getTime() + (verification ? 24 * 3600000 : 3600000));
      // Superseded unsent links must not sit around until a later retry.
      await tx.execute(sql`UPDATE email_outbox SET status='cancelled',last_error='token_superseded',updated_at=NOW()
        WHERE metadata->>'journeyUserId'=${userId} AND status IN ('pending','failed')
        AND ${verification ? sql`(metadata->>'journeyKind'='verify_email' OR metadata->>'journeyKind' LIKE 'verify_reminder_%')`
          : sql`metadata->>'journeyKind'='reset_request'`}`);
      if (verification) {
        await tx.execute(sql`UPDATE email_verification_tokens SET used_at=NOW() WHERE user_id=${userId} AND used_at IS NULL`);
        await tx.execute(sql`INSERT INTO email_verification_tokens(user_id,token_hash,expires_at) VALUES(${userId},${hash},${expires})`);
      } else {
        if (!user.password) {
          await tx.execute(sql`UPDATE signup_journey_jobs SET status='skipped',skip_reason='oauth_only',lease_until=NULL WHERE id=${id}`);
          return;
        }
        await tx.execute(sql`UPDATE password_reset_tokens SET used_at=NOW() WHERE user_id=${userId} AND used_at IS NULL`);
        await tx.execute(sql`INSERT INTO password_reset_tokens(user_id,token_hash,expires_at) VALUES(${userId},${hash},${expires})`);
      }
      link = `${base}${link}?token=${encodeURIComponent(raw)}`;
    } else if (link) link = `${base}${link}`;
    const rendered = renderCoreEmail(message, { name: safeName(user.first_name), language: prefs.language,
      ...job.payload }, link, marketing ? `${base}${unsubscribePath(userId)}` : undefined);
    let outboxId: number | undefined;
    const dispatched = await dispatchAutomationEvent(messagingAutomationRegistry, message.node.id,
      { coreEligible: true, userId, event: `signup_journey.${job.message_type}` }, async () => {
      const metadata = { signupJourney: true, journeyUserId: userId, journeyKind: job.message_type,
        journeyHeaders: rendered.headers, journeyIdempotencyKey: `journey/${id}` };
      const inserted = await tx.execute(sql`INSERT INTO email_outbox
        (email_type,to_email,subject,html,text_body,status,attempt_count,max_attempts,metadata,created_at,updated_at)
        VALUES(${job.message_type},${user.email},${rendered.subject},${rendered.html},${rendered.text},
          'pending',0,4,${JSON.stringify(metadata)}::jsonb,NOW(),NOW())
          ON CONFLICT DO NOTHING RETURNING id`);
      const existing = inserted.rows[0] ?? (await tx.execute(sql`SELECT id FROM email_outbox
        WHERE metadata->>'journeyIdempotencyKey'=${`journey/${id}`} LIMIT 1`)).rows[0];
      outboxId = Number(existing?.id);
      if (!outboxId) throw new Error("Outbox insert returned no id");
      await tx.execute(sql`UPDATE signup_journey_jobs SET status='queued',outbox_id=${outboxId},
        updated_at=NOW(),lease_until=NULL,payload='{}'::jsonb WHERE id=${id}`);
      if (job.message_type === "deletion_complete") await finalizeAccountDeletion(tx, userId);
      return { queued: true };
    }, { cancellation: { cancel: async () => cancelVerificationReminders(tx, userId) } });
    if (!dispatched.executed) throw new Error(`Journey registry dispatch skipped: ${dispatched.reason}`);
    return outboxId;
  });
}

async function syncWelcomeReceipts(userId?: string) {
  const completed = await db.execute(sql`SELECT j.user_id,o.sent_at FROM signup_journey_jobs j
    JOIN email_outbox o ON o.id=j.outbox_id JOIN signup_journey_state s ON s.user_id=j.user_id
    WHERE j.message_type='welcome' AND o.status='sent' AND s.welcome_at IS NULL
      ${userId ? sql`AND j.user_id=${userId}` : sql``} LIMIT 50`);
  for (const row of completed.rows as any[]) await db.transaction(async (tx) => {
    const { user, state } = await lockJourney(tx, row.user_id);
    if (state.welcome_at || user.is_deleted) return;
    const sent = new Date(row.sent_at);
    await tx.execute(sql`UPDATE signup_journey_state SET welcome_at=${sent} WHERE user_id=${row.user_id}`);
    await scheduleMessage(tx, row.user_id, "profile_nudge", "account", new Date(sent.getTime() + 2 * 86400000));
    await scheduleMessage(tx, row.user_id, "planner_nudge", "account", new Date(sent.getTime() + 3 * 86400000));
  });
}

export async function runCoreJourney(options: { userId?: string } = {}) {
  // This worker also drives ONLY journey retries; it never drains bookings or
  // changes the generic outbox schedule.
  const retries = await db.execute(sql`SELECT id FROM email_outbox WHERE metadata->>'signupJourney'='true'
    AND ((status IN ('pending','failed') AND (retry_after IS NULL OR retry_after<=NOW()))
      OR (status='processing' AND retry_after<=NOW()))
    ${options.userId ? sql`AND metadata->>'journeyUserId'=${options.userId}` : sql``}
    ORDER BY id LIMIT 50`);
  if (retries.rows.length) {
    const { deliverJourneyOutboxRow } = await import("../../services/email-outbox.service");
    for (const row of retries.rows) await deliverJourneyOutboxRow(Number(row.id));
  }
  await syncWelcomeReceipts(options.userId);
  const claimed = await db.execute(sql`WITH due AS (
    SELECT id FROM signup_journey_jobs WHERE
      ((status IN ('pending','failed') AND send_at<=NOW()) OR (status='processing' AND lease_until<NOW()))
      ${options.userId ? sql`AND user_id=${options.userId}` : sql``}
    ORDER BY send_at,id LIMIT 50 FOR UPDATE SKIP LOCKED
  ) UPDATE signup_journey_jobs j SET status='processing',lease_until=NOW()+INTERVAL '5 minutes',
    updated_at=NOW() FROM due WHERE j.id=due.id RETURNING j.id,j.user_id,j.attempt_count`);
  let queued = 0, failed = 0;
  for (const row of claimed.rows as any[]) {
    try {
      const id = await processJob(row.id, row.user_id);
      if (id) {
        queued++;
        const { deliverJourneyOutboxRow } = await import("../../services/email-outbox.service");
        await deliverJourneyOutboxRow(id);
      }
    } catch (error) {
      failed++;
      logger.error({ err: error, jobId: row.id }, "[signup-journey] job failed");
      const attempts = Number(row.attempt_count) + 1;
      const retry = [1, 5, 30][attempts - 1];
      await db.execute(sql`UPDATE signup_journey_jobs SET status=${retry ? "failed" : "dead"},
        attempt_count=${attempts},skip_reason='processing_failed',lease_until=NULL,
        send_at=${new Date(Date.now() + (retry || 30) * 60000)},updated_at=NOW()
        WHERE id=${row.id} AND status='processing'`);
      if (!retry) {
        const { alertJourneyFailure } = await import("./_core-alert");
        await alertJourneyFailure(`job:${row.id}`);
      }
    }
  }
  await syncWelcomeReceipts(options.userId);
  await db.execute(sql`UPDATE signup_journey_jobs j SET status=CASE
      WHEN o.status='sent' THEN 'sent' WHEN o.status='dead' THEN 'dead' ELSE 'skipped' END,
      skip_reason=CASE WHEN o.status='cancelled' THEN o.last_error ELSE j.skip_reason END,updated_at=NOW()
    FROM email_outbox o WHERE j.outbox_id=o.id AND j.status='queued'
      AND o.status IN ('sent','dead','cancelled')
      ${options.userId ? sql`AND j.user_id=${options.userId}` : sql``}`);
  return { scanned: claimed.rows.length, queued, failed,
    ...(failed ? { error: `${failed} signup journey jobs failed` } : {}) };
}