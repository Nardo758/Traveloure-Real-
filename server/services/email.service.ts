/**
 * Email Service
 * Sends transactional emails via Resend (LB-P1: provider migrated from
 * Nodemailer/SMTP to Resend per launch-owner decision).
 *
 * Required env:
 *   RESEND_API_KEY       Resend project API key
 *   EMAIL_FROM_NOREPLY   e.g. "Traveloure <no-reply@traveloure.com>"
 *                        (sending domain MUST be verified in Resend dashboard
 *                         for real-user delivery — staging tests "succeed"
 *                         without verification but messages silently bounce.)
 *   EMAIL_REPLY_TO       Human reply-to address, e.g. "admin@traveloure.com"
 *
 * EMAIL_SENDS_ENABLED is the production send gate. Mail leaves this process
 * only when that variable is exactly true. It is checked before every other
 * gate, including for password reset and verification.
 *
 * EMAIL_TEMPLATE_ALLOWLIST is the next production gate after
 * EMAIL_SENDS_ENABLED, for every sendEmail call. It is a comma-separated
 * list of email_type names. Unset, empty, or blank allows nothing. There is
 * no code default. The development no-send gate stays ahead of it.
 *
 * Legacy alias: EMAIL_FROM is still read as a fallback for EMAIL_FROM_NOREPLY
 * so existing deployments that predate the rename continue to work.
 *
 * APP_BASE_URL is derived from REPLIT_DOMAINS at runtime; override with
 * APP_BASE_URL env var if running outside Replit.
 */

import crypto from "node:crypto";
import { Resend } from "resend";
import { dispatchMessagingEvent } from "../automations/messaging/runtime";
import { dispatchMessagingProducer, wrapEmailProviderTransport } from "../automations/messaging/producer-index";
import { authPasswordResetEmailAutomation } from "../automations/messaging/auth-password-reset-email";
import { authVerificationEmailAutomation } from "../automations/messaging/auth-verification-email";
import { authWelcomeEmailAutomation } from "../automations/messaging/auth-welcome-email";
import { planDeliveredEmailAutomation } from "../automations/messaging/plan-delivered-email";
import { planApprovedEmailAutomation } from "../automations/messaging/plan-approved-email";
import { planChangesRequestedEmailAutomation } from "../automations/messaging/plan-changes-requested-email";
import { planSuggestionEmailAutomation } from "../automations/messaging/plan-suggestion-email";
import { logger } from "../infrastructure/logger";
import { getPlatformFlag, FLAG_EMAIL_NOTIFICATIONS_ENABLED } from "./platform-flags";
import { canQueueGenerationNotice } from "./itinerary-outcome-email";
import { escHtml, stripCrLf } from "../utils/email-escape";
import { PASSWORD_CHANGED_COPY } from "./password-changed-copy";
import type { OutboxHoldSummary } from "./email-outbox-expiry";
import { reconciliationKindLabel } from "@shared/reconciliation-kinds";
import { shapeAdminDigestLists } from "./admin-digest-shape";
import type { AdminAuditDigest } from "./admin-audit-digest";

/** Production send gate. Only the exact string true allows a provider call. */
export function emailSendsEnabled(value: string | undefined = process.env.EMAIL_SENDS_ENABLED): boolean {
  return value === "true";
}

/**
 * email_type names that may leave after EMAIL_SENDS_ENABLED. Unset, empty, or
 * only blanks allows nothing. There is no wildcard and no "all". Comparison is
 * exact and case-sensitive; spaces around items are ignored.
 */
export function emailTemplateAllowlist(value: string | undefined = process.env.EMAIL_TEMPLATE_ALLOWLIST): readonly string[] {
  if (typeof value !== "string" || value.length === 0) return [];
  const names: string[] = [];
  for (const part of value.split(",")) {
    const trimmed = part.trim();
    if (trimmed.length > 0) names.push(trimmed);
  }
  return names;
}

/** True only when emailType is one of the allowlist names, exactly. */
export function emailTemplateAllowed(
  emailType: string | null | undefined,
  allowlist: readonly string[] = emailTemplateAllowlist(),
): boolean {
  if (typeof emailType !== "string" || emailType.length === 0) return false;
  return allowlist.includes(emailType);
}

function createClient(key: string): Resend {
  const client = new Resend(key);
  const originalSend = client.emails.send.bind(client.emails);
  client.emails.send = wrapEmailProviderTransport(
    originalSend,
    dispatchMessagingEvent,
  ) as typeof client.emails.send;
  return client;
}

/** Reads EMAIL_REPLY_TO — the human-facing reply address. */
function getReplyToAddress(): string {
  return process.env.EMAIL_REPLY_TO ?? "";
}

export function getAppBaseUrl(): string {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL;
  const domains = process.env.REPLIT_DOMAINS;
  if (domains) {
    const primary = domains.split(",")[0].trim();
    return `https://${primary}`;
  }
  return "http://localhost:5000";
}

// escHtml / stripCrLf moved to ../utils/email-escape (ledger `2026-09-04-invite-mailer`) so a
// PURE payload builder can share them without importing this module, which reaches the DB through
// platform-flags. Re-exported so any existing deep import keeps resolving; call sites unchanged.
export { escHtml, stripCrLf } from "../utils/email-escape";

// ─── Generic sendEmail ──────────────────────────────────────────────────────

export interface SendEmailParams {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  /** Opt-in provider retry deduplication; existing callers retain their send behavior. */
  idempotencyKey?: string;
  /** Internal outbox opt-in; never forwarded to the email provider. */
  generationNotice?: boolean;
  /**
   * Password reset and email verification only. Skips the notifications kill
   * switch. Never forwarded to the provider. EMAIL_SENDS_ENABLED and the
   * development no-send gate still apply.
   */
  authCritical?: boolean;
  /** Optional files, including vendor coordination calendar invitations. */
  attachments?: Array<{ filename: string; content: Buffer | string; contentType?: string }>;
  /**
   * Same shape as email_outbox.email_type. Required. A missing or empty value
   * is refused and never sent. Not forwarded to the provider.
   */
  emailType: string;
  /**
   * An explicit address wins. Omitted, null, or blank uses EMAIL_REPLY_TO.
   * The send is refused when neither is set.
   */
  replyTo?: string | null;
}

export interface SendEmailResult {
  ok: boolean;
  id?: string;
  error?: string;
  /**
   * The provider was not called. `sends_disabled` is EMAIL_SENDS_ENABLED.
   * `development_gate` is canQueueGenerationNotice.
   * `kill_switch` is email_notifications_enabled.
   * `template_not_allowed` is a missing or unlisted emailType.
   * None of these is a failed attempt.
   */
  suppressed?: "sends_disabled" | "development_gate" | "kill_switch" | "template_not_allowed";
}

/**
 * Test seam for the one provider call. Production leaves it unset.
 * emailType is the required category; it is not part of the provider payload.
 */
export const _emailProviderTestHooks: {
  send?: (
    payload: {
      from: string;
      to: string | string[];
      subject: string;
      html: string;
      text?: string;
      replyTo?: string;
      attachments?: SendEmailParams["attachments"];
    },
    options: { idempotencyKey: string } | undefined,
    emailType: string,
  ) => Promise<{ data: { id?: string } | null; error: { message?: string } | null }>;
} = {};

/**
 * Low-level email sender. Validates all three required env vars and wraps
 * Resend in a try/catch so callers never receive an unhandled rejection.
 *
 * Returns { ok: true, id } on success or { ok: false, error } on failure —
 * it never throws into the caller.
 */
export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  // EMAIL_SENDS_ENABLED is in front of canQueueGenerationNotice and the admin
  // kill switch. Auth-critical mail does not skip it. Nothing about the
  // recipient is logged.
  if (!emailSendsEnabled()) {
    logger.warn(
      { reason: "EMAIL_SENDS_ENABLED", authCritical: params.authCritical === true },
      "[email] send refused; EMAIL_SENDS_ENABLED is not true",
    );
    return {
      ok: false,
      error: "EMAIL_SENDS_ENABLED is not true",
      suppressed: "sends_disabled",
    };
  }

  // canQueueGenerationNotice (server/services/itinerary-outcome-email.ts) is the
  // development no-send gate. It runs on the address this call would actually
  // hand the provider, before the kill switch and before Resend. A development
  // signup QA redirect therefore cannot skip it, and neither can an outbox retry.
  const recipients = Array.isArray(params.to) ? params.to : [params.to];
  if (!recipients.every((email) => canQueueGenerationNotice(email))) {
    return { ok: false, error: "No approved development inbox", suppressed: "development_gate" };
  }

  // Next production gate. Missing and unlisted types, including password reset
  // and verification, never reach the provider. The log names the type and
  // the reason, and not the recipient.
  const emailType = typeof params.emailType === "string" ? params.emailType : "";
  if (emailType.length === 0 || !emailTemplateAllowed(emailType)) {
    const reason = emailType.length === 0 ? "email_type_required" : "EMAIL_TEMPLATE_ALLOWLIST";
    logger.warn(
      { reason, emailType: emailType.length === 0 ? null : emailType },
      "[email] send refused; EMAIL_TEMPLATE_ALLOWLIST",
    );
    return { ok: false, error: reason, suppressed: "template_not_allowed" };
  }

  // Admin-controlled kill switch (/admin/system → "Email Notifications").
  // Auth-critical outbox rows (password reset, email verification) set
  // authCritical and are the only sends that skip this flag. They still
  // passed the development gate above.
  if (!params.authCritical) {
    const notificationsEnabled = await getPlatformFlag(FLAG_EMAIL_NOTIFICATIONS_ENABLED, true);
    if (!notificationsEnabled) {
      console.log(
        `[email] sendEmail skipped — email_notifications_enabled=false (subject="${params.subject}")`
      );
      return {
        ok: false,
        error: "Email notifications are disabled by platform settings",
        suppressed: "kill_switch",
      };
    }
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM_NOREPLY ?? process.env.EMAIL_FROM;
  const explicitReplyTo = typeof params.replyTo === "string" ? params.replyTo.trim() : "";
  const replyTo = explicitReplyTo || process.env.EMAIL_REPLY_TO || "";

  if (!apiKey) {
    console.error("[email] sendEmail: RESEND_API_KEY is not set");
    return { ok: false, error: "RESEND_API_KEY is not set" };
  }
  if (!from) {
    console.error("[email] sendEmail: EMAIL_FROM_NOREPLY is not set");
    return { ok: false, error: "EMAIL_FROM_NOREPLY is not set" };
  }
  if (!replyTo) {
    console.error("[email] sendEmail: EMAIL_REPLY_TO is not set and no replyTo provided");
    return { ok: false, error: "EMAIL_REPLY_TO is not set and no replyTo provided" };
  }

  try {
    const payload = {
      from,
      to: params.to,
      subject: params.subject,
      html: params.html,
      ...(params.text ? { text: params.text } : {}),
      replyTo,
      ...(params.attachments?.length ? { attachments: params.attachments } : {}),
    };
    const options = params.idempotencyKey ? { idempotencyKey: params.idempotencyKey } : undefined;
    const { data, error } = _emailProviderTestHooks.send
      ? await _emailProviderTestHooks.send(payload, options, emailType)
      : await createClient(apiKey).emails.send(payload, options);

    if (error) {
      console.error("[email] sendEmail Resend error:", {
        to: params.to,
        subject: params.subject,
        error,
      });
      return { ok: false, error: String((error as { message?: string }).message ?? error) };
    }

    const id = (data as { id?: string } | null)?.id;
    console.log(`[email] sendEmail ok — id=${id} subject="${params.subject}" to=${Array.isArray(params.to) ? params.to.join(", ") : params.to}`);
    return { ok: true, id };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[email] sendEmail threw:", { to: params.to, subject: params.subject, error: message });
    return { ok: false, error: message };
  }
}

export interface BookingConfirmationParams {
  toEmail: string;
  userName: string;
  bookingId: string;
  bookingTitle: string;
  bookingDate?: string | null;
  confirmationCode: string;
}

/**
 * Build the subject/html/text payload for a booking confirmation email without
 * sending it. Exported so email-outbox.service.ts can enqueue the payload
 * without a circular dependency back into this module.
 */
