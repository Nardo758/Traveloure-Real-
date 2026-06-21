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
      reply_to: replyTo,
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

  const greeting = params.userName ? `Hi ${params.userName},` : "Hi,";
  const myBookingsUrl = `${getAppBaseUrl()}/my-bookings`;
  const dateLine = params.bookingDate
    ? `<tr style="background: #F3F4F6;">
         <td style="padding: 12px 16px; color: #6B7280;">Date</td>
         <td style="padding: 12px 16px; color: #111827; font-weight: 600;">${params.bookingDate}</td>
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
          <td style="padding: 12px 16px; color: #111827; font-weight: 600;">${params.bookingTitle}</td>
        </tr>
        ${dateLine}
        <tr>
          <td style="padding: 12px 16px; color: #6B7280;">Confirmation code</td>
          <td style="padding: 12px 16px; color: #111827; font-weight: 600; font-family: monospace; letter-spacing: 1px;">${params.confirmationCode}</td>
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
    subject: `Your booking is confirmed — ${params.bookingTitle}`,
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
      <p style="color: #374151;">Hi ${params.providerName},</p>
      <p style="color: #374151;">You have a new booking request on Traveloure.</p>
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0; background: #F9FAFB; border-radius: 8px; overflow: hidden;">
        <tr>
          <td style="padding: 12px 16px; color: #6B7280; width: 40%;">Service</td>
          <td style="padding: 12px 16px; color: #111827; font-weight: 600;">${params.serviceName}</td>
        </tr>
        <tr style="background: #F3F4F6;">
          <td style="padding: 12px 16px; color: #6B7280;">Traveler</td>
          <td style="padding: 12px 16px; color: #111827; font-weight: 600;">${params.travelerName}</td>
        </tr>
        <tr>
          <td style="padding: 12px 16px; color: #6B7280;">Amount</td>
          <td style="padding: 12px 16px; color: #111827; font-weight: 600;">$${params.amount}</td>
        </tr>
        <tr style="background: #F3F4F6;">
          <td style="padding: 12px 16px; color: #6B7280;">Booking ID</td>
          <td style="padding: 12px 16px; color: #6B7280; font-size: 12px;">${params.bookingId}</td>
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
    subject: `New booking request: ${params.serviceName}`,
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

  const greeting = params.firstName ? `Hi ${params.firstName},` : "Hi,";
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

  const greeting = params.firstName ? `Hi ${params.firstName},` : "Hi,";
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

interface AdminDigestParams {
  toEmail: string;
  unresolvedNotifications: DigestNotification[];
  expertsWithoutPayout: DigestExpert[];
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
          <td style="padding:8px 12px;color:#111827;font-size:13px">${n.message}</td>
          <td style="padding:8px 12px;color:#6B7280;font-size:13px">${n.destination ?? "—"}</td>
        </tr>`
    )
    .join("");

  const expertRows = params.expertsWithoutPayout
    .map(
      (e) => {
        const name = [e.firstName, e.lastName].filter(Boolean).join(" ") || e.email || e.id;
        return `<tr style="background:#FFF5F5">
          <td style="padding:8px 12px;color:#111827;font-size:13px">${name}</td>
          <td style="padding:8px 12px;color:#6B7280;font-size:13px">${e.email ?? "—"}</td>
        </tr>`;
      }
    )
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

  <p style="color:#9CA3AF;font-size:11px;margin-top:40px;border-top:1px solid #F3F4F6;padding-top:16px">
    Traveloure Admin Digest · Auto-generated daily · <a href="${baseUrl}/admin/dashboard" style="color:#FF385C">Open Dashboard</a>
  </p>
</div>`;

  await client.emails.send({
    from: getFromAddress(),
    to: params.toEmail,
    subject: `[Traveloure Admin] Daily Digest — ${params.unresolvedNotifications.length} alerts, ${params.expertsWithoutPayout.length} payout gaps`,
    html,
  });

  console.log(`[email] Admin digest sent to ${params.toEmail}`);
}
