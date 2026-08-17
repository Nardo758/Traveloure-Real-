/**
 * Email Outbox Service
 *
 * Provides a durable delivery layer for transactional emails. Instead of
 * fire-and-forget calls to Resend, callers enqueue an email row (status=pending)
 * and the outbox scheduler retries failed rows with exponential backoff.
 *
 * Retry schedule (after attempt N fails, wait before attempt N+1):
 *   attempt 1 fails →   5 min delay
 *   attempt 2 fails →  15 min delay
 *   attempt 3 fails →  45 min delay
 *   attempt 4 fails → 120 min delay (2 h)
 *   attempt 5 fails → 360 min delay (6 h)
 *   attempt 6 fails → DEAD — no more retries; row surfaced on admin dashboard
 *
 * Concurrency safety: drainOutbox() atomically claims rows with a
 * `FOR UPDATE SKIP LOCKED` CTE so concurrent scheduler processes never
 * pick up the same row. Claimed rows move to status='processing' with a
 * 10-minute lease; expired leases are recovered on the next drain pass.
 *
 * Booking flow contract: enqueueEmail() and drainOutbox() never throw into
 * their callers — all errors are caught, logged, and recorded on the row.
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import { emailOutbox, type InsertEmailOutbox } from "../../shared/schema";
import { logger } from "../infrastructure/logger";
import {
  buildBookingConfirmationEmailPayload,
  type BookingConfirmationParams,
} from "./email.service";
import type { SendEmailResult } from "./email.service";

// ── Backoff schedule ──────────────────────────────────────────────────────────

/**
 * Minutes to wait after each failed attempt before scheduling the next retry.
 * Index 0 = delay after the 1st failure, index 4 = delay after the 5th failure.
 * The 6th failure marks the row dead (no entry at index 5).
 */
export const BACKOFF_MINUTES = [5, 15, 45, 120, 360] as const;

/**
 * Return the Date at which the next delivery attempt should be scheduled.
 * `failedAttemptCount` is the 1-based count of attempts that have already failed.
 * Exported (with underscore prefix) for testing only.
 */
export function _nextRetryAfter(failedAttemptCount: number): Date {
  const index   = Math.min(failedAttemptCount - 1, BACKOFF_MINUTES.length - 1);
  const minutes = BACKOFF_MINUTES[index];
  return new Date(Date.now() + minutes * 60 * 1000);
}

// ── Test seam ─────────────────────────────────────────────────────────────────

/**
 * Test-only seam. Override `sendEmailFn` to intercept the actual send call
 * without network calls.
 *
 * @example
 * _outboxTestHooks.sendEmailFn = async (_params) => ({ ok: false, error: "simulated failure" });
 */
export const _outboxTestHooks: {
  sendEmailFn?: (params: SendEmailParams) => Promise<SendEmailResult>;
} = {};

// ── Types ─────────────────────────────────────────────────────────────────────

import type { SendEmailParams } from "./email.service";

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
        emailType:    params.emailType ?? "generic",
        toEmail:      toEmailStr,
        subject:      params.subject,
        html:         params.html,
        textBody:     params.text,
        replyTo:      params.replyTo,
        status:       "pending",
        attemptCount: 0,
        maxAttempts:  6,
        metadata:     params.metadata ?? {},
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
  await attemptDelivery(outboxId, params, { attemptCount: 0, maxAttempts: 6 });

  return outboxId;
}

/**
 * Drain loop: atomically claim up to 50 due or lease-expired rows, then
 * attempt delivery on each claimed row.  Called by the outbox scheduler every
 * 5 minutes.
 *
 * Concurrency safety: the CTE uses `FOR UPDATE SKIP LOCKED` so a concurrent
 * drain process skips any rows already claimed by this one.  Claimed rows
 * move to status='processing' with a 10-minute lease; if this process dies,
 * the next pass recovers rows whose lease has elapsed.
 *
 * Never throws.
 */
export async function drainOutbox(): Promise<void> {
  type ClaimedRow = {
    id: number;
    to_email: string;
    subject: string;
    html: string;
    text_body: string | null;
    from_address: string | null;
    reply_to: string | null;
    attempt_count: number;
    max_attempts: number;
  };

  let claimed: ClaimedRow[];

  try {
    // Single atomic statement: select due rows (FOR UPDATE SKIP LOCKED) and
    // immediately move them to 'processing' so concurrent drains cannot pick
    // the same row.  The 10-minute lease (retry_after) means a dead process
    // leaves rows that the next pass can recover.
    const result = await db.execute(sql`
      WITH candidates AS (
        SELECT id FROM email_outbox
        WHERE (
          status IN ('pending', 'failed')
          AND (retry_after IS NULL OR retry_after <= NOW())
        )
        OR (
          status = 'processing'
          AND retry_after < NOW() - INTERVAL '1 minute'
        )
        ORDER BY created_at ASC
        LIMIT 50
        FOR UPDATE SKIP LOCKED
      )
      UPDATE email_outbox AS o
      SET    status      = 'processing',
             retry_after = NOW() + INTERVAL '10 minutes',
             updated_at  = NOW()
      FROM   candidates c
      WHERE  o.id = c.id
      RETURNING o.id, o.to_email, o.subject, o.html, o.text_body,
                o.from_address, o.reply_to, o.attempt_count, o.max_attempts
    `);
    claimed = (result.rows ?? []) as ClaimedRow[];
  } catch (err: unknown) {
    logger.error({ err }, "[email-outbox] drainOutbox: failed to claim rows");
    return;
  }

  if (claimed.length === 0) return;
  logger.info({ count: claimed.length }, "[email-outbox] drainOutbox: processing claimed rows");

  for (const row of claimed) {
    const params: SendEmailParams = {
      to:      row.to_email,
      subject: row.subject,
      html:    row.html,
      ...(row.text_body ? { text: row.text_body } : {}),
      ...(row.reply_to  ? { replyTo: row.reply_to } : {}),
    };
    await attemptDelivery(row.id, params, {
      attemptCount: row.attempt_count,
      maxAttempts:  row.max_attempts,
    });
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Try to send `params` via sendEmail (or the test-seam override) and update
 * the outbox row accordingly.  When `outboxId` is null the send still happens
 * but nothing is written to the DB.
 *
 * Never throws.
 */
async function attemptDelivery(
  outboxId: number | null,
  params: SendEmailParams,
  current: { attemptCount: number; maxAttempts: number }
): Promise<void> {
  const attemptCount = current.attemptCount + 1; // 1-based count after this attempt
  const maxAttempts  = current.maxAttempts;
  const toStr        = Array.isArray(params.to) ? params.to.join(", ") : params.to;

  // Use the test seam if provided, otherwise import sendEmail at call-time so
  // tests that override _outboxTestHooks.sendEmailFn take effect without a
  // circular import at module-load time.
  let result: SendEmailResult;
  try {
    if (_outboxTestHooks.sendEmailFn) {
      result = await _outboxTestHooks.sendEmailFn(params);
    } else {
      const { sendEmail } = await import("./email.service");
      result = await sendEmail(params);
    }
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
               retry_after   = NULL,
               updated_at    = NOW()
        WHERE  id = ${outboxId}
      `);
      logger.info(
        { outboxId, resendId: result.id, to: toStr, subject: params.subject },
        "[email-outbox] sent"
      );
    } else {
      const isDead    = attemptCount >= maxAttempts;
      const newStatus = isDead ? "dead" : "failed";
      const retryAt   = isDead ? null : _nextRetryAfter(attemptCount);

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