export function buildBookingConfirmationEmailPayload(params: BookingConfirmationParams): {
  subject: string;
  html: string;
  text: string;
} {
  const greeting = params.userName ? `Hi ${escHtml(params.userName)},` : "Hi,";
  const myBookingsUrl = `${getAppBaseUrl()}/my-bookings`;
  const dateLine = params.bookingDate
    ? `<tr style="background: #F3F4F6;">
         <td style="padding: 12px 16px; color: #6B7280;">Date</td>
         <td style="padding: 12px 16px; color: #111827; font-weight: 600;">${escHtml(params.bookingDate)}</td>
       </tr>`
    : "";
  const datePlain = params.bookingDate ? `Date:              ${params.bookingDate}\n` : "";

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #FF385C; margin-bottom: 8px;">Booking Confirmed!</h2>
      <p style="color: #374151;">${greeting}</p>
      <p style="color: #374151;">
        Your booking is confirmed. Here are your details:
      </p>
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0; background: #F9FAFB; border-radius: 8px; overflow: hidden;">
        <tr>
          <td style="padding: 12px 16px; color: #6B7280; width: 40%;">Booking</td>
          <td style="padding: 12px 16px; color: #111827; font-weight: 600;">${escHtml(params.bookingTitle)}</td>
        </tr>
        ${dateLine}
        <tr>
          <td style="padding: 12px 16px; color: #6B7280;">Confirmation code</td>
          <td style="padding: 12px 16px; color: #111827; font-weight: 600; font-family: monospace; letter-spacing: 1px;">${escHtml(params.confirmationCode)}</td>
        </tr>
      </table>
      <a href="${myBookingsUrl}"
         style="display: inline-block; background: #FF385C; color: #ffffff; text-decoration: none;
                padding: 12px 24px; border-radius: 6px; font-weight: 600; margin-top: 8px;">
        View My Bookings
      </a>
      <p style="color: #9CA3AF; font-size: 12px; margin-top: 32px;">
        You're receiving this because you made a booking on Traveloure.<br>
        View your bookings at <a href="${myBookingsUrl}" style="color: #FF385C;">${myBookingsUrl}</a>.
      </p>
    </div>
  `;

  const text = [
    `Booking Confirmed!`,
    ``,
    greeting,
    ``,
    `Your booking is confirmed. Here are your details:`,
    ``,
    `Booking:           ${params.bookingTitle}`,
    datePlain.trimEnd(),
    `Confirmation code: ${params.confirmationCode}`,
    ``,
    `View your bookings: ${myBookingsUrl}`,
  ].filter(line => line !== "").join("\n");

  return {
    subject: `Your booking is confirmed — ${stripCrLf(params.bookingTitle)}`,
    html,
    text,
  };
}

// ─── Occasion reminder (Plus scheduled draft) ────────────────────────────────
// Ledger 2026-08-27-plus-is-delivery. One email per generated occasion draft, deep-linking to the
// slip. The occasion_drafts ledger (notified_at) guards against a second send — this builder just
// shapes the message. Go through enqueueEmail so the platform kill switch is honored and the send
// is persisted/retried (there is no per-user email-preference table in this codebase today).
export interface OccasionReminderParams {
  firstName?: string | null;
  occasionLabel: string;
  homeCity: string;
  tripId: string;
  daysUntil: number;
}

export function buildOccasionReminderEmailPayload(params: OccasionReminderParams): {
  subject: string;
  html: string;
  text: string;
} {
  const greeting = params.firstName ? `Hi ${escHtml(params.firstName)},` : "Hi,";
  const tripUrl = `${getAppBaseUrl()}/trip/${encodeURIComponent(params.tripId)}?tab=itinerary`;
  const label = escHtml(params.occasionLabel);
  const city = escHtml(params.homeCity);
  const when =
    params.daysUntil <= 0
      ? "is today"
      : params.daysUntil === 1
        ? "is tomorrow"
        : `is in ${params.daysUntil} days`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #FF385C; margin-bottom: 8px;">${label} ${when}</h2>
      <p style="color: #374151;">${greeting}</p>
      <p style="color: #374151;">
        <strong>${label}</strong> ${when} — and a plan built for <strong>${city}</strong> is ready in your account.
        We drafted it from your city so you can make the day yours with a few taps.
      </p>
      <a href="${tripUrl}"
         style="display: inline-block; background: #FF385C; color: #ffffff; text-decoration: none;
                padding: 12px 24px; border-radius: 6px; font-weight: 600; margin-top: 8px;">
        View your plan
      </a>
      <p style="color: #9CA3AF; font-size: 12px; margin-top: 32px;">
        You're receiving this because you're a Traveloure Plus member and added this occasion to your calendar.<br>
        Open your plan at <a href="${tripUrl}" style="color: #FF385C;">${tripUrl}</a>.
      </p>
    </div>
  `;

  const text = [
    `${params.occasionLabel} ${when}`,
    ``,
    greeting,
    ``,
    `${params.occasionLabel} ${when} — and a plan built for ${params.homeCity} is ready in your account.`,
    `We drafted it from your city so you can make the day yours.`,
    ``,
    `View your plan: ${tripUrl}`,
  ].filter((line) => line !== "").join("\n");

  return {
    subject: `${stripCrLf(params.occasionLabel)} ${when} — a plan for ${stripCrLf(params.homeCity)} is ready`,
    html,
    text,
  };
}

// ─── Ready-made store: purchase delivered / revision requested ───────────────
// Ledger 2026-09-14-readymade-notifications. Pure BUILDERS only (the
// buildOccasionReminderEmailPayload precedent): the ready-made rail enqueues these through the
// EXISTING outbox (`enqueueEmail`), so the platform kill switch, the retry schedule and the admin
// visibility are the ones every other transactional email already has — no new sender (§18 rule 1).
//
// §13 GOVERNS THE COPY AND IS THE POINT. What the buyer has bought is a PLAN — an editable trip
// in their account, carrying PLACEHOLDER DATES they re-date themselves. It is NOT a finished trip
// and NOTHING in it is booked; the clone deliberately carries no booking linkage at all
// (ledger 2026-09-13-clone-carries-content-not-state). Neither builder may say or imply otherwise,
// and neither states anything about what happens next beyond the ONE REVISION entitlement, which IS
// true of every purchase (ledger 2026-08-22-concierge-p3 (a); narrowed to the revision alone by the
// decision-maker ruling of 2026-09-15 — punchlist D-2, ledger
// `2026-09-15-d2-one-revision-not-a-consultation`: only the revision has storage and a rail, so a
// consultation is never promised here).
//
// D-3 (decision-maker ruling 2026-09-15, option A; ledger `2026-09-15-d3-readymade-separate-checkout`):
// a ready-made trip and a service booking are NEVER mixed in one checkout. What this email reports
// paid is the PLAN — its own PaymentIntent against `ready_made_trips`. Every bookable thing inside
// the plan is a separate reservation at its own listing price, carted by the buyer on the slip
// (LD 39). The delivered email already said nothing is booked; it now also says the bookings are a
// separate purchase, because "not booked yet" alone still leaves "…and already paid for" available
// to the reader (§13).

export interface ReadyMadeDeliveredEmailParams {
  firstName?: string | null;
  listingTitle: string;
  market?: string | null;
  tripId: string;
  /** What the buyer's purchase ROW records was paid. Never recomputed from the listing (§14). */
  pricePaidCents: number;
  currency: string;
}

/** `1250` + `"USD"` → `"USD 12.50"`. Deliberately dumb: the row's own number, never a rate. */
function formatPaidAmount(cents: number, currency: string): string {
  const code = stripCrLf(String(currency || "USD")).toUpperCase().slice(0, 10);
  const major = (Number(cents) / 100).toFixed(2);
  return `${code} ${major}`;
}

export function buildReadyMadeDeliveredEmailPayload(params: ReadyMadeDeliveredEmailParams): {
  subject: string;
  html: string;
  text: string;
} {
  const greeting = params.firstName ? `Hi ${escHtml(params.firstName)},` : "Hi,";
  const planUrl = `${getAppBaseUrl()}/plans/${encodeURIComponent(params.tripId)}`;
  const title = escHtml(params.listingTitle);
  const amount = escHtml(formatPaidAmount(params.pricePaidCents, params.currency));
  // §13: a market we were not told is simply not mentioned — never "somewhere", never a guess.
  const whereLine = params.market ? ` for ${escHtml(params.market)}` : "";

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #FF385C; margin-bottom: 8px;">Your plan is in your account</h2>
      <p style="color: #374151;">${greeting}</p>
      <p style="color: #374151;">
        Thanks for your purchase of <strong>${title}</strong>${whereLine}. We have copied it into your
        account as your own editable plan.
      </p>
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0; background: #F9FAFB; border-radius: 8px; overflow: hidden;">
        <tr>
          <td style="padding: 12px 16px; color: #6B7280; width: 40%;">Plan</td>
          <td style="padding: 12px 16px; color: #111827; font-weight: 600;">${title}</td>
        </tr>
        <tr style="background: #F3F4F6;">
          <td style="padding: 12px 16px; color: #6B7280;">Paid</td>
          <td style="padding: 12px 16px; color: #111827; font-weight: 600;">${amount}</td>
        </tr>
      </table>
      <p style="color: #374151;">
        It opens on <strong>placeholder dates</strong> — set your real dates on the plan and everything
        moves with them. Nothing in the plan is booked yet: each item is a recommendation you can book,
        change or remove.
      </p>
      <p style="color: #374151;">
        What you paid for is the plan itself. Stays, tours, transport and anything else it recommends
        are booked separately, each at its own price.
      </p>
      <p style="color: #374151;">
        Your purchase also includes one revision with the expert who built it. You can request it
        from the plan whenever you are ready.
      </p>
      <a href="${planUrl}"
         style="display: inline-block; background: #FF385C; color: #ffffff; text-decoration: none;
                padding: 12px 24px; border-radius: 6px; font-weight: 600; margin-top: 8px;">
        Open your plan
      </a>
      <p style="color: #9CA3AF; font-size: 12px; margin-top: 32px;">
        You're receiving this because you bought a ready-made plan on Traveloure.<br>
        Find it any time under My plans, or at <a href="${planUrl}" style="color: #FF385C;">${planUrl}</a>.
      </p>
    </div>
  `;

  const text = [
    `Your plan is in your account`,
    ``,
    greeting,
    ``,
    `Thanks for your purchase of ${params.listingTitle}${params.market ? ` for ${params.market}` : ""}.`,
    `We have copied it into your account as your own editable plan.`,
    ``,
    `Plan: ${params.listingTitle}`,
    `Paid: ${formatPaidAmount(params.pricePaidCents, params.currency)}`,
    ``,
    `It opens on placeholder dates — set your real dates on the plan and everything moves with them.`,
    `Nothing in the plan is booked yet: each item is a recommendation you can book, change or remove.`,
    ``,
    `What you paid for is the plan itself. Stays, tours, transport and anything else it recommends`,
    `are booked separately, each at its own price.`,
    ``,
    `Your purchase also includes one revision with the expert who built it.`,
    ``,
    `Open your plan: ${planUrl}`,
  ].join("\n");

  return {
    subject: `Your plan is ready — ${stripCrLf(params.listingTitle)}`,
    html,
    text,
  };
}

export interface ReadyMadeRevisionRequestedEmailParams {
  firstName?: string | null;
  listingTitle: string;
  tripId: string;
  /** The buyer's own words, or null when they sent none. NULL is never rendered as "no note". */
  note?: string | null;
}

export function buildReadyMadeRevisionRequestedEmailPayload(
  params: ReadyMadeRevisionRequestedEmailParams,
): { subject: string; html: string; text: string } {
  const greeting = params.firstName ? `Hi ${escHtml(params.firstName)},` : "Hi,";
  const workspaceUrl = `${getAppBaseUrl()}/expert/workspace/${encodeURIComponent(params.tripId)}`;
  const title = escHtml(params.listingTitle);
  const note = params.note?.trim() ? params.note.trim() : null;
  const noteHtml = note
    ? `<blockquote style="margin: 16px 0; padding: 12px 16px; border-left: 3px solid #FF385C;
         background: #F9FAFB; color: #374151;">${escHtml(note)}</blockquote>`
    : "";

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #FF385C; margin-bottom: 8px;">A buyer requested their included revision</h2>
      <p style="color: #374151;">${greeting}</p>
      <p style="color: #374151;">
        A buyer of <strong>${title}</strong> has requested the revision included with their purchase.
        You now have edit access to their copy of the plan.
      </p>
      ${noteHtml}
      <a href="${workspaceUrl}"
         style="display: inline-block; background: #FF385C; color: #ffffff; text-decoration: none;
                padding: 12px 24px; border-radius: 6px; font-weight: 600; margin-top: 8px;">
        Open the workspace
      </a>
      <p style="color: #9CA3AF; font-size: 12px; margin-top: 32px;">
        You're receiving this because you sell this plan on Traveloure.<br>
        Open it at <a href="${workspaceUrl}" style="color: #FF385C;">${workspaceUrl}</a>.
      </p>
    </div>
  `;

  const text = [
    `A buyer requested their included revision`,
    ``,
    greeting,
    ``,
    `A buyer of ${params.listingTitle} has requested the revision included with their purchase.`,
    `You now have edit access to their copy of the plan.`,
    ...(note ? [``, `They wrote: ${note}`] : []),
    ``,
    `Open the workspace: ${workspaceUrl}`,
  ].join("\n");

  return {
    subject: `Revision requested — ${stripCrLf(params.listingTitle)}`,
    html,
    text,
  };
}

export interface BookingAlertParams {
  providerEmail: string;
  providerName: string;
  bookingId: string;
  serviceName: string;
  travelerName: string;
  amount: string;
}

/**
 * The provider's "new booking request" email, as a payload (board task #1564, ledger
 * `2026-09-23-phase2-messages`). Pure. It is SENT only through the retrying outbox
 * (`enqueueBookingAlertEmail` in email-outbox.service.ts): the old direct Resend send had no retry
 * and no record, so a Resend outage silently lost the alert. The direct sender is deleted (§18c).
 */
export function buildBookingAlertEmailPayload(params: BookingAlertParams): { subject: string; html: string; text: string } {
  // C5: /expert/bookings retired — new booking requests land on Inbox's Queue tab.
  const bookingsUrl = `${getAppBaseUrl()}/expert/inbox`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #FF385C; margin-bottom: 8px;">New Booking Request</h2>
      <p style="color: #374151;">Hi ${escHtml(params.providerName)},</p>
      <p style="color: #374151;">You have a new booking request on Traveloure.</p>
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0; background: #F9FAFB; border-radius: 8px; overflow: hidden;">
        <tr>
          <td style="padding: 12px 16px; color: #6B7280; width: 40%;">Service</td>
          <td style="padding: 12px 16px; color: #111827; font-weight: 600;">${escHtml(params.serviceName)}</td>
        </tr>
        <tr style="background: #F3F4F6;">
          <td style="padding: 12px 16px; color: #6B7280;">Traveler</td>
          <td style="padding: 12px 16px; color: #111827; font-weight: 600;">${escHtml(params.travelerName)}</td>
        </tr>
        <tr>
          <td style="padding: 12px 16px; color: #6B7280;">Amount</td>
          <td style="padding: 12px 16px; color: #111827; font-weight: 600;">$${escHtml(params.amount)}</td>
        </tr>
        <tr style="background: #F3F4F6;">
          <td style="padding: 12px 16px; color: #6B7280;">Booking ID</td>
          <td style="padding: 12px 16px; color: #6B7280; font-size: 12px;">${escHtml(params.bookingId)}</td>
        </tr>
      </table>
      <a href="${bookingsUrl}"
         style="display: inline-block; background: #FF385C; color: #ffffff; text-decoration: none;
                padding: 12px 24px; border-radius: 6px; font-weight: 600; margin-top: 8px;">
        View Booking
      </a>
      <p style="color: #9CA3AF; font-size: 12px; margin-top: 32px;">
        You're receiving this because you're an expert or provider on Traveloure.<br>
        Manage your bookings at <a href="${bookingsUrl}" style="color: #FF385C;">${bookingsUrl}</a>.
      </p>
    </div>
  `;

  const text = [
    `New Booking Request`,
    ``,
    `Hi ${params.providerName},`,
    ``,
    `You have a new booking request on Traveloure.`,
    ``,
    `Service:   ${params.serviceName}`,
    `Traveler:  ${params.travelerName}`,
    `Amount:    $${params.amount}`,
    `Booking:   ${params.bookingId}`,
    ``,
    `View your bookings: ${bookingsUrl}`,
  ].join("\n");

  return {
    subject: `New booking request: ${stripCrLf(params.serviceName)}`,
    html,
    text,
  };
}

