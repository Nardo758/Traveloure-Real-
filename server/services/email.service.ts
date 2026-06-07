/**
 * Email Service
 * Sends transactional emails via SMTP (Nodemailer).
 *
 * Required environment variables (all optional — if missing, emails are skipped):
 *   SMTP_HOST     e.g. smtp.sendgrid.net
 *   SMTP_PORT     e.g. 587
 *   SMTP_USER     e.g. apikey  (SendGrid) or your SMTP username
 *   SMTP_PASS     SMTP password / API key
 *   EMAIL_FROM    e.g. no-reply@traveloure.com
 */

import nodemailer from "nodemailer";

function createTransporter() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

function getBaseUrl(): string {
  const domains = process.env.REPLIT_DOMAINS;
  if (domains) {
    const primary = domains.split(",")[0].trim();
    return `https://${primary}`;
  }
  return "http://localhost:5000";
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
  const transporter = createTransporter();

  if (!transporter) {
    console.log(
      "[email] SMTP not configured — skipping booking alert email for booking",
      params.bookingId
    );
    return;
  }

  const from = process.env.EMAIL_FROM || "no-reply@traveloure.com";
  const bookingsUrl = `${getBaseUrl()}/expert/bookings`;

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

  await transporter.sendMail({
    from,
    to: params.providerEmail,
    subject: `New booking request: ${params.serviceName}`,
    text,
    html,
  });

  console.log(
    `[email] Booking alert sent to ${params.providerEmail} for booking ${params.bookingId}`
  );
}
