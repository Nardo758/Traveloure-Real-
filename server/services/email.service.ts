/**
 * Email Service
 *
 * Stub implementation — logs what would be sent.
 * Replace the `_send()` method body with a real provider (SendGrid / Resend)
 * when you're ready; the interface and call sites stay the same.
 *
 * To wire in SendGrid:
 *   npm install @sendgrid/mail
 *   import sgMail from "@sendgrid/mail";
 *   sgMail.setApiKey(process.env.SENDGRID_API_KEY!);
 *   await sgMail.send({ to, from, subject, html });
 *
 * To wire in Resend:
 *   npm install resend
 *   import { Resend } from "resend";
 *   const resend = new Resend(process.env.RESEND_API_KEY);
 *   await resend.emails.send({ from, to, subject, html });
 */

export interface ReviewReminderPayload {
  to: string;
  travelerName: string;
  serviceName: string;
  bookingId: string;
  confirmationCode: string;
  completedAt: Date;
}

export interface BookingConfirmationPayload {
  to: string;
  guestName: string;
  bookingId: string;
  confirmationCode: string;
  serviceName: string;
  bookingDate?: string | null;
  totalAmount?: number | null;
  currency?: string;
}

export interface EmailResult {
  queued: boolean;
  provider: "stub" | "sendgrid" | "resend";
  to: string;
  subject: string;
  message?: string;
}

class EmailService {
  private readonly from = "noreply@traveloure.com";
  private readonly provider: "stub" | "sendgrid" | "resend" = "stub";

  /**
   * Send a booking confirmation email.
   * Returns a result object so callers can log/respond without depending on
   * whether a real provider is configured.
   */
  async sendBookingConfirmation(
    payload: BookingConfirmationPayload
  ): Promise<EmailResult> {
    const subject = `Booking Confirmed — ${payload.serviceName} [${payload.confirmationCode}]`;
    const html = this._buildConfirmationHtml(payload);

    return this._send({ to: payload.to, subject, html });
  }

  /**
   * Send a review reminder email to a traveler after their booking completes.
   */
  async sendReviewReminder(payload: ReviewReminderPayload): Promise<EmailResult> {
    const subject = `How was your experience with ${payload.serviceName}?`;
    const html = this._buildReviewReminderHtml(payload);
    return this._send({ to: payload.to, subject, html });
  }

  /**
   * Send a booking cancellation email.
   */
  async sendBookingCancellation(payload: {
    to: string;
    guestName: string;
    bookingId: string;
    confirmationCode: string;
    serviceName: string;
  }): Promise<EmailResult> {
    const subject = `Booking Cancelled — ${payload.serviceName} [${payload.confirmationCode}]`;
    const html = `
      <p>Hi ${payload.guestName},</p>
      <p>Your booking for <strong>${payload.serviceName}</strong> (ref: ${payload.confirmationCode}) has been cancelled.</p>
      <p>If you have any questions, reply to this email.</p>
      <p>— The Traveloure Team</p>
    `;

    return this._send({ to: payload.to, subject, html });
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private _buildReviewReminderHtml(p: ReviewReminderPayload): string {
    const baseUrl = process.env.REPLIT_DOMAINS
      ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`
      : "https://traveloure.com";
    const reviewUrl = `${baseUrl}/my-bookings`;
    const completedStr = new Date(p.completedAt).toLocaleDateString("en-US", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
    });
    return `
<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#222">
  <h2 style="color:#FF385C">How did it go? ⭐</h2>
  <p>Hi ${p.travelerName},</p>
  <p>Your booking for <strong>${p.serviceName}</strong> (ref: ${p.confirmationCode}) was completed on ${completedStr}.</p>
  <p>We'd love to hear about your experience! Your review helps other travelers discover great services and helps providers improve.</p>
  <p style="margin:24px 0">
    <a href="${reviewUrl}"
       style="background:#FF385C;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;display:inline-block">
      Leave a Review
    </a>
  </p>
  <p style="color:#666;font-size:14px">It only takes a minute, and your feedback makes a real difference.</p>
  <p style="color:#999;font-size:12px;margin-top:32px">— The Traveloure Team<br>You're receiving this because you recently completed a booking on Traveloure.</p>
</body>
</html>`.trim();
  }

  private async _send(opts: {
    to: string;
    subject: string;
    html: string;
  }): Promise<EmailResult> {
    const result: EmailResult = {
      queued: true,
      provider: this.provider,
      to: opts.to,
      subject: opts.subject,
    };

    if (this.provider === "stub") {
      // Log to console so developers can see the email content during development
      console.log(
        `[EmailService STUB] Would send email:\n  To: ${opts.to}\n  Subject: ${opts.subject}\n  Provider: ${this.provider}`
      );
      result.message =
        "Email logged (stub mode — no real provider configured). " +
        "Connect SendGrid or Resend to deliver real emails.";
      return result;
    }

    // Real provider implementations go here (see file header for examples)
    result.queued = false;
    result.message = "Unknown provider";
    return result;
  }

  private _buildConfirmationHtml(p: BookingConfirmationPayload): string {
    const dateStr = p.bookingDate
      ? new Date(p.bookingDate).toLocaleDateString("en-US", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : "TBD";
    const amountStr =
      p.totalAmount != null
        ? `${(p.currency ?? "USD")} ${(p.totalAmount / 100).toFixed(2)}`
        : "—";

    return `
<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#222">
  <h2 style="color:#FF385C">Booking Confirmed ✓</h2>
  <p>Hi ${p.guestName},</p>
  <p>Your booking has been confirmed. Here are the details:</p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0">
    <tr><td style="padding:8px 0;color:#666;width:40%">Service</td><td><strong>${p.serviceName}</strong></td></tr>
    <tr><td style="padding:8px 0;color:#666">Confirmation</td><td><strong>${p.confirmationCode}</strong></td></tr>
    <tr><td style="padding:8px 0;color:#666">Date</td><td>${dateStr}</td></tr>
    <tr><td style="padding:8px 0;color:#666">Total Paid</td><td>${amountStr}</td></tr>
    <tr><td style="padding:8px 0;color:#666">Booking ID</td><td style="font-size:12px;color:#999">${p.bookingId}</td></tr>
  </table>
  <p>You can view and manage your booking at <a href="https://traveloure.com/bookings">traveloure.com/bookings</a>.</p>
  <p style="color:#999;font-size:12px">— The Traveloure Team</p>
</body>
</html>`.trim();
  }
}

export const emailService = new EmailService();
