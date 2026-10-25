/**
 * Email Outbox Service
 *
 * Provides a durable delivery layer for transactional emails. Instead of
 * fire-and-forget calls to Resend, callers enqueue an email row and the outbox
 * scheduler retries failed rows with exponential backoff.
 *
 * Retry schedule (after attempt N fails, wait before attempt N+1):
 *   attempt 1 fails →   5 min delay
 *   attempt 2 fails →  15 min delay
 *   attempt 3 fails →  45 min delay
 *   attempt 4 fails → 120 min delay  (2 h)
 *   attempt 5 fails → 360 min delay  (6 h)
 *   attempt 6 fails → DEAD — no more retries; surfaced on admin dashboard
 *
 * ── Concurrency safety ──────────────────────────────────────────────────────
 *
 * Rows are born as status='processing' (not 'pending') with a 10-minute lease
 * stored in retry_after. The drain's FOR UPDATE SKIP LOCKED CTE only targets
 * 'pending'/'failed' rows or expired 'processing' rows (lease elapsed), so a
 * concurrent drain cannot claim a row that immediate delivery is still sending.
 *
 * After delivery, the status update is conditional (WHERE status='processing')
 * so a stale sender — one whose lease elapsed and whose row was re-claimed by
 * the drain — cannot overwrite the new owner's state.
 *
 * drain-only flow:
 *   pending/failed (due) → claim → processing (10-min lease) → sent | failed | dead
 *
 * enqueue flow:
 *   insert as processing (10-min lease) → deliver → sent | failed | dead
 *
 * expired lease recovery (next drain pass):
 *   processing (lease < now-1min) → re-claim → processing (new lease) → …
 *
 * Booking flow contract: enqueueEmail() and drainOutbox() never throw into
 * their callers — all errors are caught, logged, and recorded on the row.
 */

import { db } from "../db";
import { and, eq, sql } from "drizzle-orm";
import { emailOutbox, itineraryComparisons, users, type InsertEmailOutbox } from "../../shared/schema";
import { logger } from "../infrastructure/logger";
import { runBackgroundJob } from "./background-job-runner";
import { jitteredStartupDelay } from "./startup-delay";
import { isItineraryFollowup } from "./itinerary-followup-email";
import { canQueueGenerationNotice } from "./itinerary-outcome-email";
import { FLAG_EMAIL_NOTIFICATIONS_ENABLED, getPlatformFlag } from "./platform-flags";
import { LegacyBookingEmailPersistenceError } from "./legacy-booking-email-persistence-error";
import {
  buildBookingAlertEmailPayload,
  buildBookingConfirmationEmailPayload,
  emailSendsEnabled,
  emailTemplateAllowed,
  emailTemplateAllowlist,
  type BookingAlertParams,
  type BookingConfirmationParams,
  type SendEmailParams,
  type SendEmailResult,
} from "./email.service";
import {
  buildGuestInviteEmailPayload,
  type GuestInviteEmailParams,
} from "./guest-invite-email";
import {
  EMAIL_OUTBOX_EXPIRY_BOOT_MESSAGE,
  OUTBOX_EXPIRED_REASON,
  computeOutboxExpiresAt,
  outboxRowExpired,
  type OutboxHoldSummary,
} from "./email-outbox-expiry";

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

/** The 10-minute lease window used by both enqueue and drain claim steps. */
const LEASE_MS = 10 * 60 * 1000;

const AUTH_EMAIL_TYPES = new Set(["password_reset", "email_verification"]);

function readMetadata(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
    } catch {
      return {};
    }
  }
  if (typeof value === "object") return value as Record<string, unknown>;
  return {};
}

function isAuthCritical(emailType: string | undefined, metadata: Record<string, unknown>): boolean {
  return metadata.authCritical === true || (emailType != null && AUTH_EMAIL_TYPES.has(emailType));
}

/** An issued auth link is past its original expiry. A retry must not resend it. */
function authLinkExpired(metadata: Record<string, unknown>, now = Date.now()): boolean {
  const raw = metadata.linkExpiresAt;
  if (typeof raw !== "string") return false;
  const at = Date.parse(raw);
  return !Number.isNaN(at) && at <= now;
}

function dedupeKeyOf(params: EnqueueEmailParams): string | null {
  const key = params.metadata?.dedupeKey;
  return typeof key === "string" && key.trim() !== "" ? key : null;
}

/**
 * canQueueGenerationNotice is the no-send gate. The drain calls it here, before
 * sendEmail, so a retry that would reach the provider is a send and is refused
 * unless the gate allows that recipient. The test seam may rewrite the
 * recipient and then call sendEmail, which applies the same gate to the
 * address it actually sends.
 */
async function sendThroughNoSendGate(params: SendEmailParams): Promise<SendEmailResult> {
  if (_outboxTestHooks.sendEmailFn) {
    return _outboxTestHooks.sendEmailFn(params);
  }
  const recipients = Array.isArray(params.to) ? params.to : params.to.split(",").map((email) => email.trim()).filter(Boolean);
  if (!recipients.every((email) => canQueueGenerationNotice(email))) {
    return { ok: false, error: "No approved development inbox", suppressed: "development_gate" };
  }
  const { sendEmail } = await import("./email.service");
  return sendEmail(params);
}