interface PasswordResetParams {
  toEmail: string;
  firstName?: string | null;
  resetUrl: string;
  expiresInMinutes: number;
  /** Expiry minted with the token. Retries keep this instant and the same link. */
  linkExpiresAt?: Date;
  /** sha256 of the raw token. Metadata stores this, never the raw token. */
  tokenHash?: string;
}

function applicationNoteKey(message: string | null | undefined): string {
  return crypto.createHash("sha256").update(message ?? "").digest("hex").slice(0, 16);
}

/** One outbox row per logical send. A missing id still enqueues; it just cannot dedupe. */
function criticalDedupeKey(parts: Array<string | null | undefined>): string | undefined {
  if (parts.some((part) => part == null)) return undefined;
  return parts.join(":");
}

/**
 * Durable enqueue. Never throws. Delivery, retry, the kill switch and the
 * development no-send gate belong to the outbox drain.
 */
async function enqueueTransactionalEmail(input: {
  emailType: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  authCritical?: boolean;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const { enqueueEmail } = await import("./email-outbox.service");
    await enqueueEmail({
      emailType: input.emailType,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      authCritical: input.authCritical,
      metadata: input.metadata,
    });
  } catch (err) {
    console.error(`[email] ${input.emailType} outbox enqueue failed (non-fatal):`, err);
  }
}

export async function sendPasswordResetEmail(params: PasswordResetParams): Promise<void> {
  return dispatchMessagingProducer(
    authPasswordResetEmailAutomation,
    dispatchMessagingEvent,
    "auth.password_reset_email",
    params,
    {},
    () => sendPasswordResetEmailAction(params),
  );
}

async function sendPasswordResetEmailAction(params: PasswordResetParams): Promise<void> {
  const greeting = params.firstName ? `Hi ${escHtml(params.firstName)},` : "Hi,";
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #FF385C; margin-bottom: 8px;">Reset your Traveloure password</h2>
      <p style="color: #374151;">${greeting}</p>
      <p style="color: #374151;">
        We received a request to reset your password. Click the button below to choose a new one.
        This link expires in ${params.expiresInMinutes} minutes and can only be used once.
      </p>
      <p style="margin: 24px 0;">
        <a href="${params.resetUrl}"
           style="display: inline-block; background: #FF385C; color: #ffffff; text-decoration: none;
                  padding: 12px 24px; border-radius: 6px; font-weight: 600;">
          Reset password
        </a>
      </p>
      <p style="color: #6B7280; font-size: 13px;">
        Or paste this link into your browser:<br>
        <span style="color: #374151; word-break: break-all;">${params.resetUrl}</span>
      </p>
      <p style="color: #9CA3AF; font-size: 12px; margin-top: 32px;">
        If you didn't request a password reset, you can safely ignore this email — your password
        won't change.
      </p>
    </div>
  `;

  const text = [
    `Reset your Traveloure password`,
    ``,
    greeting,
    ``,
    `We received a request to reset your password. This link expires in ${params.expiresInMinutes} minutes and can only be used once:`,
    ``,
    params.resetUrl,
    ``,
    `If you didn't request a password reset, you can safely ignore this email.`,
  ].join("\n");

  await enqueueTransactionalEmail({
    emailType: "password_reset",
    to: params.toEmail,
    subject: "Reset your Traveloure password",
    text,
    html,
    authCritical: true,
    metadata: {
      ...(params.tokenHash ? { dedupeKey: `password_reset:${params.tokenHash}` } : {}),
      ...(params.linkExpiresAt ? { linkExpiresAt: params.linkExpiresAt.toISOString() } : {}),
      authCritical: true,
    },
  });
}

interface EmailVerificationParams {
  toEmail: string;
  firstName?: string | null;
  verifyUrl: string;
  expiresInHours: number;
  /** Expiry minted with the token (24h from issue). Retries do not extend it. */
  linkExpiresAt?: Date;
  /** sha256 of the raw token. Metadata stores this, never the raw token. */
  tokenHash?: string;
}

export async function sendEmailVerificationEmail(params: EmailVerificationParams): Promise<void> {
  return dispatchMessagingProducer(
    authVerificationEmailAutomation,
    dispatchMessagingEvent,
    "auth.verification_email",
    params,
    {},
    () => sendEmailVerificationEmailAction(params),
  );
}

async function sendEmailVerificationEmailAction(params: EmailVerificationParams): Promise<void> {
  const greeting = params.firstName ? `Hi ${escHtml(params.firstName)},` : "Hi,";
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #FF385C; margin-bottom: 8px;">Confirm your email</h2>
      <p style="color: #374151;">${greeting}</p>
      <p style="color: #374151;">
        Thanks for signing up for Traveloure. Click the button below to confirm your email address
        and finish setting up your account. This link expires in ${params.expiresInHours} hours.
      </p>
      <p style="margin: 24px 0;">
        <a href="${params.verifyUrl}"
           style="display: inline-block; background: #FF385C; color: #ffffff; text-decoration: none;
                  padding: 12px 24px; border-radius: 6px; font-weight: 600;">
          Confirm email
        </a>
      </p>
      <p style="color: #6B7280; font-size: 13px;">
        Or paste this link into your browser:<br>
        <span style="color: #374151; word-break: break-all;">${params.verifyUrl}</span>
      </p>
      <p style="color: #9CA3AF; font-size: 12px; margin-top: 32px;">
        If you didn't sign up for Traveloure, you can safely ignore this email.
      </p>
    </div>
  `;

  const text = [
    `Confirm your email`,
    ``,
    greeting,
    ``,
    `Thanks for signing up for Traveloure. Use this link to confirm your email address — it expires in ${params.expiresInHours} hours:`,
    ``,
    params.verifyUrl,
    ``,
    `If you didn't sign up for Traveloure, you can safely ignore this email.`,
  ].join("\n");

  await enqueueTransactionalEmail({
    emailType: "email_verification",
    to: params.toEmail,
    subject: "Confirm your Traveloure email",
    text,
    html,
    authCritical: true,
    metadata: {
      ...(params.tokenHash ? { dedupeKey: `email_verification:${params.tokenHash}` } : {}),
      ...(params.linkExpiresAt ? { linkExpiresAt: params.linkExpiresAt.toISOString() } : {}),
      authCritical: true,
    },
  });
}

/**
 * Test seam. Unset in production, so the sender calls enqueueTransactionalEmail.
 * A test may set enqueueEmail to throw; this function still does not throw.
 */
export const _passwordChangedNoticeTestHooks: {
  enqueueEmail?: (input: {
    emailType: string;
    to: string;
    subject: string;
    html: string;
    text: string;
    authCritical?: boolean;
    metadata?: Record<string, unknown>;
  }) => Promise<unknown>;
} = {};

