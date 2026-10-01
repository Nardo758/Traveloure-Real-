import { sql } from "drizzle-orm";
import { emailOutbox } from "../../shared/schema";
import type { PaidCharge } from "@shared/payment-on-record";
import { buildCanonicalBookingEmailPayload, type CanonicalBookingPaymentLeg } from "./canonical-booking-email";
import { getAppBaseUrl } from "./email.service";

const EMAIL_TYPE = "canonical_booking_confirmation";

export class CanonicalBookingEmailPersistenceError extends Error {
  readonly code = "CANONICAL_BOOKING_EMAIL_PERSISTENCE_FAILED";

  constructor(bookingId: string, cause: unknown) {
    super(`Could not persist the canonical booking confirmation for ${bookingId}`);
    this.name = "CanonicalBookingEmailPersistenceError";
    (this as Error & { cause?: unknown }).cause = cause;
  }
}

export function isCanonicalBookingEmailPersistenceError(error: unknown): error is CanonicalBookingEmailPersistenceError {
  return error instanceof CanonicalBookingEmailPersistenceError
    || (typeof error === "object" && error !== null
      && (error as { code?: unknown }).code === "CANONICAL_BOOKING_EMAIL_PERSISTENCE_FAILED");
}

function finiteAmount(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const amount = typeof value === "number" ? value : Number(value);
  return Number.isFinite(amount) ? amount : null;
}

function dateText(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString().slice(0, 10);
  return null;
}

function timestampText(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  return null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Write exactly one traveler confirmation into the caller's transaction. This deliberately bypasses
 * enqueueEmail(), whose insert-and-send behavior is best-effort and not transaction-bound.
 */
export async function persistCanonicalBookingConfirmation(
  tx: any,
  input: {
    bookingId: string;
    paymentIntentId: string;
    leg: CanonicalBookingPaymentLeg;
    paidCharge: PaidCharge;
  },
): Promise<void> {
  const { bookingId, paymentIntentId, leg, paidCharge } = input;
  try {
    const result = await tx.execute(sql`
      SELECT sb.id, sb.tracking_number, sb.booking_details, sb.deposit_amount, sb.balance_amount,
             to_char(sb.balance_due_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS') AS balance_due_at,
             traveler.email AS traveler_email,
             NULLIF(BTRIM(CONCAT_WS(' ', traveler.first_name, traveler.last_name)), '') AS traveler_name,
             contract.title AS contract_title, payment_currency.currency AS payment_currency
      FROM service_bookings sb
      LEFT JOIN users traveler ON traveler.id = sb.traveler_id
      LEFT JOIN user_and_expert_contracts contract ON contract.id = sb.contract_id
      LEFT JOIN LATERAL (
        SELECT pi.currency
        FROM payment_intents pi
        WHERE pi.stripe_payment_intent_id = ${paymentIntentId}
        ORDER BY pi.id DESC
        LIMIT 1
      ) payment_currency ON TRUE
      WHERE sb.id = ${bookingId}
      FOR UPDATE OF sb
    `);
    const row = result.rows[0] as any;
    if (!row) throw new Error("Promoted booking could not be read for its confirmation");

    const details = row.booking_details && typeof row.booking_details === "object"
      ? row.booking_details as Record<string, unknown>
      : {};
    const serviceFee = finiteAmount((details.travelerServiceFee as Record<string, unknown> | undefined)?.charged);
    const stampAmount = finiteAmount(paidCharge.amount);
    const amountPaid = stampAmount === null ? null : stampAmount + (leg === "deposit" ? serviceFee ?? 0 : 0);
    const titleSnapshot = stringValue(details.serviceTitle)
      ?? stringValue(details.serviceName)
      ?? stringValue(details.title)
      ?? stringValue(row.contract_title)?.replace(/^Booking:\s*/i, "")
      ?? null;
    const stay = details.stay && typeof details.stay === "object"
      ? details.stay as Record<string, unknown>
      : {};
    // The purchased stay wins over an independent scheduled service date on the cart line.
    const checkIn = dateText(details.checkIn) ?? dateText(stay.checkIn);
    const checkOut = dateText(details.checkOut) ?? dateText(stay.checkOut);
    const bookingDate = checkIn
      ? `${checkIn}${checkOut ? ` – ${checkOut}` : ""}`
      : dateText(details.scheduledDate) ?? dateText(details.serviceDate);
    const balanceDueAt = timestampText(row.balance_due_at);
    const currencySnapshot = stringValue(row.payment_currency)
      ?? stringValue(details.currency)
      ?? stringValue(details.paymentCurrency);
    const currency = currencySnapshot && /^[a-z]{3}$/i.test(currencySnapshot)
      ? currencySnapshot.toUpperCase()
      : null;
    const confirmationCode = stringValue(row.tracking_number) ?? bookingId;
    const payload = buildCanonicalBookingEmailPayload({
      appBaseUrl: getAppBaseUrl(),
      leg,
      bookingId,
      confirmationCode,
      travelerName: stringValue(row.traveler_name),
      bookingTitle: titleSnapshot,
      bookingDate,
      balanceDueAt,
      currency,
      amountPaid,
      remainingBalance: leg === "deposit" ? finiteAmount(row.balance_amount) : null,
    });
    const toEmail = stringValue(row.traveler_email);
    const missingRecipient = !toEmail;

    await tx.insert(emailOutbox).values({
      emailType: EMAIL_TYPE,
      toEmail: toEmail ?? "",
      subject: payload.subject,
      html: payload.html,
      textBody: payload.text,
      status: missingRecipient ? "dead" : "pending",
      attemptCount: 0,
      maxAttempts: 6,
      lastError: missingRecipient ? "Traveler email missing at payment promotion; confirmation was not deliverable." : null,
      metadata: {
        source: "canonical_service_booking_payment",
        bookingId,
        paymentIntentId,
        eventKey: `canonical_booking_confirmation:${bookingId}:${leg}`,
        leg,
        paymentLeg: leg,
        paidCharge,
        ...(missingRecipient ? { deliveryBlocked: true, deliveryError: "traveler_email_missing" } : {}),
      },
    });
  } catch (error) {
    if (isCanonicalBookingEmailPersistenceError(error)) throw error;
    throw new CanonicalBookingEmailPersistenceError(bookingId, error);
  }
}