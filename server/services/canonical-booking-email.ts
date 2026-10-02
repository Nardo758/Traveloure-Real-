import { escHtml, stripCrLf } from "../utils/email-escape";

export type CanonicalBookingPaymentLeg = "full" | "deposit" | "balance";

export interface CanonicalBookingEmailParams {
  appBaseUrl: string;
  leg: CanonicalBookingPaymentLeg;
  bookingId: string;
  confirmationCode: string;
  travelerName: string | null;
  bookingTitle: string | null;
  bookingDate: string | null;
  balanceDueAt: string | null;
  currency: string | null;
  amountPaid: number | null;
  remainingBalance: number | null;
}

function moneyLine(label: string, amount: number | null, currency: string | null): { html: string; text: string } {
  if (amount === null || !Number.isFinite(amount)) return { html: "", text: "" };
  const rendered = amount.toFixed(2);
  const unit = currency ? ` ${currency}` : " (currency not recorded)";
  return {
    html: `<tr><td style="padding:12px 16px;color:#6B7280;">${escHtml(label)}</td><td style="padding:12px 16px;color:#111827;font-weight:600;">${escHtml(rendered)}${escHtml(unit)}</td></tr>`,
    text: `${label}: ${rendered}${unit}`,
  };
}

/**
 * Pure canonical traveler email builder. Currency is deliberately not inferred: service_bookings
 * does not snapshot it. A currency is shown only when booking_details carries an explicit snapshot.
 */
export function buildCanonicalBookingEmailPayload(params: CanonicalBookingEmailParams): {
  subject: string;
  html: string;
  text: string;
} {
  const greeting = params.travelerName ? `Hi ${params.travelerName},` : "Hello,";
  const title = params.bookingTitle || "Your booking";
  const bookingUrl = `${params.appBaseUrl.replace(/\/+$/, "")}/bookings`;
  const paymentCopy = params.leg === "deposit"
    ? "Your deposit payment has been received. Your booking is not fully paid yet; the remaining balance is still due."
    : params.leg === "balance"
      ? "Your balance payment has been received. Your booking is now fully paid and confirmed."
      : "Your payment has been received and your booking is confirmed.";
  const paymentPlain = paymentCopy;
  const amount = moneyLine(params.leg === "deposit" ? "Deposit payment recorded" : params.leg === "balance" ? "Balance payment recorded" : "Payment recorded", params.amountPaid, params.currency);
  const remaining = params.leg === "deposit"
    ? moneyLine("Remaining balance recorded", params.remainingBalance, params.currency)
    : { html: "", text: "" };
  const bookingDateHtml = params.bookingDate
    ? `<tr><td style="padding:12px 16px;color:#6B7280;">Date</td><td style="padding:12px 16px;color:#111827;font-weight:600;">${escHtml(params.bookingDate)}</td></tr>`
    : "";
  const bookingDateText = params.bookingDate ? `Date: ${params.bookingDate}` : "";
  const dueDateHtml = params.leg === "deposit" && params.balanceDueAt
    ? `<tr><td style="padding:12px 16px;color:#6B7280;">Balance due</td><td style="padding:12px 16px;color:#111827;font-weight:600;">${escHtml(params.balanceDueAt)}</td></tr>`
    : "";
  const dueDateText = params.leg === "deposit" && params.balanceDueAt ? `Balance due: ${params.balanceDueAt}` : "";
  const text = [
    params.leg === "deposit" ? "Deposit payment received" : params.leg === "balance" ? "Balance payment received — booking confirmed" : "Payment received — booking confirmed",
    "",
    greeting,
    "",
    paymentPlain,
    "",
    `Booking: ${title}`,
    bookingDateText,
    `Booking reference: ${params.confirmationCode || params.bookingId}`,
    amount.text,
    remaining.text,
    dueDateText,
    "",
    `View your bookings: ${bookingUrl}`,
  ].filter(Boolean).join("\n");

  return {
    subject: stripCrLf(`${params.leg === "deposit" ? "Deposit received" : params.leg === "balance" ? "Balance paid — booking confirmed" : "Booking confirmed"} — ${title}`),
    html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#374151;">
      <h2 style="color:#FF385C;">${params.leg === "deposit" ? "Deposit received" : params.leg === "balance" ? "Booking fully paid" : "Booking confirmed"}</h2>
      <p>${escHtml(greeting)}</p><p>${escHtml(paymentCopy)}</p>
      <table style="width:100%;border-collapse:collapse;margin:20px 0;background:#F9FAFB;">
        <tr><td style="padding:12px 16px;color:#6B7280;width:40%;">Booking</td><td style="padding:12px 16px;color:#111827;font-weight:600;">${escHtml(title)}</td></tr>
        ${bookingDateHtml}
        <tr><td style="padding:12px 16px;color:#6B7280;">Booking reference</td><td style="padding:12px 16px;color:#111827;font-weight:600;font-family:monospace;">${escHtml(params.confirmationCode || params.bookingId)}</td></tr>
        ${amount.html}${remaining.html}${dueDateHtml}
      </table>
      <a href="${escHtml(bookingUrl)}" style="display:inline-block;background:#FF385C;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:600;">View your bookings</a>
      <p style="color:#9CA3AF;font-size:12px;margin-top:32px;">You’re receiving this because you made a booking on Traveloure.</p>
    </div>`,
    text,
  };
}