/** One notice per reset token. No link, no token, no timestamp. Never throws. */
export async function sendPasswordChangedEmail(params: {
  toEmail: string;
  firstName?: string | null;
  tokenHash: string;
}): Promise<void> {
  try {
    const greeting = params.firstName ? `Hi ${escHtml(params.firstName)},` : "Hi,";
    const heading = PASSWORD_CHANGED_COPY.heading;
    const paragraphs = PASSWORD_CHANGED_COPY.body.map((line) => escHtml(line));
    const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #FF385C; margin-bottom: 8px;">${escHtml(heading)}</h2>
      <p style="color: #374151;">${greeting}</p>
      ${paragraphs.map((line) => `<p style="color: #374151;">${line}</p>`).join("\n")}
    </div>
  `;
    const text = [
      heading,
      ``,
      greeting,
      ``,
      ...PASSWORD_CHANGED_COPY.body,
    ].join("\n");
    const payload = {
      emailType: "password_changed",
      to: params.toEmail,
      subject: PASSWORD_CHANGED_COPY.subject,
      text,
      html,
      authCritical: true,
      metadata: {
        dedupeKey: `password_changed:${params.tokenHash}`,
        authCritical: true,
      },
    };
    if (_passwordChangedNoticeTestHooks.enqueueEmail) {
      await _passwordChangedNoticeTestHooks.enqueueEmail(payload);
      return;
    }
    await enqueueTransactionalEmail(payload);
  } catch (err) {
    console.error("[email] password_changed outbox enqueue failed (non-fatal):", err);
  }
}

// ─── Booking Decline ────────────────────────────────────────────────────────

export interface BookingDeclineEmailParams {
  toEmail: string;
  travelerName?: string | null;
  bookingTrackingNumber?: string | null;
  /** Booking id. Present callers dedupe one decline notice per booking. */
  bookingId?: string | null;
  /** Human-readable service/product title for the declined booking. */
  serviceName?: string | null;
  /** Decline reason provided by the expert/provider, or null if none given. */
  declineReason?: string | null;
}

/**
 * Sends a decline notification email to the traveler when an expert or provider
 * rejects their booking request. The email surfaces the decline reason so the
 * traveler does not have to check the in-app notification.
 *
 * Enqueued. An unlisted type stays a held outbox row. The drain sends the stored body.
 */
export async function sendBookingDeclineEmail(
  params: BookingDeclineEmailParams
): Promise<void> {
  const greeting = params.travelerName
    ? `Hi ${escHtml(params.travelerName)},`
    : "Hi,";
  const bookingLabel = params.bookingTrackingNumber
    ? `booking ${escHtml(params.bookingTrackingNumber)}`
    : "your booking";
  const serviceLabel = params.serviceName ? escHtml(params.serviceName) : null;
  const myBookingsUrl = `${getAppBaseUrl()}/bookings`;

  const reasonBlock = params.declineReason
    ? `<tr style="background: #FEF2F2;">
         <td style="padding: 12px 16px; color: #6B7280; width: 40%;">Reason</td>
         <td style="padding: 12px 16px; color: #111827;">${escHtml(params.declineReason)}</td>
       </tr>`
    : "";
  const reasonPlain = params.declineReason
    ? `Reason:   ${params.declineReason}\n`
    : "";

  const serviceRow = serviceLabel
    ? `<tr style="background: #F3F4F6;">
         <td style="padding: 12px 16px; color: #6B7280;">Service</td>
         <td style="padding: 12px 16px; color: #111827; font-weight: 600;">${serviceLabel}</td>
       </tr>`
    : "";
  const servicePlain = params.serviceName
    ? `Service:  ${params.serviceName}\n`
    : "";

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #374151; margin-bottom: 8px;">Booking Declined</h2>
      <p style="color: #374151;">${greeting}</p>
      <p style="color: #374151;">
        Unfortunately, the provider was unable to accept ${bookingLabel}. No charge has been made.
      </p>
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0; background: #F9FAFB; border-radius: 8px; overflow: hidden;">
        ${serviceRow}
        ${reasonBlock}
      </table>
      <p style="color: #374151;">
        You can browse other services or contact our support team if you have questions.
      </p>
      <a href="${myBookingsUrl}"
         style="display: inline-block; background: #FF385C; color: #ffffff; text-decoration: none;
                padding: 12px 24px; border-radius: 6px; font-weight: 600; margin-top: 8px;">
        View My Bookings
      </a>
      <p style="color: #9CA3AF; font-size: 12px; margin-top: 32px;">
        You're receiving this because you made a booking request on Traveloure.<br>
        View your bookings at <a href="${myBookingsUrl}" style="color: #FF385C;">${myBookingsUrl}</a>.
      </p>
    </div>
  `;

  const text = [
    `Booking Declined`,
    ``,
    greeting,
    ``,
    `Unfortunately, the provider was unable to accept ${
      params.bookingTrackingNumber ? `booking ${params.bookingTrackingNumber}` : "your booking"
    }. No charge has been made.`,
    ``,
    servicePlain.trimEnd(),
    reasonPlain.trimEnd(),
    `View your bookings: ${myBookingsUrl}`,
  ]
    .filter((line) => line !== "")
    .join("\n");

  const subject = params.serviceName
    ? `Your booking request for ${stripCrLf(params.serviceName)} was declined`
    : "Your booking request was declined";

  await enqueueTransactionalEmail({
    emailType: "booking_decline",
    to: params.toEmail,
    subject,
    html,
    text,
    metadata: {
      ...(params.bookingId
        ? { bookingId: params.bookingId, dedupeKey: `booking_decline:${params.bookingId}` }
        : {}),
      ...(params.bookingTrackingNumber ? { bookingTrackingNumber: params.bookingTrackingNumber } : {}),
    },
  });
}

// ─── Booking Cancellation with Refund ─────────────────────────────────────

export interface BookingCancellationWithRefundEmailParams {
  toEmail: string;
  travelerName?: string | null;
  bookingTrackingNumber?: string | null;
  serviceName?: string | null;
  /** Refund amount in dollars (already paid booking, provider-initiated cancel). */
  refundAmount: number;
  /** Cancellation reason provided by the provider, or null if none given. */
  cancellationReason?: string | null;
  /** One outbox row per booking. The email body does not include this id. */
  bookingId?: string;
}

/**
 * Sends a cancellation + full-refund notification email to the traveler when a
 * provider cancels an already-paid booking. Unlike the decline email, this
 * explicitly states that a full refund has been issued and names the amount.
 *
 * Enqueued through the outbox, so the drain's kill switch and retry apply.
 */
export async function sendBookingCancellationWithRefundEmail(
  params: BookingCancellationWithRefundEmailParams
): Promise<void> {
  const greeting = params.travelerName
    ? `Hi ${escHtml(params.travelerName)},`
    : "Hi,";
  const bookingLabel = params.bookingTrackingNumber
    ? `booking ${escHtml(params.bookingTrackingNumber)}`
    : "your booking";
  const serviceLabel = params.serviceName ? escHtml(params.serviceName) : null;
  const myBookingsUrl = `${getAppBaseUrl()}/bookings`;
  const refundStr = params.refundAmount.toFixed(2);

  const reasonBlock = params.cancellationReason
    ? `<tr style="background: #FEF2F2;">
         <td style="padding: 12px 16px; color: #6B7280; width: 40%;">Reason</td>
         <td style="padding: 12px 16px; color: #111827;">${escHtml(params.cancellationReason)}</td>
       </tr>`
    : "";
  const reasonPlain = params.cancellationReason
    ? `Reason:   ${params.cancellationReason}\n`
    : "";

  const serviceRow = serviceLabel
    ? `<tr style="background: #F3F4F6;">
         <td style="padding: 12px 16px; color: #6B7280;">Service</td>
         <td style="padding: 12px 16px; color: #111827; font-weight: 600;">${serviceLabel}</td>
       </tr>`
    : "";
  const servicePlain = params.serviceName
    ? `Service:  ${params.serviceName}\n`
    : "";

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #374151; margin-bottom: 8px;">Booking Cancelled — Full Refund Issued</h2>
      <p style="color: #374151;">${greeting}</p>
      <p style="color: #374151;">
        The provider has cancelled ${bookingLabel}. A full refund of
        <strong>$${escHtml(refundStr)}</strong> has been issued to your original payment method.
        Refunds typically appear within 5–10 business days depending on your bank.
      </p>
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0; background: #F9FAFB; border-radius: 8px; overflow: hidden;">
        ${serviceRow}
        <tr>
          <td style="padding: 12px 16px; color: #6B7280; width: 40%;">Refund amount</td>
          <td style="padding: 12px 16px; color: #111827; font-weight: 600;">$${escHtml(refundStr)}</td>
        </tr>
        ${reasonBlock}
      </table>
      <p style="color: #374151;">
        You can browse other services or contact our support team if you have questions.
      </p>
      <a href="${myBookingsUrl}"
         style="display: inline-block; background: #FF385C; color: #ffffff; text-decoration: none;
                padding: 12px 24px; border-radius: 6px; font-weight: 600; margin-top: 8px;">
        View My Bookings
      </a>
      <p style="color: #9CA3AF; font-size: 12px; margin-top: 32px;">
        You're receiving this because you made a booking on Traveloure.<br>
        View your bookings at <a href="${myBookingsUrl}" style="color: #FF385C;">${myBookingsUrl}</a>.
      </p>
    </div>
  `;

  const text = [
    `Booking Cancelled — Full Refund Issued`,
    ``,
    greeting,
    ``,
    `The provider has cancelled ${
      params.bookingTrackingNumber ? `booking ${params.bookingTrackingNumber}` : "your booking"
    }. A full refund of $${refundStr} has been issued to your original payment method.`,
    ``,
    servicePlain.trimEnd(),
    `Refund amount: $${refundStr}`,
    reasonPlain.trimEnd(),
    ``,
    `View your bookings: ${myBookingsUrl}`,
  ]
    .filter((line) => line !== "")
    .join("\n");

  const subject = params.serviceName
    ? `Your booking for ${stripCrLf(params.serviceName)} was cancelled — full refund issued`
    : "Your booking was cancelled — full refund issued";

  await enqueueTransactionalEmail({
    emailType: "cancellation_refund",
    to: params.toEmail,
    subject,
    html,
    text,
    metadata: {
      ...(params.bookingId ? { bookingId: params.bookingId, dedupeKey: `cancellation_refund:${params.bookingId}` } : {}),
    },
  });
}

// ─── Late payment refunded (R162, ledger `2026-09-27-failed-is-final`) ─────

export interface LateSuccessRefundEmailParams {
  toEmail: string;
  travelerName?: string | null;
  serviceName?: string | null;
  /** Dollars refunded — what Stripe says the payment took, all of it. */
  refundAmount: number;
}

/**
 * R162: the traveler was told "Payment didn't go through", then the SAME payment went through
 * anyway. `failed` is final, so nothing was booked and the money was refunded automatically. This
 * says exactly that, so money reappearing on the card is never unexplained — and it says it is NOT a
 * new charge. Sent ONCE, by the caller that holds the notice claim (`refundLateSuccessOnFailedIntent`).
 * Uses `sendEmail`, so the platform email kill switch applies. Never throws.
 */
export async function sendLateSuccessRefundEmail(params: LateSuccessRefundEmailParams): Promise<void> {
  const greeting = params.travelerName ? `Hi ${escHtml(params.travelerName)},` : "Hi,";
  const what = params.serviceName ? `your payment for <strong>${escHtml(params.serviceName)}</strong>` : "your payment";
  const whatPlain = params.serviceName ? `your payment for "${params.serviceName}"` : "your payment";
  const refundStr = params.refundAmount.toFixed(2);
  const bookingsUrl = `${getAppBaseUrl()}/my-bookings`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #374151; margin-bottom: 8px;">Your payment was refunded</h2>
      <p style="color: #374151;">${greeting}</p>
      <p style="color: #374151;">
        Earlier we told you ${what} didn't go through. The payment then went through after that,
        but by then the booking had already been closed, so <strong>nothing was booked</strong>.
      </p>
      <p style="color: #374151;">
        We have refunded <strong>$${escHtml(refundStr)}</strong> to your original payment method
        automatically. <strong>This is not a new charge</strong> — it is that payment coming back to you.
        Refunds typically appear within 5–10 business days depending on your bank.
      </p>
      <p style="color: #374151;">If you still want this booking, you can book it again from your plan.</p>
      <a href="${bookingsUrl}"
         style="display: inline-block; background: #FF385C; color: #ffffff; text-decoration: none;
                padding: 12px 24px; border-radius: 6px; font-weight: 600; margin-top: 8px;">
        View My Bookings
      </a>
    </div>
  `;
  const text = [
    `Your payment was refunded`,
    ``,
    params.travelerName ? `Hi ${params.travelerName},` : "Hi,",
    ``,
    `Earlier we told you ${whatPlain} didn't go through. The payment then went through after that,`,
    `but by then the booking had already been closed, so nothing was booked.`,
    ``,
    `We have refunded $${refundStr} to your original payment method automatically.`,
    `This is not a new charge — it is that payment coming back to you.`,
    ``,
    `If you still want this booking, you can book it again from your plan: ${bookingsUrl}`,
  ].join("\n");
  const result = await sendEmail({
    to: params.toEmail,
    subject: "Your payment was refunded — nothing was booked",
    html,
    text,
    emailType: "late_success_refund",
  });
  if (result.suppressed) {
    console.warn(`[email] sendLateSuccessRefundEmail not sent (${result.suppressed})`);
  } else if (!result.ok) {
    console.warn(`[email] sendLateSuccessRefundEmail failed for ${params.toEmail}:`, result.error);
  } else {
    console.log(`[email] late-success refund email sent to ${params.toEmail}`);
  }
}

export interface ExpiredClaimEmailParams {
  toEmail: string;
  travelerName?: string | null;
  serviceName?: string | null;
  /** The plan the item went back to, when the booking had one. NULL ⇒ the sentence is not said (§13). */
  tripId?: string | null;
}

/** R164 (G2): the words of the expired-claim notice, one home for the email and its test. */
export function expiredClaimNoticeSentence(serviceName: string | null | undefined, hasPlan: boolean): string {
  const what = serviceName ? `Your booking for ${serviceName}` : "Your booking";
  return hasPlan
    ? `${what} wasn't completed, so we released it. It's back in your plan; you can book it again.`
    : `${what} wasn't completed, so we released it. You can book it again.`;
}

/**
 * R164 (G2, decision-maker Sep 27, 2026): a checkout that reached Stripe (a PaymentIntent was stamped)
 * and was never paid is released by the stale-authorized sweep. The traveler is told ONCE, by the
 * caller holding the notice claim (`notifyExpiredStampedClaim`). Never sent for an unstamped claim —
 * that traveler never reached payment. Uses `sendEmail`, so the platform email kill switch applies.
 * Never throws.
 */
export async function sendExpiredClaimEmail(params: ExpiredClaimEmailParams): Promise<void> {
  const hasPlan = !!params.tripId;
  const sentence = expiredClaimNoticeSentence(params.serviceName, hasPlan);
  const url = hasPlan ? `${getAppBaseUrl()}/plans/${encodeURIComponent(params.tripId!)}` : `${getAppBaseUrl()}/my-bookings`;
  const greeting = params.travelerName ? `Hi ${escHtml(params.travelerName)},` : "Hi,";
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #374151; margin-bottom: 8px;">Your booking wasn't completed</h2>
      <p style="color: #374151;">${greeting}</p>
      <p style="color: #374151;">${escHtml(sentence)}</p>
      <a href="${url}"
         style="display: inline-block; background: #FF385C; color: #ffffff; text-decoration: none;
                padding: 12px 24px; border-radius: 6px; font-weight: 600; margin-top: 8px;">
        ${hasPlan ? "Open your plan" : "View My Bookings"}
      </a>
    </div>
  `;
  const text = [
    params.travelerName ? `Hi ${params.travelerName},` : "Hi,",
    ``,
    sentence,
    ``,
    url,
  ].join("\n");
  const result = await sendEmail({
    to: params.toEmail,
    subject: "Your booking wasn't completed",
    html,
    text,
    emailType: "expired_claim",
  });
  if (result.suppressed) {
    console.warn(`[email] sendExpiredClaimEmail not sent (${result.suppressed})`);
  } else if (!result.ok) {
    console.warn(`[email] sendExpiredClaimEmail failed for ${params.toEmail}:`, result.error);
  } else {
    console.log(`[email] expired-claim email sent to ${params.toEmail}`);
  }
}

// ─── Admin Daily Digest ────────────────────────────────────────────────────

interface DigestNotification {
  id: number;
  message: string;
  destination?: string | null;
  createdAt?: Date | string | null;
}

interface DigestExpert {
  id: string;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}

interface MissedWebhook {
  stripeEventId: string;
  eventType: string;
  stripeCreatedAt: number;
}

export interface ReconciliationMismatch {
  /** One of shared/schema.ts `RECONCILIATION_EXCEPTION_KINDS` (ruling 40 widened this from the
   *  two legacy-rail kinds to nine, seven of which are cart-rail classifications). Kept as a
   *  plain string because this value is READ BACK OUT of an `admin_notifications.reason` JSON
   *  blob — a union here would only pretend the parse was validated. */
  type: string;
  rail?: string;
  chargeId?: string;
  bookingId?: string;
  paymentIntentId?: string;
  amount?: number;
}

/* The digest's drift labels come from `shared/reconciliation-kinds.ts` (punchlist V-28). This file
 * used to carry its own map whose comment said, in so many words, that it "mirrors KIND_LABELS on
 * the admin page" — two hand-maintained copies of one vocabulary, and both had fallen seven kinds
 * behind the job. `reconciliationKindLabel` is the ONE reader on every surface; an unknown kind
 * still falls back to the raw key rather than being mislabelled as a known one (§13). */

interface AdminDigestParams {
  toEmail: string;
  unresolvedNotifications: DigestNotification[];
  expertsWithoutPayout: DigestExpert[];
  missedWebhooks?: MissedWebhook[];
  reconciliationMismatches?: ReconciliationMismatch[];
  /** Emails that exhausted their retries (board #1566). Absent or total 0 ⇒ the section is omitted. */
  deadEmails?: DigestDeadEmails;
  /** Expired (cancelled, reason expired) and current held rows. Counts and reasons only. */
  outboxHolds?: OutboxHoldSummary;
  /** Counts of audited admin actions in the trailing 24 hours. Absent or total 0 ⇒ the section is omitted. */
  adminActions?: AdminAuditDigest;
}

export interface DigestDeadEmails {
  total: number;
  newInLast24h: number;
  rows: { id: number; emailType: string; toEmail: string; subject: string; attemptCount: number; lastError: string | null; deadAt: string }[];
}

/**
 * The digest's "undelivered emails" section (board task #1566, ledger `2026-09-23-phase2-messages`).
 * Pure, so it can be proven without sending. Empty string when nothing is dead. There is no admin
 * page for the outbox yet, so the section names the retry endpoint rather than a screen that does
 * not exist (§13).
 */
export function buildDeadEmailDigestSection(dead: DigestDeadEmails | undefined): string {
  if (!dead || dead.total === 0) return "";
  const rows = dead.rows
    .map(
      (d) => `<tr style="background:#FEF2F2">
          <td style="padding:8px 12px;color:#111827;font-size:13px">${escHtml(d.emailType)}</td>
          <td style="padding:8px 12px;color:#111827;font-size:13px">${escHtml(d.toEmail)}</td>
          <td style="padding:8px 12px;color:#6B7280;font-size:13px">${escHtml(d.subject)}</td>
          <td style="padding:8px 12px;color:#6B7280;font-size:12px">${escHtml(d.lastError ?? "")}</td>
          <td style="padding:8px 12px;color:#6B7280;font-size:12px;font-family:monospace">#${d.id}</td>
        </tr>`,
    )
    .join("");
  const more = dead.total > dead.rows.length ? `<p style="color:#6B7280;font-size:12px">Showing the ${dead.rows.length} most recent of ${dead.total}.</p>` : "";
  return `
  <h3 style="color:#B91C1C;margin-top:24px">✉ Undelivered Emails (${dead.total}${dead.newInLast24h > 0 ? `, ${dead.newInLast24h} new today` : ""})</h3>
  <p style="color:#6B7280;font-size:13px">These emails failed every retry and were never delivered — the recipient does not have them. Each stays listed here until it is retried with <code>POST /api/admin/email-outbox/&lt;id&gt;/retry</code>.</p>
  <table style="width:100%;border-collapse:collapse;margin-bottom:8px">
    <thead>
      <tr style="background:#FEE2E2">
        <th style="padding:8px 12px;text-align:left;font-size:12px;color:#B91C1C">Type</th>
        <th style="padding:8px 12px;text-align:left;font-size:12px;color:#B91C1C">To</th>
        <th style="padding:8px 12px;text-align:left;font-size:12px;color:#B91C1C">Subject</th>
        <th style="padding:8px 12px;text-align:left;font-size:12px;color:#B91C1C">Last error</th>
        <th style="padding:8px 12px;text-align:left;font-size:12px;color:#B91C1C">Id</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  ${more}`;
}

/**
 * Counts only. Omitted when nothing is expired and nothing is held. Reasons are
 * the text already stored on the row. No addresses.
 */
export function buildOutboxHoldDigestSection(holds: OutboxHoldSummary | undefined): string {
  if (!holds) return "";
  const heldTotal = holds.held.reduce((sum, row) => sum + row.count, 0);
  if (holds.expired === 0 && heldTotal === 0) return "";
  const heldRows = holds.held
    .map(
      (row) => `<tr>
          <td style="padding:8px 12px;color:#111827;font-size:13px">${escHtml(row.reason)}</td>
          <td style="padding:8px 12px;color:#111827;font-size:13px">${row.count}</td>
        </tr>`,
    )
    .join("");
  const heldTable = heldTotal === 0 ? "" : `
  <p style="color:#6B7280;font-size:13px">Held (${heldTotal}), grouped by the reason already on the row. A held row is retried only when a later drain is allowed to send it.</p>
  <table style="width:100%;border-collapse:collapse;margin-bottom:8px">
    <thead>
      <tr style="background:#FEF3C7">
        <th style="padding:8px 12px;text-align:left;font-size:12px;color:#92400E">Reason</th>
        <th style="padding:8px 12px;text-align:left;font-size:12px;color:#92400E">Count</th>
      </tr>
    </thead>
    <tbody>${heldRows}</tbody>
  </table>`;
  return `
  <h3 style="color:#92400E;margin-top:24px">✉ Outbox expiry and holds (${holds.expired} expired, ${heldTotal} held)</h3>
  <p style="color:#6B7280;font-size:13px">${holds.expired} cancelled with reason expired. Those rows are not sent and are not retried.</p>
  ${heldTable}`;
}

/**
 * Counts only. Omitted when there were no audited admin actions in the window.
 * Printed values are escaped. No jsonb payload, ip address, user agent,
 * resource id, or target user is on `digest`, so none of those can be printed.
 */
export function buildAdminAuditDigestSection(digest: AdminAuditDigest | undefined): string {
  if (!digest || digest.total === 0) return "";
  const actionRows = digest.byAction
    .map(
      (row) => `<tr>
          <td style="padding:8px 12px;color:#111827;font-size:13px">${escHtml(row.action)}</td>
          <td style="padding:8px 12px;color:#111827;font-size:13px">${row.count}</td>
        </tr>`,
    )
    .join("");
  const actorRows = digest.byActor
    .map(
      (row) => `<tr>
          <td style="padding:8px 12px;color:#111827;font-size:13px">${escHtml(row.label)}</td>
          <td style="padding:8px 12px;color:#111827;font-size:13px">${escHtml(row.role)}</td>
          <td style="padding:8px 12px;color:#111827;font-size:13px">${row.count}</td>
        </tr>`,
    )
    .join("");
  const otherActions = digest.otherActions.kinds > 0
    ? `<p style="color:#6B7280;font-size:12px">and ${digest.otherActions.kinds} other actions (${digest.otherActions.count} in total)</p>`
    : "";
  const otherActors = digest.otherActors.people > 0
    ? `<p style="color:#6B7280;font-size:12px">and ${digest.otherActors.people} more people (${digest.otherActors.count} actions)</p>`
    : "";
  const logUrl = `${getAppBaseUrl()}/admin/audit-log`;
  return `
  <h3 style="color:#374151;margin-top:24px">Audited admin actions (${digest.total} in the last 24 hours, by ${digest.actorCount} people)</h3>
  <p style="color:#6B7280;font-size:13px">${digest.total} actions by ${digest.actorCount} people.</p>
  <table style="width:100%;border-collapse:collapse;margin-bottom:8px">
    <thead>
      <tr style="background:#E5E7EB">
        <th style="padding:8px 12px;text-align:left;font-size:12px;color:#374151">Action</th>
        <th style="padding:8px 12px;text-align:left;font-size:12px;color:#374151">Count</th>
      </tr>
    </thead>
    <tbody>${actionRows}</tbody>
  </table>
  ${otherActions}
  <table style="width:100%;border-collapse:collapse;margin-bottom:8px">
    <thead>
      <tr style="background:#E5E7EB">
        <th style="padding:8px 12px;text-align:left;font-size:12px;color:#374151">Actor</th>
        <th style="padding:8px 12px;text-align:left;font-size:12px;color:#374151">Role</th>
        <th style="padding:8px 12px;text-align:left;font-size:12px;color:#374151">Count</th>
      </tr>
    </thead>
    <tbody>${actorRows}</tbody>
  </table>
  ${otherActors}
  <p style="color:#6B7280;font-size:13px">Full log: <a href="${escHtml(logUrl)}">${escHtml(logUrl)}</a></p>`;
}

export type AdminDigestSendResult =
  | { outcome: "sent" }
  | { outcome: "not_sent"; reason: string; emailType: "admin_digest_24h" };

export async function sendAdminDigestEmail(params: AdminDigestParams): Promise<AdminDigestSendResult> {
  if (!process.env.RESEND_API_KEY) {
    console.log("[email] RESEND_API_KEY not set — skipping admin digest email");
    return { outcome: "not_sent", reason: "RESEND_API_KEY", emailType: "admin_digest_24h" };
  }

  const baseUrl = getAppBaseUrl();
  const date = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  // Same collapse and dedupe the scheduler applies, so a caller that passes the
  // raw rows still prints one line per booking/type and one drift alert.
  const shaped = shapeAdminDigestLists({
    unresolvedNotifications: params.unresolvedNotifications,
    reconciliationMismatches: params.reconciliationMismatches ?? [],
  });
  const unresolvedNotifications = shaped.unresolvedNotifications;
  const reconciliationMismatches = shaped.reconciliationMismatches;

  const notifRows = unresolvedNotifications
    .map(
      (n) =>
        `<tr style="background:#FFF7F0">
          <td style="padding:8px 12px;color:#111827;font-size:13px">${escHtml(n.message)}</td>
          <td style="padding:8px 12px;color:#6B7280;font-size:13px">${escHtml(n.destination) || "—"}</td>
        </tr>`
    )
    .join("");

  const expertRows = params.expertsWithoutPayout
    .map(
      (e) => {
        const name = [e.firstName, e.lastName].filter(Boolean).join(" ") || e.email || e.id;
        return `<tr style="background:#FFF5F5">
          <td style="padding:8px 12px;color:#111827;font-size:13px">${escHtml(name)}</td>
          <td style="padding:8px 12px;color:#6B7280;font-size:13px">${escHtml(e.email) || "—"}</td>
        </tr>`;
      }
    )
    .join("");

  const missedRows = (params.missedWebhooks ?? [])
    .map(
      (w) => {
        const ts = new Date(w.stripeCreatedAt * 1000).toISOString();
        return `<tr style="background:#FFF1F2">
          <td style="padding:8px 12px;color:#111827;font-size:13px;font-family:monospace">${escHtml(w.stripeEventId)}</td>
          <td style="padding:8px 12px;color:#6B7280;font-size:13px">${escHtml(w.eventType)}</td>
          <td style="padding:8px 12px;color:#6B7280;font-size:13px">${escHtml(ts)}</td>
        </tr>`;
      }
    )
    .join("");

  const reconRows = reconciliationMismatches
    .map((m) => {
      // Ruling 40: the drift job now emits NINE classifications, not two. The old two-branch
      // ternary labelled every unrecognised kind "Booking confirmed — no charge", which would
      // have described an amount mismatch or an unreversed refund as something it is not — a
      // detector whose ops surface mislabels the finding is worse than one that says nothing.
      const label = reconciliationKindLabel(m.type);
      const ref =
        m.chargeId && !m.bookingId
          ? `Charge: ${escHtml(m.chargeId)} · $${escHtml(String(m.amount ?? "?"))}`
          : `Booking: ${escHtml(m.bookingId) || "—"} · PI: ${escHtml(m.paymentIntentId) || "—"}` +
            (m.amount != null ? ` · $${escHtml(String(m.amount))}` : "");
      return `<tr style="background:#FFF7ED">
        <td style="padding:8px 12px;color:#92400E;font-size:13px;font-weight:600">${label}</td>
        <td style="padding:8px 12px;color:#111827;font-size:13px;font-family:monospace">${ref}</td>
      </tr>`;
    })
    .join("");

  const html = `
<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;padding:24px">
  <h2 style="color:#FF385C;margin-bottom:4px">Traveloure — Daily Admin Digest</h2>
  <p style="color:#6B7280;font-size:13px;margin-top:0">${date}</p>

  ${unresolvedNotifications.length > 0 ? `
  <h3 style="color:#92400E;margin-top:24px">⚠ Unresolved Lead Alerts (${unresolvedNotifications.length})</h3>
  <table style="width:100%;border-collapse:collapse;margin-bottom:8px">
    <thead>
      <tr style="background:#FEF3C7">
        <th style="padding:8px 12px;text-align:left;font-size:12px;color:#92400E">Message</th>
        <th style="padding:8px 12px;text-align:left;font-size:12px;color:#92400E">Destination</th>
      </tr>
    </thead>
    <tbody>${notifRows}</tbody>
  </table>
  <a href="${baseUrl}/admin/dashboard" style="display:inline-block;background:#FF385C;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:13px;font-weight:600;margin-bottom:20px">
    Review Alerts →
  </a>
  ` : ""}

  ${params.expertsWithoutPayout.length > 0 ? `
  <h3 style="color:#991B1B;margin-top:24px">💳 Experts Without Payout Setup (${params.expertsWithoutPayout.length})</h3>
  <p style="color:#6B7280;font-size:13px">These experts cannot receive payments until their Stripe Connect account setup is complete.</p>
  <table style="width:100%;border-collapse:collapse;margin-bottom:8px">
    <thead>
      <tr style="background:#FEE2E2">
        <th style="padding:8px 12px;text-align:left;font-size:12px;color:#991B1B">Name</th>
        <th style="padding:8px 12px;text-align:left;font-size:12px;color:#991B1B">Email</th>
      </tr>
    </thead>
    <tbody>${expertRows}</tbody>
  </table>
  <a href="${baseUrl}/admin/experts" style="display:inline-block;background:#DC2626;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:13px;font-weight:600">
    Manage Experts →
  </a>
  ` : ""}

  ${(params.missedWebhooks ?? []).length > 0 ? `
  <h3 style="color:#7C3AED;margin-top:24px">🔔 Missing Stripe Webhooks (${params.missedWebhooks!.length})</h3>
  <p style="color:#6B7280;font-size:13px">These events appear in Stripe's API but were NOT received by the server in the last 24 hours. Stripe retries for up to 3 days — check the Stripe dashboard to confirm delivery status.</p>
  <table style="width:100%;border-collapse:collapse;margin-bottom:8px">
    <thead>
      <tr style="background:#EDE9FE">
        <th style="padding:8px 12px;text-align:left;font-size:12px;color:#7C3AED">Event ID</th>
        <th style="padding:8px 12px;text-align:left;font-size:12px;color:#7C3AED">Type</th>
        <th style="padding:8px 12px;text-align:left;font-size:12px;color:#7C3AED">Stripe Created</th>
      </tr>
    </thead>
    <tbody>${missedRows}</tbody>
  </table>
  <a href="https://dashboard.stripe.com/events" style="display:inline-block;background:#7C3AED;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:13px;font-weight:600">
    Check Stripe Dashboard →
  </a>
  ` : ""}

  ${reconciliationMismatches.length > 0 ? `
  <h3 style="color:#B45309;margin-top:24px">🔴 Payment Reconciliation Mismatches (${reconciliationMismatches.length})</h3>
  <p style="color:#6B7280;font-size:13px">Daily Stripe ↔ database comparison found drift. Each row requires manual investigation in the Stripe dashboard before taking action.</p>
  <table style="width:100%;border-collapse:collapse;margin-bottom:8px">
    <thead>
      <tr style="background:#FEF3C7">
        <th style="padding:8px 12px;text-align:left;font-size:12px;color:#B45309">Type</th>
        <th style="padding:8px 12px;text-align:left;font-size:12px;color:#B45309">Reference</th>
      </tr>
    </thead>
    <tbody>${reconRows}</tbody>
  </table>
  <a href="https://dashboard.stripe.com/payments" style="display:inline-block;background:#B45309;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:13px;font-weight:600">
    Check Stripe Payments →
  </a>
  ` : ""}

  ${buildDeadEmailDigestSection(params.deadEmails)}
  ${buildOutboxHoldDigestSection(params.outboxHolds)}
  ${buildAdminAuditDigestSection(params.adminActions)}

  <p style="color:#9CA3AF;font-size:11px;margin-top:40px;border-top:1px solid #F3F4F6;padding-top:16px">
    Traveloure Admin Digest · Auto-generated daily · <a href="${baseUrl}/admin/dashboard" style="color:#FF385C">Open Dashboard</a>
  </p>
</div>`;

  const missedCount = (params.missedWebhooks ?? []).length;
  const reconCount = reconciliationMismatches.length;
  const deadCount = params.deadEmails?.total ?? 0;
  const expiredCount = params.outboxHolds?.expired ?? 0;
  const heldCount = params.outboxHolds?.held.reduce((sum, row) => sum + row.count, 0) ?? 0;
  const adminActionTotal = params.adminActions?.total ?? 0;
  const subject = `[Traveloure Admin] Daily Digest — ${unresolvedNotifications.length} alerts, ${params.expertsWithoutPayout.length} payout gaps${missedCount > 0 ? `, ${missedCount} missed webhooks` : ""}${reconCount > 0 ? `, ${reconCount} recon mismatches` : ""}${deadCount > 0 ? `, ${deadCount} undelivered emails` : ""}${expiredCount > 0 ? `, ${expiredCount} expired` : ""}${heldCount > 0 ? `, ${heldCount} held` : ""}${adminActionTotal > 0 ? `, ${adminActionTotal} admin actions` : ""}`;
  const result = await sendEmail({
    to: params.toEmail,
    subject,
    html,
    emailType: "admin_digest_24h",
  });
  if (result.suppressed) {
    console.warn(`[email] admin digest not sent (${result.suppressed}) email_type=admin_digest_24h`);
    return { outcome: "not_sent", reason: result.suppressed, emailType: "admin_digest_24h" };
  }
  if (!result.ok) throw new Error(result.error ?? "Admin digest was not accepted");

  console.log(`[email] Admin digest sent to ${params.toEmail}`);
  return { outcome: "sent" };
}

// ─── Welcome email ───────────────────────────────────────────────────────────

interface WelcomeEmailParams {
  toEmail: string;
  firstName: string | null;
}

/**
 * Queue the welcome through the existing outbox; never send without a durable row.
 * Introduces the platform, surfaces the three core actions (plan a trip, browse
 * experts, explore local picks), and gives a direct CTA to the dashboard.
 * Safe to call without awaiting — all errors are caught internally.
 */
export async function sendWelcomeEmail(params: WelcomeEmailParams): Promise<void> {
  return dispatchMessagingProducer(
    authWelcomeEmailAutomation,
    dispatchMessagingEvent,
    "auth.welcome_email",
    params,
    {},
    async () => {
      const { enqueueWelcomeForEmail } = await import("./signup-welcome-outbox.service");
      await enqueueWelcomeForEmail(params.toEmail);
    },
  );
}

export function buildWelcomeEmailPayload(params: WelcomeEmailParams): SendEmailParams {
  const firstName = params.firstName?.trim() || null;
  const greeting = firstName ? `Hi ${escHtml(firstName)},` : "Hi there,";
  const baseUrl = getAppBaseUrl();
  const dashboardUrl = `${baseUrl}/dashboard`;
  const exploreUrl  = `${baseUrl}/explore`;
  const expertsUrl  = `${baseUrl}/travel-experts`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #ffffff;">

      <!-- Header -->
      <div style="text-align: center; margin-bottom: 32px;">
        <h1 style="color: #FF385C; margin: 0; font-size: 28px; font-weight: 700;">Welcome to Traveloure</h1>
        <p style="color: #6B7280; margin-top: 8px; font-size: 15px;">Your AI-powered travel companion</p>
      </div>

      <!-- Greeting -->
      <p style="color: #374151; font-size: 16px;">${greeting}</p>
      <p style="color: #374151; font-size: 15px; line-height: 1.6;">
        Your account is all set. Traveloure uses AI to turn your travel ideas into
        personalised day-by-day itineraries — and connects you with local
        experts when you want a human touch.
      </p>

      <!-- 3 feature tiles -->
      <table style="width: 100%; border-collapse: collapse; margin: 24px 0;">
        <tr>
          <td style="padding: 16px; background: #FFF1F2; border-radius: 8px; vertical-align: top; width: 30%;">
            <div style="font-size: 24px; margin-bottom: 8px;">🗺️</div>
            <div style="font-weight: 700; color: #111827; margin-bottom: 4px;">Plan a trip</div>
            <div style="color: #6B7280; font-size: 13px;">Tell us where you're going and get a full AI itinerary in seconds.</div>
          </td>
          <td style="width: 4%;"></td>
          <td style="padding: 16px; background: #F0FDF4; border-radius: 8px; vertical-align: top; width: 30%;">
            <div style="font-size: 24px; margin-bottom: 8px;">🧑‍💼</div>
            <div style="font-weight: 700; color: #111827; margin-bottom: 4px;">Meet an expert</div>
            <div style="color: #6B7280; font-size: 13px;">Book a session with a local expert for tailored, local advice.</div>
          </td>
          <td style="width: 4%;"></td>
          <td style="padding: 16px; background: #EFF6FF; border-radius: 8px; vertical-align: top; width: 30%;">
            <div style="font-size: 24px; margin-bottom: 8px;">💎</div>
            <div style="font-weight: 700; color: #111827; margin-bottom: 4px;">Discover gems</div>
            <div style="color: #6B7280; font-size: 13px;">Find hidden local spots in Tokyo, Kyoto, Paris and beyond.</div>
          </td>
        </tr>
      </table>

      <!-- Primary CTA -->
      <div style="text-align: center; margin: 32px 0;">
        <a href="${dashboardUrl}"
           style="display: inline-block; background: #FF385C; color: #ffffff; text-decoration: none;
                  padding: 14px 32px; border-radius: 8px; font-weight: 700; font-size: 16px;">
          Start Planning
        </a>
      </div>

      <!-- Secondary links -->
      <p style="text-align: center; color: #6B7280; font-size: 13px;">
        Or jump straight to
        <a href="${exploreUrl}"  style="color: #FF385C; text-decoration: none;">Explore destinations</a>
        &nbsp;·&nbsp;
        <a href="${expertsUrl}" style="color: #FF385C; text-decoration: none;">Browse experts</a>
      </p>

      <!-- Footer -->
      <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 32px 0;" />
      <p style="color: #9CA3AF; font-size: 12px; text-align: center;">
        You're receiving this because you just created a Traveloure account.<br>
        Questions? Reply to this email — we read every one.
      </p>
    </div>
  `;

  const text = [
    `Welcome to Traveloure!`,
    ``,
    greeting,
    ``,
    `Your account is all set. Here's what you can do:`,
    ``,
    `🗺️  Plan a trip  — ${dashboardUrl}`,
    `🧑‍💼  Meet an expert — ${expertsUrl}`,
    `💎  Discover local picks — ${exploreUrl}`,
    ``,
    `Start planning: ${dashboardUrl}`,
    ``,
    `Questions? Just reply to this email.`,
  ].join("\n");

  return {
    to: params.toEmail,
    subject: `Welcome to Traveloure — let's plan your next adventure`,
    html,
    text,
    emailType: "signup_welcome",
  };
}

// ─── Payment-failed email ─────────────────────────────────────────────────────

interface PaymentFailedParams {
  toEmail: string;
  userName?: string | null;
  bookingTitle?: string | null;
  /** One outbox row per booking this flip moved. Not rendered in the email. */
  bookingId?: string;
}

/**
 * Fire-and-forget email to a traveler whose booking payment failed. The booking
 * is left in "failed" state (the webhook already flipped it) so the traveler can
 * safely retry from My Bookings without hitting the idempotency guard.
 * Never throws — all errors caught internally.
 */
export async function sendPaymentFailedEmail(params: PaymentFailedParams): Promise<void> {
  const greeting = params.userName ? `Hi ${escHtml(params.userName)},` : "Hi,";
  const bookingsUrl = `${getAppBaseUrl()}/my-bookings`;
  const titleLine = params.bookingTitle
    ? `<p style="color:#374151;">Your payment for <strong>${escHtml(params.bookingTitle)}</strong> didn't go through, so the booking wasn't confirmed.</p>`
    : `<p style="color:#374151;">Your recent payment didn't go through, so the booking wasn't confirmed.</p>`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #DC2626; margin-bottom: 8px;">Payment didn't go through</h2>
      <p style="color: #374151;">${greeting}</p>
      ${titleLine}
      <p style="color: #374151;">
        No charge was made. This usually happens when a card is declined or expires — you can
        retry with the same or a different card from your bookings.
      </p>
      <a href="${bookingsUrl}"
         style="display: inline-block; background: #FF385C; color: #ffffff; text-decoration: none;
                padding: 12px 24px; border-radius: 6px; font-weight: 600; margin-top: 8px;">
        Retry from My Bookings
      </a>
      <p style="color: #9CA3AF; font-size: 12px; margin-top: 32px;">
        You're receiving this because a booking payment on Traveloure was not completed.<br>
        Manage your bookings at <a href="${bookingsUrl}" style="color: #FF385C;">${bookingsUrl}</a>.
      </p>
    </div>
  `;

  const text = [
    `Payment didn't go through`,
    ``,
    greeting,
    ``,
    params.bookingTitle
      ? `Your payment for "${params.bookingTitle}" didn't go through, so the booking wasn't confirmed.`
      : `Your recent payment didn't go through, so the booking wasn't confirmed.`,
    ``,
    `No charge was made. You can retry from your bookings:`,
    bookingsUrl,
  ].join("\n");

  const subject = params.bookingTitle
    ? `Payment failed — ${stripCrLf(params.bookingTitle)}`
    : `Your Traveloure payment didn't go through`;
  await enqueueTransactionalEmail({
    emailType: "payment_failed",
    to: params.toEmail,
    subject,
    html,
    text,
    metadata: {
      ...(params.bookingId ? { bookingId: params.bookingId, dedupeKey: `payment_failed:${params.bookingId}` } : {}),
    },
  });
}

