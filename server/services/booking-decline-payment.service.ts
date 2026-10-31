/**
 * Owner decline of a booking that already has a PaymentIntent.
 *
 * A succeeded charge is refunded by the caller (the existing `refundServiceBooking`
 * rail — one refund implementation). An uncaptured authorization (`requires_capture`)
 * is cancelled so the traveler's card hold is released. The cancel goes through
 * `cancelPaymentIntent`, the one cancel call site, under a key derived from the
 * PaymentIntent id, so a retry is the same single cancel.
 *
 * A PaymentIntent Stripe already reports canceled, and a refund the refunder reports
 * as already issued, are no-ops: a second decline or a retry does not cancel or
 * refund again. A cancel that does not leave the intent canceled refuses the
 * decline — the booking stays where it is, and the hold stays the caller's to retry.
 *
 * The log line is built field by field. The retrieve payload is never logged: it
 * can carry a card, a client secret, or a payment method.
 */

export function bookingDeclineCancelIdempotencyKey(paymentIntentId: string): string {
  return `booking-decline-cancel-${paymentIntentId}`;
}

export type BookingDeclinePaymentLog = {
  bookingId: string;
  paymentIntentId: string;
  /** Stripe's status, or null when the intent could not be read. */
  paymentIntentStatus: string | null;
  outcome:
    | "refund"
    | "already_refunded"
    | "hold_released"
    | "already_canceled"
    | "unpaid"
    | "lookup_failed"
    | "release_failed";
  /** Stripe's error code token, when the failure carried one. Never an error body. */
  stripeCode?: string;
};

export type BookingDeclineRefundPayload = {
  alreadyRefunded?: boolean;
};

export type BookingDeclineSettlement<T extends BookingDeclineRefundPayload> =
  | { outcome: "refund"; alreadyRefunded: boolean; payload: T }
  | { outcome: "hold_released" }
  | { outcome: "noop"; reason: "already_canceled" }
  | { outcome: "unpaid"; paymentIntentStatus: string }
  | { outcome: "lookup_failed" }
  | { outcome: "release_failed" };

export type BookingDeclinePaymentDeps<T extends BookingDeclineRefundPayload> = {
  retrieve: (paymentIntentId: string) => Promise<{ status: string }>;
  cancel: (paymentIntentId: string, idempotencyKey: string) => Promise<{ status: string }>;
  /** Called only for a succeeded charge. Throws leave the booking unchanged (the route's refund catch). */
  refund: () => Promise<T>;
  log?: (line: BookingDeclinePaymentLog) => void | Promise<void>;
};

function isCanceledStatus(status: string | null | undefined): boolean {
  return status === "canceled" || status === "cancelled";
}

/** A short Stripe code token. Anything else — a message, a body, a card — is dropped. */
function safeStripeCode(err: unknown): string | undefined {
  const code = (err as { code?: unknown } | null)?.code;
  if (typeof code !== "string") return undefined;
  if (!/^[a-z0-9_]{1,64}$/.test(code)) return undefined;
  return code;
}

function lineOf(
  input: { bookingId: string; paymentIntentId: string },
  outcome: BookingDeclinePaymentLog["outcome"],
  paymentIntentStatus: string | null,
  stripeCode?: string,
): BookingDeclinePaymentLog {
  const line: BookingDeclinePaymentLog = {
    bookingId: input.bookingId,
    paymentIntentId: input.paymentIntentId,
    paymentIntentStatus,
    outcome,
  };
  if (stripeCode) line.stripeCode = stripeCode;
  return line;
}

async function defaultLog(line: BookingDeclinePaymentLog): Promise<void> {
  const { logger } = await import("../infrastructure/logger");
  logger.info(line, "[booking-decline] payment outcome");
}

export async function settleBookingDeclinePayment<T extends BookingDeclineRefundPayload>(input: {
  bookingId: string;
  paymentIntentId: string;
} & BookingDeclinePaymentDeps<T>): Promise<BookingDeclineSettlement<T>> {
  const write = input.log ?? defaultLog;
  const emit = async (
    outcome: BookingDeclinePaymentLog["outcome"],
    paymentIntentStatus: string | null,
    stripeCode?: string,
  ) => {
    await write(lineOf(input, outcome, paymentIntentStatus, stripeCode));
  };

  let status: string;
  try {
    // Only the status is read. The rest of the PaymentIntent stays in the caller.
    status = (await input.retrieve(input.paymentIntentId)).status;
  } catch (err) {
    await emit("lookup_failed", null, safeStripeCode(err));
    return { outcome: "lookup_failed" };
  }

  if (isCanceledStatus(status)) {
    await emit("already_canceled", status);
    return { outcome: "noop", reason: "already_canceled" };
  }

  if (status === "requires_capture") {
    try {
      const canceled = await input.cancel(
        input.paymentIntentId,
        bookingDeclineCancelIdempotencyKey(input.paymentIntentId),
      );
      if (!isCanceledStatus(canceled.status)) {
        await emit("release_failed", status);
        return { outcome: "release_failed" };
      }
      await emit("hold_released", canceled.status);
      return { outcome: "hold_released" };
    } catch (err) {
      let after: string | null = null;
      try {
        after = (await input.retrieve(input.paymentIntentId)).status;
      } catch {
        after = null;
      }
      if (isCanceledStatus(after)) {
        await emit("already_canceled", after, safeStripeCode(err));
        return { outcome: "noop", reason: "already_canceled" };
      }
      await emit("release_failed", after ?? status, safeStripeCode(err));
      return { outcome: "release_failed" };
    }
  }

  if (status === "succeeded") {
    const payload = await input.refund();
    const alreadyRefunded = Boolean(payload?.alreadyRefunded);
    await emit(alreadyRefunded ? "already_refunded" : "refund", status);
    return { outcome: "refund", alreadyRefunded, payload };
  }

  await emit("unpaid", status);
  return { outcome: "unpaid", paymentIntentStatus: status };
}
