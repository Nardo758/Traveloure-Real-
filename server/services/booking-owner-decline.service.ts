/**
 * The owner decline path, one implementation.
 *
 * A captured charge is refunded through `refundServiceBooking` (existing key
 * `refund-sb-<bookingId>-<cents>` when an amount override is passed). An
 * uncaptured authorization is still cancelled under `booking-decline-cancel-<pi>`
 * by `settleBookingDeclinePayment`. This lane adds no concierge PaymentIntent
 * and no concierge-* key.
 *
 * A concierge advisor row on the booking's trip, if one exists, has its
 * access_until set to now once the decline has actually landed.
 */
import { sql } from "drizzle-orm";
import { db } from "../db";
import { storage, type BookingStatusNotification } from "../storage";
import { resolveCapturedDeposit } from "./deposit.service";
import { travelerChargeForRow } from "./traveler-charge";
import { stripe, stripePaymentService } from "./stripe-payment.service";
import { settleBookingDeclinePayment } from "./booking-decline-payment.service";
import { logger } from "../infrastructure/logger";
import { sanitizeBookingForExpert } from "../utils/data-sanitizer";
import { OWNER_BOOKING_TRANSITIONS } from "../utils/booking-from-states";
import { endConciergeAdvisorAccess } from "./concierge-engagement.service";

export type OwnerDeclineHttp = { status: number; body: unknown };