// ─── Provider verification decision email ─────────────────────────────────────

interface VerificationDecisionParams {
  toEmail: string;
  firstName?: string | null;
  decision: "verified" | "rejected";
  /** Optional admin note shown to the provider on a rejection. */
  reason?: string | null;
  /** Provider user id. With priorStatus, one outbox row per decision change. */
  userId?: string | null;
  priorStatus?: string | null;
}

/**
 * Fire-and-forget email to a provider when an admin decides their
 * background/category verification review (verified or rejected). Never throws.
 */
export async function sendVerificationDecisionEmail(params: VerificationDecisionParams): Promise<void> {
  const greeting = params.firstName ? `Hi ${escHtml(params.firstName)},` : "Hi,";
  const settingsUrl = `${getAppBaseUrl()}/provider/settings`;
  const approved = params.decision === "verified";
  const reasonBlock =
    !approved && params.reason
      ? `<p style="color:#374151;"><strong>Reviewer note:</strong> ${escHtml(params.reason)}</p>`
      : "";

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
      <h2 style="color: ${approved ? "#059669" : "#DC2626"}; margin-bottom: 8px;">
        ${approved ? "Verification approved" : "Verification not approved"}
      </h2>
      <p style="color: #374151;">${greeting}</p>
      <p style="color: #374151;">
        ${approved
          ? "Your account passed its review. You can now publish listings in background-check and higher-insurance categories."
          : "We reviewed your account and couldn't approve verification at this time. You can update your details and request another review."}
      </p>
      ${reasonBlock}
      <a href="${settingsUrl}"
         style="display: inline-block; background: #FF385C; color: #ffffff; text-decoration: none;
                padding: 12px 24px; border-radius: 6px; font-weight: 600; margin-top: 8px;">
        Open Provider Settings
      </a>
      <p style="color: #9CA3AF; font-size: 12px; margin-top: 32px;">
        You're receiving this because you're a provider on Traveloure.<br>
        Manage verification at <a href="${settingsUrl}" style="color: #FF385C;">${settingsUrl}</a>.
      </p>
    </div>
  `;

  const text = [
    approved ? "Verification approved" : "Verification not approved",
    ``,
    greeting,
    ``,
    approved
      ? "Your account passed its review. You can now publish listings in background-check and higher-insurance categories."
      : "We reviewed your account and couldn't approve verification at this time. You can update your details and request another review.",
    !approved && params.reason ? `\nReviewer note: ${params.reason}` : "",
    ``,
    `Open provider settings: ${settingsUrl}`,
  ].filter((l) => l !== "").join("\n");

  const subject = approved ? "Your Traveloure verification is approved" : "Your Traveloure verification review";
  const dedupeKey = params.userId
    ? `verification_decision:${params.userId}:${params.priorStatus ?? ""}:${params.decision}:${applicationNoteKey(params.reason)}`
    : undefined;
  await enqueueTransactionalEmail({
    emailType: "verification_decision",
    to: params.toEmail,
    subject,
    html,
    text,
    metadata: {
      decision: params.decision,
      ...(params.userId ? { userId: params.userId } : {}),
      ...(dedupeKey ? { dedupeKey } : {}),
    },
  });
}

// ─── Expert application rejection email ───────────────────────────────────────

interface ExpertApplicationApprovalParams {
  toEmail: string;
  firstName?: string | null;
  applicationId?: string;
  /** Prior status from the locked write. A later re-entry is a different send. */
  priorStatus?: string | null;
}

/**
 * Fire-and-forget email to an expert applicant when their application is
 * approved. Congratulates them, explains the Stripe Connect next step, and
 * links directly to /expert/money (the C8-renamed Earnings module). Never throws.
 */
export async function sendExpertApplicationApprovalEmail(
  params: ExpertApplicationApprovalParams
): Promise<void> {
  const greeting = params.firstName ? `Hi ${escHtml(params.firstName)},` : "Hi,";
  const earningsUrl = `${getAppBaseUrl()}/expert/money`; // C8: Earnings → Money; old route redirects

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #16A34A; margin-bottom: 8px;">You're approved as a Traveloure Expert! 🎉</h2>
      <p style="color: #374151;">${greeting}</p>
      <p style="color: #374151;">
        Congratulations — your application to join Traveloure as a local expert has been approved!
        You can now create services, accept bookings, and earn money sharing your local knowledge.
      </p>
      <h3 style="color: #111827; margin-bottom: 8px;">Next step: set up payouts</h3>
      <p style="color: #374151;">
        To receive payments, you'll need to connect your Stripe account. It only takes a few
        minutes — head to your earnings page to get started.
      </p>
      <a href="${earningsUrl}"
         style="display: inline-block; background: #FF385C; color: #ffffff; text-decoration: none;
                padding: 12px 24px; border-radius: 6px; font-weight: 600; margin-top: 8px;">
        Set Up Payouts
      </a>
      <p style="color: #9CA3AF; font-size: 12px; margin-top: 32px;">
        You're receiving this because your expert application on Traveloure was approved.<br>
        Manage your earnings at <a href="${earningsUrl}" style="color: #FF385C;">${earningsUrl}</a>.
      </p>
    </div>
  `;

  const text = [
    "You're approved as a Traveloure Expert! 🎉",
    ``,
    greeting,
    ``,
    "Congratulations — your application to join Traveloure as a local expert has been approved!",
    "You can now create services, accept bookings, and earn money sharing your local knowledge.",
    ``,
    "Next step: set up payouts",
    ``,
    "To receive payments, connect your Stripe account — it only takes a few minutes:",
    ``,
    `Set up payouts: ${earningsUrl}`,
  ].join("\n");

  await enqueueTransactionalEmail({
    emailType: "expert_application_approved",
    to: params.toEmail,
    subject: "Your Traveloure expert application has been approved!",
    html,
    text,
    metadata: {
      ...(params.applicationId ? { applicationId: params.applicationId } : {}),
      ...(criticalDedupeKey([
        "expert_application",
        "approved",
        params.applicationId,
        params.priorStatus ?? "",
      ])
        ? { dedupeKey: criticalDedupeKey(["expert_application", "approved", params.applicationId, params.priorStatus ?? ""]) }
        : {}),
    },
  });
}