/**
 * Outbox claim predicate. Empty allowlist is FALSE so a drain does not claim
 * and release the same unlisted rows. Applied only after EMAIL_SENDS_ENABLED.
 */
function emailTypeAllowlistSql() {
  const names = emailTemplateAllowlist();
  if (names.length === 0) return sql`FALSE`;
  const list = sql.join(names.map((name) => sql`${name}`), sql`, `);
  return sql`email_type = ANY(ARRAY[${list}]::text[])`;
}

async function settleWithoutAttempt(
  outboxId: number | null,
  status: "cancelled" | "pending" | "held",
  lastError: string,
  retryAfter: Date | null,
): Promise<void> {
  if (outboxId === null) return;
  await db.execute(sql`
    UPDATE email_outbox
    SET    status      = ${status},
           last_error  = ${lastError},
           retry_after = ${retryAfter},
           updated_at  = NOW()
    WHERE  id     = ${outboxId}
      AND  status = 'processing'
  `);
}

// ── Test seam ─────────────────────────────────────────────────────────────────

/**
 * Test-only seam. Override `sendEmailFn` to intercept the actual send call
 * without network calls.
 *
 * @example
 * _outboxTestHooks.sendEmailFn = async () => ({ ok: false, error: "simulated" });
 */
export const _outboxTestHooks: {
  sendEmailFn?: (params: SendEmailParams) => Promise<SendEmailResult>;
  /** Replaces the post-commit legacy confirmation kick (tests that inspect the durable row). */
  legacyConfirmationKickFn?: (outboxId: number) => void;
} = {};

// ── Public API ─────────────────────────────────────────────────────────────────

export interface EnqueueEmailParams extends Omit<SendEmailParams, "emailType"> {
  /** Caller-supplied category for admin visibility (e.g. 'booking_confirmation'). */
  emailType?: string;
  /** Arbitrary key→value context stored on the row (e.g. { bookingId }). */
  metadata?: Record<string, unknown>;
}

/**
 * Write an email to the outbox as status='processing' with a 10-minute lease,
 * then immediately attempt delivery.
 *
 * The row is born as 'processing' (not 'pending') so the drain's
 * FOR UPDATE SKIP LOCKED cannot claim it while this send is in flight.
 * The final status update is conditional (WHERE status='processing') so a stale
 * sender cannot overwrite a row that a drain has re-claimed after lease expiry.
 *
 * Returns the outbox row id so callers can correlate logs.
 * Never throws — all errors are caught and recorded on the outbox row.
 */
function outboxInsertValues(params: EnqueueEmailParams, lease: Date): InsertEmailOutbox {
  const toEmailStr = Array.isArray(params.to) ? params.to.join(", ") : params.to;
  const metadata: Record<string, unknown> = { ...(params.metadata ?? {}) };
  if (params.authCritical) metadata.authCritical = true;
  return {
    emailType:    params.emailType ?? "generic",
    toEmail:      toEmailStr,
    subject:      params.subject,
    html:         params.html,
    textBody:     params.text,
    replyTo:      params.replyTo,
    // Born as 'processing' with a lease so the drain cannot concurrently
    // claim and send this row before immediate delivery completes.
    status:       "processing",
    retryAfter:   lease,
    attemptCount: 0,
    maxAttempts:  6,
    metadata,
    // Stored once, here. A later drain does not recompute it and does not
    // fill a null on a row that already exists.
    expiresAt:    computeOutboxExpiresAt(params.emailType ?? "generic", metadata, new Date()),
  };
}

