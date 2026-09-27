/**
 * THE STATUS A TRAVELER'S BOOKING CARD READS — for its badge, its tab AND its actions (R163, ledger
 * `2026-09-27-dashboard-refund-reads-refunded`).
 *
 * A refund issued from the Stripe dashboard changes no `service_bookings.status`; the server says
 * so with `refundedOutOfBand` when the refund covered the booking's whole share, and the ONE shared
 * reading `itemBookingLabelStatus` turns that into `refunded`. The badge and every action gate read
 * this same value, so a booking that says "Refunded" never offers Cancel or Dispute — exactly what a
 * `refunded` row offers. Nothing money-shaped is derived here; the server refuses the same cancel
 * and dispute on its own (409 `refunded_out_of_band`, §14).
 */
import { itemBookingLabelStatus } from "@shared/booking-visibility";

export interface BookingStatusLike {
  status: string;
  refundedOutOfBand?: true | boolean | null;
}

export function bookingDisplayStatus(b: BookingStatusLike): string {
  return itemBookingLabelStatus(b) ?? b.status;
}