export async function applyOwnerDecline(input: {
  booking: any;
  bookingId: string;
  reason: string | null;
  actorUserId: string;
  role: string;
}): Promise<OwnerDeclineHttp> {
  const { booking, bookingId, reason, actorUserId, role } = input;
  const capturedDeposit = resolveCapturedDeposit(booking as any);
  if (capturedDeposit.kind === "unresolvable") {
    return {
      status: 409,
      body: {
        message:
          "This booking took a deposit, but the platform cannot tell how much was captured, so it will not be cancelled with an unknown refund. Support has been given the details.",
        currentStatus: booking.status,
        reason: capturedDeposit.reason,
      },
    };
  }

  const endAccess = () => endConciergeAdvisorAccess(booking.tripId, booking.providerId);

  if (booking.stripePaymentIntentId) {
    let settled: Awaited<ReturnType<typeof settleBookingDeclinePayment<{
      alreadyRefunded: boolean;
      refundResult: { alreadyRefunded?: boolean; amount?: number };
      amountPaid: number;
      isDepositRefund: boolean;
    }>>>;
    try {
      settled = await settleBookingDeclinePayment({
        bookingId,
        paymentIntentId: booking.stripePaymentIntentId,
        retrieve: async (id) => {
          const pi = await stripe.paymentIntents.retrieve(id);
          return { status: pi.status };
        },
        cancel: (id, key) => stripePaymentService.cancelPaymentIntent(id, key),
        refund: async () => {
          const isDepositRefund = capturedDeposit.kind === "deposit_only";
          const amountPaid = isDepositRefund
            ? capturedDeposit.amount
            : travelerChargeForRow({
                totalAmount: booking.totalAmount,
                platformFee: booking.platformFee,
                insuranceFee: booking.insuranceFee,
                conciergeFeeSnapshot: booking.bookingDetails?.travelerCharge?.conciergeFee ?? null,
              }).amount;
          const refundResult = await stripePaymentService.refundServiceBooking(
            bookingId,
            reason || "cancelled_by_provider",
            { amountOverride: amountPaid, feeRefundPercent: 100 }, // fee-literal-ok: 100 = full make-whole refund %, not a fee_bands rate
          );
          return {
            alreadyRefunded: Boolean(refundResult?.alreadyRefunded),
            refundResult,
            amountPaid,
            isDepositRefund,
          };
        },
        log: (line) => {
          logger.info(line, "[booking-decline] payment outcome");
        },
      });
      if (settled.outcome === "refund") {
        const { refundResult, amountPaid, isDepositRefund } = settled.payload;
        if (settled.alreadyRefunded || refundResult?.alreadyRefunded) {
          await endAccess();
          const refreshed = await storage.getServiceBooking(bookingId);
          return {
            status: 200,
            body: {
              ...(refreshed ? sanitizeBookingForExpert(refreshed, role, actorUserId) : refreshed),
              refund: { issued: false, alreadyRefunded: true },
            },
          };
        }
        await storage.reverseEarningsForBooking(bookingId);
        await storage.reversePlatformRevenueForBooking(bookingId, new Date(), 1);
        await db.execute(sql`
          UPDATE service_bookings
          SET cancelled_at = NOW(), cancellation_reason = ${reason ?? "Cancelled by the provider"}, updated_at = NOW()
          WHERE id = ${bookingId}
        `);
        const { revertPurchasedItemsForBooking } = await import("./item-routing.service");
        await revertPurchasedItemsForBooking(bookingId);
        if (booking.travelerId) {
          try {
            const refundNoun = isDepositRefund
              ? `A refund of your deposit ($${amountPaid.toFixed(2)}) has been issued to your original payment method, and the outstanding balance will not be collected.`
              : `A full refund of $${amountPaid.toFixed(2)} has been issued to your original payment method.`;
            await storage.createNotification({
              userId: booking.travelerId,
              type: "booking_cancelled",
              title: isDepositRefund
                ? "Booking cancelled by provider — deposit refunded"
                : "Booking cancelled by provider — full refund issued",
              message: reason
                ? `Your booking ${booking.trackingNumber ?? ""} was cancelled by the provider. ${refundNoun} Reason: ${reason}`
                : `Your booking ${booking.trackingNumber ?? ""} was cancelled by the provider. ${refundNoun}`,
              relatedId: bookingId,
              relatedType: "booking",
              data: {
                bookingId,
                refundAmount: amountPaid,
                cancelledBy: "provider",
                ...(isDepositRefund ? { refundScope: "deposit" } : {}),
                ...(reason ? { reason } : {}),
              },
            });
          } catch (notifyErr) {
            console.error("Failed to notify traveler of provider cancellation:", notifyErr);
          }
          try {
            const traveler = await storage.getUser(booking.travelerId);
            if (traveler?.email) {
              const { sendBookingCancellationWithRefundEmail } = await import("./email.service");
              await sendBookingCancellationWithRefundEmail({
                toEmail: traveler.email,
                travelerName: traveler.firstName ?? null,
                bookingTrackingNumber: booking.trackingNumber ?? null,
                serviceName: booking.serviceName ?? null,
                refundAmount: amountPaid,
                cancellationReason: reason ?? null,
                bookingId,
              });
            }
          } catch (emailErr) {
            console.error("Failed to send cancellation+refund email to traveler:", emailErr);
          }
        }
        await endAccess();
        const refreshed = await storage.getServiceBooking(bookingId);
        return {
          status: 200,
          body: {
            ...(refreshed ? sanitizeBookingForExpert(refreshed, role, actorUserId) : refreshed),
            refund: {
              issued: true,
              amount: refundResult?.amount ?? amountPaid,
              scope: isDepositRefund ? "deposit" : "full",
            },
          },
        };
      }
    } catch (refundErr: any) {
      console.error("Provider cancellation refund error:", refundErr);
      if (refundErr?.name === "LostChargebackRefundBlockedError") {
        const { lostChargebackRefusalBody } = await import("./lost-chargeback-guard.service");
        return { status: 409, body: lostChargebackRefusalBody(refundErr.result) };
      }
      if (refundErr?.name === "ServiceBookingRefundRefusedError") {
        return {
          status: 409,
          body: { error: "refund_refused_status", status: refundErr.bookingStatus, message: refundErr.message },
        };
      }
      return {
        status: 502,
        body: {
          message: "The refund could not be issued, so the booking was NOT cancelled. Please try again.",
          error: refundErr?.message,
        },
      };
    }
    if (settled!.outcome === "release_failed") {
      return {
        status: 502,
        body: {
          message: "The card hold could not be released, so the booking was NOT declined. Please try again.",
          currentStatus: booking.status,
        },
      };
    }
    if (
      capturedDeposit.kind === "deposit_only" &&
      (settled!.outcome === "lookup_failed" || settled!.outcome === "unpaid")
    ) {
      return {
        status: 409,
        body: {
          message:
            "This booking's deposit payment could not be confirmed with the payment processor, so it was NOT cancelled. Please try again in a moment.",
          currentStatus: booking.status,
          reason: "deposit_intent_unconfirmed",
        },
      };
    }
  }

  const notify: BookingStatusNotification | undefined = booking.travelerId
    ? {
        userId: booking.travelerId,
        type: "booking_cancelled",
        title: "Booking declined by provider",
        message: reason
          ? `Your booking ${booking.trackingNumber ?? ""} was declined by the provider. Reason: ${reason}`
          : `Your booking ${booking.trackingNumber ?? ""} was declined by the provider.`,
        data: { bookingId, cancelledBy: "provider", ...(reason ? { reason } : {}) },
        dedupeKey: `booking:${bookingId}:cancelled`,
      }
    : undefined;

  const updated = await storage.updateServiceBookingStatus(
    bookingId,
    "cancelled",
    reason ?? undefined,
    OWNER_BOOKING_TRANSITIONS.cancelled,
    notify,
  );
  if (!updated) {
    return {
      status: 409,
      body: { message: "This booking changed before your update was applied. Reload and try again." },
    };
  }

  if (booking.travelerId) {
    try {
      const traveler = await storage.getUser(booking.travelerId);
      if (traveler?.email) {
        const { sendBookingDeclineEmail } = await import("./email.service");
        await sendBookingDeclineEmail({
          toEmail: traveler.email,
          travelerName: traveler.firstName ?? null,
          bookingTrackingNumber: booking.trackingNumber ?? null,
          bookingId,
          serviceName: booking.serviceName ?? null,
          declineReason: reason ?? null,
        });
      }
    } catch (emailErr) {
      console.error("Failed to send decline email to traveler:", emailErr);
    }
  }

  await endAccess();
  const refreshed = await storage.getServiceBooking(bookingId);
  return {
    status: 200,
    body: refreshed ? sanitizeBookingForExpert(refreshed, role, actorUserId) : refreshed,
  };
}