interface ExpertApplicationRejectionParams {
  toEmail: string;
  firstName?: string | null;
  /** Optional rejection reason provided by the admin. */
  rejectionMessage?: string | null;
  applicationId?: string;
  priorStatus?: string | null;
}

/**
 * Fire-and-forget email to an expert applicant when their application is
 * rejected. Includes the admin's rejection reason (if any) and a link back
 * to /expert/apply so they can revise and resubmit. Never throws.
 */
export async function sendExpertApplicationRejectionEmail(
  params: ExpertApplicationRejectionParams
): Promise<void> {
  const greeting = params.firstName ? `Hi ${escHtml(params.firstName)},` : "Hi,";
  const applyUrl = `${getAppBaseUrl()}/expert/apply`;
  const reasonBlock =
    params.rejectionMessage
      ? `<p style="color:#374151;"><strong>Reviewer note:</strong> ${escHtml(params.rejectionMessage)}</p>`
      : "";

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #DC2626; margin-bottom: 8px;">Application not approved</h2>
      <p style="color: #374151;">${greeting}</p>
      <p style="color: #374151;">
        Thank you for applying to join Traveloure as a local expert. After reviewing your
        application, we're unable to approve it at this time.
      </p>
      ${reasonBlock}
      <p style="color: #374151;">
        You're welcome to update your details and reapply. Click the button below to return
        to the application form.
      </p>
      <a href="${applyUrl}"
         style="display: inline-block; background: #FF385C; color: #ffffff; text-decoration: none;
                padding: 12px 24px; border-radius: 6px; font-weight: 600; margin-top: 8px;">
        Reapply as an Expert
      </a>
      <p style="color: #9CA3AF; font-size: 12px; margin-top: 32px;">
        You're receiving this because you submitted an expert application on Traveloure.<br>
        Apply again at <a href="${applyUrl}" style="color: #FF385C;">${applyUrl}</a>.
      </p>
    </div>
  `;

  const text = [
    "Application not approved",
    ``,
    greeting,
    ``,
    "Thank you for applying to join Traveloure as a local expert. After reviewing your application, we're unable to approve it at this time.",
    params.rejectionMessage ? `\nReviewer note: ${params.rejectionMessage}` : "",
    ``,
    "You're welcome to update your details and reapply.",
    ``,
    `Reapply at: ${applyUrl}`,
  ].filter((l) => l !== "").join("\n");

  await enqueueTransactionalEmail({
    emailType: "expert_application_rejected",
    to: params.toEmail,
    subject: "Your Traveloure expert application",
    html,
    text,
    metadata: {
      ...(params.applicationId ? { applicationId: params.applicationId } : {}),
      ...(criticalDedupeKey([
        "expert_application",
        "rejected",
        params.applicationId,
        params.priorStatus ?? "",
        applicationNoteKey(params.rejectionMessage),
      ])
        ? {
            dedupeKey: criticalDedupeKey([
              "expert_application",
              "rejected",
              params.applicationId,
              params.priorStatus ?? "",
              applicationNoteKey(params.rejectionMessage),
            ]),
          }
        : {}),
    },
  });
}

// ─── Provider application rejection email ─────────────────────────────────────

interface ProviderApplicationRejectionParams {
  toEmail: string;
  firstName?: string | null;
  rejectionMessage?: string | null;
  applicationId?: string;
  priorStatus?: string | null;
}

/**
 * Test-only seam. When a key is set here the corresponding function delegates
 * to it instead of sending real email. Empty by default — no production impact.
 */
export const _emailTestHooks: {
  sendProviderApplicationRejectionEmail?: (
    params: ProviderApplicationRejectionParams
  ) => Promise<void>;
  sendProviderApplicationApprovalEmail?: (
    params: ProviderApplicationApprovalParams
  ) => Promise<void>;
} = {};

/**
 * Fire-and-forget email to a provider applicant when their application is
 * rejected. Includes the admin's rejection reason (if any) and a link back
 * to /provider/apply so they can revise and resubmit. Never throws.
 */
export async function sendProviderApplicationRejectionEmail(
  params: ProviderApplicationRejectionParams
): Promise<void> {
  if (_emailTestHooks.sendProviderApplicationRejectionEmail) {
    return _emailTestHooks.sendProviderApplicationRejectionEmail(params);
  }
  const greeting = params.firstName ? `Hi ${escHtml(params.firstName)},` : "Hi,";
  const applyUrl = `${getAppBaseUrl()}/provider/apply`;
  const reasonBlock =
    params.rejectionMessage
      ? `<p style="color:#374151;"><strong>Reviewer note:</strong> ${escHtml(params.rejectionMessage)}</p>`
      : "";

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #DC2626; margin-bottom: 8px;">Application not approved</h2>
      <p style="color: #374151;">${greeting}</p>
      <p style="color: #374151;">
        Thank you for applying to join Traveloure as a service provider. After reviewing your
        application, we're unable to approve it at this time.
      </p>
      ${reasonBlock}
      <p style="color: #374151;">
        You're welcome to update your details and reapply. Click the button below to return
        to the application form.
      </p>
      <a href="${applyUrl}"
         style="display: inline-block; background: #FF385C; color: #ffffff; text-decoration: none;
                padding: 12px 24px; border-radius: 6px; font-weight: 600; margin-top: 8px;">
        Reapply as a Provider
      </a>
      <p style="color: #9CA3AF; font-size: 12px; margin-top: 32px;">
        You're receiving this because you submitted a provider application on Traveloure.<br>
        Apply again at <a href="${applyUrl}" style="color: #FF385C;">${applyUrl}</a>.
      </p>
    </div>
  `;

  const text = [
    "Application not approved",
    ``,
    greeting,
    ``,
    "Thank you for applying to join Traveloure as a service provider. After reviewing your application, we're unable to approve it at this time.",
    params.rejectionMessage ? `\nReviewer note: ${params.rejectionMessage}` : "",
    ``,
    "You're welcome to update your details and reapply.",
    ``,
    `Reapply at: ${applyUrl}`,
  ].filter((l) => l !== "").join("\n");

  await enqueueTransactionalEmail({
    emailType: "provider_application_rejected",
    to: params.toEmail,
    subject: "Your Traveloure provider application",
    html,
    text,
    metadata: {
      ...(params.applicationId ? { applicationId: params.applicationId } : {}),
      ...(criticalDedupeKey([
        "provider_application",
        "rejected",
        params.applicationId,
        params.priorStatus ?? "",
        applicationNoteKey(params.rejectionMessage),
      ])
        ? {
            dedupeKey: criticalDedupeKey([
              "provider_application",
              "rejected",
              params.applicationId,
              params.priorStatus ?? "",
              applicationNoteKey(params.rejectionMessage),
            ]),
          }
        : {}),
    },
  });
}

