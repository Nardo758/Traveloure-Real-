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
 * Legacy alias: EMAIL_FROM is still read as a fallback for EMAIL_FROM_NOREPLY
 * so existing deployments that predate the rename continue to work.
 *
 * APP_BASE_URL is derived from REPLIT_DOMAINS at runtime; override with
 * APP_BASE_URL env var if running outside Replit.
 */

import { Resend } from "resend";

let cachedClient: Resend | null = null;
function getClient(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (cachedClient) return cachedClient;
  cachedClient = new Resend(key);
  return cachedClient;
}

/** Reads EMAIL_FROM_NOREPLY (preferred) or EMAIL_FROM (legacy alias). */
function getFromAddress(): string {
  return process.env.EMAIL_FROM_NOREPLY ?? process.env.EMAIL_FROM ?? "";
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

/**
 * Escape a string for safe interpolation inside an HTML email body.
 * Converts the five characters that have special meaning in HTML so that
 * user-controlled values cannot inject markup or attributes.
 */
function escHtml(raw: string | null | undefined): string {
  if (raw == null) return "";
  return String(raw)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Strip carriage-return and line-feed characters from a value before it is
 * interpolated into an email `subject` header.  A bare CR or LF in a header
 * value is the classic "email header injection" vector.
 */
function stripCrLf(raw: string | null | undefined): string {
  if (raw == null) return "";
  return String(raw).replace(/[\r\n]/g, "");
}

// ─── Generic sendEmail ──────────────────────────────────────────────────────

export interface SendEmailParams {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  /** Override per-call; falls back to EMAIL_REPLY_TO env var. */
  replyTo?: string;
}

export interface SendEmailResult {
  ok: boolean;
  id?: string;
  error?: string;
}

/**
 * Low-level email sender. Validates all three required env vars and wraps
 * Resend in a try/catch so callers never receive an unhandled rejection.
 *
 * Returns { ok: true, id } on success or { ok: false, error } on failure —
 * it never throws into the caller.
 */
export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM_NOREPLY ?? process.env.EMAIL_FROM;
  const defaultReplyTo = process.env.EMAIL_REPLY_TO;
  const replyTo = params.replyTo ?? defaultReplyTo;

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
    const client = new Resend(apiKey);
    const { data, error } = await client.emails.send({
      from,
      to: params.to,
      subject: params.subject,
      html: params.html,
      ...(params.text ? { text: params.text } : {}),
      replyTo: replyTo,
    });

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

interface BookingConfirmationParams {
  toEmail: string;
  userName: string;
  bookingId: string;
  bookingTitle: string;
  bookingDate?: string | null;
  confirmationCode: string;
}

export async function sendBookingConfirmationEmail(params: BookingConfirmationParams): Promise<void> {
  const client = getClient();
  if (!client) {
    console.log(
      "[email] RESEND_API_KEY not set — skipping booking confirmation email for booking",
      params.bookingId
    );
    return;
  }

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

  await client.emails.send({
    from: getFromAddress(),
    to: params.toEmail,
    subject: `Your booking is confirmed — ${stripCrLf(params.bookingTitle)}`,
    text,
    html,
  });

  console.log(
    `[email] Booking confirmation sent to ${params.toEmail} for booking ${params.bookingId} (code: ${params.confirmationCode})`
  );
}

interface BookingAlertParams {
  providerEmail: string;
  providerName: string;
  bookingId: string;
  serviceName: string;
  travelerName: string;
  amount: string;
}

export async function sendBookingAlertEmail(params: BookingAlertParams): Promise<void> {
  const client = getClient();
  if (!client) {
    console.log(
      "[email] RESEND_API_KEY not set — skipping booking alert email for booking",
      params.bookingId
    );
    return;
  }

  const bookingsUrl = `${getAppBaseUrl()}/expert/bookings`;

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

  await client.emails.send({
    from: getFromAddress(),
    to: params.providerEmail,
    subject: `New booking request: ${stripCrLf(params.serviceName)}`,
    text,
    html,
  });

  console.log(
    `[email] Booking alert sent to ${params.providerEmail} for booking ${params.bookingId}`
  );
}

interface PasswordResetParams {
  toEmail: string;
  firstName?: string | null;
  resetUrl: string;
  expiresInMinutes: number;
}

export async function sendPasswordResetEmail(params: PasswordResetParams): Promise<void> {
  const client = getClient();
  if (!client) {
    // Logged for ops visibility — the LB-P1 forgot-password handler is intentionally
    // silent on delivery state to avoid account enumeration, so this log is the only
    // signal that delivery was skipped.
    console.warn(
      "[email] RESEND_API_KEY not set — password reset email NOT sent to",
      params.toEmail
    );
    return;
  }

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

  await client.emails.send({
    from: getFromAddress(),
    to: params.toEmail,
    subject: "Reset your Traveloure password",
    text,
    html,
  });

  console.log(`[email] Password reset link sent to ${params.toEmail}`);
}

interface EmailVerificationParams {
  toEmail: string;
  firstName?: string | null;
  verifyUrl: string;
  expiresInHours: number;
}

export async function sendEmailVerificationEmail(params: EmailVerificationParams): Promise<void> {
  const client = getClient();
  if (!client) {
    console.warn("[email] RESEND_API_KEY not set — verification email NOT sent to", params.toEmail);
    return;
  }

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

  await client.emails.send({
    from: getFromAddress(),
    to: params.toEmail,
    subject: "Confirm your Traveloure email",
    text,
    html,
  });

  console.log(`[email] Verification link sent to ${params.toEmail}`);
}

// ─── Admin Daily Digest ────────────────────────────────────────────────────

interface DigestNotification {
  id: number;
  message: string;
  destination?: string | null;
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
  type: "stripe_charge_no_booking" | "booking_no_stripe_charge";
  chargeId?: string;
  bookingId?: string;
  paymentIntentId?: string;
  amount?: number;
}

interface AdminDigestParams {
  toEmail: string;
  unresolvedNotifications: DigestNotification[];
  expertsWithoutPayout: DigestExpert[];
  missedWebhooks?: MissedWebhook[];
  reconciliationMismatches?: ReconciliationMismatch[];
}

export async function sendAdminDigestEmail(params: AdminDigestParams): Promise<void> {
  const client = getClient();
  if (!client) {
    console.log("[email] RESEND_API_KEY not set — skipping admin digest email");
    return;
  }

  const baseUrl = getAppBaseUrl();
  const date = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  const notifRows = params.unresolvedNotifications
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

  const reconRows = (params.reconciliationMismatches ?? [])
    .map((m) => {
      const label =
        m.type === "stripe_charge_no_booking"
          ? "Stripe charge — no booking"
          : "Booking confirmed — no charge";
      const ref =
        m.type === "stripe_charge_no_booking"
          ? `Charge: ${escHtml(m.chargeId) || "—"} · $${escHtml(String(m.amount ?? "?"))}`
          : `Booking: ${escHtml(m.bookingId) || "—"} · PI: ${escHtml(m.paymentIntentId) || "—"}`;
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

  ${params.unresolvedNotifications.length > 0 ? `
  <h3 style="color:#92400E;margin-top:24px">⚠ Unresolved Lead Alerts (${params.unresolvedNotifications.length})</h3>
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
  <p style="color:#6B7280;font-size:13px">These experts cannot receive payments until their Stripe Connect account is verified.</p>
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

  ${(params.reconciliationMismatches ?? []).length > 0 ? `
  <h3 style="color:#B45309;margin-top:24px">🔴 Payment Reconciliation Mismatches (${params.reconciliationMismatches!.length})</h3>
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

  <p style="color:#9CA3AF;font-size:11px;margin-top:40px;border-top:1px solid #F3F4F6;padding-top:16px">
    Traveloure Admin Digest · Auto-generated daily · <a href="${baseUrl}/admin/dashboard" style="color:#FF385C">Open Dashboard</a>
  </p>
</div>`;

  const missedCount = (params.missedWebhooks ?? []).length;
  const reconCount = (params.reconciliationMismatches ?? []).length;
  await client.emails.send({
    from: getFromAddress(),
    to: params.toEmail,
    subject: `[Traveloure Admin] Daily Digest — ${params.unresolvedNotifications.length} alerts, ${params.expertsWithoutPayout.length} payout gaps${missedCount > 0 ? `, ${missedCount} missed webhooks` : ""}${reconCount > 0 ? `, ${reconCount} recon mismatches` : ""}`,
    html,
  });

  console.log(`[email] Admin digest sent to ${params.toEmail}`);
}

// ─── Welcome email ───────────────────────────────────────────────────────────

interface WelcomeEmailParams {
  toEmail: string;
  firstName: string | null;
}

/**
 * Fire-and-forget welcome email sent immediately after a new account is created.
 * Introduces the platform, surfaces the three core actions (plan a trip, browse
 * experts, explore hidden gems), and gives a direct CTA to the dashboard.
 * Safe to call without awaiting — all errors are caught internally.
 */
export async function sendWelcomeEmail(params: WelcomeEmailParams): Promise<void> {
  const client = getClient();
  if (!client) {
    console.log("[email] RESEND_API_KEY not set — skipping welcome email for", params.toEmail);
    return;
  }

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
        personalised day-by-day itineraries — and connects you with verified local
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
            <div style="color: #6B7280; font-size: 13px;">Book a session with a local expert for tailored, insider advice.</div>
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
    `💎  Discover hidden gems — ${exploreUrl}`,
    ``,
    `Start planning: ${dashboardUrl}`,
    ``,
    `Questions? Just reply to this email.`,
  ].join("\n");

  try {
    await client.emails.send({
      from: getFromAddress(),
      to: params.toEmail,
      subject: `Welcome to Traveloure — let's plan your next adventure`,
      html,
      text,
    });
    console.log(`[email] Welcome email sent to ${params.toEmail}`);
  } catch (err) {
    console.error("[email] Welcome email failed (non-fatal):", err);
  }
}

// ─── Payment-failed email ─────────────────────────────────────────────────────

interface PaymentFailedParams {
  toEmail: string;
  userName?: string | null;
  bookingTitle?: string | null;
}

/**
 * Fire-and-forget email to a traveler whose booking payment failed. The booking
 * is left in "failed" state (the webhook already flipped it) so the traveler can
 * safely retry from My Bookings without hitting the idempotency guard.
 * Never throws — all errors caught internally.
 */
export async function sendPaymentFailedEmail(params: PaymentFailedParams): Promise<void> {
  const client = getClient();
  if (!client) {
    console.log("[email] RESEND_API_KEY not set — skipping payment-failed email for", params.toEmail);
    return;
  }

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

  try {
    await client.emails.send({
      from: getFromAddress(),
      to: params.toEmail,
      subject: params.bookingTitle
        ? `Payment failed — ${stripCrLf(params.bookingTitle)}`
        : `Your Traveloure payment didn't go through`,
      html,
      text,
    });
    console.log(`[email] Payment-failed email sent to ${params.toEmail}`);
  } catch (err) {
    console.error("[email] Payment-failed email failed (non-fatal):", err);
  }
}

// ─── Provider verification decision email ─────────────────────────────────────

interface VerificationDecisionParams {
  toEmail: string;
  firstName?: string | null;
  decision: "verified" | "rejected";
  /** Optional admin note shown to the provider on a rejection. */
  reason?: string | null;
}

/**
 * Fire-and-forget email to a provider when an admin decides their
 * background/category verification review (verified or rejected). Never throws.
 */
export async function sendVerificationDecisionEmail(params: VerificationDecisionParams): Promise<void> {
  const client = getClient();
  if (!client) {
    console.log("[email] RESEND_API_KEY not set — skipping verification-decision email for", params.toEmail);
    return;
  }

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
        ${approved ? "You're verified" : "Verification not approved"}
      </h2>
      <p style="color: #374151;">${greeting}</p>
      <p style="color: #374151;">
        ${approved
          ? "Your account has been verified. You can now publish listings in background-check and higher-insurance categories."
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
    approved ? "You're verified" : "Verification not approved",
    ``,
    greeting,
    ``,
    approved
      ? "Your account has been verified. You can now publish listings in background-check and higher-insurance categories."
      : "We reviewed your account and couldn't approve verification at this time. You can update your details and request another review.",
    !approved && params.reason ? `\nReviewer note: ${params.reason}` : "",
    ``,
    `Open provider settings: ${settingsUrl}`,
  ].filter((l) => l !== "").join("\n");

  try {
    await client.emails.send({
      from: getFromAddress(),
      to: params.toEmail,
      subject: approved ? "You're verified on Traveloure" : "Your Traveloure verification review",
      html,
      text,
    });
    console.log(`[email] Verification-decision (${params.decision}) email sent to ${params.toEmail}`);
  } catch (err) {
    console.error("[email] Verification-decision email failed (non-fatal):", err);
  }
}

// ─── Expert application rejection email ───────────────────────────────────────

interface ExpertApplicationApprovalParams {
  toEmail: string;
  firstName?: string | null;
}

/**
 * Fire-and-forget email to an expert applicant when their application is
 * approved. Congratulates them, explains the Stripe Connect next step, and
 * links directly to /expert/earnings. Never throws.
 */
export async function sendExpertApplicationApprovalEmail(
  params: ExpertApplicationApprovalParams
): Promise<void> {
  const client = getClient();
  if (!client) {
    console.log("[email] RESEND_API_KEY not set — skipping expert approval email for", params.toEmail);
    return;
  }

  const greeting = params.firstName ? `Hi ${escHtml(params.firstName)},` : "Hi,";
  const earningsUrl = `${getAppBaseUrl()}/expert/earnings`;

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

  try {
    await client.emails.send({
      from: getFromAddress(),
      to: params.toEmail,
      subject: "Your Traveloure expert application has been approved!",
      html,
      text,
    });
    console.log(`[email] Expert application approval email sent to ${params.toEmail}`);
  } catch (err) {
    console.error("[email] Expert application approval email failed (non-fatal):", err);
  }
}

interface ExpertApplicationRejectionParams {
  toEmail: string;
  firstName?: string | null;
  /** Optional rejection reason provided by the admin. */
  rejectionMessage?: string | null;
}

/**
 * Fire-and-forget email to an expert applicant when their application is
 * rejected. Includes the admin's rejection reason (if any) and a link back
 * to /expert/apply so they can revise and resubmit. Never throws.
 */
export async function sendExpertApplicationRejectionEmail(
  params: ExpertApplicationRejectionParams
): Promise<void> {
  const client = getClient();
  if (!client) {
    console.log("[email] RESEND_API_KEY not set — skipping expert rejection email for", params.toEmail);
    return;
  }

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

  try {
    await client.emails.send({
      from: getFromAddress(),
      to: params.toEmail,
      subject: "Your Traveloure expert application",
      html,
      text,
    });
    console.log(`[email] Expert application rejection email sent to ${params.toEmail}`);
  } catch (err) {
    console.error("[email] Expert application rejection email failed (non-fatal):", err);
  }
}