async function enqueueEmailImpl(params: EnqueueEmailParams): Promise<number | null> {
  const toEmailStr = Array.isArray(params.to) ? params.to.join(", ") : params.to;
  const lease      = new Date(Date.now() + LEASE_MS);
  const values     = outboxInsertValues(params, lease);
  const dedupeKey  = dedupeKeyOf(params);

  let outboxId: number | null = null;
  let deliver = true;

  try {
    if (dedupeKey) {
      const placed = await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`email-outbox:${dedupeKey}`}, 0))`);
        const [existing] = await tx
          .select({ id: emailOutbox.id })
          .from(emailOutbox)
          .where(sql`${emailOutbox.metadata}->>'dedupeKey' = ${dedupeKey}`)
          .limit(1);
        if (existing) return { id: existing.id, deliver: false };
        const [row] = await tx.insert(emailOutbox).values(values).returning({ id: emailOutbox.id });
        return { id: row?.id ?? null, deliver: true };
      });
      outboxId = placed.id;
      deliver = placed.deliver;
    } else {
      const [row] = await db
        .insert(emailOutbox)
        .values(values)
        .returning({ id: emailOutbox.id });
      outboxId = row?.id ?? null;
    }
  } catch (insertErr: unknown) {
    logger.error(
      { err: insertErr, subject: params.subject, to: toEmailStr },
      "[email-outbox] failed to insert outbox row — email will NOT be retried"
    );
    // A deduped send that failed to record must not fire a second provider call.
    // An ordinary enqueue still attempts once, matching the previous contract.
    if (dedupeKey) return null;
  }

  if (deliver) {
    const metadata = readMetadata(values.metadata);
    const emailType = values.emailType ?? "generic";
    await attemptDelivery(outboxId, {
      ...params,
      emailType,
      authCritical: params.authCritical || metadata.authCritical === true,
    }, {
      attemptCount: 0,
      maxAttempts: 6,
      emailType,
      metadata,
      expiresAt: values.expiresAt ?? null,
    });
  }

  return outboxId;
}

/** Route enqueue through the messaging registry while preserving its public result contract. */
export async function enqueueEmail(params: EnqueueEmailParams): Promise<number | null> {
  try {
    const { dispatchMessagingEvent } = await import("../automations/messaging/runtime");
    return await dispatchMessagingEvent(
      "messaging.email-outbox-enqueue",
      "email.enqueue",
      { emailType: params.emailType ?? "generic" },
      { emailType: params.emailType ?? "generic" },
      () => enqueueEmailImpl(params),
    );
  } catch (err) {
    logger.error({ err }, "[email-outbox] enqueue automation dispatch failed");
    return null;
  }
}

/**
 * Drain loop: atomically claim up to 50 due or lease-expired rows using a
 * CTE with FOR UPDATE SKIP LOCKED, then attempt delivery on each claimed row.
 * Called by the outbox scheduler every 5 minutes.
 *
 * Rows born from enqueueEmail() start as 'processing' with a fresh lease and
 * are therefore invisible to this CTE until their lease expires — preventing
 * concurrent delivery.
 *
 * Never throws.
 *
 * RETURN SHAPE (lane: internal-jobs-hardening, L4): `{ drained }` — the number of rows this pass
 * claimed and attempted. It used to return void, which the internal-job endpoint could not tell
 * apart from an overlap skip, so `POST /internal/jobs/email-outbox` answered `skipped:true` on
 * every call — a successful drain, a skip, and an outbox that had silently stopped draining all
 * rendered identically to the cron (§17 rule 2). `{ drained: 0 }` is now an honest "ran, nothing
 * due"; a claim failure carries `error` so the endpoint surfaces it as a 500 instead of a silent
 * 200. Delivery outcomes per row are unchanged and still reported by attemptDelivery's own logs.
 */
export interface DrainOutboxResult {
  drained: number;
  error?: string;
}

async function drainOutboxImpl(): Promise<DrainOutboxResult> {
  if (!emailSendsEnabled()) {
    logger.warn(
      { reason: "EMAIL_SENDS_ENABLED" },
      "[email-outbox] drain refused; EMAIL_SENDS_ENABLED is not true",
    );
    return { drained: 0 };
  }

  if (emailTemplateAllowlist().length === 0) {
    logger.warn(
      { reason: "EMAIL_TEMPLATE_ALLOWLIST" },
      "[email-outbox] drain refused; EMAIL_TEMPLATE_ALLOWLIST allows nothing",
    );
  }

  type ClaimedRow = {
    id:            number;
    to_email:      string;
    subject:       string;
    html:          string;
    text_body:     string | null;
    from_address:  string | null;
    reply_to:      string | null;
    attempt_count: number;
    max_attempts:  number;
    email_type:    string;
    metadata:      unknown;
    expires_at:    Date | string | null;
  };

  let claimed: ClaimedRow[];

  try {
    // Single atomic statement: select due rows (skipping locked ones held by
    // concurrent drains or live enqueue deliveries) and move them to
    // 'processing' with a fresh 10-minute lease.
    const result = await db.execute(sql`
      WITH due AS (
        SELECT id, expires_at FROM email_outbox
        WHERE (
          (
            status IN ('pending', 'failed', 'held')
            AND (retry_after IS NULL OR retry_after <= NOW())
          )
          OR (
            status = 'processing'
            AND retry_after < NOW() - INTERVAL '1 minute'
          )
        )
        AND ${emailTypeAllowlistSql()}
        ORDER BY created_at ASC
        LIMIT 50
        FOR UPDATE SKIP LOCKED
      ),
      expired AS (
        UPDATE email_outbox AS e
        SET    status      = 'cancelled',
               last_error  = ${OUTBOX_EXPIRED_REASON},
               retry_after = NULL,
               updated_at  = NOW()
        FROM   due d
        WHERE  e.id = d.id
          AND  d.expires_at IS NOT NULL
          AND  d.expires_at <= NOW()
        RETURNING e.id
      ),
      candidates AS (
        SELECT d.id FROM due d
        WHERE (d.expires_at IS NULL OR d.expires_at > NOW())
          AND NOT EXISTS (SELECT 1 FROM expired x WHERE x.id = d.id)
      )
      UPDATE email_outbox AS o
      SET    status      = 'processing',
             retry_after = NOW() + INTERVAL '10 minutes',
             updated_at  = NOW()
      FROM   candidates c
      WHERE  o.id = c.id
      RETURNING o.id, o.to_email, o.subject, o.html, o.text_body,
                o.from_address, o.reply_to, o.attempt_count, o.max_attempts, o.email_type,
                o.metadata, o.expires_at
    `);
    claimed = (result.rows ?? []) as ClaimedRow[];
  } catch (err: unknown) {
    logger.error({ err }, "[email-outbox] drainOutbox: failed to claim rows");
    return { drained: 0, error: "failed to claim rows" };
  }

  if (claimed.length === 0) return { drained: 0 };
  logger.info({ count: claimed.length }, "[email-outbox] drainOutbox: processing claimed rows");

  for (const row of claimed) {
    const metadata = readMetadata(row.metadata);
    const params: SendEmailParams = {
      to:      row.to_email,
      subject: row.subject,
      html:    row.html,
      ...(row.text_body ? { text: row.text_body } : {}),
      ...(row.reply_to  ? { replyTo: row.reply_to } : {}),
      generationNotice: row.email_type === "itinerary_ready" || row.email_type === "itinerary_failed",
      authCritical: isAuthCritical(row.email_type, metadata),
      emailType: row.email_type,
    };
    await attemptDelivery(row.id, params, {
      attemptCount: row.attempt_count,
      maxAttempts:  row.max_attempts,
      emailType: row.email_type,
      metadata,
      expiresAt: row.expires_at ?? null,
    });
  }

  return { drained: claimed.length };
}

/** Claim one committed, due notice; competing drains share the same lease guard. */
export async function deliverQueuedEmail(outboxId: number): Promise<void> {
  try {
    if (emailSendsEnabled()) {
      const peek = await db.execute(sql`
        SELECT email_type FROM email_outbox
        WHERE id = ${outboxId}
          AND status IN ('pending', 'failed', 'held')
          AND (retry_after IS NULL OR retry_after <= NOW())
      `);
      const peeked = peek.rows?.[0] as { email_type?: string } | undefined;
      if (peeked && !emailTemplateAllowed(peeked.email_type)) {
        logger.warn(
          { outboxId, emailType: peeked.email_type ?? null, reason: "EMAIL_TEMPLATE_ALLOWLIST" },
          "[email-outbox] send refused; EMAIL_TEMPLATE_ALLOWLIST",
        );
        return;
      }
    }
    const allowlistGate = emailSendsEnabled() ? emailTypeAllowlistSql() : sql`TRUE`;
    const result = await db.execute(sql`
      UPDATE email_outbox SET status = 'processing',
        retry_after = NOW() + INTERVAL '10 minutes', updated_at = NOW()
      WHERE id = ${outboxId} AND status IN ('pending', 'failed', 'held')
        AND (retry_after IS NULL OR retry_after <= NOW())
        AND ${allowlistGate}
      RETURNING to_email, subject, html, text_body, reply_to, attempt_count, max_attempts, email_type, metadata, expires_at
    `);
    const row = result.rows?.[0] as {
      to_email: string; subject: string; html: string; text_body: string | null;
      reply_to: string | null; attempt_count: number; max_attempts: number; email_type: string;
      metadata: unknown; expires_at: Date | string | null;
    } | undefined;
    if (!row) return;
    const metadata = readMetadata(row.metadata);
    await attemptDelivery(outboxId, {
      to: row.to_email, subject: row.subject, html: row.html,
      generationNotice: row.email_type === "itinerary_ready" || row.email_type === "itinerary_failed",
      authCritical: isAuthCritical(row.email_type, metadata),
      emailType: row.email_type,
      ...(row.text_body ? { text: row.text_body } : {}),
      ...(row.reply_to ? { replyTo: row.reply_to } : {}),
    }, { attemptCount: row.attempt_count, maxAttempts: row.max_attempts, emailType: row.email_type, metadata, expiresAt: row.expires_at ?? null });
  } catch (err) {
    logger.error({ err, outboxId }, "[email-outbox] immediate generation delivery failed; retry worker retains ownership");
  }
}

/** Route the existing drain implementation through its scheduled messaging node. */
export async function drainOutbox(): Promise<DrainOutboxResult> {
  try {
    const { runMessagingSchedule } = await import("../automations/messaging/runtime");
    return await runMessagingSchedule(
      "messaging.email-outbox-drain",
      "email-outbox-drain",
      () => drainOutboxImpl(),
    );
  } catch (err) {
    logger.error({ err }, "[email-outbox] drain automation dispatch failed");
    return { drained: 0, error: "failed to dispatch drain automation" };
  }
}

/**
 * Admin retry may reset a failed or dead row only when its email_type may leave.
 * Checked only after EMAIL_SENDS_ENABLED. Returns the refusal reason, or null
 * when the reset may proceed. Does not write the row.
 */
export function adminOutboxRetryRefusal(
  emailType: string | null | undefined,
  outboxId: number,
): "EMAIL_TEMPLATE_ALLOWLIST" | null {
  if (!emailSendsEnabled()) return null;
  if (emailTemplateAllowed(emailType)) return null;
  logger.warn(
    { outboxId, emailType: emailType ?? null, reason: "EMAIL_TEMPLATE_ALLOWLIST" },
    "[email-outbox] admin retry refused; EMAIL_TEMPLATE_ALLOWLIST",
  );
  return "EMAIL_TEMPLATE_ALLOWLIST";
}

/** Admin retry dispatch uses its own event node and the same original drain action. */
export async function drainOutboxForAdminRetry(outboxId: number): Promise<DrainOutboxResult> {
  const { dispatchMessagingEvent } = await import("../automations/messaging/runtime");
  return dispatchMessagingEvent(
    "messaging.email-outbox-admin-retry",
    "email_outbox.admin_retry",
    { outboxId },
    { outboxId },
    () => drainOutboxImpl(),
  );
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Try to send `params` via sendEmail (or the test-seam override) and update
 * the outbox row conditionally (WHERE status='processing') so a stale sender
 * cannot overwrite a row that was re-claimed after lease expiry.
 *
 * When `outboxId` is null the send still happens but nothing is written to the DB.
 * Never throws.
 */
async function attemptDelivery(
  outboxId: number | null,
  params: SendEmailParams,
  current: {
    attemptCount: number;
    maxAttempts: number;
    emailType?: string;
    metadata?: Record<string, unknown>;
    expiresAt?: Date | string | null;
  }
): Promise<void> {
  const attemptCount = current.attemptCount + 1; // 1-based count after this attempt
  const maxAttempts  = current.maxAttempts;
  const toStr        = Array.isArray(params.to) ? params.to.join(", ") : params.to;
  const metadata     = current.metadata ?? {};
  const authCritical = params.authCritical === true || isAuthCritical(current.emailType, metadata);

  // EMAIL_SENDS_ENABLED refuses every row, including password reset and
  // verification. The row stays held with its attempt count unchanged and is
  // not scheduled for another try until a drain runs with sends allowed.
  // This stays ahead of the allowlist so an unset send gate still records
  // EMAIL_SENDS_ENABLED rather than the template reason.
  if (!emailSendsEnabled()) {
    await settleWithoutAttempt(outboxId, "held", "EMAIL_SENDS_ENABLED is not true", null);
    logger.warn(
      { outboxId, emailType: current.emailType, reason: "EMAIL_SENDS_ENABLED", authCritical },
      "[email-outbox] send refused; EMAIL_SENDS_ENABLED is not true",
    );
    return;
  }

  // Unlisted types, including password reset and verification, stay held.
  // Checked before auth-link expiry so an unlisted row is never cancelled.
  if (!emailTemplateAllowed(current.emailType)) {
    await settleWithoutAttempt(outboxId, "held", "EMAIL_TEMPLATE_ALLOWLIST", null);
    logger.warn(
      { outboxId, emailType: current.emailType ?? null, reason: "EMAIL_TEMPLATE_ALLOWLIST", authCritical },
      "[email-outbox] send refused; EMAIL_TEMPLATE_ALLOWLIST",
    );
    return;
  }

  // After the two holds, so an unlisted or sends-disabled row stays held.
  // A past expires_at is terminal: cancelled, reason expired, attempt count
  // unchanged, and the claim predicate does not select cancelled.
  if (outboxRowExpired(current.expiresAt)) {
    await settleWithoutAttempt(outboxId, "cancelled", OUTBOX_EXPIRED_REASON, null);
    logger.info(
      { outboxId, emailType: current.emailType ?? null, reason: OUTBOX_EXPIRED_REASON },
      "[email-outbox] expired; not sent",
    );
    return;
  }

  if (authLinkExpired(metadata)) {
    await settleWithoutAttempt(
      outboxId,
      "cancelled",
      "Auth link expired before delivery; the issued link was not resent",
      null,
    );
    logger.info({ outboxId, emailType: current.emailType }, "[email-outbox] auth link expired; not resent");
    return;
  }

  // A paused outbox still delivers resets and verification. Every other kind is
  // held with its attempt count unchanged, so the pause cannot exhaust the row.
  if (!authCritical) {
    const notificationsEnabled = await getPlatformFlag(FLAG_EMAIL_NOTIFICATIONS_ENABLED, true);
    if (!notificationsEnabled) {
      await settleWithoutAttempt(
        outboxId,
        "pending",
        "Email notifications are disabled by platform settings",
        _nextRetryAfter(1),
      );
      logger.info({ outboxId, emailType: current.emailType }, "[email-outbox] held; email notifications are disabled");
      return;
    }
  }

  // Use the test seam if provided; otherwise import sendEmail dynamically so
  // there is no circular import at module-load time. The real provider path
  // goes through sendThroughNoSendGate, which calls canQueueGenerationNotice
  // before sendEmail.
  let result: SendEmailResult;
  try {
    if (outboxId !== null && current.emailType === "signup_welcome") {
      const { deliverSignupWelcome } = await import("./signup-welcome-outbox.service");
      await deliverSignupWelcome(outboxId, (payload) => sendThroughNoSendGate(payload), _nextRetryAfter);
      return;
    }
    if (outboxId !== null && current.emailType && isItineraryFollowup(current.emailType)) {
      const { deliverItineraryFollowup } = await import("./itinerary-followup.service");
      await deliverItineraryFollowup(outboxId, (payload) => sendThroughNoSendGate(payload));
      return;
    }
    // Generation notices opt in to eligibility checks and stable provider retry keys.
    // Legacy notifications retain their behavior.
    if (outboxId !== null && params.generationNotice) {
      const [row] = await db.select({ metadata: emailOutbox.metadata }).from(emailOutbox)
        .where(eq(emailOutbox.id, outboxId)).limit(1);
      const metadata = row?.metadata as {
        generationNoticeKey?: string; comparisonId?: string; outcome?: string;
        generationCompletedAt?: string;
      } | undefined;
      if (metadata?.generationNoticeKey) {
        const [current] = await db.select({
          status: itineraryComparisons.status, updatedAt: itineraryComparisons.updatedAt,
          email: users.email,
        }).from(itineraryComparisons).innerJoin(users, eq(users.id, itineraryComparisons.userId))
          .where(eq(itineraryComparisons.id, metadata.comparisonId!)).limit(1);
        const obsolete = !current || current.email !== toStr ||
          current.status !== (metadata.outcome === "ready" ? "generated" : "failed") ||
          (metadata.outcome === "failed" && current.updatedAt?.toISOString() !== metadata.generationCompletedAt);
        if (obsolete) {
          await db.update(emailOutbox).set({
            status: "cancelled", lastError: "Outcome superseded, itinerary/account deleted, or recipient changed",
            retryAfter: null, updatedAt: new Date(),
          }).where(and(eq(emailOutbox.id, outboxId), eq(emailOutbox.status, "processing")));
          return;
        }
        params = { ...params, idempotencyKey: `itinerary-outbox-${outboxId}` };
      }
    }
    params = { ...params, emailType: current.emailType ?? params.emailType ?? "" };
    result = await sendThroughNoSendGate(params);
  } catch (err: unknown) {
    // sendEmail is documented to never throw, but be defensive.
    const message = err instanceof Error ? err.message : String(err);
    result = { ok: false, error: message };
  }

  if (outboxId === null) return; // no row to update

  if (result.suppressed === "template_not_allowed") {
    await settleWithoutAttempt(outboxId, "held", "EMAIL_TEMPLATE_ALLOWLIST", null);
    logger.warn(
      { outboxId, emailType: current.emailType ?? null, reason: "EMAIL_TEMPLATE_ALLOWLIST" },
      "[email-outbox] send refused; EMAIL_TEMPLATE_ALLOWLIST",
    );
    return;
  }
  if (result.suppressed === "sends_disabled") {
    await settleWithoutAttempt(outboxId, "held", result.error ?? "EMAIL_SENDS_ENABLED is not true", null);
    logger.warn(
      { outboxId, emailType: current.emailType, reason: "EMAIL_SENDS_ENABLED" },
      "[email-outbox] send refused; EMAIL_SENDS_ENABLED is not true",
    );
    return;
  }
  if (result.suppressed === "development_gate") {
    await settleWithoutAttempt(outboxId, "cancelled", result.error ?? "No approved development inbox", null);
    logger.info({ outboxId, emailType: current.emailType }, "[email-outbox] refused by canQueueGenerationNotice");
    return;
  }
  if (result.suppressed === "kill_switch") {
    await settleWithoutAttempt(
      outboxId,
      "pending",
      result.error ?? "Email notifications are disabled by platform settings",
      _nextRetryAfter(1),
    );
    return;
  }

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
        WHERE  id     = ${outboxId}
          AND  status = 'processing'
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
        WHERE  id     = ${outboxId}
          AND  status = 'processing'
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

type OutboxTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Called only by a winning legacy confirmation UPDATE in the SAME transaction.
 * Persist before commit; the existing drain owns delivery, never this writer.
 * Unlike the best-effort enqueue shortcut, any persistence failure must roll
 * back confirmation so an authoritative payment retry can safely try again.
 */
export async function persistLegacyBookingConfirmationEmail(
  tx: OutboxTransaction,
  bookingId: string,
): Promise<number> {
  try {
    const result = await tx.execute(sql`
      SELECT b.title, b.booking_date, b.confirmation_code,
             u.email, u.first_name, u.last_name
      FROM bookings b
      LEFT JOIN users u ON u.id = b.user_id
      WHERE b.id = ${bookingId} AND b.status = 'confirmed'
    `);
    const row = result.rows[0] as {
      title: string | null;
      booking_date: string | null;
      confirmation_code: string | null;
      email: string | null;
      first_name: string | null;
      last_name: string | null;
    } | undefined;
    if (!row?.confirmation_code) {
      throw new Error("Confirmed booking could not be read with its stored confirmation code");
    }
    const toEmail = row.email?.trim() || "";
    const payload = buildBookingConfirmationEmailPayload({
      toEmail,
      userName: [row.first_name, row.last_name].filter(Boolean).join(" "),
      bookingId,
      bookingTitle: row.title || "Your booking",
      bookingDate: row.booking_date ?? null,
      confirmationCode: row.confirmation_code,
    });
    const missingRecipient = !toEmail;
    const [inserted] = await tx.insert(emailOutbox).values({
      emailType: "booking_confirmation",
      toEmail,
      subject: payload.subject,
      html: payload.html,
      textBody: payload.text,
      status: missingRecipient ? "dead" : "pending",
      attemptCount: 0,
      maxAttempts: 6,
      lastError: missingRecipient
        ? "Traveler email missing at payment confirmation; confirmation was not deliverable."
        : null,
      metadata: {
        bookingId,
        confirmationCode: row.confirmation_code,
        source: "legacy_booking_payment",
        ...(missingRecipient ? { deliveryBlocked: true, deliveryError: "traveler_email_missing" } : {}),
      },
    }).returning({ id: emailOutbox.id });
    return inserted.id;
  } catch (error) {
    throw new LegacyBookingEmailPersistenceError(bookingId, error);
  }
}

/**
 * After the confirming transaction COMMITS, try the row once now so the traveler hears at once in
 * the normal case. Never awaited and never throws: `deliverQueuedEmail` claims the row with an
 * atomic conditional, so this and the 5-minute drain cannot both send it, and a kick lost to a
 * process death leaves a `pending` row the drain still delivers — the drain stays the guarantee.
 */
export function kickLegacyConfirmationDelivery(outboxId: number): void {
  if (_outboxTestHooks.legacyConfirmationKickFn) {
    _outboxTestHooks.legacyConfirmationKickFn(outboxId);
    return;
  }
  void deliverQueuedEmail(outboxId);
}

/**
 * Enqueue a booking confirmation email via the outbox so it is retried
 * automatically if Resend is unreachable. This is the preferred entry-point
 * for all booking-confirmation sends.
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

// ── Dead-letter summary (admin digest) ────────────────────────────────────────

export interface DeadEmailRow {
  id: number;
  emailType: string;
  toEmail: string;
  subject: string;
  attemptCount: number;
  lastError: string | null;
  deadAt: string;
}

export interface DeadEmailSummary {
  /** Every row currently `dead` — they stay dead until an admin retries them. */
  total: number;
  /** Of those, how many went dead in the last 24 hours. */
  newInLast24h: number;
  /** The most recent dead rows, newest first, capped at `limit`. */
  rows: DeadEmailRow[];
}

/**
 * What the daily admin digest reports about emails that exhausted their retries (board task
 * #1566, ledger `2026-09-23-phase2-messages`). Until now a dead row produced one log line and
 * nothing else; nothing in the digest said a traveler's confirmation had never arrived.
 *
 * It lists every row CURRENTLY dead rather than only the last day's, so a row keeps appearing in
 * each digest until someone retries it, and a restart that shifts the digest's clock can never
 * make one slip through unreported.
 */
/**
 * Counts for the daily admin digest. Expired rows are the cancelled ones
 * whose reason is `expired`. Held rows are grouped by the reason already
 * on the row. No addresses.
 */
export async function loadOutboxHoldSummary(): Promise<OutboxHoldSummary> {
  const expired = await db.execute(sql`
    SELECT count(*)::int AS n
      FROM email_outbox
     WHERE status = 'cancelled'
       AND last_error = ${OUTBOX_EXPIRED_REASON}
  `);
  const held = await db.execute(sql`
    SELECT coalesce(nullif(btrim(last_error), ''), 'no reason recorded') AS reason,
           count(*)::int AS n
      FROM email_outbox
     WHERE status = 'held'
     GROUP BY 1
     ORDER BY 2 DESC, 1 ASC
  `);
  const expiredCount = Number((expired.rows[0] as { n?: number } | undefined)?.n ?? 0);
  return {
    expired: expiredCount,
    held: (held.rows as { reason?: string; n?: number }[]).map((row) => ({
      reason: String(row.reason ?? "no reason recorded"),
      count: Number(row.n ?? 0),
    })),
  };
}

export async function loadDeadEmailSummary(limit = 25): Promise<DeadEmailSummary> {
  const counts = await db.execute(sql`
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE updated_at >= NOW() - INTERVAL '24 hours')::int AS new_in_last_24h
      FROM email_outbox
     WHERE status = 'dead'
  `);
  const rows = await db.execute(sql`
    SELECT id, email_type, to_email, subject, attempt_count, last_error, updated_at
      FROM email_outbox
     WHERE status = 'dead'
     ORDER BY updated_at DESC, id DESC
     LIMIT ${limit}
  `);
  const c = (counts.rows[0] ?? {}) as { total?: number; new_in_last_24h?: number };
  return {
    total: Number(c.total ?? 0),
    newInLast24h: Number(c.new_in_last_24h ?? 0),
    rows: (rows.rows as any[]).map((r) => ({
      id: Number(r.id),
      emailType: String(r.email_type),
      toEmail: String(r.to_email),
      subject: String(r.subject),
      attemptCount: Number(r.attempt_count),
      lastError: r.last_error ?? null,
      deadAt: new Date(r.updated_at).toISOString(),
    })),
  };
}

// ── Provider booking alert ────────────────────────────────────────────────────

/**
 * Enqueue a provider's "new booking request" alert through the outbox (board task #1564, ledger
 * `2026-09-23-phase2-messages`), so a Resend outage retries it on the normal schedule and a row
 * that exhausts its attempts goes `dead` where the admin can see it — instead of being lost in a
 * log line. Because it goes through `sendEmail`, it also honours the platform email kill switch.
 *
 * Never throws. Enqueued is not delivered: callers must not report it as received.
 */
export async function enqueueBookingAlertEmail(params: BookingAlertParams): Promise<number | null> {
  const payload = buildBookingAlertEmailPayload(params);
  return enqueueEmail({
    emailType: "provider_booking_alert",
    to:        params.providerEmail,
    subject:   payload.subject,
    html:      payload.html,
    text:      payload.text,
    metadata:  { bookingId: params.bookingId },
  });
}

// ── Guest invite ──────────────────────────────────────────────────────────────

/**
 * Enqueue ONE guest's invite email through the outbox (ledger 2026-09-04-invite-mailer).
 *
 * The guest-invite rail has no mail path of its own: it enqueues here like every other
 * transactional email, so the platform kill switch, the retry schedule and the admin
 * dead-letter view all apply unchanged (§18 rule 1 — one mail implementation, many callers).
 *
 * Returns the outbox row id, or null when NO durable row could be written. The caller treats
 * null as "not enqueued" and must not stamp the invite as sent — an email with no outbox row is
 * never retried, so calling it sent would be a claim the platform cannot support (§13).
 *
 * ENQUEUED IS NOT DELIVERED. A non-null id means the outbox accepted the message, nothing more.
 * Never report it to a host as received, opened or read.
 */
export async function enqueueGuestInviteEmail(params: {
  toEmail: string;
  inviteId: string;
  experienceId: string;
  email: GuestInviteEmailParams;
}): Promise<number | null> {
  const payload = buildGuestInviteEmailPayload(params.email);
  return enqueueEmail({
    emailType: "guest_invite",
    to:        params.toEmail,
    subject:   payload.subject,
    html:      payload.html,
    text:      payload.text,
    metadata:  { inviteId: params.inviteId, experienceId: params.experienceId },
  });
}

// ── Scheduler wrapper (used by server/index.ts) ───────────────────────────────

/**
 * The outbox pass, then the phone-push sweep (Locked Decision 53). Push rides this existing
 * 5-minute job — no new cron, no new internal endpoint — and catches every notification writer
 * that did not dispatch immediately. The sweep never throws and never changes the drain's result.
 */
export async function drainOutboxAndSweepPush(): Promise<DrainOutboxResult> {
  const result = await drainOutbox();
  try {
    const { sweepUnpushedNotifications } = await import("./web-push.service");
    await sweepUnpushedNotifications();
  } catch (err) {
    logger.warn({ err }, "[email-outbox] push sweep failed (non-fatal)");
  }
  return result;
}

let _drainInterval: ReturnType<typeof setInterval> | null = null;

/** Boot record of the expiry rule and the send-flag state. No allowlist names, no addresses. */
export function logEmailOutboxExpiry(): void {
  logger.info(
    {
      sendsEnabled: emailSendsEnabled(),
      allowlistCount: emailTemplateAllowlist().length,
    },
    EMAIL_OUTBOX_EXPIRY_BOOT_MESSAGE,
  );
}

export const emailOutboxScheduler = {
  start(intervalMs = 5 * 60 * 1000): void {
    if (_drainInterval) return; // already running
    logEmailOutboxExpiry();
    // First pass after startup (boot-herd floor + jitter, #1712 — lifts the old 30s delay clear of
    // the boot window). The drain cadence itself is unchanged.
    setTimeout(() => {
      void runBackgroundJob("email-outbox", () => drainOutboxAndSweepPush()).catch((err) =>
        logger.error({ err }, "[email-outbox] scheduled pass failed"),
      );
      _drainInterval = setInterval(() => {
        void runBackgroundJob("email-outbox", () => drainOutboxAndSweepPush()).catch((err) =>
          logger.error({ err }, "[email-outbox] scheduled pass failed"),
        );
      }, intervalMs);
    }, jitteredStartupDelay());
    logger.info("[email-outbox] scheduler registered (interval=%dms)", intervalMs);
  },

  stop(): void {
    if (_drainInterval) {
      clearInterval(_drainInterval);
      _drainInterval = null;
    }
  },
};