// ─── Provider application approval email ──────────────────────────────────────

interface ProviderApplicationApprovalParams {
  toEmail: string;
  firstName?: string | null;
  applicationId?: string;
  priorStatus?: string | null;
}

/**
 * Fire-and-forget email to a provider applicant when their application is
 * approved. Congratulates them, explains the Stripe Connect next step, and
 * links directly to /provider/money (C9: the Earnings module renamed Money;
 * /provider/earnings redirects there). Never throws.
 */
export async function sendProviderApplicationApprovalEmail(
  params: ProviderApplicationApprovalParams
): Promise<void> {
  if (_emailTestHooks.sendProviderApplicationApprovalEmail) {
    return _emailTestHooks.sendProviderApplicationApprovalEmail(params);
  }
  const greeting = params.firstName ? `Hi ${escHtml(params.firstName)},` : "Hi,";
  const earningsUrl = `${getAppBaseUrl()}/provider/money`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #16A34A; margin-bottom: 8px;">You're approved as a Traveloure Provider! 🎉</h2>
      <p style="color: #374151;">${greeting}</p>
      <p style="color: #374151;">
        Congratulations — your application to join Traveloure as a service provider has been approved!
        You can now list services, accept bookings, and start earning on the platform.
      </p>
      <h3 style="color: #111827; margin-bottom: 8px;">Next step: set up payouts</h3>
      <p style="color: #374151;">
        To receive payments, you'll need to connect your Stripe account. It only takes a few
        minutes — head to your earnings page to get started.
      </p>
      <a href="${earningsUrl}"
         style="display: inline-block; background: #FF385C; color: #ffffff; text-decoration: none;
                padding: 12px 24px; border-radius: 6px; font-weight: 600; margin-top: 8px;">
        Set Up Payouts
      </a>
      <p style="color: #9CA3AF; font-size: 12px; margin-top: 32px;">
        You're receiving this because your provider application on Traveloure was approved.<br>
        Manage your earnings at <a href="${earningsUrl}" style="color: #FF385C;">${earningsUrl}</a>.
      </p>
    </div>
  `;

  const text = [
    "You're approved as a Traveloure Provider! 🎉",
    ``,
    greeting,
    ``,
    "Congratulations — your application to join Traveloure as a service provider has been approved!",
    "You can now list services, accept bookings, and start earning on the platform.",
    ``,
    "Next step: set up payouts",
    ``,
    "To receive payments, connect your Stripe account — it only takes a few minutes:",
    ``,
    `Set up payouts: ${earningsUrl}`,
  ].join("\n");

  await enqueueTransactionalEmail({
    emailType: "provider_application_approved",
    to: params.toEmail,
    subject: "Your Traveloure provider application has been approved!",
    html,
    text,
    metadata: {
      ...(params.applicationId ? { applicationId: params.applicationId } : {}),
      ...(criticalDedupeKey([
        "provider_application",
        "approved",
        params.applicationId,
        params.priorStatus ?? "",
      ])
        ? { dedupeKey: criticalDedupeKey(["provider_application", "approved", params.applicationId, params.priorStatus ?? ""]) }
        : {}),
    },
  });
}

// ─── Trip lifecycle emails (QA_PUNCH_LIST item 14 / Build map W3-B) ──────────────────────────
//
// A logged-out customer previously learned about a delivered plan / approval / suggestion ONLY
// via the in-app bell notification — these four functions are the email channel for the same
// four ratified events. Same transport/from-address/reply-to/honest-failure posture as every
// function above: no RESEND_API_KEY -> silent skip (never a crash, never a fake "sent"); a send
// failure is caught and logged, never thrown, so it can never fail the state transition it rides
// beside. Deep links do NOT literally match the bell: email links point at `/trip/:id` (the raw
// `data.workspacePath`), while the bell's link goes through `resolveNotificationLink` (client/src/
// lib/notification-icons.tsx, ruling R-E), which rewrites every `/trip/`-prefixed workspacePath to
// `/plans/:tripId` (SlipView) — so email lands on the Trip Card and the bell lands on the Slip.
// CC-11 fix: PlanApprovalBanner now renders on both surfaces (PlanCard.tsx and SlipView.tsx), so
// the delivery handshake (Approve / Request changes) is reachable from either deep link.
//
// Subject/body/deep-link are rendered before enqueue and stored on the outbox row. A later
// drain sends that stored payload. The reached log still names the subject and link.

interface PlanDeliveredEmailParams {
  toEmail: string;
  firstName?: string | null;
  tripId: string;
}

/**
 * W3-B ①: plan DELIVERED -> customer email. Fired once, beside the existing bell-notification
 * insert, only on the workspace-status `-> delivered` transition (never `in_review`).
 */
export async function sendPlanDeliveredEmail(params: PlanDeliveredEmailParams): Promise<void> {
  return dispatchMessagingProducer(
    planDeliveredEmailAutomation,
    dispatchMessagingEvent,
    "plan.delivered_email",
    params,
    {},
    () => sendPlanDeliveredEmailAction(params),
  );
}

async function sendPlanDeliveredEmailAction(params: PlanDeliveredEmailParams): Promise<void> {
  const greeting = params.firstName ? `Hi ${escHtml(params.firstName)},` : "Hi,";
  const tripUrl = `${getAppBaseUrl()}/trip/${params.tripId}?tab=itinerary`;
  const subject = "Your itinerary has been delivered";

  console.log(`[email] sendPlanDeliveredEmail reached — tripId=${params.tripId} subject="${subject}" link=${tripUrl}`);

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #FF385C; margin-bottom: 8px;">Your itinerary has been delivered</h2>
      <p style="color: #374151;">${greeting}</p>
      <p style="color: #374151;">
        Your expert marked your itinerary as complete. Take a look and let them know if it's
        everything you wanted, or if you'd like any changes.
      </p>
      <a href="${tripUrl}"
         style="display: inline-block; background: #FF385C; color: #ffffff; text-decoration: none;
                padding: 12px 24px; border-radius: 6px; font-weight: 600; margin-top: 8px;">
        View Your Itinerary
      </a>
      <p style="color: #9CA3AF; font-size: 12px; margin-top: 32px;">
        You're receiving this because your Traveloure trip plan was delivered by your expert.<br>
        View it at <a href="${tripUrl}" style="color: #FF385C;">${tripUrl}</a>.
      </p>
    </div>
  `;

  const text = [
    subject,
    ``,
    greeting,
    ``,
    `Your expert marked your itinerary as complete. Take a look and let them know if it's everything you wanted, or if you'd like any changes.`,
    ``,
    `View your itinerary: ${tripUrl}`,
  ].join("\n");

  await enqueueTransactionalEmail({
    emailType: "plan_delivered",
    to: params.toEmail,
    subject,
    html,
    text,
    metadata: { tripId: params.tripId },
  });
}

