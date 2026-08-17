/**
 * Email Outbox Service
 *
 * Provides a durable delivery layer for transactional emails. Instead of
 * fire-and-forget calls to Resend, callers enqueue an email row (status=pending)
 * and the outbox scheduler retries failed rows with exponential backoff.
 *
 * Retry schedule (attempt_count → seconds until next retry):
 *   1 →   5 min
 *   2 →  15 min
 *   3 →  45 min
 *   4 → 120 min  (2 h)
 *   5 → 360 min  (6 h)
 * After max_attempts (default 5) the row is marked 'dead' and surfaced on the
 * admin dashboard for manual inspection.
 *
 * Booking flow contract: enqueueEmail() and drainOutbox() never throw into
 * their callers — all errors are caught, logged, and recorded on the row.
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import { emailOutbox, type InsertEmailOutbox } from "../../shared/schema";
import { logger } from "../infrastructure/logger";
import {
  sendEmail,
  type SendEmailParams,
  buildBookingConfirmationEmailPayload,
  type BookingConfirmationParams,
} from "./email.service";

// ── Backoff schedule ──────────────────────────────────────────────────────────

const BACKOFF_MINUTES = [5, 15, 45, 120, 360] as const;

function nextRetryAfter(attemptCount: number): Date {
  const minutes = BACKOFF_MINUTES[Math.min(attemptCount, BACKOFF_MINUTES.length - 1)];
  return new Date(Date.now() + minutes * 60 * 1000);
}

// ── Public API ─────────────────────────────────────────────────────────────────

export interface EnqueueEmailParams extends SendEmailParams {
  /** Caller-supplied category for admin visibility (e.g. 'booking_confirmation'). */
  emailType?: string;
  /** Arbitrary key→value context stored on the row (e.g. { bookingId }). */
  metadata?: Record<string, unknown>;
}

/**
 * Write an email to the outbox with status='pending', then immediately attempt
 * delivery. Returns the outbox row id so callers can correlate logs.
 *
 * Never throws — all errors are caught and recorded on the outbox row.
 */
export async function enqueueEmail(params: EnqueueEmailParams): Promise<number | null> {
  const toEmailStr = Array.isArray(params.to) ? params.to.join(", ") : params.to;

  let outboxId: number | null = null;

  try {
    const [row] = await db
      .insert(emailOutbox)
      .values({
        emailType:   params.emailType ?? "generic",
        toEmail:     toEmailStr,
        subject:     params.subject,
        html:        params.html,
        textBody:    params.text,
        replyTo:     params.replyTo,
        status:      "pending",
        attemptCount: 0,
        metadata:    params.metadata ?? {},
      } satisfies InsertEmailOutbox)
      .returning({ id: emailOutbox.id });

    outboxId = row?.id ?? null;
  } catch (insertErr: unknown) {
    logger.error(
      { err: insertErr, subject: params.subject, to: toEmailStr },
      "[email-outbox] failed to insert outbox row — email will NOT be retried"
    );
    // Fall through: still attempt delivery so at least this attempt has a chance.
  }

  // Attempt immediate delivery.
  await attemptDelivery(outboxId, params);

  return outboxId;
}

/**
 * Retry loop: pick up all pending/failed rows whose retry_after has elapsed and
 * attempt delivery. Called by the outbox scheduler every 5 minutes.
 *
 * Never throws.
 */