interface PlanApprovedEmailParams {
  toEmail: string;
  firstName?: string | null;
  tripId: string;
}

/**
 * W3-B ④: plan APPROVED -> expert email. Symmetric with sendPlanChangesRequestedEmail below —
 * both ride the same /trips/:id/plan-review decision endpoint, just the opposite branch.
 */
export async function sendPlanApprovedEmail(params: PlanApprovedEmailParams): Promise<void> {
  return dispatchMessagingProducer(
    planApprovedEmailAutomation,
    dispatchMessagingEvent,
    "plan.approved_email",
    params,
    {},
    () => sendPlanApprovedEmailAction(params),
  );
}

async function sendPlanApprovedEmailAction(params: PlanApprovedEmailParams): Promise<void> {
  const greeting = params.firstName ? `Hi ${escHtml(params.firstName)},` : "Hi,";
  const workspaceUrl = `${getAppBaseUrl()}/expert/workspace/${params.tripId}`;
  const subject = "Your delivered plan was approved";

  console.log(`[email] sendPlanApprovedEmail reached — tripId=${params.tripId} subject="${subject}" link=${workspaceUrl}`);

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #16A34A; margin-bottom: 8px;">Your delivered plan was approved</h2>
      <p style="color: #374151;">${greeting}</p>
      <p style="color: #374151;">
        Your client approved the plan you delivered for their trip. No further action is needed
        unless they reach out with new requests.
      </p>
      <a href="${workspaceUrl}"
         style="display: inline-block; background: #FF385C; color: #ffffff; text-decoration: none;
                padding: 12px 24px; border-radius: 6px; font-weight: 600; margin-top: 8px;">
        Open Workspace
      </a>
      <p style="color: #9CA3AF; font-size: 12px; margin-top: 32px;">
        You're receiving this because you're an expert on Traveloure.<br>
        Open the trip workspace at <a href="${workspaceUrl}" style="color: #FF385C;">${workspaceUrl}</a>.
      </p>
    </div>
  `;

  const text = [
    subject,
    ``,
    greeting,
    ``,
    `Your client approved the plan you delivered for their trip. No further action is needed unless they reach out with new requests.`,
    ``,
    `Open workspace: ${workspaceUrl}`,
  ].join("\n");

  await enqueueTransactionalEmail({
    emailType: "plan_approved",
    to: params.toEmail,
    subject,
    html,
    text,
    metadata: { tripId: params.tripId },
  });
}

interface PlanChangesRequestedEmailParams {
  toEmail: string;
  firstName?: string | null;
  tripId: string;
  note?: string | null;
}

/**
 * W3-B ②: CHANGES REQUESTED -> expert email.
 */
export async function sendPlanChangesRequestedEmail(params: PlanChangesRequestedEmailParams): Promise<void> {
  return dispatchMessagingProducer(
    planChangesRequestedEmailAutomation,
    dispatchMessagingEvent,
    "plan.changes_requested_email",
    params,
    {},
    () => sendPlanChangesRequestedEmailAction(params),
  );
}

async function sendPlanChangesRequestedEmailAction(params: PlanChangesRequestedEmailParams): Promise<void> {
  const greeting = params.firstName ? `Hi ${escHtml(params.firstName)},` : "Hi,";
  const workspaceUrl = `${getAppBaseUrl()}/expert/workspace/${params.tripId}`;
  const subject = "Changes requested on your delivered plan";
  const note = params.note?.trim() || null;

  console.log(`[email] sendPlanChangesRequestedEmail reached — tripId=${params.tripId} subject="${subject}" link=${workspaceUrl}`);

  const noteBlock = note
    ? `<p style="color:#374151;"><strong>Client note:</strong> ${escHtml(note)}</p>`
    : "";

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #DC2626; margin-bottom: 8px;">Changes requested on your delivered plan</h2>
      <p style="color: #374151;">${greeting}</p>
      <p style="color: #374151;">
        Your client sent your delivered plan back for changes.
      </p>
      ${noteBlock}
      <a href="${workspaceUrl}"
         style="display: inline-block; background: #FF385C; color: #ffffff; text-decoration: none;
                padding: 12px 24px; border-radius: 6px; font-weight: 600; margin-top: 8px;">
        Open Workspace
      </a>
      <p style="color: #9CA3AF; font-size: 12px; margin-top: 32px;">
        You're receiving this because you're an expert on Traveloure.<br>
        Open the trip workspace at <a href="${workspaceUrl}" style="color: #FF385C;">${workspaceUrl}</a>.
      </p>
    </div>
  `;

  const text = [
    subject,
    ``,
    greeting,
    ``,
    `Your client sent your delivered plan back for changes.`,
    note ? `\nClient note: ${note}` : "",
    ``,
    `Open workspace: ${workspaceUrl}`,
  ].filter((l) => l !== "").join("\n");

  await enqueueTransactionalEmail({
    emailType: "plan_changes_requested",
    to: params.toEmail,
    subject,
    html,
    text,
    metadata: { tripId: params.tripId },
  });
}

interface NewSuggestionEmailParams {
  toEmail: string;
  firstName?: string | null;
  tripId: string;
  suggestionTitle: string;
  /** Suggestion row id. Present callers dedupe one notice per suggestion. */
  suggestionId?: string | null;
}

/**
 * W3-B ③: POST-APPROVAL suggestion created -> customer email. The caller is responsible for
 * only invoking this when the advisor row's `planApprovalStatus === 'approved'` — an
 * in-planning (pre-approval) suggestion stays bell-only, deliberately (see the call site in
 * server/routes/booking-actions.ts). This function itself does not re-check that gate.
 */
export async function sendNewSuggestionEmail(params: NewSuggestionEmailParams): Promise<void> {
  return dispatchMessagingProducer(
    planSuggestionEmailAutomation,
    dispatchMessagingEvent,
    "plan.suggestion_email",
    params,
    {},
    () => sendNewSuggestionEmailAction(params),
  );
}

async function sendNewSuggestionEmailAction(params: NewSuggestionEmailParams): Promise<void> {
  const greeting = params.firstName ? `Hi ${escHtml(params.firstName)},` : "Hi,";
  const tripUrl = `${getAppBaseUrl()}/trip/${params.tripId}?tab=itinerary`;
  const subject = "New suggestion from your expert";

  console.log(`[email] sendNewSuggestionEmail reached — tripId=${params.tripId} subject="${subject}" link=${tripUrl}`);

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #FF385C; margin-bottom: 8px;">New suggestion from your expert</h2>
      <p style="color: #374151;">${greeting}</p>
      <p style="color: #374151;">
        Your expert suggested "${escHtml(params.suggestionTitle)}" for your trip.
      </p>
      <a href="${tripUrl}"
         style="display: inline-block; background: #FF385C; color: #ffffff; text-decoration: none;
                padding: 12px 24px; border-radius: 6px; font-weight: 600; margin-top: 8px;">
        View Suggestion
      </a>
      <p style="color: #9CA3AF; font-size: 12px; margin-top: 32px;">
        You're receiving this because your Traveloure trip has an approved plan and your expert
        added a new suggestion.<br>
        View it at <a href="${tripUrl}" style="color: #FF385C;">${tripUrl}</a>.
      </p>
    </div>
  `;

  const text = [
    subject,
    ``,
    greeting,
    ``,
    `Your expert suggested "${params.suggestionTitle}" for your trip.`,
    ``,
    `View it: ${tripUrl}`,
  ].join("\n");

  await enqueueTransactionalEmail({
    emailType: "new_suggestion",
    to: params.toEmail,
    subject,
    html,
    text,
    metadata: {
      tripId: params.tripId,
      ...(params.suggestionId
        ? { suggestionId: params.suggestionId, dedupeKey: `new_suggestion:${params.suggestionId}` }
        : {}),
    },
  });
}