export async function drainOutbox(): Promise<void> {
  let due: Array<{
    id: number;
    toEmail: string;
    subject: string;
    html: string;
    textBody: string | null;
    fromAddress: string | null;
    replyTo: string | null;
    attemptCount: number;
    maxAttempts: number;
  }>;

  try {
    const result = await db.execute(sql`
      SELECT id, to_email, subject, html, text_body, from_address, reply_to,
             attempt_count, max_attempts
      FROM   email_outbox
      WHERE  status IN ('pending', 'failed')
        AND  (retry_after IS NULL OR retry_after <= NOW())
      ORDER  BY created_at ASC
      LIMIT  50
    `);
    due = (result.rows ?? []) as typeof due;
  } catch (err: unknown) {
    logger.error({ err }, "[email-outbox] drainOutbox: failed to query due rows");
    return;
  }

  if (due.length === 0) return;
  logger.info({ count: due.length }, "[email-outbox] drainOutbox: processing due rows");

  for (const row of due) {
    const params: SendEmailParams = {
      to:      row.toEmail,
      subject: row.subject,
      html:    row.html,
      ...(row.textBody ? { text: row.textBody } : {}),
      ...(row.replyTo  ? { replyTo: row.replyTo } : {}),
    };
    await attemptDelivery(row.id, params, {
      attemptCount: row.attemptCount,
      maxAttempts:  row.maxAttempts,
    });
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Try to send `params` via sendEmail and update the outbox row accordingly.
 * When `outboxId` is null the send still happens but nothing is written to the DB.
 * Never throws.
 */
async function attemptDelivery(
  outboxId: number | null,
  params: SendEmailParams,
  current?: { attemptCount: number; maxAttempts: number }
): Promise<void> {
  const attemptCount = (current?.attemptCount ?? 0) + 1;
  const maxAttempts  = current?.maxAttempts ?? 5;
  const toStr        = Array.isArray(params.to) ? params.to.join(", ") : params.to;

  let result: Awaited<ReturnType<typeof sendEmail>>;
  try {
    result = await sendEmail(params);
  } catch (err: unknown) {
    // sendEmail is documented to never throw, but be defensive.
    const message = err instanceof Error ? err.message : String(err);
    result = { ok: false, error: message };
  }

  if (outboxId === null) return; // no row to update

  try {
    if (result.ok) {
      await db.execute(sql`
        UPDATE email_outbox
        SET    status        = 'sent',
               attempt_count = ${attemptCount},
               resend_id     = ${result.id ?? null},
               sent_at       = NOW(),
               last_error    = NULL,
               updated_at    = NOW()
        WHERE  id = ${outboxId}
      `);
      logger.info(
        { outboxId, resendId: result.id, to: toStr, subject: params.subject },
        "[email-outbox] sent"
      );
    } else {
      const isDead   = attemptCount >= maxAttempts;
      const newStatus = isDead ? "dead" : "failed";
      const retryAt  = isDead ? null : nextRetryAfter(attemptCount);

      await db.execute(sql`
        UPDATE email_outbox
        SET    status        = ${newStatus},
               attempt_count = ${attemptCount},
               last_error    = ${result.error ?? "unknown error"},
               retry_after   = ${retryAt},
               updated_at    = NOW()
        WHERE  id = ${outboxId}
      `);

      if (isDead) {
        logger.error(
          { outboxId, to: toStr, subject: params.subject, error: result.error, attemptCount },
          "[email-outbox] DEAD — max attempts exhausted; admin action required"
        );
      } else {
        logger.warn(
          { outboxId, to: toStr, subject: params.subject, error: result.error, attemptCount, retryAt },
          "[email-outbox] delivery failed; scheduled for retry"
        );
      }
    }
  } catch (updateErr: unknown) {
    logger.error(
      { err: updateErr, outboxId },
      "[email-outbox] failed to update outbox row after delivery attempt"
    );
  }
}

// ── Booking confirmation shortcut ─────────────────────────────────────────────

/**
 * Enqueue a booking confirmation email via the outbox so it is retried
 * automatically if Resend is unreachable. This is the preferred entry-point
 * for all booking-confirmation sends — callers never need to call
 * sendBookingConfirmationEmail directly.
 *
 * Never throws. The booking flow is unchanged: a Resend failure records the
 * row for retry but does not propagate to the caller.
 */
export async function enqueueBookingConfirmationEmail(
  params: BookingConfirmationParams
): Promise<void> {
  const payload = buildBookingConfirmationEmailPayload(params);
  await enqueueEmail({
    emailType: "booking_confirmation",
    to:        params.toEmail,
    subject:   payload.subject,
    html:      payload.html,
    text:      payload.text,
    metadata:  { bookingId: params.bookingId, confirmationCode: params.confirmationCode },
  });
}

// ── Scheduler wrapper (used by server/index.ts) ───────────────────────────────

let _drainInterval: ReturnType<typeof setInterval> | null = null;

export const emailOutboxScheduler = {
  start(intervalMs = 5 * 60 * 1000): void {
    if (_drainInterval) return; // already running
    // First pass after a short delay so startup noise settles.
    setTimeout(() => {
      void drainOutbox();
      _drainInterval = setInterval(() => {
        void drainOutbox();
      }, intervalMs);
    }, 30 * 1000);
    logger.info("[email-outbox] scheduler registered (interval=%dms)", intervalMs);
  },

  stop(): void {
    if (_drainInterval) {
      clearInterval(_drainInterval);
      _drainInterval = null;
    }
  },
};
